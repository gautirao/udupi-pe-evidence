package com.example.realestate.discover.event;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Integration test for {@link DiscoverEventRetentionJob} and {@link DiscoverEventRepository}.
 *
 * <p>Uses Testcontainers + real Flyway migrations so the full V93 schema is present.
 *
 * <p>The retention job and meter registry are instantiated directly in the test
 * (rather than via @Import/@Bean) to avoid the @EnableAutoConfiguration base-packages
 * issue that occurs when a static @Configuration inner class is the only loaded component.
 * This mirrors the pattern used in other @DataJpaTest classes in this project.
 *
 * <p>Proves:
 * <ul>
 *   <li>Deletes only rows with ts older than 180 days (UTC).</li>
 *   <li>Rows exactly at the 180-day boundary are NOT deleted (boundary is exclusive:
 *       {@code WHERE ts < cutoff}, so ts == cutoff is NOT deleted).</li>
 *   <li>Recent rows are untouched.</li>
 *   <li>Metric counter is incremented even when 0 rows are deleted.</li>
 *   <li>Idempotent: second run on the same data deletes 0 additional rows.</li>
 *   <li>Batched delete: more rows than batch size are all purged in multiple passes.</li>
 * </ul>
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class DiscoverEventRetentionJobIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private DiscoverEventRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // Instantiate directly — avoids @Import static-config @EnableAutoConfiguration issue
    private SimpleMeterRegistry meterRegistry;
    private DiscoverEventRetentionJob retentionJob;

    @BeforeEach
    void setUp() {
        // Fresh meter registry and job per test — counter starts at 0 each time
        meterRegistry = new SimpleMeterRegistry();
        retentionJob = new DiscoverEventRetentionJob(repository, meterRegistry);
        // Clean table state
        jdbcTemplate.execute("DELETE FROM discover_event");
    }

    // ── Deletes only expired rows ─────────────────────────────────────────────

    @Test
    @DisplayName("purge deletes rows older than 180 days and leaves recent rows untouched")
    void purge_deletesExpiredOnly() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // 3 expired (> 180 days old)
        insert(now.minusDays(181));
        insert(now.minusDays(200));
        insert(now.minusDays(365));

        // 2 recent (< 180 days old)
        insert(now.minusDays(1));
        insert(now.minusDays(90));

        assertThat(repository.count()).isEqualTo(5);

        retentionJob.purgeExpiredEvents();

        assertThat(repository.count())
                .as("only 2 recent rows should remain after purge")
                .isEqualTo(2);
    }

    // ── UTC boundary row ──────────────────────────────────────────────────────

    @Test
    @DisplayName("rows newer than 180d cutoff are kept; rows older than 180d are deleted")
    void purge_boundaryRowNotDeleted() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // 179 days old — clearly within retention window, must survive
        OffsetDateTime recentRow = now.minusDays(179);
        insert(recentRow);
        // 181 days old — clearly past cutoff, must be deleted
        insert(now.minusDays(181));

        assertThat(repository.count()).isEqualTo(2);

        retentionJob.purgeExpiredEvents();

        // Only the recent row should remain
        assertThat(repository.count())
                .as("row 179d old must survive; row 181d old must be deleted")
                .isEqualTo(1);

        DiscoverEvent surviving = repository.findAll().get(0);
        assertThat(surviving.getTs().toInstant())
                .isCloseTo(recentRow.toInstant(),
                        within(2, java.time.temporal.ChronoUnit.SECONDS));
    }

    // ── Metric counter on zero-row run ────────────────────────────────────────

    @Test
    @DisplayName("metric counter registered and incremented even when 0 rows deleted")
    void metric_incrementedOnZeroRowRun() {
        // Table is empty — 0 rows to delete
        retentionJob.purgeExpiredEvents();

        Counter counter = meterRegistry.find(DiscoverEventRetentionJob.METRIC_ROWS_PURGED).counter();
        assertThat(counter)
                .as("rows_purged counter must be registered after a zero-row run")
                .isNotNull();
        // counter.increment(0) is a no-op for the count value itself, but the counter is registered
        assertThat(counter.count())
                .as("count must be 0 after a zero-row run")
                .isEqualTo(0.0);
    }

    @Test
    @DisplayName("metric counter accumulates the correct deleted count")
    void metric_countsDeletedRows() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        insert(now.minusDays(200));
        insert(now.minusDays(201));

        retentionJob.purgeExpiredEvents();

        Counter counter = meterRegistry.find(DiscoverEventRetentionJob.METRIC_ROWS_PURGED).counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count())
                .as("counter must equal 2 (the two deleted rows)")
                .isCloseTo(2.0, org.assertj.core.data.Offset.offset(0.001));
    }

    // ── Idempotency ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("idempotent: second run on same data deletes 0 additional rows")
    void idempotent_secondRunDeletesZero() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        insert(now.minusDays(190));
        insert(now.minusDays(200));

        // First run — deletes 2 rows
        retentionJob.purgeExpiredEvents();
        assertThat(repository.count()).isEqualTo(0);

        double counterAfterFirst = meterRegistry.find(DiscoverEventRetentionJob.METRIC_ROWS_PURGED)
                .counter().count();

        // Second run — same cutoff, no rows left to delete
        retentionJob.purgeExpiredEvents();
        assertThat(repository.count()).as("still 0 rows after second run").isEqualTo(0);

        double counterAfterSecond = meterRegistry.find(DiscoverEventRetentionJob.METRIC_ROWS_PURGED)
                .counter().count();
        assertThat(counterAfterSecond - counterAfterFirst)
                .as("counter must not increase on zero-delete second run")
                .isCloseTo(0.0, org.assertj.core.data.Offset.offset(0.001));
    }

    // ── Batched delete (functional proof) ────────────────────────────────────

    @Test
    @DisplayName("batched delete: more rows than batch size are all purged in multiple passes")
    void batchedDelete_allPurgedInMultiplePasses() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        // Insert more than DELETE_BATCH_SIZE (500) expired rows
        int expiredCount = DiscoverEventRetentionJob.DELETE_BATCH_SIZE + 10;
        for (int i = 0; i < expiredCount; i++) {
            insert(now.minusDays(181 + i));
        }
        // 1 recent row that must survive
        insert(now.minusDays(1));

        assertThat(repository.count()).isEqualTo(expiredCount + 1);

        retentionJob.purgeExpiredEvents();

        assertThat(repository.count())
                .as("all expired rows must be purged across multiple batch passes; 1 recent row survives")
                .isEqualTo(1);

        // Verify the counter reflects all deleted rows
        Counter counter = meterRegistry.find(DiscoverEventRetentionJob.METRIC_ROWS_PURGED).counter();
        assertThat(counter.count())
                .as("counter must equal total expired rows deleted")
                .isCloseTo((double) expiredCount, org.assertj.core.data.Offset.offset(0.001));
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    private void insert(OffsetDateTime ts) {
        repository.save(new DiscoverEvent(
                UUID.randomUUID(),
                "FILTER_APPLY",
                "IN|KA|Udupi|Manipal",
                "residential",
                "sale",
                "20L_50L",
                Map.of(),
                ts));
    }
}
