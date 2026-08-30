package com.example.realestate.discover.citylaunch;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.example.realestate.discover.AgriDestinationClassificationGenerator;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres) for the #2151 PR A Agri destination
 * classification pipeline (generation -&gt; determinism -&gt; regeneration/stale-row removal -&gt;
 * AC3 null/zero-origin precondition -&gt; promotion atomicity), driving the REAL prepare/validate/promote
 * flow via {@link CityLaunchPreparationService}, {@link CityLaunchValidationService}, {@link
 * CityLaunchPromotionService} — mirrors {@link CityLaunchPromotionServiceIT}'s Testcontainers base
 * and fixture-helper conventions.
 *
 * <p>Deliberately does NOT re-prove what {@code RevisionChecksumTest} (AC16 byte-identical/append-
 * only digest contract), {@code AgriDestinationClassificationGeneratorTest} (direction/band boundary
 * mapping as a pure function of {@code RegionalGeo}), or {@code AdminCityLaunchValidationControllerIT}
 * (AC2 {@code agri_validated} EXISTS-guard) already cover — see those classes for that coverage.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // #2177: pgjdbc ALWAYS issues its own "SET extra_float_digits" during connection startup
        // (independent of the server/session default) to guarantee lossless TEXT round-tripping for
        // its own correctness — so setting extra_float_digits on the Postgres server alone (or via
        // Hikari data-source-properties, applied before pgjdbc's own startup handshake completes)
        // does NOT reproduce the hosted bug. connection-init-sql runs AFTER pgjdbc's connection setup
        // finishes, on every pooled physical connection, so this explicit SET is the one that sticks
        // — faithfully modelling the truncation a connection routed through Supabase's PgBouncer
        // transaction-pooler experiences. binaryTransfer=false forces pgjdbc's TEXT wire format for
        // every query result (not just the first few, before its server-side-prepare threshold);
        // BINARY transfer carries full IEEE-754 precision regardless of extra_float_digits and would
        // otherwise mask the truncation entirely once Hibernate re-executes the same query 5+ times.
        "spring.datasource.hikari.data-source-properties.binaryTransfer=false",
        "spring.datasource.hikari.connection-init-sql=SET extra_float_digits = 0",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-agri-city-launch-it",
        "spring.task.scheduling.enabled=false"
})
class AgriDestinationClassificationCityLaunchIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired private CityLaunchPreparationService preparationService;
    @Autowired private CityLaunchValidationService validationService;
    @Autowired private CityLaunchPromotionService promotionService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;
    @Autowired private AgriDestinationClassificationRepository agriDestinationClassificationRepository;
    @Autowired private AgriDestinationClassificationGenerator agriDestinationClassificationGenerator;
    @Autowired private JdbcTemplate jdbc;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            // agri_destination_classification.area_key FKs public.areas -- must be cleared before
            // the areas DELETE below (mirrors CityLaunchPromotionServiceIT's cleanup).
            jdbc.update("DELETE FROM public.agri_destination_classification WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            // #2163: seedRegionPolicy()/seedClassification() insert rows that FK-reference (policy)
            // or otherwise scope to (classifications) this city/slug and must be cleared first.
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = ?", slug);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    /** Polls {@code assertion} every 100ms for up to 15s, re-throwing its last failure on timeout. */
    private static void pollUntil(Runnable assertion) {
        long deadline = System.currentTimeMillis() + 15_000;
        AssertionError lastError;
        do {
            try {
                assertion.run();
                return;
            } catch (AssertionError e) {
                lastError = e;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        } while (System.currentTimeMillis() < deadline);
        throw lastError;
    }

    // ── Fixture helpers (mirror CityLaunchPromotionServiceIT's own private helpers) ────────────

    private static final double ORIGIN_LAT = 13.0;
    private static final double ORIGIN_LON = 74.7;

    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, false) RETURNING id",
                Integer.class, slug, slug + "-test-city", ORIGIN_LAT, ORIGIN_LON);
    }

    /**
     * A city whose {@code geo_center_lat}/{@code geo_center_lon} are both 0.0 (AC3 negative
     * fixture). {@code public.cities.geo_center_lat}/{@code geo_center_lon} carry a DB-level NOT
     * NULL constraint (confirmed live: a literal NULL insert here is rejected with a
     * DataIntegrityViolationException BEFORE this test ever reaches CityLaunchGraphWriter), so the
     * only reachable way to exercise AC3's null-OR-zero precondition through a real INSERT is the
     * zero-origin half of that same {@code origin.lat() == 0.0 || origin.lon() == 0.0} check — this
     * is exactly the "plausible-but-wrong Gulf-of-Guinea origin" hazard AC3's own javadoc names.
     */
    private int seedCityWithZeroOrigin(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 0.0, 0.0, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private void seedArea(int cityId, String areaKey, double lat, double lon) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, cityId + "-district", lat, lon);
    }

    private void seedRegion(int cityId, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, ?, 1)",
                cityId, regionKey, regionKey);
    }

    private void seedMembership(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source) "
                        + "VALUES (?, ?, ?, 'AUTO')",
                cityId, areaKey, regionKey);
    }

    /**
     * #2163: {@code prepare()} now self-materializes canonical geography prerequisites via
     * {@code CityRegionOnboardingService.apply()}, which requires a {@code city_region_policy}
     * row (else it throws {@code MISSING_POLICY}). Mirrors Udupi's real production policy
     * (CENTRAL_CARDINAL_4).
     */
    private void seedRegionPolicy(int cityId, String regionModel, double centralRadiusKm) {
        jdbc.update(
                "INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                        + "VALUES (?, ?, ?)",
                cityId, regionModel, centralRadiusKm);
    }

    /**
     * #2163: directly seeds a {@code regional_area_classifications} row (bypassing
     * {@code RegionalClassificationBackfillService}, whose {@code array_length(area_key,'|')=4}
     * filter this file's area_keys now satisfy but which would recompute rather than honour the
     * exact fixture geometry) so {@code prepare()}'s self-generated {@code CityRegionOnboardingService.apply()}
     * call finds {@code classificationsPresent()=true} and skips the (here, inapplicable) backfill
     * gate. The exact direction/distance values are irrelevant to every test in this file — none
     * asserts on which region_key an area lands in, only that city_regions/memberships end up
     * non-empty so prepare() can proceed to admission.
     */
    private void seedClassification(String citySlug, String areaKey) {
        jdbc.update(
                "INSERT INTO public.regional_area_classifications "
                        + "(city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at) "
                        + "VALUES (?, ?, 'N', '0_10', 0.0, 5.0, now())",
                citySlug, areaKey);
    }

    /**
     * #2163: guarantees {@code classificationsPresent()=true} for fixtures whose own areas are
     * seeded WITHOUT classification rows (e.g. the zero-origin AC3 fixture), so {@code
     * CityRegionOnboardingService.apply()} always has >=1 real region to materialize (satisfying
     * {@code validateCanonicalGeographyReady}'s "regions non-empty" post-condition). Seeded
     * INACTIVE so {@code AgriDestinationClassificationGenerator}'s ACTIVE-only {@code inScope}
     * filter skips it — it therefore never appears in any Agri row-count assertion in this file.
     */
    private void seedDecoyClassifiedArea(int cityId, String citySlug) {
        String decoyAreaKey = citySlug + "|d|g|decoy-2163";
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                        + "lifecycle_status) VALUES (?, ?, ?, ?, ?, ?, 'INACTIVE')",
                decoyAreaKey, cityId, decoyAreaKey, cityId + "-district", ORIGIN_LAT, ORIGIN_LON);
        seedClassification(citySlug, decoyAreaKey);
    }

    /** Valid canonical geography: {@code areaOffsets} keyed by area_key suffix -> [lat, lon]. */
    private int seedValidGeography(String citySlug, Map<String, double[]> areaOffsets) {
        int cityId = seedCity(citySlug);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, citySlug);
        for (Map.Entry<String, double[]> e : areaOffsets.entrySet()) {
            String areaKey = citySlug + "|d|g|" + e.getKey();
            seedArea(cityId, areaKey, e.getValue()[0], e.getValue()[1]);
            seedClassification(citySlug, areaKey);
        }
        return cityId;
    }

    /** Drives the REAL prepare -&gt; async graph-write -&gt; validate flow to a VALIDATED revision. */
    private long prepareAndValidate(int cityId) {
        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        long revisionId = prep.revisionId();
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing", "agriDestinations"}) {
            validationService.toggleCheck(cityId, revisionId, key, true);
        }
        validationService.markValidated(cityId, revisionId);
        assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.VALIDATED);
        return revisionId;
    }

    // ── Independent geo-math, coded from scratch in the test — NEVER calls RegionalGeo or the
    // generator, so a genuine production bug in either would actually fail this test. ────────────

    private static final double EARTH_RADIUS_KM = 6371.0;

    /** Spherical law of cosines great-circle distance — a DIFFERENT formula from RegionalGeo's
     *  haversine, computed independently, so this is not merely re-running the same code twice. */
    private static double independentDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaLambda = Math.toRadians(lon2 - lon1);
        double cosCentralAngle = Math.sin(phi1) * Math.sin(phi2)
                + Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        // Clamp for floating-point safety at exactly 0km (cos can drift fractionally above 1.0).
        cosCentralAngle = Math.min(1.0, Math.max(-1.0, cosCentralAngle));
        return EARTH_RADIUS_KM * Math.acos(cosCentralAngle);
    }

    private static double independentBearingDeg(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaLambda = Math.toRadians(lon2 - lon1);
        double y = Math.sin(deltaLambda) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        double bearing = Math.toDegrees(Math.atan2(y, x));
        return (bearing % 360 + 360) % 360;
    }

    /** Independently-coded direction sector mapping, per RegionalGeo's PUBLISHED javadoc contract
     *  (8 compass sectors, N wraps [337.5,360) U [0,22.5)) — not a call into RegionalGeo itself. */
    private static String independentDirectionKey(double bearingDeg) {
        if (bearingDeg >= 337.5 || bearingDeg < 22.5) return "N";
        if (bearingDeg < 67.5) return "NE";
        if (bearingDeg < 112.5) return "E";
        if (bearingDeg < 157.5) return "SE";
        if (bearingDeg < 202.5) return "S";
        if (bearingDeg < 247.5) return "SW";
        if (bearingDeg < 292.5) return "W";
        return "NW";
    }

    private static String independentDistanceBandKey(double distanceKm) {
        if (distanceKm < 10.0) return "0_10";
        if (distanceKm < 25.0) return "10_25";
        if (distanceKm < 50.0) return "25_50";
        return "50_up";
    }

    // =========================================================================================
    // 1 — GENERATION CORRECTNESS: real generator output matches an INDEPENDENTLY computed
    // haversine/bearing expectation, well away from any boundary.
    // =========================================================================================

    @Test
    @DisplayName("generation correctness: prepare on a city with valid canonical geography produces "
            + "Agri rows whose distance/bearing/direction/band match an independently-computed "
            + "expectation, and every row's origin equals the city's configured origin")
    void generationCorrectness_matchesIndependentComputation() {
        Map<String, double[]> areas = Map.of(
                "area-north", new double[] {ORIGIN_LAT + 0.05, ORIGIN_LON},          // ~5.6km due N
                "area-east", new double[] {ORIGIN_LAT, ORIGIN_LON + 0.135},           // ~14.6km due E
                "area-south", new double[] {ORIGIN_LAT - 0.30, ORIGIN_LON});          // ~33.4km due S
        int cityId = seedValidGeography("gen1", areas);

        long revisionId = prepareAndValidate(cityId);

        List<SandboxAgriDestinationClassification> rows =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId);
        assertThat(rows).hasSize(3);

        Map<String, SandboxAgriDestinationClassification> byAreaKey = new java.util.HashMap<>();
        rows.forEach(r -> byAreaKey.put(r.getAreaKey(), r));

        for (Map.Entry<String, double[]> e : areas.entrySet()) {
            String areaKey = "gen1|d|g|" + e.getKey();
            double destLat = e.getValue()[0];
            double destLon = e.getValue()[1];
            double expectedDistanceKm = independentDistanceKm(ORIGIN_LAT, ORIGIN_LON, destLat, destLon);
            double expectedBearingDeg = independentBearingDeg(ORIGIN_LAT, ORIGIN_LON, destLat, destLon);
            String expectedDirectionKey = independentDirectionKey(expectedBearingDeg);
            String expectedBandKey = independentDistanceBandKey(expectedDistanceKm);

            SandboxAgriDestinationClassification row = byAreaKey.get(areaKey);
            assertThat(row).as("row for %s must exist", areaKey).isNotNull();
            assertThat(row.getDistanceKm())
                    .as("distance for %s", areaKey)
                    .isCloseTo(expectedDistanceKm, org.assertj.core.data.Offset.offset(0.01));
            assertThat(row.getBearingDeg())
                    .as("bearing for %s", areaKey)
                    .isCloseTo(expectedBearingDeg, org.assertj.core.data.Offset.offset(0.5));
            assertThat(row.getDirectionKey()).as("direction for %s", areaKey).isEqualTo(expectedDirectionKey);
            assertThat(row.getDistanceBandKey()).as("band for %s", areaKey).isEqualTo(expectedBandKey);
            assertThat(row.getOriginLat()).isEqualTo(ORIGIN_LAT);
            assertThat(row.getOriginLon()).isEqualTo(ORIGIN_LON);
            assertThat(row.getGeneratorVersion()).isNotBlank();
        }

        // Sanity: the three chosen offsets genuinely land in three DIFFERENT bands/directions, so
        // this test is not vacuously true for a single degenerate case.
        assertThat(byAreaKey.get("gen1|d|g|area-north").getDistanceBandKey()).isEqualTo("0_10");
        assertThat(byAreaKey.get("gen1|d|g|area-east").getDistanceBandKey()).isEqualTo("10_25");
        assertThat(byAreaKey.get("gen1|d|g|area-south").getDistanceBandKey()).isEqualTo("25_50");
        assertThat(byAreaKey.get("gen1|d|g|area-north").getDirectionKey()).isEqualTo("N");
        assertThat(byAreaKey.get("gen1|d|g|area-east").getDirectionKey()).isEqualTo("E");
        assertThat(byAreaKey.get("gen1|d|g|area-south").getDirectionKey()).isEqualTo("S");
    }

    // =========================================================================================
    // 2 — DETERMINISM: regenerating over UNCHANGED inputs (via rerunSuperseding, since the first
    // revision is still in-flight/PREPARED) produces identical row content AND an identical
    // persisted_revision_checksum.
    // =========================================================================================

    @Test
    @DisplayName("determinism: regenerating over unchanged inputs produces identical Agri row content "
            + "and an identical persisted_revision_checksum across two revisions")
    void determinism_regenerationOverUnchangedInputs_identicalContentAndChecksum() {
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.02, ORIGIN_LON + 0.01},
                "area-2", new double[] {ORIGIN_LAT - 0.04, ORIGIN_LON - 0.02},
                "area-3", new double[] {ORIGIN_LAT + 0.01, ORIGIN_LON - 0.06});
        int cityId = seedValidGeography("det1", areas);

        PrepareResponse prep1 = preparationService.prepare(cityId, ADMIN_ID);
        long revisionId1 = prep1.revisionId();
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId1).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        PrepareResponse prep2 = preparationService.rerunSuperseding(cityId, revisionId1, ADMIN_ID);
        long revisionId2 = prep2.revisionId();
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId2).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        List<SandboxAgriDestinationClassification> rows1 =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId1);
        List<SandboxAgriDestinationClassification> rows2 =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId2);
        assertThat(rows1).hasSize(3);
        assertThat(rows2).hasSize(3);

        Map<String, SandboxAgriDestinationClassification> byKey1 = new java.util.HashMap<>();
        rows1.forEach(r -> byKey1.put(r.getAreaKey(), r));
        Map<String, SandboxAgriDestinationClassification> byKey2 = new java.util.HashMap<>();
        rows2.forEach(r -> byKey2.put(r.getAreaKey(), r));

        assertThat(byKey1.keySet()).containsExactlyInAnyOrderElementsOf(byKey2.keySet());
        for (String areaKey : byKey1.keySet()) {
            SandboxAgriDestinationClassification r1 = byKey1.get(areaKey);
            SandboxAgriDestinationClassification r2 = byKey2.get(areaKey);
            assertThat(r2.getDistanceKm()).as("%s distanceKm", areaKey).isEqualTo(r1.getDistanceKm());
            assertThat(r2.getBearingDeg()).as("%s bearingDeg", areaKey).isEqualTo(r1.getBearingDeg());
            assertThat(r2.getDirectionKey()).as("%s directionKey", areaKey).isEqualTo(r1.getDirectionKey());
            assertThat(r2.getDistanceBandKey()).as("%s distanceBandKey", areaKey).isEqualTo(r1.getDistanceBandKey());
            assertThat(r2.getOriginLat()).isEqualTo(r1.getOriginLat());
            assertThat(r2.getOriginLon()).isEqualTo(r1.getOriginLon());
            assertThat(r2.getGeneratorVersion()).isEqualTo(r1.getGeneratorVersion());
        }

        // The property that actually makes promotion's checksum gate meaningful: two independent
        // generations over byte-identical input produce the byte-identical persisted checksum.
        String checksum1 = revisionRepository.findById(revisionId1).orElseThrow().getPersistedRevisionChecksum();
        String checksum2 = revisionRepository.findById(revisionId2).orElseThrow().getPersistedRevisionChecksum();
        assertThat(checksum1).isNotBlank();
        assertThat(checksum2).isEqualTo(checksum1);
    }

    // =========================================================================================
    // 3 — IDEMPOTENCY / STALE-ROW REMOVAL: an area made INACTIVE between two PROMOTED revisions
    // must NOT leave its classification row behind in PRODUCTION after the second promotion — the
    // guard against reproducing the F2 no-delete-upsert defect.
    // =========================================================================================

    @Test
    @DisplayName("stale-row removal: deactivating an area between two promotions removes its Agri "
            + "row from PRODUCTION on the next promotion — content otherwise stable and reproducible")
    void staleRowRemoval_deactivatedAreaDoesNotSurviveNextPromotion() {
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.03, ORIGIN_LON},
                "area-2", new double[] {ORIGIN_LAT - 0.03, ORIGIN_LON + 0.02},
                "area-3", new double[] {ORIGIN_LAT, ORIGIN_LON - 0.05});
        int cityId = seedValidGeography("stale1", areas);

        long revisionId1 = prepareAndValidate(cityId);
        PromotionReport report1 = promotionService.launch(cityId, revisionId1, ADMIN_ID.toString());
        assertThat(report1.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(report1.agriDestinationsPromoted()).isEqualTo(3);

        List<AgriDestinationClassification> prodAfterFirst = agriDestinationClassificationRepository.findByCityId(cityId);
        assertThat(prodAfterFirst).hasSize(3);

        // Deactivate one area — the generator's ACTIVE-only filter must exclude it from the NEXT
        // revision's sandbox set, and promotion's REPLACE discipline must not let its prior
        // production row survive.
        jdbc.update("UPDATE public.areas SET lifecycle_status = 'INACTIVE' WHERE area_key = ?", "stale1|d|g|area-2");

        long revisionId2 = prepareAndValidate(cityId);
        List<SandboxAgriDestinationClassification> sandboxRows2 =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId2);
        assertThat(sandboxRows2).hasSize(2);
        assertThat(sandboxRows2.stream().map(SandboxAgriDestinationClassification::getAreaKey))
                .doesNotContain("stale1|d|g|area-2");

        PromotionReport report2 = promotionService.launch(cityId, revisionId2, ADMIN_ID.toString());
        assertThat(report2.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(report2.agriDestinationsPromoted()).isEqualTo(2);

        List<AgriDestinationClassification> prodAfterSecond = agriDestinationClassificationRepository.findByCityId(cityId);
        assertThat(prodAfterSecond).hasSize(2);
        assertThat(prodAfterSecond.stream().map(AgriDestinationClassification::getAreaKey))
                .as("the deactivated area's stale production row must not survive the REPLACE-discipline "
                        + "promotion — this is the exact F2 no-delete-upsert defect this table's design closes")
                .doesNotContain("stale1|d|g|area-2")
                .containsExactlyInAnyOrder("stale1|d|g|area-1", "stale1|d|g|area-3");
    }

    // =========================================================================================
    // 4 — AC3: a NULL city origin fails prepare with GeographyValidationException BEFORE any
    // sandbox row is written, and the revision never reaches PREPARED. Positive control included.
    // =========================================================================================

    @Test
    @DisplayName("AC3: a city with a zero (0.0/0.0) geo_center_lat/geo_center_lon origin fails prepare "
            + "with a Geography validation failure, zero sandbox rows written, revision never reaches "
            + "PREPARED")
    void ac3_zeroOrigin_prepareFails_noRevisionReachesPrepared() {
        int cityId = seedCityWithZeroOrigin("ac3-zero");
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, "ac3-zero");
        seedArea(cityId, "ac3-zero|d|g|area-1", ORIGIN_LAT, ORIGIN_LON);
        seedClassification("ac3-zero", "ac3-zero|d|g|area-1");

        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        long revisionId = prep.revisionId();

        // The origin precondition is enforced inside the ASYNC graph write (CityLaunchGraphWriter
        // #validate), not the synchronous admission check — so prepare() itself returns normally
        // (revision admitted PREPARING) and the failure surfaces as an eventual FAILED transition.
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.FAILED));

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getFailureReason())
                .as("failure reason must identify the missing origin, not a generic failure")
                .containsIgnoringCase("geo_center_lat");
        assertThat(revision.getPreparedAt()).isNull();
        assertThat(revision.getPersistedRevisionChecksum()).isNull();

        // Whole-transaction rollback: NO sandbox row of any kind survives the failed validate().
        assertThat(sandboxAreaRepository.findByRevisionId(revisionId)).isEmpty();
        assertThat(sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId)).isEmpty();
    }

    @Test
    @DisplayName("AC3 positive control: a city WITH a valid non-null/non-zero origin reaches PREPARED "
            + "with real Agri rows generated")
    void ac3_validOrigin_prepareSucceeds_agriRowsGenerated() {
        int cityId = seedValidGeography("ac3-ok", Map.of("area-1", new double[] {ORIGIN_LAT + 0.02, ORIGIN_LON}));

        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        long revisionId = prep.revisionId();
        pollUntil(() -> assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        List<SandboxAgriDestinationClassification> rows =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getOriginLat()).isEqualTo(ORIGIN_LAT);
        assertThat(rows.get(0).getOriginLon()).isEqualTo(ORIGIN_LON);
    }

    // =========================================================================================
    // 4b — CORRECTNESS FIX REGRESSION (PR reviewer finding): generation consumes the CAPTURED
    // revision area input (sandbox_areas), never a fresh independent read of production
    // public.areas. Proven behaviourally: mutate public.areas AFTER the revision's areas were
    // captured but BEFORE (re)generation, then assert the generated rows reflect the CAPTURED
    // state, not the mutated production state. Against the pre-fix implementation — which took a
    // bare `cityId` and issued its own `SELECT ... FROM public.areas WHERE city_id = ?` — this
    // exact sequence would have picked up BOTH production mutations below and failed every
    // assertion in this test (wrong area_key set, wrong distance for area-1).
    // =========================================================================================

    @Test
    @DisplayName("regression (#2151 correctness fix): generation uses the captured revision area "
            + "input, not a fresh production public.areas read — a production mutation landing "
            + "AFTER capture but BEFORE generation must not change the generated rows")
    void generation_usesCapturedRevisionInput_notFreshProductionRead() {
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.04, ORIGIN_LON},
                "area-2", new double[] {ORIGIN_LAT - 0.06, ORIGIN_LON + 0.02});
        int cityId = seedValidGeography("snap1", areas);

        long revisionId = prepareAndValidate(cityId);

        // The exact input CityLaunchGraphWriter captured into sandbox_areas for this revision,
        // BEFORE any production mutation below — this is what the generator must be driven by.
        // #2163: exclude the fixture's decoy classified area (see seedDecoyClassifiedArea) — it
        // exists only to satisfy prepare()'s self-materialized classificationsPresent()/apply()
        // prerequisites, is captured into sandbox_areas like every other area regardless of
        // lifecycle_status, but is not part of what THIS test is verifying.
        List<SandboxArea> capturedAreas = sandboxAreaRepository.findByRevisionId(revisionId).stream()
                .filter(a -> !a.getAreaKey().contains("decoy-2163"))
                .toList();
        assertThat(capturedAreas).hasSize(2);
        Set<String> capturedAreaKeys = capturedAreas.stream()
                .map(SandboxArea::getAreaKey)
                .collect(Collectors.toSet());

        // Mutate PRODUCTION public.areas AFTER capture: deactivate area-2 (the OLD generator's
        // `lifecycle_status = 'ACTIVE'` filter would then exclude it) and move area-1 far away
        // (the OLD generator would compute a completely different distance/bearing for it).
        jdbc.update("UPDATE public.areas SET lifecycle_status = 'INACTIVE' WHERE area_key = ?", "snap1|d|g|area-2");
        jdbc.update("UPDATE public.areas SET geo_center_lat = ?, geo_center_lon = ? WHERE area_key = ?",
                ORIGIN_LAT + 5.0, ORIGIN_LON + 5.0, "snap1|d|g|area-1");

        // Regenerate for the SAME revision, passing the CAPTURED (pre-mutation) input — exactly
        // what CityLaunchGraphWriter now does; production is never consulted again here.
        List<SandboxAgriDestinationClassification> regenerated =
                agriDestinationClassificationGenerator.generateAndStoreForRevision(
                        revisionId, capturedAreas, ORIGIN_LAT, ORIGIN_LON, Instant.now());

        Set<String> regeneratedAreaKeys = regenerated.stream()
                .map(SandboxAgriDestinationClassification::getAreaKey)
                .collect(Collectors.toSet());
        assertThat(regeneratedAreaKeys)
                .as("generated area_key set must EQUAL the captured revision's sandbox_areas key "
                        + "set (filtered by ACTIVE + non-null coordinates) — never reflect a "
                        + "production mutation that happened after capture")
                .isEqualTo(capturedAreaKeys);
        assertThat(regeneratedAreaKeys)
                .as("area-2 must still be classified despite production having been flipped to "
                        + "INACTIVE after capture")
                .contains("snap1|d|g|area-2");

        SandboxAgriDestinationClassification area1Row = regenerated.stream()
                .filter(r -> r.getAreaKey().equals("snap1|d|g|area-1"))
                .findFirst()
                .orElseThrow();
        double expectedDistanceKm =
                independentDistanceKm(ORIGIN_LAT, ORIGIN_LON, ORIGIN_LAT + 0.04, ORIGIN_LON);
        assertThat(area1Row.getDistanceKm())
                .as("area-1's distance must reflect its CAPTURED (pre-mutation) coordinates, not "
                        + "the coordinates production public.areas was mutated to afterward")
                .isCloseTo(expectedDistanceKm, org.assertj.core.data.Offset.offset(0.01));
    }

    // =========================================================================================
    // 5 — PROMOTION ATOMICITY: promotion installs the Agri rows into production; a tampered
    // persisted_revision_checksum yields a 422 and leaves the production table COMPLETELY
    // untouched (row counts, not merely "an exception was raised").
    // =========================================================================================

    @Test
    @DisplayName("promotion atomicity: a happy-path promotion installs exactly the sandbox row count "
            + "into production Agri classification")
    void promotionAtomicity_happyPath_installsExactRowCountIntoProduction() {
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.01, ORIGIN_LON},
                "area-2", new double[] {ORIGIN_LAT - 0.02, ORIGIN_LON + 0.01});
        int cityId = seedValidGeography("promo1", areas);
        long revisionId = prepareAndValidate(cityId);

        assertThat(agriDestinationClassificationRepository.findByCityId(cityId))
                .as("nothing in production before promotion")
                .isEmpty();

        PromotionReport report = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(report.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(report.agriDestinationsPromoted()).isEqualTo(2);

        List<AgriDestinationClassification> prodRows = agriDestinationClassificationRepository.findByCityId(cityId);
        assertThat(prodRows).hasSize(2);
        assertThat(prodRows.stream().map(AgriDestinationClassification::getAreaKey))
                .containsExactlyInAnyOrder("promo1|d|g|area-1", "promo1|d|g|area-2");
    }

    @Test
    @DisplayName("promotion atomicity: a tampered persisted_revision_checksum rejects promotion with "
            + "422 and leaves the production Agri table with ZERO rows for this city, before AND after")
    void promotionAtomicity_tamperedChecksum_rejectedWithZeroProductionWrites() {
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.015, ORIGIN_LON},
                "area-2", new double[] {ORIGIN_LAT - 0.025, ORIGIN_LON - 0.01});
        int cityId = seedValidGeography("promo2", areas);
        long revisionId = prepareAndValidate(cityId);

        assertThat(agriDestinationClassificationRepository.findByCityId(cityId)).isEmpty();

        jdbc.update("UPDATE public.city_launch_revision SET persisted_revision_checksum = ? WHERE id = ?",
                "deliberately-tampered-checksum-value", revisionId);

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .isInstanceOf(ResponseStatusException.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        // Production table row count is IDENTICAL before and after the rejected promotion attempt —
        // not merely "an exception was thrown" but genuinely zero writes.
        assertThat(agriDestinationClassificationRepository.findByCityId(cityId))
                .as("checksum-mismatch promotion must write ZERO production Agri rows")
                .isEmpty();
        // Also verify the revision itself never advanced past VALIDATED (whole-transaction rollback).
        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();
    }

    // =========================================================================================
    // 6 — #2177 CHECKSUM PRECISION DRIFT REGRESSION: CityLaunchGraphWriter must stamp
    // persisted_revision_checksum from the SAME DB-round-tripped representation of every double
    // that CityLaunchPromotionService.launch recomputes from — not from the in-memory `.save()`-
    // returned entities, which carry full Java `double` precision never round-tripped through a
    // SELECT. On a connection with extra_float_digits=0 (this container; matches hosted Supabase —
    // see the @Container javadoc above), Postgres formats a re-SELECTed DOUBLE PRECISION to 15
    // significant digits, which is lossy versus the up-to-17 significant digits a haversine-
    // computed double may need to round-trip exactly. Before the #2177 fix, prepare-time hashed the
    // full-precision in-memory value while promote-time always hashed the truncated re-queried
    // value, so a genuine (non-tampered) revision could fail promotion with a false-positive 422
    // checksum mismatch purely from this representation gap.
    // =========================================================================================

    @Test
    @DisplayName("#2177 regression: promotion succeeds for a genuine (untampered) revision whose Agri "
            + "distance/bearing doubles have enough decimal entropy to previously trigger a false "
            + "checksum-mismatch 422 from prepare-time vs. promote-time float representation drift")
    void checksumPrecisionDrift_promotionSucceedsDespiteHighEntropyDoubles() {
        // Offsets chosen so haversine distance/bearing land far from any round number or band/sector
        // boundary — maximising the odds the resulting double needs the full 17 significant digits
        // to round-trip exactly (matching the diagnosed live case: a haversine distance of
        // 1.1561671177279886 round-tripping through Postgres as 1.15616711772799 under
        // extra_float_digits=0).
        Map<String, double[]> areas = Map.of(
                "area-1", new double[] {ORIGIN_LAT + 0.083756219, ORIGIN_LON + 0.041928374},
                "area-2", new double[] {ORIGIN_LAT - 0.019283746, ORIGIN_LON + 0.067182934},
                "area-3", new double[] {ORIGIN_LAT + 0.052918374, ORIGIN_LON - 0.038475610});
        int cityId = seedValidGeography("prec1", areas);

        long revisionId = prepareAndValidate(cityId);

        // Sanity: at least one generated distance/bearing genuinely carries high decimal entropy —
        // otherwise this test would vacuously pass even against the pre-fix code.
        List<SandboxAgriDestinationClassification> rows =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId);
        assertThat(rows).hasSize(3);
        boolean anyHighEntropy = rows.stream().anyMatch(r ->
                Double.toString(r.getDistanceKm()).replace("-", "").replace(".", "").length() >= 15
                        || Double.toString(r.getBearingDeg()).replace("-", "").replace(".", "").length() >= 15);
        assertThat(anyHighEntropy)
                .as("fixture must produce at least one distanceKm/bearingDeg with >=15 significant "
                        + "digits, else this test cannot exercise the #2177 precision-drift gap")
                .isTrue();

        PromotionReport report = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());

        assertThat(report.lifecycleStatus())
                .as("a genuine, untampered revision must promote successfully — a checksum mismatch "
                        + "here means prepare-time and promote-time hashed different representations "
                        + "of the same underlying double values (#2177)")
                .isEqualTo("PROMOTED");
        assertThat(report.agriDestinationsPromoted()).isEqualTo(3);

        List<AgriDestinationClassification> prodRows = agriDestinationClassificationRepository.findByCityId(cityId);
        assertThat(prodRows).hasSize(3);
    }
}
