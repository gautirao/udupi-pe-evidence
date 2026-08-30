package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/**
 * Testcontainers integration test proving {@link AreaOnboardingApplyService#apply}'s safety
 * invariants (#1887 PR2 + the post-review rework) against all 11 original acceptance criteria PLUS
 * the 7 blocking findings from the user's independent PR review: unresolved-decision refusal +
 * decision immutability (FIX 1), idempotent geometry-preservation audit (FIX 2), full
 * projection-column verification (FIX 3), production dataset identity + artifact-checksum
 * enforcement (FIX 4), removed automatic alias creation (FIX 5), provenance in the existing audit
 * row (FIX 6), and a stale-canonical-target guard for UPDATE candidates (FIX 7).
 *
 * <p>Mirrors {@link AreaOnboardingDryRunSafetyIT}'s Testcontainers + Flyway configuration exactly.
 * Uses the real Bangalore + Udupi area seed from V71. Services are wired as REAL Spring beans (via
 * the nested {@link Config}) rather than manually {@code new}'d, so {@code @Transactional} is
 * genuinely exercised by the container — not merely assumed.
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
class AreaOnboardingApplyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String HEBBAL = "IN|KA|Bengaluru|Hebbal";
    private static final String KORAMANGALA = "IN|KA|Bengaluru|Koramangala";

    /** A complete, production-shaped dataset identity (#1887 rework FIX 4) shared by every test. */
    private static final AreaOnboardingService.BatchIdentity TEST_IDENTITY = new AreaOnboardingService.BatchIdentity(
            "dataset-apply-it", "v1", "PLACEHOLDER-FIXED-UP-POST-INSERT", "test-provider", "1",
            OffsetDateTime.parse("2026-01-01T00:00:00Z"));

    @TestConfiguration
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
    private AreaOnboardingService onboardingService;
    @Autowired
    private AreaOnboardingReviewService reviewService;
    @Autowired
    private AreaOnboardingApplyService applyService;
    @Autowired
    private ObjectMapper objectMapper;

    private Integer bangaloreCityId;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        bangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'bangalore'", Integer.class);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private AreaOnboardingService.CandidateInput candidate(
            String areaKey, String name, Double lat, Double lon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String externalSourceId) {
        return new AreaOnboardingService.CandidateInput(
                areaKey, name, lat, lon, minLat, minLon, maxLat, maxLon, geometrySource, externalSourceId);
    }

    /**
     * #1887 rework #2: a plain real dry-run with a COMPLETE {@link #TEST_IDENTITY} — NO post-insert
     * fix-up of any kind. {@code artifact_checksum} is left exactly as PR1's dry-run wrote it
     * (provenance metadata, untouched by PR2). {@code persisted_batch_checksum} starts NULL and is
     * populated only by {@link AreaOnboardingReviewService#approve} at review-finalisation time.
     */
    private long dryRun(int cityId, List<AreaOnboardingService.CandidateInput> candidates) {
        return onboardingService.dryRun(cityId, "apply-it", TEST_IDENTITY, candidates).batchId();
    }

    private long dryRunSingleApprove(int cityId, AreaOnboardingService.CandidateInput candidate, String reviewedBy) {
        long batchId = dryRun(cityId, List.of(candidate));
        reviewService.approve(batchId, reviewedBy);
        return batchId;
    }

    private String artifactChecksumOf(long batchId) {
        return jdbcTemplate.queryForObject(
                "SELECT artifact_checksum FROM area_onboarding_batch WHERE id = ?", String.class, batchId);
    }

    private String persistedBatchChecksumOf(long batchId) {
        return jdbcTemplate.queryForObject(
                "SELECT persisted_batch_checksum FROM area_onboarding_batch WHERE id = ?", String.class, batchId);
    }

    // ── AC1: exact candidate_payload materialization ────────────────────────────

    @Test
    @DisplayName("AC1: apply() materializes the new canonical area with EXACTLY the candidate_payload's values")
    void applyMaterializesExactCandidatePayloadValues() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ApplyNewArea1", "Apply New Area", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "ext-apply-1");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-1");

        ApplyReport report = applyService.apply(batchId, "applier-1");

        assertThat(report.created()).isEqualTo(1);
        assertThat(report.skippedNotApproved()).isZero();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT * FROM areas WHERE area_key = ?", "IN|KA|Udupi|ApplyNewArea1");
        assertThat(row.get("name")).isEqualTo("Apply New Area");
        assertThat(row.get("district")).isEqualTo("Udupi");
        assertThat(((Number) row.get("geo_center_lat")).doubleValue()).isCloseTo(13.30, within(1e-9));
        assertThat(((Number) row.get("geo_center_lon")).doubleValue()).isCloseTo(74.75, within(1e-9));
        assertThat(((Number) row.get("min_lat")).doubleValue()).isCloseTo(13.29, within(1e-9));
        assertThat(((Number) row.get("max_lon")).doubleValue()).isCloseTo(74.76, within(1e-9));
        assertThat(row.get("geometry_source")).isEqualTo("OSM");
        assertThat(row.get("lifecycle_status")).isEqualTo("ACTIVE");
    }

    // ── AC2: verified-geometry protection ───────────────────────────────────────

    @Test
    @DisplayName("AC2: a PROVISIONAL candidate updating a VERIFIED area preserves geometry, "
            + "still updates name/district, and records a GEOMETRY_PRESERVED audit row")
    void geometryProtection_verifiedAreaPreservedAgainstProvisionalCandidate() {
        jdbcTemplate.update("UPDATE areas SET geometry_source = 'OSM' WHERE area_key = ?", HEBBAL);
        Map<String, Object> before = jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", HEBBAL);

        // No bbox / no geometrySource on the candidate -> PROVISIONAL, strictly lower rank than
        // the now-VERIFIED existing Hebbal row.
        AreaOnboardingService.CandidateInput input = candidate(
                HEBBAL, "Hebbal Extended", 13.0451, 77.5977, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-2");

        ApplyReport report = applyService.apply(batchId, "applier-2");

        assertThat(report.updated()).isEqualTo(1);
        assertThat(report.geometryPreserved()).isEqualTo(1);

        Map<String, Object> after = jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", HEBBAL);
        assertThat(after.get("name")).isEqualTo("Hebbal Extended");
        assertThat(after.get("district")).isEqualTo("Bengaluru");
        assertThat(((Number) after.get("min_lat")).doubleValue())
                .isCloseTo(((Number) before.get("min_lat")).doubleValue(), within(1e-9));
        assertThat(((Number) after.get("max_lon")).doubleValue())
                .isCloseTo(((Number) before.get("max_lon")).doubleValue(), within(1e-9));
        assertThat(after.get("geometry_source")).isEqualTo("OSM");

        Integer geometryPreservedAuditCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM area_onboarding_apply_audit WHERE batch_id = ? AND action = 'GEOMETRY_PRESERVED'",
                Integer.class, batchId);
        assertThat(geometryPreservedAuditCount).isEqualTo(1);
    }

    // ── FIX 2: GEOMETRY_PRESERVED audit idempotency on unchanged re-apply ───────

    @Test
    @DisplayName("FIX 2: re-applying an unchanged geometry-downgrade batch adds ZERO additional "
            + "GEOMETRY_PRESERVED (or any) audit rows — exactly one after the first apply")
    void geometryPreservedAuditIsIdempotentOnReapply() {
        jdbcTemplate.update("UPDATE areas SET geometry_source = 'OSM' WHERE area_key = ?", HEBBAL);

        AreaOnboardingService.CandidateInput input = candidate(
                HEBBAL, "Hebbal Extended Fix2", 13.0451, 77.5977, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-fix2");

        applyService.apply(batchId, "applier-fix2");
        Integer firstGeometryPreservedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM area_onboarding_apply_audit WHERE batch_id = ? AND action = 'GEOMETRY_PRESERVED'",
                Integer.class, batchId);
        assertThat(firstGeometryPreservedCount).isEqualTo(1);

        int auditBeforeSecond = count("area_onboarding_apply_audit");
        int areasBeforeSecond = count("areas");
        int outboxBeforeSecond = count("area_region_reclass_outbox");

        ApplyReport second = applyService.apply(batchId, "applier-fix2");

        Integer secondGeometryPreservedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM area_onboarding_apply_audit WHERE batch_id = ? AND action = 'GEOMETRY_PRESERVED'",
                Integer.class, batchId);
        assertThat(secondGeometryPreservedCount).isEqualTo(1); // still exactly one, not two
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBeforeSecond); // zero new rows of any kind
        assertThat(count("areas")).isEqualTo(areasBeforeSecond);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBeforeSecond);
        assertThat(second.auditRows()).isZero();
    }

    // ── AC3: stable area_key identity, never re-keyed ───────────────────────────

    @Test
    @DisplayName("AC3: UPDATE always targets the existing area_key and never re-keys the row")
    void updateNeverReKeysArea() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Central", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-3");

        int areasBefore = count("areas");
        ApplyReport report = applyService.apply(batchId, "applier-3");

        assertThat(report.updated()).isEqualTo(1);
        assertThat(report.created()).isZero();
        assertThat(count("areas")).isEqualTo(areasBefore); // update in place, no new row
        Integer stillExists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, KORAMANGALA);
        assertThat(stillExists).isEqualTo(1);
    }

    // ── AC4: idempotent re-apply ─────────────────────────────────────────────────

    @Test
    @DisplayName("AC4: re-applying an already-applied, unchanged batch produces ZERO additional "
            + "areas/apply_audit/reclass_outbox rows")
    void reapplyingUnchangedBatchIsFullyIdempotent() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|IdempotentNewArea", "Idempotent New Area", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "idem-ext-1");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-4");

        ApplyReport first = applyService.apply(batchId, "applier-4");
        assertThat(first.created()).isEqualTo(1);
        assertThat(first.outboxEnqueued()).isEqualTo(1);

        int areasAfterFirst = count("areas");
        int auditAfterFirst = count("area_onboarding_apply_audit");
        int outboxAfterFirst = count("area_region_reclass_outbox");

        ApplyReport second = applyService.apply(batchId, "applier-4");

        assertThat(count("areas")).isEqualTo(areasAfterFirst);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditAfterFirst);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxAfterFirst);
        assertThat(second.created()).isZero();
        assertThat(second.updated()).isZero();
        assertThat(second.unchanged()).isEqualTo(1);
        assertThat(second.outboxEnqueued()).isZero();
        assertThat(second.auditRows()).isZero();
    }

    // ── AC5 / FIX 5 / FIX 6: audit trail correctness, no alias creation, provenance ─

    @Test
    @DisplayName("AC5/FIX5/FIX6: audit rows are recorded for CREATE_AREA and REGION_RECLASS_ENQUEUED "
            + "(never ALIAS_ADDED — alias creation was removed), and CREATE_AREA's after_json carries "
            + "the batch provider + candidate external_source_id")
    void auditTrailRecordsCreateAndOutboxButNeverAlias_andCarriesProvenance() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|AuditTrailArea", "Audit Trail Area", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "audit-ext-1");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-5");

        int aliasBefore = count("area_alias");
        applyService.apply(batchId, "applier-5");

        List<Map<String, Object>> auditRows = jdbcTemplate.queryForList(
                "SELECT action, area_key, after_json::text AS after_text FROM area_onboarding_apply_audit "
                        + "WHERE batch_id = ? ORDER BY id", batchId);

        assertThat(auditRows).extracting(r -> r.get("action"))
                .contains("CREATE_AREA", "REGION_RECLASS_ENQUEUED")
                .doesNotContain("ALIAS_ADDED");
        assertThat(auditRows).filteredOn(r -> "CREATE_AREA".equals(r.get("action")))
                .allSatisfy(r -> {
                    assertThat(r.get("area_key")).isEqualTo("IN|KA|Udupi|AuditTrailArea");
                    String afterJson = (String) r.get("after_text");
                    assertThat(afterJson).contains("\"provider\"").contains("test-provider")
                            .contains("\"externalSourceId\"").contains("audit-ext-1");
                });

        // FIX 5: apply() creates NO area_alias rows at all.
        assertThat(count("area_alias")).isEqualTo(aliasBefore);
    }

    // ── AC6: lifecycle scaffolding + never hard-delete ──────────────────────────

    @Test
    @DisplayName("AC6: areas.lifecycle_status defaults ACTIVE and merged_into_area_key is nullable; "
            + "apply only ever grows the areas table, never shrinks it")
    void lifecycleColumnsPresentAndNoHardDelete() {
        int areasBefore = count("areas");

        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|LifecycleArea", "Lifecycle Area", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-6");
        applyService.apply(batchId, "applier-6");

        assertThat(count("areas")).isEqualTo(areasBefore + 1);
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT lifecycle_status, merged_into_area_key FROM areas WHERE area_key = ?",
                "IN|KA|Udupi|LifecycleArea");
        assertThat(row.get("lifecycle_status")).isEqualTo("ACTIVE");
        assertThat(row.get("merged_into_area_key")).isNull();
    }

    // ── AC7: zero-listing area applies valid ACTIVE ─────────────────────────────

    @Test
    @DisplayName("AC7: a brand-new, zero-listing candidate area applies to a valid ACTIVE canonical area")
    void zeroListingAreaAppliesActive() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Bengaluru|ZeroListingApplyArea", "Zero Listing Apply Area", 13.00, 77.45,
                null, null, null, null, "OSM", null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-7");

        ApplyReport report = applyService.apply(batchId, "applier-7");
        assertThat(report.created()).isEqualTo(1);

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT lifecycle_status FROM areas WHERE area_key = ?", "IN|KA|Bengaluru|ZeroListingApplyArea");
        assertThat(row.get("lifecycle_status")).isEqualTo("ACTIVE");

        Integer listingCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ?", Integer.class,
                "IN|KA|Bengaluru|ZeroListingApplyArea");
        assertThat(listingCount).isZero();
    }

    // ── AC8: decoupled outbox enqueue, zero region-chain invocation ─────────────

    @Test
    @DisplayName("AC8: apply enqueues a durable outbox row and makes ZERO changes to city_regions/"
            + "city_region_memberships/regional_area_classifications (region reclass is never synchronous)")
    void outboxEnqueuedWithoutTouchingRegionTables() {
        int regionsBefore = count("city_regions");
        int membershipsBefore = count("city_region_memberships");
        int classificationsBefore = count("regional_area_classifications");
        int outboxBefore = count("area_region_reclass_outbox");

        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|OutboxArea", "Outbox Area", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-8");
        applyService.apply(batchId, "applier-8");

        assertThat(count("city_regions")).isEqualTo(regionsBefore);
        assertThat(count("city_region_memberships")).isEqualTo(membershipsBefore);
        assertThat(count("regional_area_classifications")).isEqualTo(classificationsBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore + 1);

        Map<String, Object> outboxRow = jdbcTemplate.queryForMap(
                "SELECT city_id, batch_id, payload::text AS payload_text FROM area_region_reclass_outbox WHERE batch_id = ?",
                batchId);
        assertThat(((Number) outboxRow.get("city_id")).intValue()).isEqualTo(udupiCityId);
        assertThat(((Number) outboxRow.get("batch_id")).longValue()).isEqualTo(batchId);
        String payload = (String) outboxRow.get("payload_text");
        assertThat(payload).contains("\"cityId\"").contains("\"batchId\"").contains("\"affectedAreaKeys\"")
                .contains("IN|KA|Udupi|OutboxArea");
    }

    // ── FIX 1: unresolved-decision refusal + decision immutability ─────────────

    @Test
    @DisplayName("FIX 1: a PENDING candidate anywhere in the batch refuses the WHOLE apply — "
            + "zero canonical/audit/outbox writes, even for an approved sibling in the same batch")
    void pendingCandidateBlocksWholeBatch() {
        AreaOnboardingService.CandidateInput approvedInput = candidate(
                "IN|KA|Udupi|ApprovedSiblingFix1", "Approved Sibling Fix1", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        // lon shifted clear of the seeded Udupi area's bbox so it doesn't spuriously classify as
        // POSSIBLE_DUPLICATE (which would make the whole batch apply_allowed=false already).
        AreaOnboardingService.CandidateInput pendingInput = candidate(
                "IN|KA|Udupi|PendingSiblingFix1", "Pending Sibling Fix1", 13.32, 74.84,
                13.31, 74.83, 13.33, 74.85, "OSM", null);

        long batchId = dryRun(udupiCityId, List.of(approvedInput, pendingInput));

        Long approvedCandidateId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_onboarding_candidate WHERE batch_id = ? AND input_area_key = ?",
                Long.class, batchId, "IN|KA|Udupi|ApprovedSiblingFix1");
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET review_decision = 'APPROVED', reviewed_by = ?, "
                        + "reviewed_at = now() WHERE id = ?",
                "reviewer-fix1", approvedCandidateId);
        // PendingSiblingFix1 is deliberately left at review_decision = 'PENDING' (the column default).

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        // #1887 rework #4 BLOCKING 1: this batch's review was never finalised via
        // AreaOnboardingReviewService.approve (both decisions above were forced by raw SQL, bypassing
        // it entirely) — review_status stays IN_REVIEW, which is now the invariant apply() enforces
        // (replacing the old live "scan for a PENDING candidate" check with the same net effect: a
        // batch with any unresolved decision can never have been FINALIZED).
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FINALIZED");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        Integer approvedAreaCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|ApprovedSiblingFix1");
        assertThat(approvedAreaCount).isZero();
    }

    @Test
    @DisplayName("FIX 1: review decisions cannot be mutated after a successful apply")
    void reviewDecisionsImmutableAfterSuccessfulApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|ImmutableAfterApply", "Immutable After Apply", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-fix1b");

        applyService.apply(batchId, "applier-fix1b");

        assertThatThrownBy(() -> reviewService.approve(batchId, "reviewer-fix1b-again"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ALREADY been applied");
    }

    @Test
    @DisplayName("AC9: apply() refuses an apply_allowed=false batch — no writes performed")
    void applyRefusesNotAllowedBatch() {
        // OUTSIDE_CITY forces applyAllowed=false at dry-run time.
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Bengaluru|NotAllowedArea", "Not Allowed Area", 13.34, 74.79,
                null, null, null, null, null, null);
        long batchId = onboardingService.dryRun(bangaloreCityId, "apply-it", TEST_IDENTITY, List.of(input)).batchId();

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-9b"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("apply_allowed=false");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("AreaOnboardingReviewService.approve() refuses to approve candidates in an "
            + "apply_allowed=false batch")
    void reviewServiceRefusesNotAllowedBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Bengaluru|ReviewRefused", "Review Refused", 13.34, 74.79,
                null, null, null, null, null, null);
        long batchId = onboardingService.dryRun(bangaloreCityId, "apply-it", TEST_IDENTITY, List.of(input)).batchId();

        assertThatThrownBy(() -> reviewService.approve(batchId, "reviewer-x"))
                .isInstanceOf(IllegalStateException.class);
    }

    // ── AC10: transactional atomicity — checksum-mismatch precondition aborts the WHOLE apply ──

    @Test
    @DisplayName("AC10: a payload_checksum mismatch on ONE candidate aborts the ENTIRE apply BEFORE "
            + "any write — zero areas/apply_audit/reclass_outbox rows for either candidate")
    void checksumMismatchOnOneCandidateAbortsEntireBatchBeforeAnyWrite() {
        AreaOnboardingService.CandidateInput goodInput = candidate(
                "IN|KA|Udupi|RollbackGood", "Rollback Good", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        AreaOnboardingService.CandidateInput corruptedInput = candidate(
                "IN|KA|Udupi|RollbackBad", "Rollback Bad", 13.32, 74.84,
                13.31, 74.83, 13.33, 74.85, "OSM", null);

        long batchId = dryRun(udupiCityId, List.of(goodInput, corruptedInput));
        reviewService.approve(batchId, "reviewer-10");

        Long corruptedId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_onboarding_candidate WHERE batch_id = ? AND input_area_key = ?",
                Long.class, batchId, "IN|KA|Udupi|RollbackBad");
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET payload_checksum = 'deliberately-corrupted' WHERE id = ?",
                corruptedId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-10"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("payload_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);

        // The "good" candidate — sequenced BEFORE the corrupted one — must also NOT have been
        // written: checksum verification for the whole batch happens before ANY write (risk R1).
        Integer goodAreaCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM areas WHERE area_key = ?", Integer.class, "IN|KA|Udupi|RollbackGood");
        assertThat(goodAreaCount).isZero();
    }

    // ── FIX 3: full projection-column verification before any write ────────────

    @Test
    @DisplayName("FIX 3: a tampered normalised_area_key aborts the WHOLE batch — zero writes")
    void tamperedNormalisedAreaKeyAbortsBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix3NormKey", "Fix3 Norm Key", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-fix3a");

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET normalised_area_key = 'IN|KA|Udupi|TamperedKey' "
                        + "WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix3a"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("normalised_area_key");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("FIX 3: a matched_area_key tampered to an unrelated existing area aborts the WHOLE "
            + "batch (caught by the FIX 7 canonical-fingerprint mismatch) — zero writes")
    void tamperedMatchedAreaKeyAbortsBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Central Fix3", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-fix3b");

        // Redirect matched_area_key at a DIFFERENT, unrelated existing area (Hebbal) instead of
        // the one actually reviewed (Koramangala).
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET matched_area_key = ? WHERE batch_id = ?",
                HEBBAL, batchId);

        Map<String, Object> hebbalBefore = jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", HEBBAL);

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix3b"))
                .isInstanceOf(IllegalStateException.class);

        Map<String, Object> hebbalAfter = jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", HEBBAL);
        assertThat(hebbalAfter).isEqualTo(hebbalBefore); // untouched
    }

    @Test
    @DisplayName("FIX 3: a tampered clean outcome (CREATE-family candidate flipped to UPDATE-family, "
            + "with no existing area at its key) aborts the WHOLE batch — zero writes")
    void tamperedCleanOutcomeAbortsBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix3Outcome", "Fix3 Outcome", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-fix3c");

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET outcome = 'READY_TO_UPDATE' WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix3c"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("expects an existing area");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("FIX 3: a cross-city matched target aborts the WHOLE batch — zero writes")
    void crossCityTargetAbortsBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Cross City", 12.9352, 77.6245, null, null, null, null, null, null);
        // Approve/dry-run this candidate as an UDUPI batch even though KORAMANGALA is a Bangalore
        // area — simulating a candidate whose matched_area_key resolves to a DIFFERENT city than
        // the batch it was reviewed in.
        long batchId = dryRun(bangaloreCityId, List.of(input));
        reviewService.approve(batchId, "reviewer-fix3d");

        // Move the batch's own city_id to Udupi post-review to simulate the cross-city drift
        // without relying on dry-run's own cross-city rejection. city_id also feeds the FIX 4b
        // persisted_batch_checksum digest, but that check runs strictly AFTER the Phase 1
        // per-candidate loop (which includes this FIX 3(g) cross-city check) inside apply(), so the
        // cross-city throw always fires first regardless of digest state — no re-finalisation needed.
        jdbcTemplate.update("UPDATE area_onboarding_batch SET city_id = ? WHERE id = ?", udupiCityId, batchId);

        Map<String, Object> koramangalaBefore =
                jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", KORAMANGALA);

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix3d"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cross-city");

        Map<String, Object> koramangalaAfter =
                jdbcTemplate.queryForMap("SELECT * FROM areas WHERE area_key = ?", KORAMANGALA);
        assertThat(koramangalaAfter).isEqualTo(koramangalaBefore);
    }

    // ── FIX 4: production dataset identity + artifact-checksum enforcement ─────

    @Test
    @DisplayName("FIX 4: missing production dataset identity (legacy EMPTY BatchIdentity) refuses apply")
    void missingDatasetIdentityRefusesApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix4MissingIdentity", "Fix4 Missing Identity", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        // Legacy 3-arg overload -> BatchIdentity.EMPTY: no dataset_id/version/checksum/provider/
        // schema/extractedAt at all.
        long batchId = onboardingService.dryRun(udupiCityId, "apply-it", List.of(input)).batchId();
        reviewService.approve(batchId, "reviewer-fix4a");

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix4a"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("dataset identity");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("FIX 4b: a persisted_batch_checksum that disagrees with the recomputed value aborts "
            + "the WHOLE apply (direct tamper of the stored digest)")
    void persistedBatchChecksumMismatchAbortsApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix4ChecksumMismatch", "Fix4 Checksum Mismatch", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-fix4b");
        assertThat(persistedBatchChecksumOf(batchId)).isNotBlank(); // approve() finalised it

        jdbcTemplate.update(
                "UPDATE area_onboarding_batch SET persisted_batch_checksum = 'deliberately-wrong' WHERE id = ?",
                batchId);

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix4b"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("FIX 4b: apply() refuses a batch whose review was never finalised — "
            + "persisted_batch_checksum is still NULL even though every candidate is APPROVED")
    void nullPersistedBatchChecksumRefusesApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix4bNullChecksum", "Fix4b Null Checksum", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-fix4b-null");
        assertThat(persistedBatchChecksumOf(batchId)).isNotBlank();

        // Simulate a row approved before this column existed / finalisation never having run.
        jdbcTemplate.update(
                "UPDATE area_onboarding_batch SET persisted_batch_checksum = NULL WHERE id = ?", batchId);

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix4b-null"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    @Test
    @DisplayName("FIX 4b: the SAME persisted batch contents always recompute the SAME persisted_batch_checksum")
    void persistedBatchChecksumIsDeterministicForSamePersistedContents() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Fix4Deterministic", "Fix4 Deterministic", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "fix4-ext");
        long batchId = onboardingService.dryRun(udupiCityId, "apply-it", TEST_IDENTITY, List.of(input)).batchId();

        String checksum1 = applyService.recomputePersistedBatchChecksumFromPersisted(batchId);
        String checksum2 = applyService.recomputePersistedBatchChecksumFromPersisted(batchId);

        assertThat(checksum1).isEqualTo(checksum2);
        assertThat(checksum1).isNotBlank();
    }

    // ── #1887 PR2 rework #2: FIX 4 split into 4a (batch-identity fields) / 4b (persisted_batch_checksum),
    // artifact_checksum now pure UNTOUCHED provenance — the 3 user-required tests ─────────────────

    @Test
    @DisplayName("REWORK #2 PRIMARY: a real dryRun (PR1, unmodified, non-empty BatchIdentity) -> "
            + "review-finalisation (every candidate APPROVED, zero PENDING) -> apply() SUCCEEDS and "
            + "writes the canonical area — the genuine production path, not a hand-built staging row "
            + "or a test-only checksum-fixup helper")
    void realDryRunReviewFinaliseApplySucceedsEndToEnd() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework2EndToEnd", "Rework2 End To End", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework2-ext-1");

        // 1) REAL dry-run (PR1, unmodified) with a REAL, non-empty BatchIdentity.
        long batchId = onboardingService.dryRun(udupiCityId, "apply-it", TEST_IDENTITY, List.of(input)).batchId();
        assertThat(persistedBatchChecksumOf(batchId)).isNull(); // not yet finalised

        // 2) Finalise review: every candidate gets a final decision (here, the batch's one clean
        // candidate is bulk-approved) -> zero PENDING remain -> AreaOnboardingReviewService.approve
        // computes and stores persisted_batch_checksum.
        int approvedCount = reviewService.approve(batchId, "reviewer-rework2");
        assertThat(approvedCount).isEqualTo(1);
        assertThat(persistedBatchChecksumOf(batchId)).isNotBlank();

        // 3) apply() SUCCEEDS via the real production path — this is the scenario that could NEVER
        // pass before rework #2 (apply's old FIX 4 check compared against artifact_checksum, which
        // dry-run populates with the PROVIDER's checksum, not the internal digest apply recomputed).
        ApplyReport report = applyService.apply(batchId, "applier-rework2");

        assertThat(report.created()).isEqualTo(1);
        assertThat(report.skippedNotApproved()).isZero();
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT name FROM areas WHERE area_key = ?", "IN|KA|Udupi|Rework2EndToEnd");
        assertThat(row.get("name")).isEqualTo("Rework2 End To End");
    }

    @Test
    @DisplayName("REWORK #2 TEST 2: a persisted candidate row modified AFTER review-finalisation makes "
            + "apply's recomputed persisted_batch_checksum disagree with the stored value -> apply "
            + "refuses the WHOLE batch -> zero canonical/audit/outbox writes")
    void candidateDriftAfterFinalisationAbortsWholeBatch() throws Exception {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework2Drift", "Rework2 Drift", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework2-drift-ext");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-rework2-drift");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        Long candidateId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_onboarding_candidate WHERE batch_id = ? AND input_area_key = ?",
                Long.class, batchId, "IN|KA|Udupi|Rework2Drift");

        // Drift: replace candidate_payload with a DIFFERENT, internally-consistent payload (its OWN
        // payload_checksum recomputed to match) so the per-row payload_checksum check (Phase 1)
        // still passes and does NOT mask this as a simple payload-tamper case — this specifically
        // exercises the BATCH-LEVEL persisted_batch_checksum guard, which was computed at
        // review-finalisation time over the OLD payload and is now stale.
        AreaOnboardingService.CandidateInput driftedInput = candidate(
                "IN|KA|Udupi|Rework2Drift", "Rework2 Drift TAMPERED NAME", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework2-drift-ext");
        String driftedPayloadJson = objectMapper.writeValueAsString(driftedInput);
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET candidate_payload = ?::jsonb WHERE id = ?",
                driftedPayloadJson, candidateId);
        String driftedStoredText = jdbcTemplate.queryForObject(
                "SELECT candidate_payload::text FROM area_onboarding_candidate WHERE id = ?",
                String.class, candidateId);
        String driftedChecksum = AreaOnboardingApplyService.sha256Hex(driftedStoredText);
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET payload_checksum = ? WHERE id = ?",
                driftedChecksum, candidateId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework2-drift"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        // The stored digest itself is untouched by apply()'s failed attempt.
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #2 TEST 3: artifact_checksum (the provider/curator value) is NEVER modified "
            + "anywhere in the PR2 path — byte-identical to what dry-run wrote, through review-"
            + "finalisation and apply")
    void artifactChecksumNeverModifiedThroughDryRunReviewApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework2ArtifactUntouched", "Rework2 Artifact Untouched", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework2-artifact-ext");

        long batchId = onboardingService.dryRun(udupiCityId, "apply-it", TEST_IDENTITY, List.of(input)).batchId();
        String afterDryRun = artifactChecksumOf(batchId);
        assertThat(afterDryRun).isEqualTo(TEST_IDENTITY.artifactChecksum());

        reviewService.approve(batchId, "reviewer-rework2-artifact");
        String afterReview = artifactChecksumOf(batchId);
        assertThat(afterReview).isEqualTo(afterDryRun);

        applyService.apply(batchId, "applier-rework2-artifact");
        String afterApply = artifactChecksumOf(batchId);
        assertThat(afterApply).isEqualTo(afterDryRun);
    }

    // ── FIX 7: stale-canonical-target guard for UPDATE candidates ───────────────

    @Test
    @DisplayName("FIX 7: an out-of-band change to the canonical target between review and apply "
            + "refuses the whole apply — the newer canonical value is preserved, zero apply audit/outbox writes")
    void staleCanonicalTargetRefusesApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Fix7", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-fix7");

        // Out-of-band change to the canonical target AFTER review, simulating another process
        // editing the area between dry-run+review and apply.
        jdbcTemplate.update("UPDATE areas SET name = 'Koramangala Changed Out Of Band' WHERE area_key = ?",
                KORAMANGALA);

        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-fix7"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("canonical state has changed since review");

        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);

        Map<String, Object> stillChanged = jdbcTemplate.queryForMap(
                "SELECT name FROM areas WHERE area_key = ?", KORAMANGALA);
        assertThat(stillChanged.get("name")).isEqualTo("Koramangala Changed Out Of Band"); // newer value preserved
    }

    @Test
    @DisplayName("FIX 7: an UNCHANGED canonical target between review and apply applies successfully")
    void unchangedCanonicalTargetAppliesSuccessfully() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Fix7 Stable", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-fix7b");

        ApplyReport report = applyService.apply(batchId, "applier-fix7b");
        assertThat(report.updated()).isEqualTo(1);
    }

    // ── #1887 PR2 rework #3: persisted_batch_checksum widened to cover EVERY apply-driving field ──
    // (review_decision, matched_area_key, outcome, external_source_id,
    // reviewed_canonical_fingerprint), not just id/candidate_payload/payload_checksum. Each test
    // below drifts exactly ONE of those fields directly on the persisted candidate row AFTER
    // review-finalisation, and asserts apply() aborts the WHOLE batch on the persisted_batch_checksum
    // mismatch specifically (not some other, coincidentally-triggered check) with ZERO writes.

    @Test
    @DisplayName("REWORK #3 TEST 1: a review_decision flipped directly on the persisted row AFTER "
            + "finalisation (e.g. APPROVED -> REJECTED) makes apply's recomputed persisted_batch_checksum "
            + "disagree with the stored value -> apply refuses the WHOLE batch -> zero writes")
    void reviewDecisionDriftAfterFinalisationAbortsWholeBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework3ReviewDecisionDrift", "Rework3 Review Decision Drift", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework3-rd-ext");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-rework3-rd");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET review_decision = 'REJECTED' WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-rd"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #3 TEST 2: a matched_area_key cleared directly on the persisted row AFTER "
            + "finalisation makes apply's recomputed persisted_batch_checksum disagree with the stored "
            + "value -> apply refuses the WHOLE batch -> zero writes")
    void matchedAreaKeyDriftAfterFinalisationAbortsWholeBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Rework3 MatchedKeyDrift", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-rework3-mak");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        // Cleared, not redirected: NULLing matched_area_key when normalised_area_key already IS
        // KORAMANGALA means Phase 1's own target-resolution and FIX 7 fingerprint checks are
        // unaffected (they fall back to the identical normalised key) — the ONLY thing this
        // isolates is the persisted_batch_checksum guard now also covering matched_area_key.
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET matched_area_key = NULL WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-mak"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #3 TEST 3: an outcome swapped between two matched-outcome values directly on "
            + "the persisted row AFTER finalisation makes apply's recomputed persisted_batch_checksum "
            + "disagree with the stored value -> apply refuses the WHOLE batch -> zero writes")
    void outcomeDriftAfterFinalisationAbortsWholeBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Rework3 OutcomeDrift", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-rework3-oc");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        String originalOutcome = jdbcTemplate.queryForObject(
                "SELECT outcome FROM area_onboarding_candidate WHERE batch_id = ?", String.class, batchId);
        assertThat(originalOutcome).isIn("READY_TO_UPDATE", "UNCHANGED"); // both matched-outcome, existing != null
        String swappedOutcome = "READY_TO_UPDATE".equals(originalOutcome) ? "UNCHANGED" : "READY_TO_UPDATE";

        // Swapped to the OTHER matched outcome (still requires an existing target, which KORAMANGALA
        // is) so Phase 1's stale-outcome consistency check (FIX 3(e)) does not itself throw first —
        // this isolates the persisted_batch_checksum guard now also covering outcome.
        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET outcome = ? WHERE batch_id = ?", swappedOutcome, batchId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-oc"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #3 TEST 4: an external_source_id changed directly on the persisted row AFTER "
            + "finalisation makes apply's recomputed persisted_batch_checksum disagree with the stored "
            + "value -> apply refuses the WHOLE batch -> zero writes")
    void externalSourceIdDriftAfterFinalisationAbortsWholeBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework3ExternalSourceIdDrift", "Rework3 External Source Id Drift", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework3-esid-original");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-rework3-esid");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET external_source_id = 'rework3-esid-tampered' "
                        + "WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-esid"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("persisted_batch_checksum mismatch");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #3 TEST 5 (updated by rework #4 BLOCKING 3): a reviewed_canonical_fingerprint "
            + "tampered directly on a CREATE-family persisted row AFTER finalisation is now caught by "
            + "the STRENGTHENED per-candidate fingerprint-parity check itself (BLOCKING 3 closed the "
            + "gap where CREATE-family candidates were never fingerprint-verified at apply time) — "
            + "apply refuses the WHOLE batch -> zero writes -> persisted_batch_checksum untouched")
    void reviewedCanonicalFingerprintDriftAfterFinalisationAbortsWholeBatch() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework3FingerprintDrift", "Rework3 Fingerprint Drift", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "rework3-fp-ext");
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-rework3-fp");
        String checksumAtFinalisation = persistedBatchChecksumOf(batchId);
        assertThat(checksumAtFinalisation).isNotBlank();

        jdbcTemplate.update(
                "UPDATE area_onboarding_candidate SET reviewed_canonical_fingerprint = "
                        + "'deliberately-tampered-fingerprint' WHERE batch_id = ?", batchId);

        int areasBefore = count("areas");
        int auditBefore = count("area_onboarding_apply_audit");
        int outboxBefore = count("area_region_reclass_outbox");

        // Before rework #4, a CREATE-family candidate's reviewed_canonical_fingerprint was never
        // read by the per-candidate check at all, so this tamper was caught only by the coarser
        // batch-level persisted_batch_checksum digest. BLOCKING 3 now fingerprint-verifies EVERY
        // candidate family uniformly, so this tampered (non-sentinel, non-matching-real) value is
        // caught earlier and more specifically — still IllegalStateException, still zero writes,
        // still leaves persisted_batch_checksum byte-identical.
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-fp"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("was reviewed against a real canonical fingerprint but no area now exists there");

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditBefore);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxBefore);
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAtFinalisation);
    }

    @Test
    @DisplayName("REWORK #3: apply() refuses a batch whose artifact_checksum is blank/null — a "
            + "'must be present' completeness check, alongside dataset_id/dataset_version/provider/"
            + "input_schema_version/source_extracted_at (artifact_checksum's VALUE is still never "
            + "read/compared as a digest input anywhere)")
    void blankArtifactChecksumRefusesApply() {
        AreaOnboardingService.CandidateInput input = candidate(
                "IN|KA|Udupi|Rework3BlankArtifactChecksum", "Rework3 Blank Artifact Checksum", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", null);
        long batchId = dryRunSingleApprove(udupiCityId, input, "reviewer-rework3-blank-ac");

        jdbcTemplate.update(
                "UPDATE area_onboarding_batch SET artifact_checksum = NULL WHERE id = ?", batchId);

        int areasBefore = count("areas");
        assertThatThrownBy(() -> applyService.apply(batchId, "applier-rework3-blank-ac"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("dataset identity")
                .hasMessageContaining("artifact_checksum");
        assertThat(count("areas")).isEqualTo(areasBefore);
    }

    // ── #1887 rework #3: self-heal (FIX 7) vs the widened digest's own idempotency ──────────────

    @Test
    @DisplayName("REWORK #3: after a matched candidate's canonical target actually CHANGES on the "
            + "first apply (triggering FIX 7's self-heal rewrite of reviewed_canonical_fingerprint, "
            + "now covered by persisted_batch_checksum), persisted_batch_checksum is re-stored over "
            + "the settled state so a SECOND apply of the SAME unchanged batch is a true zero-delta "
            + "no-op — it does NOT spuriously mismatch against its own prior self-heal")
    void matchedCandidateSelfHealFingerprintKeepsSecondApplyIdempotent() {
        AreaOnboardingService.CandidateInput input = candidate(
                KORAMANGALA, "Koramangala Rework3 SelfHeal", 12.9352, 77.6245, null, null, null, null, null, null);
        long batchId = dryRunSingleApprove(bangaloreCityId, input, "reviewer-rework3-selfheal");

        ApplyReport first = applyService.apply(batchId, "applier-rework3-selfheal");
        assertThat(first.updated()).isEqualTo(1); // the name change means Phase 2 actually wrote + self-healed
        String checksumAfterFirstApply = persistedBatchChecksumOf(batchId);
        assertThat(checksumAfterFirstApply).isNotBlank();

        int areasAfterFirst = count("areas");
        int auditAfterFirst = count("area_onboarding_apply_audit");
        int outboxAfterFirst = count("area_region_reclass_outbox");

        ApplyReport second = applyService.apply(batchId, "applier-rework3-selfheal");

        assertThat(second.updated()).isZero();
        assertThat(second.unchanged()).isEqualTo(1);
        assertThat(second.auditRows()).isZero();
        assertThat(second.outboxEnqueued()).isZero();
        assertThat(count("areas")).isEqualTo(areasAfterFirst);
        assertThat(count("area_onboarding_apply_audit")).isEqualTo(auditAfterFirst);
        assertThat(count("area_region_reclass_outbox")).isEqualTo(outboxAfterFirst);
        // The re-stored digest from the FIRST apply is exactly what the SECOND apply recomputes
        // against and matches — the self-heal did not spuriously invalidate itself.
        assertThat(persistedBatchChecksumOf(batchId)).isEqualTo(checksumAfterFirstApply);
    }
}
