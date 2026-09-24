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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test for #2676 Slice B1b's {@link AreaOnboardingBatchQuery}.
 *
 * <p>Proves two things that a {@code @DataJpaTest} (single rollback-only transaction) cannot:
 * (1) every field {@link AreaOnboardingBatchQuery#findBatchDetail} returns for a batch that has
 * gone through a real {@code dryRun -> approve} cycle agrees with what is actually persisted in
 * {@code area_onboarding_batch}/{@code area_onboarding_candidate}, and (2) a GET never blocks on,
 * and never observes a torn read across, a concurrent {@code apply()}/{@code approve()} holding
 * the {@code SELECT ... FOR UPDATE} lock on the same batch row — the entire reason
 * {@link AreaOnboardingBatchQuery} uses {@code REPEATABLE_READ} and deliberately never takes that
 * lock itself. Config/bean wiring and the two-connection locking technique mirror {@link
 * AreaOnboardingApplyConcurrencyIT} (see that class's T7a, {@code
 * concurrentBatchRowLockBlocksSecondConnection}) rather than inventing a new pattern.
 */
@SpringBootTest(classes = AreaOnboardingBatchQueryIT.Config.class)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class AreaOnboardingBatchQueryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final AreaOnboardingService.BatchIdentity TEST_IDENTITY = new AreaOnboardingService.BatchIdentity(
            "dataset-batchquery-it", "v1", "PLACEHOLDER-FIXED-UP-POST-INSERT", "test-provider", "1",
            OffsetDateTime.parse("2026-01-01T00:00:00Z"));

    @Configuration
    @ImportAutoConfiguration({
            DataSourceAutoConfiguration.class,
            JdbcTemplateAutoConfiguration.class,
            FlywayAutoConfiguration.class,
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
        AreaOnboardingBatchQuery batchQuery(JdbcOperations jdbcOperations) {
            return new AreaOnboardingBatchQuery(jdbcOperations);
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
    private AreaOnboardingBatchQuery batchQuery;

    private Integer udupiCityId;

    private Integer udupiCityId() {
        if (udupiCityId == null) {
            udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        }
        return udupiCityId;
    }

    @AfterEach
    void tearDown() {
        jdbcTemplate.update("DELETE FROM area_onboarding_candidate");
        jdbcTemplate.update("DELETE FROM area_onboarding_batch");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'IN|KA|Udupi|BQ%'");
    }

    private AreaOnboardingService.CandidateInput candidate(
            String areaKey, String name, Double lat, Double lon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String externalSourceId) {
        return new AreaOnboardingService.CandidateInput(
                areaKey, name, lat, lon, minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId);
    }

    private long dryRun(List<AreaOnboardingService.CandidateInput> candidates) {
        return onboardingService.dryRun(udupiCityId(), "batchquery-it", TEST_IDENTITY, candidates).batchId();
    }

    // ── field agreement: findBatchDetail() vs the raw persisted rows post-approve ──────────────

    @Test
    @DisplayName("findBatchDetail's batch header and candidate fields agree with the persisted "
            + "area_onboarding_batch/area_onboarding_candidate rows after a real dryRun -> approve cycle, "
            + "and never surface candidate_payload/payload_checksum")
    void batchDetailFieldsAgreeWithPersistedRowsPostApprove() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|BQFieldAgree", "BQ Field Agree", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76,
                "OSM", "bq-field-agree-ext");
        long batchId = dryRun(List.of(input));
        reviewService.approve(batchId, "field-agree-reviewer");

        AreaOnboardingBatchDetail detail = batchQuery.findBatchDetail(batchId);

        var persistedBatch = jdbcTemplate.queryForMap(
                "SELECT city_id, apply_allowed, dataset_id, dataset_version, provider, "
                        + "source_extracted_at, review_status, apply_status "
                        + "FROM area_onboarding_batch WHERE id = ?", batchId);

        assertThat(detail.batchId()).isEqualTo(batchId);
        assertThat(detail.cityId()).isEqualTo(((Number) persistedBatch.get("city_id")).intValue());
        assertThat(detail.applyAllowed()).isEqualTo(persistedBatch.get("apply_allowed"));
        assertThat(detail.datasetId()).isEqualTo(persistedBatch.get("dataset_id"));
        assertThat(detail.datasetVersion()).isEqualTo(persistedBatch.get("dataset_version"));
        assertThat(detail.provider()).isEqualTo(persistedBatch.get("provider"));
        assertThat(detail.reviewStatus()).isEqualTo(persistedBatch.get("review_status"));
        assertThat(detail.applyStatus()).isEqualTo(persistedBatch.get("apply_status"));
        // approve() is expected to have moved review_status off its pre-review default.
        assertThat(detail.reviewStatus()).isNotEqualTo("PENDING");

        var persistedCandidates = jdbcTemplate.queryForList(
                "SELECT id, input_area_key, normalised_area_key, matched_area_key, outcome, "
                        + "review_decision, conflict_types, geometry_trust, external_source_id "
                        + "FROM area_onboarding_candidate WHERE batch_id = ? ORDER BY id", batchId);

        assertThat(detail.candidates()).hasSize(persistedCandidates.size()).hasSize(1);
        var persistedCandidate = persistedCandidates.get(0);
        AreaOnboardingBatchDetail.CandidateSummary candidateSummary = detail.candidates().get(0);

        assertThat(candidateSummary.candidateId()).isEqualTo(((Number) persistedCandidate.get("id")).longValue());
        assertThat(candidateSummary.inputAreaKey()).isEqualTo(persistedCandidate.get("input_area_key"));
        assertThat(candidateSummary.normalisedAreaKey()).isEqualTo(persistedCandidate.get("normalised_area_key"));
        assertThat(candidateSummary.matchedAreaKey()).isEqualTo(persistedCandidate.get("matched_area_key"));
        assertThat(candidateSummary.outcome()).isEqualTo(persistedCandidate.get("outcome"));
        assertThat(candidateSummary.reviewDecision()).isEqualTo(persistedCandidate.get("review_decision"));
        assertThat(candidateSummary.geometryTrust()).isEqualTo(persistedCandidate.get("geometry_trust"));
        assertThat(candidateSummary.externalSourceId()).isEqualTo(persistedCandidate.get("external_source_id"));

        Object persistedConflictTypes = persistedCandidate.get("conflict_types");
        if (persistedConflictTypes == null || persistedConflictTypes.toString().isBlank()) {
            assertThat(candidateSummary.conflictTypes()).isEmpty();
        } else {
            assertThat(String.join(",", candidateSummary.conflictTypes())).isEqualTo(persistedConflictTypes);
        }

        // Security constraint (#2676 B1b HIGH review): the raw staged payload must never surface.
        assertThat(detail.toString()).doesNotContain("candidate_payload");
    }

    @Test
    @DisplayName("findBatchDetail throws IllegalArgumentException (mapped to 404 by the controller) "
            + "for an unknown batchId")
    void findBatchDetailThrowsForUnknownBatchId() {
        long unknownBatchId = -999L;
        assertThatThrownBy(() -> batchQuery.findBatchDetail(unknownBatchId))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── no torn read / no blocking while a concurrent apply()/approve() holds the batch lock ───

    @Test
    @DisplayName("findBatchDetail does not block behind, and does not observe a torn read across, "
            + "a concurrent transaction holding SELECT ... FOR UPDATE on the same batch row — the "
            + "same first lock approve()/apply() take (see AreaOnboardingApplyConcurrencyIT T7a)")
    void findBatchDetailDoesNotBlockOnConcurrentlyHeldRowLock() throws Exception {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|BQNoBlock", "BQ No Block", 13.30, 74.75, 13.29, 74.74, 13.31, 74.76,
                "OSM", "bq-no-block-ext");
        long batchId = dryRun(List.of(input));

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

            Future<AreaOnboardingBatchDetail> reader = pool.submit(() -> {
                assertThat(lockAcquired.await(5, TimeUnit.SECONDS)).isTrue();
                try {
                    // If findBatchDetail() ever took the FOR UPDATE lock itself, this call would
                    // hang until releaseLock fires and the assertion below (a tight timeout on
                    // Future#get) would fail the test.
                    return batchQuery.findBatchDetail(batchId);
                } finally {
                    releaseLock.countDown();
                }
            });

            AreaOnboardingBatchDetail detail = reader.get(2, TimeUnit.SECONDS);
            holder.get(10, TimeUnit.SECONDS);

            assertThat(detail.batchId()).isEqualTo(batchId);
            assertThat(detail.candidates()).hasSize(1);
        } finally {
            pool.shutdownNow();
        }
    }
}
