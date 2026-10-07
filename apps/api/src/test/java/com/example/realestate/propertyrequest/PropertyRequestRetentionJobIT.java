package com.example.realestate.propertyrequest;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link PropertyRequestRetentionJob} (#2792) against a real Postgres
 * (Testcontainers) with the real Flyway schema (V146 + V147).
 *
 * <p>Runs with {@code NOT_SUPPORTED} so no test-wide transaction wraps the job: every batch
 * commits exactly as in production, and the concurrency test sees real cross-session behaviour.
 * The table is cleaned in {@code @BeforeEach}. The job is instantiated directly with a
 * {@link SimpleMeterRegistry} (same pattern as DiscoverEventRetentionJobIT).
 */
@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@ExtendWith(OutputCaptureExtension.class)
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class PropertyRequestRetentionJobIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String INSERT_SQL = """
            INSERT INTO property_requests
                (city, area_key, area_label, journey, intent, requirement, phone_enc, phone_hash,
                 contact_via, consent_version, consented_at, retain_until)
            VALUES (?, ?, ?, 'AREA', 'BUY', ?, ?, ?, 'PHONE', 'v1', now(), ?)
            """;

    @Autowired
    private PropertyRequestRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private SimpleMeterRegistry meterRegistry;
    private PropertyRequestRetentionJob job;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        job = new PropertyRequestRetentionJob(repository, meterRegistry);
        jdbcTemplate.execute("DELETE FROM property_requests");
    }

    @Test
    @DisplayName("expired rows are deleted, unexpired rows are kept")
    void expiredDeleted_unexpiredKept() {
        OffsetDateTime now = utcNow();
        insert(now.minusDays(1));
        insert(now.minusDays(400));
        insert(now.plusDays(1));
        insert(now.plusMonths(11));

        int deleted = job.purgeExpiredBefore(now);

        assertThat(deleted).isEqualTo(2);
        assertThat(count()).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM property_requests WHERE retain_until < ?", Integer.class, now))
                .isZero();
    }

    @Test
    @DisplayName("boundary is exclusive: retain_until == cutoff survives, cutoff-1s is deleted")
    void boundary_exclusive() {
        OffsetDateTime cutoff = utcNow();
        insert(cutoff);
        insert(cutoff.minusSeconds(1));

        int deleted = job.purgeExpiredBefore(cutoff);

        assertThat(deleted).isEqualTo(1);
        assertThat(count()).isEqualTo(1);
        OffsetDateTime survivor = jdbcTemplate.queryForObject(
                "SELECT retain_until FROM property_requests", OffsetDateTime.class);
        assertThat(survivor).isNotNull();
        assertThat(survivor.toInstant()).isEqualTo(cutoff.toInstant());
    }

    @Test
    @DisplayName("idempotent: second run deletes 0")
    void idempotent_secondRunDeletesZero() {
        OffsetDateTime now = utcNow();
        insert(now.minusDays(2));
        insert(now.minusDays(3));

        assertThat(job.purgeExpiredBefore(now)).isEqualTo(2);
        assertThat(job.purgeExpiredBefore(now)).isZero();
        assertThat(count()).isZero();
        assertThat(counter().count()).isEqualTo(2.0);
    }

    @Test
    @DisplayName("more than one batch: 1010 expired rows are all purged in one run, counter == 1010")
    void multiBatch_allPurged() {
        OffsetDateTime now = utcNow();
        int expired = 2 * PropertyRequestRetentionJob.DELETE_BATCH_SIZE + 10;
        insertMany(expired, now.minusDays(1));
        insert(now.plusDays(1));

        int deleted = job.purgeExpiredBefore(now);

        assertThat(deleted).isEqualTo(expired);
        assertThat(count()).isEqualTo(1);
        assertThat(counter().count()).isEqualTo((double) expired);
    }

    @Test
    @DisplayName("empty table: returns 0 and the counter is registered")
    void emptyTable_zeroAndCounterRegistered() {
        assertThat(job.purgeExpiredBefore(utcNow())).isZero();

        assertThat(counter()).isNotNull();
        assertThat(counter().count()).isZero();
    }

    @Test
    @DisplayName("parallel invocation of two jobs: no error and exact combined count (does not prove the runs interleave)")
    void parallelInvocation_noErrorAndExactCombinedCount() throws Exception {
        OffsetDateTime now = utcNow();
        int expired = 2 * PropertyRequestRetentionJob.DELETE_BATCH_SIZE + 10;
        insertMany(expired, now.minusDays(1));
        insertMany(25, now.plusDays(30));

        PropertyRequestRetentionJob jobA = new PropertyRequestRetentionJob(repository, new SimpleMeterRegistry());
        PropertyRequestRetentionJob jobB = new PropertyRequestRetentionJob(repository, new SimpleMeterRegistry());
        CountDownLatch startGate = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (PropertyRequestRetentionJob j : List.of(jobA, jobB)) {
                Callable<Integer> task = () -> {
                    startGate.await();
                    return j.purgeExpiredBefore(now);
                };
                futures.add(pool.submit(task));
            }
            startGate.countDown();

            int total = 0;
            for (Future<Integer> f : futures) {
                total += f.get(60, TimeUnit.SECONDS); // rethrows any exception from a worker
            }

            assertThat(total).isEqualTo(expired);
            assertThat(count()).isEqualTo(25);
            assertThat(job.purgeExpiredBefore(now)).isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("PII: logs contain counts only, never row content (and the job's own line is present)")
    void logs_neverContainRowContent(CapturedOutput output) {
        OffsetDateTime now = utcNow();
        jdbcTemplate.update(INSERT_SQL,
                "SENTINEL-CITY-2792", "SENTINEL-AREA-2792", "SENTINEL-AREA-2792", "SENTINEL-REQ-2792",
                "ENC:9876501234", "SENTINEL-HASH-2792", now.minusDays(1));
        jdbcTemplate.update(INSERT_SQL,
                "SENTINEL-CITY-2792", "SENTINEL-AREA-2792", "SENTINEL-AREA-2792", "SENTINEL-REQ-2792",
                "ENC:9876501234", "SENTINEL-HASH-2792", now.plusDays(1));

        int deleted = job.purgeExpiredBefore(now);

        assertThat(deleted).isEqualTo(1);
        String out = output.getAll();
        assertThat(out).contains("completed totalDeleted=1");
        assertThat(out).doesNotContain("9876501234");
        assertThat(out).doesNotContain("SENTINEL-HASH-2792");
        assertThat(out).doesNotContain("SENTINEL-REQ-2792");
        assertThat(out).doesNotContain("SENTINEL-AREA-2792");
        assertThat(out).doesNotContain("SENTINEL-CITY-2792");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Postgres timestamptz has microsecond precision; truncate so equality round-trips exactly. */
    private static OffsetDateTime utcNow() {
        return OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
    }

    private void insert(OffsetDateTime retainUntil) {
        jdbcTemplate.update(INSERT_SQL, "Udupi", null, null, null, "ENC:test", "hash-test", retainUntil);
    }

    private void insertMany(int n, OffsetDateTime retainUntil) {
        List<Object[]> args = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            args.add(new Object[]{"Udupi", null, null, null, "ENC:test", "hash-test", retainUntil});
        }
        jdbcTemplate.batchUpdate(INSERT_SQL, args);
    }

    private int count() {
        Integer c = jdbcTemplate.queryForObject("SELECT count(*) FROM property_requests", Integer.class);
        return c == null ? 0 : c;
    }

    private Counter counter() {
        return meterRegistry.find(PropertyRequestRetentionJob.METRIC_ROWS_PURGED).counter();
    }
}
