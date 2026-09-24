package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test proving {@link AreaOnboardingService#dryRun}'s safety
 * invariants (#1887 PR1): zero writes to canonical geography tables (AC1), correct
 * {@link CandidateOutcome} classification including a zero-listing area (AC5), every
 * {@link ConflictType} surfaced by a targeted fixture (AC4), and {@link GeometryTrust} computed
 * only from geometry columns — never from listing presence/volume (AC3).
 *
 * <p>Mirrors {@link CityRegionOnboardingSafetyIT}'s Testcontainers + Flyway configuration
 * exactly. Uses the real Bangalore + Udupi area seed from V71.
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
class AreaOnboardingDryRunSafetyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String WHITEFIELD = "IN|KA|Bengaluru|Whitefield";
    private static final String KORAMANGALA = "IN|KA|Bengaluru|Koramangala";
    // Hebbal's seeded bbox (13.03-13.06 lat / 77.58-77.62 lon) does not touch or overlap any
    // other Bangalore area's seeded bbox — unlike Whitefield/Koramangala/Jayanagar, whose real
    // V71 bounding boxes touch at shared edges. Used for the UNCHANGED test so a full bbox match
    // doesn't incidentally trip SIMILAR_OR_OVERLAPPING against an unrelated neighbour.
    private static final String HEBBAL = "IN|KA|Bengaluru|Hebbal";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AreaOnboardingService onboardingService;
    private Integer bangaloreCityId;
    private Integer udupiCityId;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        onboardingService = new AreaOnboardingService(jdbcTemplate, objectMapper);
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

    // ── AC1: zero canonical writes, staging rows ARE written ────────────────────

    @Test
    @DisplayName("dryRun writes area_onboarding_batch/candidate staging rows but performs zero "
            + "writes to areas/area_alias/city_regions/city_region_memberships/regional_area_overrides")
    void dryRunWritesStagingRowsOnly_zeroCanonicalWrites() {
        int areasBefore = count("areas");
        int aliasBefore = count("area_alias");
        int regionsBefore = count("city_regions");
        int membershipsBefore = count("city_region_memberships");
        int overridesBefore = count("regional_area_overrides");
        int batchesBefore = count("area_onboarding_batch");
        int candidatesBefore = count("area_onboarding_candidate");

        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", List.of(
                candidate("IN|KA|Udupi|TestNewArea1", "Test New Area", 13.30, 74.75,
                        13.29, 74.74, 13.31, 74.76, "OSM", "ext-1")));

        assertThat(count("areas")).isEqualTo(areasBefore);
        assertThat(count("area_alias")).isEqualTo(aliasBefore);
        assertThat(count("city_regions")).isEqualTo(regionsBefore);
        assertThat(count("city_region_memberships")).isEqualTo(membershipsBefore);
        assertThat(count("regional_area_overrides")).isEqualTo(overridesBefore);

        assertThat(count("area_onboarding_batch")).isEqualTo(batchesBefore + 1);
        assertThat(count("area_onboarding_candidate")).isEqualTo(candidatesBefore + 1);
        assertThat(report.candidates()).hasSize(1);
        assertThat(report.batchId()).isPositive();
    }

    // ── AC5: zero-listing area classifies READY_TO_CREATE, not rejected ─────────

    @Test
    @DisplayName("a brand-new candidate with zero listings classifies READY_TO_CREATE, not rejected for lack of listings")
    void zeroListingAreaClassifiesReadyToCreate() {
        // Bbox omitted deliberately: the full Bangalore area set (seeded across multiple
        // migrations, not just V71) is dense enough that a synthetic bbox risks incidentally
        // overlapping a real neighbour — irrelevant noise for this AC5 test, which is about the
        // READY_TO_CREATE outcome for a never-before-seen, zero-listing area_key.
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|ZeroListingArea", "Zero Listing Area", 13.00, 77.45,
                        null, null, null, null, "OSM", null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.READY_TO_CREATE);
            assertThat(p.conflicts()).isEmpty();
        });
        assertThat(report.applyAllowed()).isTrue();

        Integer listingCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ?", Integer.class,
                "IN|KA|Bengaluru|ZeroListingArea");
        assertThat(listingCount).isZero();
    }

    // ── matched-existing-area outcomes ───────────────────────────────────────────

    @Test
    @DisplayName("a candidate exactly matching an existing area's key/name/geometry classifies UNCHANGED")
    void matchedExistingAreaWithIdenticalFieldsClassifiesUnchanged() {
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate(HEBBAL, "Hebbal", 13.0451, 77.5977,
                        13.0300, 77.5800, 13.0600, 77.6200, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.UNCHANGED);
            assertThat(p.matchedAreaKey()).isEqualTo(HEBBAL);
            assertThat(p.geometryTrust()).isEqualTo(GeometryTrust.PROVISIONAL);
            assertThat(p.conflicts()).isEmpty();
        });
    }

    @Test
    @DisplayName("a candidate matching an existing area's key but with a different name classifies READY_TO_UPDATE")
    void matchedExistingAreaWithDifferentFieldsClassifiesReadyToUpdate() {
        // Bbox deliberately omitted: Koramangala's real seeded bbox touches Jayanagar's, so
        // supplying it here would additionally (and incidentally) trip SIMILAR_OR_OVERLAPPING —
        // this test isolates the name-change -> READY_TO_UPDATE behaviour only.
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate(KORAMANGALA, "Koramangala Extended", 12.9352, 77.6245,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.READY_TO_UPDATE);
            assertThat(p.matchedAreaKey()).isEqualTo(KORAMANGALA);
        });
    }

    // ── AC4: every ConflictType exercised by a targeted fixture ──────────────────

    @Test
    @DisplayName("CANONICAL_KEY_CONFLICT when a candidate's area_key already belongs to a different city")
    void canonicalKeyConflict_whenAreaKeyBelongsToDifferentCity() {
        // Whitefield's real key/geometry belongs to Bangalore; submit it under Udupi's city_id.
        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", List.of(
                candidate(WHITEFIELD, "Whitefield", 12.9698, 77.7500,
                        12.9500, 77.7200, 12.9900, 77.7800, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).contains(ConflictType.CANONICAL_KEY_CONFLICT));
    }

    @Test
    @DisplayName("NORMALISED_NAME_CONFLICT when a candidate's name collides with a different area in the same city")
    void normalisedNameConflict_whenNameCollidesInSameCity() {
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|KoramangalaAlt", "  koramangala  ", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.conflicts()).contains(ConflictType.NORMALISED_NAME_CONFLICT);
            assertThat(p.conflicts()).doesNotContain(ConflictType.SAME_NAME_DIFFERENT_CITY);
        });
    }

    @Test
    @DisplayName("SAME_NAME_DIFFERENT_CITY is exercised for a name shared across cities, but is NEVER "
            + "flagged as NORMALISED_NAME_CONFLICT and does not block applyAllowed")
    void sameNameDifferentCity_isNotFlaggedAsNormalisedNameConflict_andDoesNotBlockApply() {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon) VALUES (?, ?, ?, ?, ?)",
                "IN|KA|Udupi|CentralFixture", udupiCityId, "Central", 13.30, 74.75);

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|CentralNew", "Central", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.conflicts()).contains(ConflictType.SAME_NAME_DIFFERENT_CITY);
            assertThat(p.conflicts()).doesNotContain(ConflictType.NORMALISED_NAME_CONFLICT);
            assertThat(p.conflicts()).doesNotContain(ConflictType.CANONICAL_KEY_CONFLICT);
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.READY_TO_CREATE);
        });
        assertThat(report.applyAllowed())
                .as("a same-name-different-city signal alone must not block apply")
                .isTrue();
    }

    @Test
    @DisplayName("ALIAS_CONFLICT when a candidate's name matches an existing area_alias row; the query "
            + "does not fail when area_alias is empty in unrelated tests")
    void aliasConflict_detectedAgainstManuallyInsertedAliasRow() {
        jdbcTemplate.update(
                "INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source) VALUES (?, ?, ?, ?, ?)",
                bangaloreCityId, WHITEFIELD, "Siruguppa", "siruguppa", "test-fixture");

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|SiruguppaNew", "Siruguppa", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).contains(ConflictType.ALIAS_CONFLICT));
    }

    @Test
    @DisplayName("DUPLICATE_EXTERNAL_SOURCE_ID when two candidates in the same batch share an external_source_id")
    void duplicateExternalSourceId_whenTwoCandidatesShareId() {
        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", List.of(
                candidate("IN|KA|Udupi|Dup1", "Dup One", 13.30, 74.75, null, null, null, null, null, "dup-1"),
                candidate("IN|KA|Udupi|Dup2", "Dup Two", 13.30, 74.75, null, null, null, null, null, "dup-1")));

        assertThat(report.candidates()).hasSize(2);
        assertThat(report.candidates()).allSatisfy(p ->
                assertThat(p.conflicts()).contains(ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID));
    }

    @Test
    @DisplayName("SIMILAR_OR_OVERLAPPING when a candidate's bbox overlaps an existing area's bbox in the same city")
    void similarOrOverlapping_whenBboxOverlapsExistingArea() {
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|OverlapsWhitefield", "Overlaps Whitefield", 12.97, 77.745,
                        12.96, 77.73, 12.98, 77.76, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.conflicts()).contains(ConflictType.SIMILAR_OR_OVERLAPPING);
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.POSSIBLE_DUPLICATE);
        });
    }

    @Test
    @DisplayName("OUTSIDE_CITY_BOUNDS + outcome OUTSIDE_CITY when a candidate's geo_center falls outside the target city's bbox")
    void outsideCityBounds_whenGeoCenterOutsideCityBbox() {
        // Udupi's real coordinates, submitted under Bangalore's city_id.
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|FarAway", "Far Away", 13.34, 74.79,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p -> {
            assertThat(p.conflicts()).contains(ConflictType.OUTSIDE_CITY_BOUNDS);
            assertThat(p.outcome()).isEqualTo(CandidateOutcome.OUTSIDE_CITY);
        });
        assertThat(report.applyAllowed()).isFalse();
        assertThat(report.blockingReasons()).isNotEmpty();
    }

    // ── #2676 B1a: batch/city-level blocking reasons ────────────────────────────

    @Test
    @DisplayName("CITY_BOUNDS_MISSING blocking reason + applyAllowed=false when the target city "
            + "has no min/max lat/lon bounds, even though the candidate itself is otherwise clean")
    void cityBoundsMissing_blocksApply_whenCityHasNoBbox() {
        jdbcTemplate.update(
                "UPDATE cities SET min_lat = NULL, min_lon = NULL, max_lat = NULL, max_lon = NULL WHERE id = ?",
                bangaloreCityId);

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|CleanCandidate", "Clean Candidate", 12.97, 77.59,
                        null, null, null, null, null, null)));

        assertThat(report.blockingReasons()).anyMatch(reason -> reason.startsWith("CITY_BOUNDS_MISSING"));
        assertThat(report.applyAllowed()).isFalse();
    }

    @Test
    @DisplayName("REGION_POLICY_MISSING blocking reason + applyAllowed=false when the target city "
            + "has no city_region_policy row — surfaces the otherwise-silent self-healing retry "
            + "path as a visible dry-run signal (observability/UX, not a correctness fix; the "
            + "retry behaviour itself is unchanged)")
    void regionPolicyMissing_blocksApply_whenCityHasNoRegionPolicyRow() {
        jdbcTemplate.update("DELETE FROM city_region_policy WHERE city_id = ?", bangaloreCityId);

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|CleanCandidate", "Clean Candidate", 12.97, 77.59,
                        null, null, null, null, null, null)));

        assertThat(report.blockingReasons()).anyMatch(reason -> reason.startsWith("REGION_POLICY_MISSING"));
        assertThat(report.applyAllowed()).isFalse();
    }

    // ── AC3: GeometryTrust computed only from geometry columns, never listings ──

    @Test
    @DisplayName("GeometryTrust is identical for two candidates with identical declared geometry, "
            + "regardless of one having many listings and the other having zero")
    void geometryTrustNeverAffectedByListingPresence() {
        String listingsPresentKey = "IN|KA|Bengaluru|ListingsPresentArea";
        String zeroListingsKey = "IN|KA|Bengaluru|ZeroListingsArea";

        for (int i = 0; i < 50; i++) {
            jdbcTemplate.update("""
                    INSERT INTO property_listings
                        (area_key, property_type, listing_purpose, price_paise, status, is_duplicate, created_at, title)
                    VALUES (?, 'apartment', 'sale', 5000000, 'LIVE', false, NOW() - INTERVAL '1 day', 'Test')
                    """, listingsPresentKey);
        }

        // Bbox omitted deliberately (see zeroListingAreaClassifiesReadyToCreate) — both
        // candidates share the exact same geoCenter/geometrySource, which is all that matters
        // for proving GeometryTrust is computed identically regardless of listing volume.
        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate(listingsPresentKey, "Listings Present Area", 13.00, 77.45,
                        null, null, null, null, null, null),
                candidate(zeroListingsKey, "Zero Listings Area", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).hasSize(2);
        AreaOnboardingReport.CandidateProjection withListings = report.candidates().get(0);
        AreaOnboardingReport.CandidateProjection withoutListings = report.candidates().get(1);

        assertThat(withListings.geometryTrust()).isEqualTo(withoutListings.geometryTrust());
        assertThat(withListings.outcome()).isEqualTo(withoutListings.outcome());
        assertThat(withListings.outcome()).isEqualTo(CandidateOutcome.READY_TO_CREATE);

        Integer presentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ?", Integer.class, listingsPresentKey);
        Integer zeroCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ?", Integer.class, zeroListingsKey);
        assertThat(presentCount).isEqualTo(50);
        assertThat(zeroCount).isZero();
    }

    // ── #1887 rework BLOCKING 1: city-scoped alias uniqueness ───────────────────

    @Test
    @DisplayName("the SAME normalised alias persists/validates in two different cities WITHOUT an ALIAS_CONFLICT")
    void sameAliasDifferentCity_doesNotConflict() {
        jdbcTemplate.update(
                "INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source) VALUES (?, ?, ?, ?, ?)",
                udupiCityId, "IN|KA|Udupi|Manipal", "Gandhi Nagar", "gandhi nagar", "test-fixture");

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|GandhiNagarNew", "Gandhi Nagar", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).doesNotContain(ConflictType.ALIAS_CONFLICT));
    }

    @Test
    @DisplayName("the same normalised alias mapping to two areas within ONE city still conflicts")
    void sameAliasSameCity_stillConflicts() {
        jdbcTemplate.update(
                "INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source) VALUES (?, ?, ?, ?, ?)",
                bangaloreCityId, WHITEFIELD, "Gandhi Nagar", "gandhi nagar", "test-fixture");

        AreaOnboardingReport report = onboardingService.dryRun(bangaloreCityId, "safety-it", List.of(
                candidate("IN|KA|Bengaluru|GandhiNagarNew", "Gandhi Nagar", 13.00, 77.45,
                        null, null, null, null, null, null)));

        assertThat(report.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).contains(ConflictType.ALIAS_CONFLICT));
    }

    // ── #1887 rework BLOCKING 2: immutable candidate payload/checksum (Option B) ─

    @Test
    @DisplayName("a persisted candidate's candidate_payload reconstructs the exact original candidate values "
            + "passed into dryRun, and payload_checksum matches a recomputed sha256 over that payload")
    void candidatePayloadReconstructsOriginalCandidate_andChecksumMatches() throws Exception {
        AreaOnboardingService.CandidateInput original = candidate(
                "IN|KA|Udupi|PayloadFixture", "Payload Fixture", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "payload-ext-1");

        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", List.of(original));
        long candidateId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_onboarding_candidate WHERE batch_id = ?", Long.class, report.batchId());

        String payloadJson = jdbcTemplate.queryForObject(
                "SELECT candidate_payload::text FROM area_onboarding_candidate WHERE id = ?", String.class, candidateId);
        String storedChecksum = jdbcTemplate.queryForObject(
                "SELECT payload_checksum FROM area_onboarding_candidate WHERE id = ?", String.class, candidateId);

        AreaOnboardingService.CandidateInput reconstructed =
                objectMapper.readValue(payloadJson, AreaOnboardingService.CandidateInput.class);
        assertThat(reconstructed).isEqualTo(original);

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(payloadJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder recomputed = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            recomputed.append(String.format("%02x", b));
        }
        assertThat(storedChecksum).isEqualTo(recomputed.toString());
    }

    // ── #1887 rework REQUIRED: batch-level dataset/provider identity ────────────

    @Test
    @DisplayName("area_onboarding_batch persists dataset id/version/checksum/provider/schema-version/date")
    void batchIdentityPersistedOnBatchRow() {
        OffsetDateTime extractedAt = OffsetDateTime.parse("2026-01-15T00:00:00Z");
        AreaOnboardingService.BatchIdentity identity = new AreaOnboardingService.BatchIdentity(
                "osm-udupi-extract", "v3", "sha256:abc123", "OSM", "1.0", extractedAt);

        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", identity, List.of(
                candidate("IN|KA|Udupi|BatchIdentityFixture", "Batch Identity Fixture", 13.30, 74.75,
                        null, null, null, null, null, null)));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT dataset_id, dataset_version, artifact_checksum, provider, input_schema_version, "
                        + "source_extracted_at FROM area_onboarding_batch WHERE id = ?", report.batchId());

        assertThat(row.get("dataset_id")).isEqualTo("osm-udupi-extract");
        assertThat(row.get("dataset_version")).isEqualTo("v3");
        assertThat(row.get("artifact_checksum")).isEqualTo("sha256:abc123");
        assertThat(row.get("provider")).isEqualTo("OSM");
        assertThat(row.get("input_schema_version")).isEqualTo("1.0");
        assertThat(row.get("source_extracted_at")).isNotNull();
    }

    // ── #1887 rework REQUIRED: provider-namespaced external_source_id dedupe (Option A) ─

    @Test
    @DisplayName("the same external_source_id under DIFFERENT providers (i.e. different batches, per Option A) "
            + "is NOT flagged as DUPLICATE_EXTERNAL_SOURCE_ID")
    void providerNamespacedDedupe_sameExternalIdDifferentProvidersNotDuplicate() {
        AreaOnboardingService.BatchIdentity osmIdentity = new AreaOnboardingService.BatchIdentity(
                null, null, null, "OSM", null, null);
        AreaOnboardingService.BatchIdentity govtIdentity = new AreaOnboardingService.BatchIdentity(
                null, null, null, "GovtSurvey", null, null);

        AreaOnboardingReport osmReport = onboardingService.dryRun(udupiCityId, "safety-it", osmIdentity, List.of(
                candidate("IN|KA|Udupi|ProviderNsOsm", "Provider Ns Osm", 13.30, 74.75,
                        null, null, null, null, null, "shared-ext-id")));
        AreaOnboardingReport govtReport = onboardingService.dryRun(udupiCityId, "safety-it", govtIdentity, List.of(
                candidate("IN|KA|Udupi|ProviderNsGovt", "Provider Ns Govt", 13.30, 74.75,
                        null, null, null, null, null, "shared-ext-id")));

        assertThat(osmReport.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).doesNotContain(ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID));
        assertThat(govtReport.candidates()).singleElement().satisfies(p ->
                assertThat(p.conflicts()).doesNotContain(ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID));
    }

    @Test
    @DisplayName("the same external_source_id under the SAME provider, in the same batch, IS flagged as "
            + "DUPLICATE_EXTERNAL_SOURCE_ID")
    void providerNamespacedDedupe_sameExternalIdSameProviderIsDuplicate() {
        AreaOnboardingService.BatchIdentity osmIdentity = new AreaOnboardingService.BatchIdentity(
                null, null, null, "OSM", null, null);

        AreaOnboardingReport report = onboardingService.dryRun(udupiCityId, "safety-it", osmIdentity, List.of(
                candidate("IN|KA|Udupi|ProviderDup1", "Provider Dup One", 13.30, 74.75,
                        null, null, null, null, null, "same-provider-ext-id"),
                candidate("IN|KA|Udupi|ProviderDup2", "Provider Dup Two", 13.30, 74.75,
                        null, null, null, null, null, "same-provider-ext-id")));

        assertThat(report.candidates()).hasSize(2);
        assertThat(report.candidates()).allSatisfy(p ->
                assertThat(p.conflicts()).contains(ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID));
    }
}
