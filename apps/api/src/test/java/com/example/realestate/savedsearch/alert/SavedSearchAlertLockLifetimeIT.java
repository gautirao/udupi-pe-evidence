package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import com.example.realestate.notification.EmailService;
import com.example.realestate.savedsearch.AlertFrequency;
import com.example.realestate.savedsearch.ResultScopeKind;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchInserter;
import com.example.realestate.savedsearch.SavedSearchRepository;
import com.example.realestate.savedsearch.SavedSearchService;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * #2482: the outbound email HTTP call must NOT happen inside a database transaction or while the
 * run's {@code pg_try_advisory_xact_lock(2019, 0)} is held.
 *
 * <p>Every assertion here is made from a <em>genuinely separate</em> JDBC connection while a
 * deliberately-stalled email transport is blocked inside {@code EmailService#sendSavedSearchAlert},
 * because that is the only way to observe the property the issue is about: the lock and the
 * transaction are server-side state, invisible from inside the thread that holds them.
 *
 * <p>This class is the red/green oracle for the fix. Against the pre-fix code
 * ({@code @Transactional runNow} taking an {@code xact} lock and then looping over blocking HTTP)
 * {@link #emailStall_releasesAdvisoryLockAndTransactionBeforeSending()} fails on BOTH of its two
 * independent probes (lock not obtainable; a connection sitting {@code idle in transaction}).
 *
 * <p>Test shape mirrors {@link SavedSearchAlertDeliveryIT}: {@code @DataJpaTest} with the real
 * {@code @Transactional} proxies imported and no test-managed transaction, so rows genuinely
 * commit. {@link EmailService} is mocked — the stall is the point, not the network.
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
@Import({
        SavedSearchService.class, SavedSearchInserter.class,
        SavedSearchAlertMatcher.class, SavedSearchAlertBookkeeper.class,
        SavedSearchAlertDeliveryService.class, SavedSearchAlertJob.class})
@org.springframework.transaction.annotation.Transactional(
        propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.task.scheduling.enabled=false",
        "app.saved-search-alerts.public-base-url=https://example.test",
        "app.saved-search-alerts.max-matches-per-run=200"
})
class SavedSearchAlertLockLifetimeIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    static final String MANIPAL = "IN|KA|Udupi|Manipal";
    static final UUID USER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-00000000c0a1");

    /** Generous: these latches only ever wait on another thread in the same JVM. */
    static final long LATCH_TIMEOUT_SECONDS = 60;

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired SavedSearchRepository savedSearchRepository;
    @Autowired SavedSearchService savedSearchService;
    @Autowired SavedSearchAlertJob job;

    @MockitoBean EmailService emailService;
    @MockitoBean PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    ExecutorService executor;
    OffsetDateTime t0;

    @BeforeEach
    void setUp() {
        executor = Executors.newFixedThreadPool(2);
        jdbc.update("DELETE FROM saved_searches WHERE user_id = ?", USER_A); // cascades batches/deliveries
        jdbc.update("DELETE FROM notifications WHERE user_id = ?", USER_A);
        jdbc.update("DELETE FROM property_listings WHERE area_key = ?", MANIPAL);
        jdbc.update("DELETE FROM profiles WHERE user_id = ?", USER_A);
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                USER_A, "ssa-lock-it-" + USER_A + "@test.local");
        jdbc.update("INSERT INTO profiles (user_id, email) VALUES (?, ?)"
                + " ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email", USER_A, "owner-a@example.test");
        t0 = OffsetDateTime.now(ZoneOffset.UTC);
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    // ---- fixtures ---------------------------------------------------------------------------

    SavedSearch alertableSearch() {
        return savedSearchService.create(USER_A, "udupi", ResultScopeKind.AREA_SET, List.of(MANIPAL), null,
                null, null, null, null, Map.of(), "Lock lifetime", AlertFrequency.INSTANT).savedSearch();
    }

    UUID newListing() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, bedrooms, status, is_duplicate,
                     latitude, longitude, first_published_at, created_at, updated_at, title)
                VALUES (?, ?, 'apartment', 'sale', ?, 3, 'LIVE', false, 13.3528, 74.7947, ?, ?, ?, 'Fixture')
                """, id, MANIPAL, 80_00_000_00L, t0.plusMinutes(1), t0.plusMinutes(1), t0.plusMinutes(1));
        return id;
    }

    /**
     * Stalls every {@code sendSavedSearchAlert} call: counts down {@code entered} on arrival, then
     * blocks until {@code release} is opened. This is the "deliberately slow/hanging email
     * transport" the issue asks for, made deterministic with latches instead of a sleep.
     */
    void stallEmailSend(CountDownLatch entered, CountDownLatch release, AtomicInteger attempts) {
        doAnswer(invocation -> {
            attempts.incrementAndGet();
            entered.countDown();
            if (!release.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new IllegalStateException("stalled email send was never released");
            }
            return null;
        }).when(emailService).sendSavedSearchAlert(
                anyString(), any(), anyString(), anyString(), anyInt(), anyString(), anyString());
    }

    // ---- probes (all from a genuinely separate connection) --------------------------------------

    /** What a second, independent session can observe about the alert run's DB footprint. */
    record LockProbe(boolean advisoryLockObtainable, int idleInTransactionBackends) {
    }

    /**
     * Opens its own connection, tries the run's advisory lock, and counts other backends sitting
     * {@code idle in transaction}, then rolls back so the probe leaves no trace. Two independent
     * signals: one directly about the advisory lock, one about transaction lifetime generally.
     */
    LockProbe probeFromSeparateConnection() throws Exception {
        try (Connection probe = dataSource.getConnection()) {
            probe.setAutoCommit(false);
            boolean obtainable;
            try (Statement st = probe.createStatement();
                 ResultSet rs = st.executeQuery(
                         "SELECT pg_try_advisory_xact_lock(" + SavedSearchAlertJob.ADVISORY_LOCK_NAMESPACE + ", 0)")) {
                obtainable = rs.next() && rs.getBoolean(1);
            }
            int idle;
            try (Statement st = probe.createStatement();
                 ResultSet rs = st.executeQuery(
                         "SELECT count(*) FROM pg_stat_activity"
                                 + " WHERE datname = current_database()"
                                 + "   AND pid <> pg_backend_pid()"
                                 + "   AND state = 'idle in transaction'")) {
                idle = rs.next() ? rs.getInt(1) : -1;
            }
            probe.rollback(); // release the advisory lock this probe may just have taken
            return new LockProbe(obtainable, idle);
        }
    }

    int countOf(String sql, UUID arg) {
        return jdbc.queryForObject(sql, Integer.class, arg);
    }

    int deliveries(UUID savedSearchId) {
        return countOf("SELECT COUNT(*) FROM saved_search_alert_deliveries WHERE saved_search_id = ?", savedSearchId);
    }

    int batches(UUID savedSearchId) {
        return countOf("SELECT COUNT(*) FROM saved_search_alert_batches WHERE saved_search_id = ?", savedSearchId);
    }

    int notifications() {
        return countOf("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'saved_search_alert'", USER_A);
    }

    // ---- 1. the headline property ---------------------------------------------------------------

    @Test
    @DisplayName("#2482: while the email transport is hung, a second connection CAN take the run's "
            + "advisory lock and no backend is idle-in-transaction — the run holds no DB resources "
            + "across outbound email latency")
    void emailStall_releasesAdvisoryLockAndTransactionBeforeSending() throws Exception {
        SavedSearch s = alertableSearch();
        UUID listing = newListing();

        CountDownLatch sendEntered = new CountDownLatch(1);
        CountDownLatch releaseSend = new CountDownLatch(1);
        AtomicInteger attempts = new AtomicInteger();
        stallEmailSend(sendEntered, releaseSend, attempts);

        Future<SavedSearchAlertJob.RunSummary> run = executor.submit(() -> job.runNow(t0.plusMinutes(5)));

        LockProbe probe;
        try {
            assertThat(sendEntered.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                    .as("the run must actually reach the email send, otherwise this test probes nothing")
                    .isTrue();
            // Bookkeeping is committed and visible from this (separate) session before the send —
            // i.e. we really are past the transactional unit and inside the stalled HTTP call.
            assertThat(deliveries(s.getId()))
                    .as("bookkeeping must be committed before the send is attempted")
                    .isEqualTo(1);
            probe = probeFromSeparateConnection();
        } finally {
            releaseSend.countDown(); // never leave the run thread hung, even if an assertion blew up
        }
        final LockProbe probeResult = probe;

        // Soft: the two probes are independent signals (advisory lock vs. transaction lifetime) and
        // both belong in the failure report — a hard assert on the first would hide the second.
        SoftAssertions.assertSoftly(softly -> {
            softly.assertThat(probeResult.advisoryLockObtainable())
                    .as("a second session must be able to take pg_try_advisory_xact_lock(%d, 0) while "
                            + "the email transport is hung", SavedSearchAlertJob.ADVISORY_LOCK_NAMESPACE)
                    .isTrue();
            softly.assertThat(probeResult.idleInTransactionBackends())
                    .as("no connection may sit 'idle in transaction' while waiting on the email transport")
                    .isZero();
        });

        SavedSearchAlertJob.RunSummary summary = run.get(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        assertThat(summary.lockAcquired()).isTrue();
        assertThat(summary.delivered()).isEqualTo(1);
        assertThat(summary.failed()).isZero();
        assertThat(attempts.get()).as("exactly one email attempt").isEqualTo(1);
        assertThat(jdbc.queryForList(
                "SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactly(listing);
        assertThat(jdbc.queryForList(
                "SELECT email_status FROM saved_search_alert_batches WHERE saved_search_id = ?", String.class, s.getId()))
                .containsExactly("SENT");
        assertThat(notifications()).isEqualTo(1);
    }

    // ---- 2. overlapping runs, one of them stalled in the email --------------------------------

    @Test
    @DisplayName("#2482: a second run started WHILE the first is hung in the email transport is not "
            + "blocked by it and produces no duplicate batch, delivery row, notification or email")
    void secondRunDuringEmailStall_isNotBlockedAndDoesNotDuplicate() throws Exception {
        SavedSearch s = alertableSearch();
        UUID listing = newListing();

        CountDownLatch sendEntered = new CountDownLatch(1);
        CountDownLatch releaseSend = new CountDownLatch(1);
        AtomicInteger attempts = new AtomicInteger();
        stallEmailSend(sendEntered, releaseSend, attempts);

        Future<SavedSearchAlertJob.RunSummary> first = executor.submit(() -> job.runNow(t0.plusMinutes(5)));

        SavedSearchAlertJob.RunSummary second;
        try {
            assertThat(sendEntered.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
            // The whole point: this second run executes to completion while the first is still
            // hung on outbound HTTP. Pre-fix it returns SKIPPED_LOCKED (lock still held); post-fix
            // it acquires the lock, finds the watermark already advanced and delivers nothing.
            second = executor.submit(() -> job.runNow(t0.plusMinutes(6)))
                    .get(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } finally {
            releaseSend.countDown();
        }

        SavedSearchAlertJob.RunSummary firstSummary = first.get(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        assertThat(second.lockAcquired())
                .as("the stalled first run must not still be holding the advisory lock")
                .isTrue();
        assertThat(second.delivered()).as("watermark CAS already advanced; nothing new to deliver").isZero();
        assertThat(firstSummary.delivered()).isEqualTo(1);

        assertThat(deliveries(s.getId())).as("no duplicate delivery row").isEqualTo(1);
        assertThat(batches(s.getId())).as("no duplicate batch").isEqualTo(1);
        assertThat(notifications()).as("no duplicate in-app notification").isEqualTo(1);
        assertThat(attempts.get()).as("no duplicate email attempt").isEqualTo(1);
        assertThat(jdbc.queryForList(
                "SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactly(listing);
    }

    // ---- 3. genuinely simultaneous runs ---------------------------------------------------------

    @Test
    @DisplayName("#2482: two runs entering runNow simultaneously (both with a stalled email "
            + "transport) deliver exactly once — no duplicate batch, delivery, notification or email")
    void simultaneousRuns_deliverExactlyOnce() throws Exception {
        SavedSearch s = alertableSearch();
        UUID listing = newListing();

        CountDownLatch bothArrived = new CountDownLatch(2);
        CountDownLatch releaseSend = new CountDownLatch(1);
        AtomicInteger attempts = new AtomicInteger();
        // Only the winner ever reaches the send; `bothArrived` is therefore NOT awaited on the
        // send path — the barrier below is what makes the two runs genuinely simultaneous.
        stallEmailSend(bothArrived, releaseSend, attempts);

        CyclicBarrier startTogether = new CyclicBarrier(2);
        Future<SavedSearchAlertJob.RunSummary> a = executor.submit(() -> {
            startTogether.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return job.runNow(t0.plusMinutes(5));
        });
        Future<SavedSearchAlertJob.RunSummary> b = executor.submit(() -> {
            startTogether.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return job.runNow(t0.plusMinutes(5));
        });

        releaseSend.countDown(); // let whichever run reaches the send proceed
        SavedSearchAlertJob.RunSummary sa = a.get(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        SavedSearchAlertJob.RunSummary sb = b.get(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        assertThat(sa.delivered() + sb.delivered()).as("exactly one run delivers").isEqualTo(1);
        assertThat(sa.failed() + sb.failed()).as("per-search failure isolation: nothing failed").isZero();
        assertThat(deliveries(s.getId())).as("no duplicate delivery row").isEqualTo(1);
        assertThat(batches(s.getId())).as("no duplicate batch").isEqualTo(1);
        assertThat(notifications()).as("no duplicate in-app notification").isEqualTo(1);
        assertThat(attempts.get()).as("no duplicate email attempt").isEqualTo(1);
        assertThat(jdbc.queryForList(
                "SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactly(listing);
        verify(emailService, times(1)).sendSavedSearchAlert(
                anyString(), any(), anyString(), anyString(), anyInt(), anyString(), anyString());
        assertThat(savedSearchRepository.findById(s.getId()).orElseThrow().getAlertWatermark())
                .as("watermark advanced exactly once").isNotNull();
    }
}
