package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration;
import org.springframework.boot.autoconfigure.transaction.TransactionAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test proving #1887 PR2 rework #4's CONCRETE concurrency-correctness
 * claims (BLOCKING 1/2/3) with real, separately-committed transactions and, where genuine
 * concurrent blocking must be demonstrated (T3, T7), TWO real {@link java.sql.Connection}s.
 *
 * <h2>Why NOT {@code @DataJpaTest} (unlike {@link AreaOnboardingApplyIT})</h2>
 * {@code @DataJpaTest} wraps every test method in ONE rollback-only transaction — fine for
 * single-connection logic tests, but unusable here: a lock acquired on one connection is invisible
 * to (and never blocks) a statement issued from a second, genuinely independent connection unless
 * both are inside REAL, separately-committed transactions. This class instead boots a minimal,
 * non-JPA Spring context (real {@link org.springframework.transaction.annotation.Transactional}
 * AOP via {@link TransactionAutoConfiguration} backed by a REAL {@link
 * org.springframework.transaction.PlatformTransactionManager} bean from {@link
 * DataSourceTransactionManagerAutoConfiguration} — {@code TransactionAutoConfiguration} alone does
 * NOT create a transaction manager; without this import {@code @Transactional} on {@link
 * AreaOnboardingApplyService#apply}/{@link AreaOnboardingReviewService#approve} would be a SILENT
 * NO-OP in this test JVM and every statement would autocommit individually — see {@link
 * #midPhase2FailureRollsBackFirstCandidatesAlreadyExecutedWrite} for a test that FAILS if this ever
 * regresses back to a no-op — a real {@link DataSourceAutoConfiguration}-backed
 * {@link DataSource}, real {@link FlywayAutoConfiguration}) against the SAME
 * {@code postgis/postgis:15-3.4} container and Flyway locations {@link AreaOnboardingApplyIT} uses,
 * so every {@code jdbcTemplate}/service call in a test method commits for real, and two manually
 * opened {@link java.sql.Connection}s (autoCommit=false) can genuinely race against each other.
 *
 * <p>Manual teardown ({@link #tearDown}) replaces the rollback wrapper {@code @DataJpaTest} would
 * otherwise have provided.
 */
@SpringBootTest(classes = AreaOnboardingApplyConcurrencyIT.Config.class)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class AreaOnboardingApplyConcurrencyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final AreaOnboardingService.BatchIdentity TEST_IDENTITY = new AreaOnboardingService.BatchIdentity(
            "dataset-concurrency-it", "v1", "PLACEHOLDER-FIXED-UP-POST-INSERT", "test-provider", "1",
            OffsetDateTime.parse("2026-01-01T00:00:00Z"));

    @Configuration
    @ImportAutoConfiguration({
            DataSourceAutoConfiguration.class,
            JdbcTemplateAutoConfiguration.class,
            FlywayAutoConfiguration.class,
            // #1887 PR2 rework #4 REVIEW FIX: TransactionAutoConfiguration alone registers the
            // @Transactional AOP infrastructure (advisor/interceptor) but does NOT itself provide a
            // PlatformTransactionManager bean. Without DataSourceTransactionManagerAutoConfiguration,
            // no transaction manager bean exists in this context, so Spring silently skips wrapping
            // apply()/approve() in a real transaction — every statement autocommits individually and
            // @Transactional becomes a no-op. Importing it here is what makes this test class's own
            // doc-comment claim ("real @Transactional AOP ... commits for real") actually true.
            DataSourceTransactionManagerAutoConfiguration.class,
            TransactionAutoConfiguration.class
    })
    static class Config {
        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        AreaOnboardingService onboardingService(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
            return new AreaOnboardingService(jdbcOperations, objectMapper);
        }

        @Bean
        AreaOnboardingReviewService reviewService(JdbcOperations jdbcOperations) {
            return new AreaOnboardingReviewService(jdbcOperations);
        }

        @Bean
        AreaOnboardingApplyAudit applyAudit(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
            return new AreaOnboardingApplyAudit(jdbcOperations, objectMapper);
        }

        @Bean
        AreaRegionReclassOutbox reclassOutbox(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
            return new AreaRegionReclassOutbox(jdbcOperations, objectMapper);
        }

        @Bean
        AreaOnboardingApplyService applyService(
                JdbcOperations jdbcOperations, ObjectMapper objectMapper,
                AreaOnboardingApplyAudit applyAudit, AreaRegionReclassOutbox reclassOutbox) {
            return new AreaOnboardingApplyService(jdbcOperations, objectMapper, applyAudit, reclassOutbox);
        }
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private AreaOnboardingService onboardingService;
    @Autowired
    private AreaOnboardingReviewService reviewService;
    @Autowired
    private AreaOnboardingApplyService applyService;

    private Integer udupiCityId;

    private Integer udupiCityId() {
        if (udupiCityId == null) {
            udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        }
        return udupiCityId;
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update("DELETE FROM area_onboarding_apply_audit");
        jdbcTemplate.update("DELETE FROM area_region_reclass_outbox");
        jdbcTemplate.update("DELETE FROM area_onboarding_candidate");
        jdbcTemplate.update("DELETE FROM area_onboarding_batch");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'IN|KA|Udupi|Conc%'");
    }

    private AreaOnboardingService.CandidateInput candidate(
            String areaKey, String name, Double lat, Double lon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String externalSourceId) {
        return new AreaOnboardingService.CandidateInput(
                areaKey, name, lat, lon, minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId);
    }

    private long dryRun(List<AreaOnboardingService.CandidateInput> candidates) {
        return onboardingService.dryRun(udupiCityId(), "concurrency-it", TEST_IDENTITY, candidates).batchId();
    }

    private long dryRunSingleApproveFinalize(AreaOnboardingService.CandidateInput input, String reviewedBy) {
        long batchId = dryRun(List.of(input));
        reviewService.approve(batchId, reviewedBy);
        return batchId;
    }

    private String reviewStatusOf(long batchId) {
        return jdbcTemplate.queryForObject(
                "SELECT review_status FROM area_onboarding_batch WHERE id = ?", String.class, batchId);
    }

    private String persistedBatchChecksumOf(long batchId) {
        return jdbcTemplate.queryForObject(
                "SELECT persisted_batch_checksum FROM area_onboarding_batch WHERE id = ?", String.class, batchId);
    }

    private String appliedBatchChecksumOf(long batchId) {
        return jdbcTemplate.queryForObject(
                "SELECT applied_batch_checksum FROM area_onboarding_batch WHERE id = ?", String.class, batchId);
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    // ── T1: checksum laundering via repeated approve() is now refused, not laundered ────────────

    @Test
    @DisplayName("T1: tampering a digest field after FINALIZE, then calling approve() again (a "
            + "legitimate no-new-approvals call), is REFUSED and persisted_batch_checksum stays "
            + "byte-identical; apply() then fails on the ORIGINAL checksum vs the tampered state, "
            + "with zero area/audit/outbox writes")
    void tamperAfterFinalizeThenReapproveRefusesAndChecksumUnlaundered() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT1", "Conc T1", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "t1-ext");
        long batchId = dryRunSingleApproveFinalize(input, "reviewer-t1");
        assertThat(reviewStatusOf(batchId)).isEqualTo("FINALIZED");
        String checksumBeforeTamper = persistedBatchChecksumOf(batchId);
        assertThat(checksumBeforeTamper).isNotBlank();

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET external_source_id = 'tampered-t1-esid' WHERE batch_id = ?",
                batchId);

        assertThatThrownBy(() -> reviewService.approve(batchId, "reviewer-t1-again"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FINALIZED");
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumBeforeTamper); // NOT laundered

        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");
        Integer areaCountBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ConcT1");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-t1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        Integer areaCountAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ConcT1");
        assertThat(areaCountAfter).isEqualTo(areaCountBefore);
    }

    // ── T2: FINALIZED batch is immutable to further review mutation, refused before apply ───────

    @Test
    @DisplayName("T2: once FINALIZED, a repeat approve() call (even approving nothing new, no "
            + "tampering involved) is refused BEFORE apply — review_decision and "
            + "persisted_batch_checksum are unchanged")
    void finalizedBatchRefusesAnyFurtherApproveCall() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT2", "Conc T2", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "t2-ext");
        long batchId = dryRunSingleApproveFinalize(input, "reviewer-t2");
        assertThat(reviewStatusOf(batchId)).isEqualTo("FINALIZED");
        String checksumAtFinalize = persistedBatchChecksumOf(batchId);
        String decisionAtFinalize = jdbcTemplate.queryForObject(
                "SELECT review_decision FROM area_onboarding_candidate WHERE batch_id = ?", String.class, batchId);

        assertThatThrownBy(() -> reviewService.approve(batchId, "reviewer-t2-again"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FINALIZED");

        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalize);
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT review_decision FROM area_onboarding_candidate WHERE batch_id = ?",
                        String.class, batchId))
                .isEqualTo(decisionAtFinalize);
    }

    // ── T3: Phase-1-to-Phase-2 TOCTOU on the canonical target ───────────────────────────────────

    @Test
    @DisplayName("T3a: while a transaction holds SELECT ... FOR UPDATE on a target area row (the "
            + "SAME lock apply() Phase 1b takes), a concurrent connection's UPDATE against that "
            + "SAME row blocks/times out under a short lock_timeout — the row-lock genuinely closes "
            + "the Phase-1-to-Phase-2 window; after the holder commits its own write, that write "
            + "(not the blocked concurrent one) is what persists")
    void concurrentWriteBlocksWhileRowLockHeldAndHoldersWriteWins() throws Exception {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT3a", "Conc T3a Original", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "t3a-ext");
        long batchId = dryRunSingleApproveFinalize(input, "reviewer-t3a");
        applyService.apply(batchId, "applier-t3a"); // establishes a real committed area row

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch lockAcquired = new CountDownLatch(1);
            CountDownLatch releaseLock = new CountDownLatch(1);

            Future<Void> holder = pool.submit(() -> {
                try (Connection connA = dataSource.getConnection()) {
                    connA.setAutoCommit(false);
                    try (var ps = connA.prepareStatement(
                            "SELECT area_key FROM areas WHERE area_key = ? FOR UPDATE")) {
                        ps.setString(1, "IN|KA|Udupi|ConcT3a");
                        ps.executeQuery();
                    }
                    lockAcquired.countDown();
                    assertThat(releaseLock.await(5, TimeUnit.SECONDS)).isTrue();
                    try (var ps = connA.prepareStatement(
                            "UPDATE areas SET name = ? WHERE area_key = ?")) {
                        ps.setString(1, "Conc T3a Holder Wrote This");
                        ps.setString(2, "IN|KA|Udupi|ConcT3a");
                        ps.executeUpdate();
                    }
                    connA.commit();
                }
                return null;
            });

            Future<SQLException> blocked = pool.submit(() -> {
                assertThat(lockAcquired.await(5, TimeUnit.SECONDS)).isTrue();
                try (Connection connB = dataSource.getConnection()) {
                    connB.setAutoCommit(false);
                    try (var setLockTimeout = connB.createStatement()) {
                        setLockTimeout.execute("SET LOCAL lock_timeout = '500ms'");
                    }
                    try (var ps = connB.prepareStatement(
                            "UPDATE areas SET name = ? WHERE area_key = ?")) {
                        ps.setString(1, "Conc T3a Sneaky Concurrent Write");
                        ps.setString(2, "IN|KA|Udupi|ConcT3a");
                        ps.executeUpdate();
                        connB.commit();
                        return null; // did NOT block — test will fail the assertion below
                    } catch (SQLException blockedException) {
                        connB.rollback();
                        return blockedException;
                    } finally {
                        releaseLock.countDown();
                    }
                }
            });

            SQLException blockedException = blocked.get(10, TimeUnit.SECONDS);
            holder.get(10, TimeUnit.SECONDS);

            assertThat((Object) blockedException).as("concurrent UPDATE must be blocked by the row lock").isNotNull();

            String finalName = jdbcTemplate.queryForObject(
                    "SELECT name FROM areas WHERE area_key = ?", String.class, "IN|KA|Udupi|ConcT3a");
            assertThat(finalName).isEqualTo("Conc T3a Holder Wrote This");
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("T3b (inverse): an external edit committed BEFORE apply() runs makes apply() abort "
            + "on fingerprint drift — the external value is preserved, not silently reverted")
    void externalEditCommittedBeforeApplyAbortsAndPreservesExternalValue() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT3b", "Conc T3b Original", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "t3b-ext");
        long firstBatchId = dryRunSingleApproveFinalize(input, "reviewer-t3b-1");
        applyService.apply(firstBatchId, "applier-t3b-1"); // materialize the area

        // A second batch reviewing an UPDATE for the SAME area (captures a fingerprint of the
        // CURRENT, pre-external-edit state at review time).
        AreaOnboardingService.CandidateInput updateInput = candidate(
                "IN|KA|Udupi|ConcT3b", "Conc T3b Reviewed Update", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "t3b-ext");
        long secondBatchId = dryRunSingleApproveFinalize(updateInput, "reviewer-t3b-2");

        // Committed, out-of-band edit BEFORE apply() runs.
        jdbcTemplate.update("UPDATE areas SET name = ? WHERE area_key = ?",
                "Conc T3b Externally Edited", "IN|KA|Udupi|ConcT3b");

        assertThatThrownBy(() -> applyService.apply(secondBatchId, "applier-t3b-2"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("canonical state has changed since review");

        String preserved = jdbcTemplate.queryForObject(
                "SELECT name FROM areas WHERE area_key = ?", String.class, "IN|KA|Udupi|ConcT3b");
        assertThat(preserved).isEqualTo("Conc T3b Externally Edited");
    }

    // ── T4: CREATE + external edit -> re-apply refuses, external edit preserved ─────────────────

    @Test
    @DisplayName("T4: apply() creates an area; an external edit is committed; re-applying the SAME "
            + "unchanged batch REFUSES (fingerprint drift on the now-real, self-healed fingerprint) "
            + "— the external edit is preserved, not silently reverted")
    void createThenExternalEditThenReapplyRefusesAndPreservesEdit() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT4", "Conc T4 Original", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "t4-ext");
        long batchId = dryRunSingleApproveFinalize(input, "reviewer-t4");

        ApplyReport first = applyService.apply(batchId, "applier-t4-1");
        assertThat(first.created()).isEqualTo(1);
        assertThat(appliedBatchChecksumOf(batchId)).isNotBlank();

        jdbcTemplate.update("UPDATE areas SET name = ? WHERE area_key = ?",
                "Conc T4 Externally Edited", "IN|KA|Udupi|ConcT4");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-t4-2"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("canonical state has changed since review");

        String preserved = jdbcTemplate.queryForObject(
                "SELECT name FROM areas WHERE area_key = ?", String.class, "IN|KA|Udupi|ConcT4");
        assertThat(preserved).isEqualTo("Conc T4 Externally Edited");
    }

    // ── T5: CREATE + external delete -> re-apply refuses, area NOT recreated ────────────────────

    @Test
    @DisplayName("T5: apply() creates an area; it is externally DELETED (no dependent FKs — a "
            + "brand-new test-only key); re-applying the SAME unchanged batch REFUSES (real stored "
            + "fingerprint vs no-longer-existing area) — the area is NOT silently recreated")
    void createThenExternalDeleteThenReapplyRefusesAndDoesNotRecreate() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT5", "Conc T5 Original", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "t5-ext");
        long batchId = dryRunSingleApproveFinalize(input, "reviewer-t5");

        ApplyReport first = applyService.apply(batchId, "applier-t5-1");
        assertThat(first.created()).isEqualTo(1);

        jdbcTemplate.update("DELETE FROM areas WHERE area_key = ?", "IN|KA|Udupi|ConcT5");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-t5-2"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no area now exists there");

        Integer recreatedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ConcT5");
        assertThat(recreatedCount).isZero();
    }

    // ── T7: concurrent approve()/apply() on the SAME batch serialize safely ─────────────────────

    @Test
    @DisplayName("T7a: while a transaction holds SELECT ... FOR UPDATE on the batch row (the SAME "
            + "FIRST lock both approve() and apply() take), a concurrent connection's attempt to "
            + "take the SAME lock blocks/times out — proving approve()/apply() on the SAME batch "
            + "cannot interleave, only serialize")
    void concurrentBatchRowLockBlocksSecondConnection() throws Exception {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT7a", "Conc T7a", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "t7a-ext");
        long batchId = dryRun(List.of(input)); // not yet finalized — batch row exists

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch lockAcquired = new CountDownLatch(1);
            CountDownLatch releaseLock = new CountDownLatch(1);

            Future<Void> holder = pool.submit(() -> {
                try (Connection connA = dataSource.getConnection()) {
                    connA.setAutoCommit(false);
                    try (var ps = connA.prepareStatement(
                            "SELECT id FROM area_onboarding_batch WHERE id = ? FOR UPDATE")) {
                        ps.setLong(1, batchId);
                        ps.executeQuery();
                    }
                    lockAcquired.countDown();
                    assertThat(releaseLock.await(5, TimeUnit.SECONDS)).isTrue();
                    connA.commit();
                }
                return null;
            });

            Future<SQLException> blocked = pool.submit(() -> {
                assertThat(lockAcquired.await(5, TimeUnit.SECONDS)).isTrue();
                try (Connection connB = dataSource.getConnection()) {
                    connB.setAutoCommit(false);
                    try (var setLockTimeout = connB.createStatement()) {
                        setLockTimeout.execute("SET LOCAL lock_timeout = '500ms'");
                    }
                    try (var ps = connB.prepareStatement(
                            "SELECT id FROM area_onboarding_batch WHERE id = ? FOR UPDATE")) {
                        ps.setLong(1, batchId);
                        ps.executeQuery();
                        connB.commit();
                        return null; // did NOT block — test will fail the assertion below
                    } catch (SQLException blockedException) {
                        connB.rollback();
                        return blockedException;
                    } finally {
                        releaseLock.countDown();
                    }
                }
            });

            SQLException blockedException = blocked.get(10, TimeUnit.SECONDS);
            holder.get(10, TimeUnit.SECONDS);

            assertThat((Object) blockedException).as("concurrent batch-row lock attempt must be blocked").isNotNull();
        } finally {
            pool.shutdownNow();
        }
    }

    // ── T8: self-checking proof that @Transactional is REAL, not a no-op ───────────────────────
    //
    // Every test above proves a genuine *concurrency* property (locking across TWO real
    // connections), but none of them fails merely because @Transactional silently stopped
    // wrapping apply() in a transaction — a single-connection autocommit statement sequence would
    // pass them too. This test is deliberately DIFFERENT: it drives a genuine mid-Phase-2 failure
    // on a SINGLE connection (apply()'s own connection) and asserts the FIRST candidate's
    // already-executed INSERT/audit write is fully rolled back alongside the second candidate's
    // failure. That rollback can ONLY happen if apply() is genuinely running inside one real,
    // atomic transaction — i.e. it depends on exactly the DataSourceTransactionManagerAutoConfiguration
    // fix above. If @Transactional were ever a no-op again (autocommit), the first candidate's
    // write would already be durably committed by the time the second candidate's write throws,
    // and the zero-row assertions below would fail — making this test a tripwire for that
    // regression, not merely a demonstration of the currently-passing behaviour.

    @Test
    @DisplayName("T8: a mid-Phase-2 failure (second of two candidates resolving to the SAME "
            + "not-yet-materialized target key) rolls back the FIRST candidate's already-executed "
            + "area/audit INSERT too — proving @Transactional genuinely wraps apply() in one atomic "
            + "transaction, not a silent no-op that would let the first write autocommit")
    void midPhase2FailureRollsBackFirstCandidatesAlreadyExecutedWrite() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ConcT8", "Conc T8", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "t8-ext");
        long batchId = dryRun(List.of(input));

        long firstCandidateId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_onboarding_candidate WHERE batch_id = ?", Long.class, batchId);

        // Duplicate the SAME PENDING candidate row (same input/normalised/matched area key, same
        // payload) into the SAME batch. Both rows resolve to the identical, not-yet-materialized
        // target area_key. reviewService.approve() below will fingerprint and finalize BOTH
        // identically (both get the "no existing area yet" sentinel), so apply()'s Phase 1
        // (payload/key/fingerprint) verification passes for BOTH — the collision is only real at
        // Phase 2, when the FIRST candidate's INSERT actually creates the row and the SECOND
        // candidate's INSERT ... ON CONFLICT DO NOTHING (BLOCKING 2's own defensive assertion)
        // then affects 0 rows instead of 1.
        jdbcTemplate.update("""
                INSERT INTO area_onboarding_candidate
                    (batch_id, input_area_key, normalised_area_key, matched_area_key, outcome,
                     conflict_types, geometry_trust, external_source_id, candidate_payload,
                     payload_checksum, review_decision)
                SELECT batch_id, input_area_key, normalised_area_key, matched_area_key, outcome,
                       conflict_types, geometry_trust, external_source_id, candidate_payload,
                       payload_checksum, 'PENDING'
                FROM area_onboarding_candidate WHERE id = ?
                """, firstCandidateId);

        assertThat(count("area_onboarding_candidate")).isEqualTo(2);

        reviewService.approve(batchId, "reviewer-t8"); // approves + finalizes BOTH duplicate rows

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-t8"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("a concurrent process created this key first");

        // THE POINT: if @Transactional were a no-op (the bug this fix closes), the FIRST
        // candidate's INSERT INTO areas + its CREATE_AREA audit row would already be durably
        // committed by the time the SECOND candidate's INSERT throws — these counts would be 1,
        // not 0. With a REAL transaction manager, apply()'s whole method rolls back together.
        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ConcT8"))
                .isZero();
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
    }

    @Test
    @DisplayName("T7b: the three possible approve()/apply() orderings on the SAME batch each behave "
            + "deterministically with no checksum corruption — apply-first then approve refuses "
            + "(already applied); approve-finalizes then apply succeeds; approve leaves the batch "
            + "IN_REVIEW (never finalized) then apply refuses on the FINALIZED precondition")
    void threeApproveApplyOrderingsBehaveDeterministically() {
        // Ordering 1: apply() runs first (on a FINALIZED batch) -> a later approve() call refuses
        // because the batch is ALREADY APPLIED (pre-existing FIX 1 immutability guard).
        // NOTE: each of the 3 orderings below uses a spatially DISTANT bbox (unlike AreaOnboardingApplyIT,
        // this class does NOT roll back between statements within a test, so a REAL committed area
        // from ordering N would otherwise trip dry-run's SIMILAR_OR_OVERLAPPING conflict detection
        // for ordering N+1's candidate if their bboxes overlapped).
        AreaOnboardingService.CandidateInput input1 = candidate(
                "IN|KA|Udupi|ConcT7b1", "Conc T7b1", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "t7b1-ext");
        long batch1 = dryRunSingleApproveFinalize(input1, "reviewer-t7b1");
        applyService.apply(batch1, "applier-t7b1");
        assertThatThrownBy(() -> reviewService.approve(batch1, "reviewer-t7b1-late"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ALREADY been applied");

        // Ordering 2: approve() finalizes first -> apply() proceeds normally.
        AreaOnboardingService.CandidateInput input2 = candidate(
                "IN|KA|Udupi|ConcT7b2", "Conc T7b2", 13.32, 74.84, 13.31, 74.83, 13.33, 74.85, "OSM", "t7b2-ext");
        long batch2 = dryRunSingleApproveFinalize(input2, "reviewer-t7b2");
        assertThat(reviewStatusOf(batch2)).isEqualTo("FINALIZED");
        ApplyReport report2 = applyService.apply(batch2, "applier-t7b2");
        assertThat(report2.created()).isEqualTo(1);

        // Ordering 3: review never finalizes (a candidate is left PENDING, bypassing approve()
        // entirely for it, mirroring AreaOnboardingApplyIT's FIX 1 test) -> apply() refuses on the
        // FINALIZED precondition, no writes.
        AreaOnboardingService.CandidateInput input3 = candidate(
                "IN|KA|Udupi|ConcT7b3", "Conc T7b3", 13.28, 74.70, 13.27, 74.69, 13.29, 74.71, "OSM", "t7b3-ext");
        long batch3 = dryRun(List.of(input3));
        assertThat(reviewStatusOf(batch3)).isEqualTo("IN_REVIEW"); // approve() never called
        assertThatThrownBy(() -> applyService.apply(batch3, "applier-t7b3"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FINALIZED");
        Integer areaCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ConcT7b3");
        assertThat(areaCount).isZero();
    }
}
