package com.example.realestate.discover;

import com.example.realestate.area.AreaNotFoundException;
import com.example.realestate.area.AreaOverviewResponse;
import com.example.realestate.area.AreaOverviewService;
import com.example.realestate.area.TrendingAreasResponse;
import com.example.realestate.area.TrendsOptionsResponse;
import com.example.realestate.intelligence.AreaIntelligenceSnapshotRepository;
import com.example.realestate.intelligence.BuyerAreaIntelligenceResponse;
import com.example.realestate.intelligence.BuyerAreaIntelligenceService;
import com.example.realestate.intelligence.ResolveAreaResponse;
import com.example.realestate.discover.navigation.PostgresAreaCountProvider;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.school.SchoolRepository;
import com.example.realestate.school.SchoolService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers real-DB behavioural parity + regression suite for #1935 (city {@code is_active}
 * gating).
 *
 * <p><b>Fixture.</b> Two hand-built cities with an IDENTICAL hierarchy (area, area_group,
 * area_overview_stats row, regional_area_classifications row, area_intelligence_snapshot row,
 * one residential LIVE listing, one agricultural_land LIVE listing):
 * <ul>
 *   <li>{@link #ACTIVE_CITY} — {@code cities.is_active = true}</li>
 *   <li>{@link #INACTIVE_CITY} — {@code cities.is_active = false}</li>
 * </ul>
 * plus {@link #UNKNOWN_CITY}, a slug never inserted into {@code cities} at all.
 *
 * <p><b>Core assertion, repeated per endpoint category:</b> inactive-city response == unknown-city
 * response (same shape/status), and active-city response returns the real seeded data (no
 * regression from the #1935 gate).
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
class CityActiveGating1935IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String ACTIVE_CITY = "qa1935active";
    private static final String INACTIVE_CITY = "qa1935inactive";
    private static final String UNKNOWN_CITY = "qa1935unknown";

    private static final String ACTIVE_AREA = "QA|QA|" + ACTIVE_CITY + "|Area1";
    private static final String INACTIVE_AREA = "QA|QA|" + INACTIVE_CITY + "|Area1";
    private static final String UNKNOWN_AREA = "QA|QA|" + UNKNOWN_CITY + "|Area1";

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private NamedParameterJdbcTemplate namedJdbcTemplate;
    @Autowired
    private ListingRepository listingRepository;
    @Autowired
    private AreaIntelligenceSnapshotRepository areaIntelligenceSnapshotRepository;
    @Autowired
    private SchoolRepository schoolRepository;

    private CityActivationGuard cityActivationGuard;
    private AreaGroupsService areaGroupsService;
    private AreaSummaryService areaSummaryService;
    private CityAreaListingsService cityAreaListingsService;
    private DiscoverAgriMapListingsService discoverAgriMapListingsService;
    private RegionSummaryService regionSummaryService;
    private RegionalAreaGroupsService regionalAreaGroupsService;
    private AreaOverviewService areaOverviewService;
    private BuyerAreaIntelligenceService buyerAreaIntelligenceService;

    private int activeCityId;
    private int inactiveCityId;

    @BeforeEach
    void setUp() {
        cityActivationGuard = new CityActivationGuard(jdbcTemplate);
        areaGroupsService = new AreaGroupsService(jdbcTemplate);
        areaSummaryService = new AreaSummaryService(jdbcTemplate);
        cityAreaListingsService = new CityAreaListingsService(jdbcTemplate);
        discoverAgriMapListingsService = new DiscoverAgriMapListingsService(jdbcTemplate);
        regionSummaryService = new RegionSummaryService(jdbcTemplate);
        regionalAreaGroupsService = new RegionalAreaGroupsService(jdbcTemplate, cityActivationGuard);
        areaOverviewService = new AreaOverviewService(
                jdbcTemplate, namedJdbcTemplate,
                // Real SchoolService — never actually invoked in this suite's assertions because
                // the fixture area_overview_stats rows leave centroid_lat/centroid_lon NULL, and
                // AreaOverviewService.querySchools() short-circuits to an empty list on a null
                // centroid before ever calling schoolService.findNearby(...).
                new SchoolService(schoolRepository),
                new com.fasterxml.jackson.databind.ObjectMapper(),
                cityActivationGuard);
        buyerAreaIntelligenceService = new BuyerAreaIntelligenceService(
                areaIntelligenceSnapshotRepository, jdbcTemplate, cityActivationGuard);

        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM area_intelligence_snapshot WHERE city_slug LIKE 'qa1935%'");
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key LIKE 'qa1935%'");
        jdbcTemplate.update("DELETE FROM city_regional_direction_labels WHERE city_key LIKE 'qa1935%'");
        jdbcTemplate.update("DELETE FROM area_overview_stats WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM area_group_members WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM area_groups WHERE slug LIKE 'qa1935%'");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug LIKE 'qa1935%'");

        activeCityId = insertCity(ACTIVE_CITY, true);
        inactiveCityId = insertCity(INACTIVE_CITY, false);

        insertArea(ACTIVE_AREA, activeCityId, "Area1");
        insertArea(INACTIVE_AREA, inactiveCityId, "Area1");

        insertAreaGroup(ACTIVE_CITY, activeCityId, ACTIVE_AREA);
        insertAreaGroup(INACTIVE_CITY, inactiveCityId, INACTIVE_AREA);

        insertAreaOverviewStats(ACTIVE_AREA);
        insertAreaOverviewStats(INACTIVE_AREA);

        insertRegionalClassification(ACTIVE_CITY, ACTIVE_AREA);
        insertRegionalClassification(INACTIVE_CITY, INACTIVE_AREA);

        insertAreaIntelligenceSnapshot(ACTIVE_CITY, ACTIVE_AREA);
        insertAreaIntelligenceSnapshot(INACTIVE_CITY, INACTIVE_AREA);

        insertLiveListing(ACTIVE_AREA, "house");
        insertLiveListing(INACTIVE_AREA, "house");
        insertLiveListing(ACTIVE_AREA, "agricultural_land");
        insertLiveListing(INACTIVE_AREA, "agricultural_land");
    }

    // ── Fixture helpers ──────────────────────────────────────────────────────

    private int insertCity(String slug, boolean active) {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.0, ?)",
                slug, slug, active);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, slug);
    }

    private void insertArea(String areaKey, int cityId, String name) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, 13.0, 74.0, 12.99, 73.99, 13.01, 74.01)",
                areaKey, cityId, name);
    }

    private void insertAreaGroup(String citySlug, int cityId, String areaKey) {
        jdbcTemplate.update(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, ?, 0, true)",
                cityId, citySlug + "-group", citySlug + " Group");
        int groupId = jdbcTemplate.queryForObject(
                "SELECT id FROM area_groups WHERE city_id = ? AND slug = ?",
                Integer.class, cityId, citySlug + "-group");
        jdbcTemplate.update(
                "INSERT INTO area_group_members (area_group_id, area_key, display_order) VALUES (?, ?, 0)",
                groupId, areaKey);
    }

    private void insertAreaOverviewStats(String areaKey) {
        jdbcTemplate.update(
                "INSERT INTO area_overview_stats (area_key, area_level, listing_count_90d, "
                        + "median_price_paise, confidence_tier) VALUES (?, 'locality', 5, 5000000, 'full')",
                areaKey);
    }

    private void insertRegionalClassification(String citySlug, String areaKey) {
        jdbcTemplate.update(
                "INSERT INTO regional_area_classifications (city_key, area_key, direction_key, "
                        + "distance_band_key, bearing_deg, distance_km) VALUES (?, ?, 'N', '0_10', 10.0, 5.0)",
                citySlug, areaKey);
    }

    private void insertAreaIntelligenceSnapshot(String citySlug, String areaKey) {
        jdbcTemplate.update(
                "INSERT INTO area_intelligence_snapshot (city_slug, area_key, area_label, "
                        + "active_listing_count, median_price_paise, dominant_property_type, "
                        + "fresh_listing_count, price_comparison_supported, confidence) "
                        + "VALUES (?, ?, 'Area1', 12, 5000000, 'house', 3, true, 'full')",
                citySlug, areaKey);
    }

    private UUID insertLiveListing(String areaKey, String propertyType) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, 13.0, 74.0, 5000000, ?, ?)",
                id, areaKey, propertyType, now, now);
        return id;
    }

    // ── 1. CityActivationGuard direct unit-level behaviour ─────────────────

    @Test
    @DisplayName("CityActivationGuard.isActiveCitySlug: true only for the active city")
    void guardIsActiveCitySlug() {
        assertThat(cityActivationGuard.isActiveCitySlug(ACTIVE_CITY)).isTrue();
        assertThat(cityActivationGuard.isActiveCitySlug(INACTIVE_CITY)).isFalse();
        assertThat(cityActivationGuard.isActiveCitySlug(UNKNOWN_CITY)).isFalse();
    }

    @Test
    @DisplayName("CityActivationGuard.isActiveForAreaKey: true only for the active area")
    void guardIsActiveForAreaKey() {
        assertThat(cityActivationGuard.isActiveForAreaKey(ACTIVE_AREA)).isTrue();
        assertThat(cityActivationGuard.isActiveForAreaKey(INACTIVE_AREA)).isFalse();
        assertThat(cityActivationGuard.isActiveForAreaKey(UNKNOWN_AREA)).isFalse();
    }

    /**
     * PR-review fix (#1935): isActiveForAreaKey() now resolves via the CANONICAL
     * areas.city_id -> cities.id join, not the old district-segment string-split heuristic
     * (matching the area_key's 3rd pipe segment against cities.slug OR cities.name). The old
     * heuristic would have gotten this case WRONG in at least one direction: a city whose
     * slug ('bengaluru'), name ('Bengaluru' — different case, still string-equal ignoring case
     * to the slug, so not fully discriminating on its own) and area_key district segment
     * ('Bengaluru Urban' — DIFFERENT from both slug and name) are all distinct strings. The old
     * code would do `lower(slug) = lower('Bengaluru Urban') OR lower(name) = lower('Bengaluru
     * Urban')` — neither matches 'bengaluru'/'Bengaluru', so it would incorrectly report this
     * real, canonically-linked area as belonging to NO active city (false negative — the area
     * would wrongly appear inactive/unknown even though areas.city_id correctly points at this
     * active city). The new canonical join resolves purely via the area_key's OWN areas row's
     * city_id FK — the district-segment text is irrelevant — so it gets this right in both
     * directions.
     */
    @Test
    @DisplayName("CityActivationGuard.isActiveForAreaKey: canonical areas.city_id join resolves correctly "
            + "even when slug != name != area_key district segment (the case the old string-split heuristic "
            + "would have gotten wrong)")
    void guardIsActiveForAreaKey_canonicalJoin_notStringHeuristic() {
        final String slug = "bengaluru";
        final String name = "Bengaluru";
        final String districtSegment = "Bengaluru Urban"; // deliberately != slug and != name
        final String areaKey = "IN|KA|" + districtSegment + "|Some Area";

        int cityId = jdbcTemplate.queryForObject(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 12.97, 77.59, true) RETURNING id",
                Integer.class, slug, name);
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, 'Some Area', 12.97, 77.59)",
                areaKey, cityId);

        try {
            // Canonical join resolves via areas.city_id -> cities.id — the district segment
            // text ('Bengaluru Urban') never has to match slug or name for this to work.
            assertThat(cityActivationGuard.isActiveForAreaKey(areaKey))
                    .as("area resolves via its OWN areas.city_id FK, not by matching the area_key's "
                            + "district-segment text against cities.slug/name")
                    .isTrue();

            jdbcTemplate.update("UPDATE cities SET is_active = false WHERE id = ?", cityId);
            assertThat(cityActivationGuard.isActiveForAreaKey(areaKey))
                    .as("same area, city now inactive — must flip to false via the same canonical join")
                    .isFalse();
        } finally {
            jdbcTemplate.update("DELETE FROM areas WHERE area_key = ?", areaKey);
            jdbcTemplate.update("DELETE FROM cities WHERE id = ?", cityId);
        }
    }

    // ── 2. /api/discover/area-groups ────────────────────────────────────────

    @Test
    @DisplayName("area-groups: inactive city == unknown city (empty groups); active city returns the real group")
    void areaGroups_inactiveEqualsUnknown_activeReturnsData() {
        AreaGroupsResponse active = areaGroupsService.getGroupsByCity(ACTIVE_CITY);
        AreaGroupsResponse inactive = areaGroupsService.getGroupsByCity(INACTIVE_CITY);
        AreaGroupsResponse unknown = areaGroupsService.getGroupsByCity(UNKNOWN_CITY);

        assertThat(active.groups()).hasSize(1);
        assertThat(active.groups().get(0).areaKeys()).contains(ACTIVE_AREA);

        assertThat(inactive.groups()).isEmpty();
        assertThat(unknown.groups()).isEmpty();
        assertThat(inactive.groups()).isEqualTo(unknown.groups());
    }

    // ── 3. /api/discover/areas ───────────────────────────────────────────────

    @Test
    @DisplayName("areas: inactive city == unknown city (empty areas); active city returns the real area")
    void areas_inactiveEqualsUnknown_activeReturnsData() {
        AreaSummaryResponse active = areaSummaryService.getAreasByCity(ACTIVE_CITY);
        AreaSummaryResponse inactive = areaSummaryService.getAreasByCity(INACTIVE_CITY);
        AreaSummaryResponse unknown = areaSummaryService.getAreasByCity(UNKNOWN_CITY);

        assertThat(active.areas()).extracting("areaKey").contains(ACTIVE_AREA);
        assertThat(inactive.areas()).isEmpty();
        assertThat(unknown.areas()).isEmpty();
    }

    // ── 4. /api/discover/cities/{city}/listings ─────────────────────────────

    @Test
    @DisplayName("cities/{city}/listings: inactive city rejected exactly like unknown city (400 unknown_city); "
            + "active city returns the seeded listing")
    void cityAreaListings_inactiveEqualsUnknown_activeReturnsData() {
        CityAreaListingsResponse active = cityAreaListingsService.getAreaListings(
                ACTIVE_CITY, List.of(ACTIVE_AREA), null, null, null, null, null, null, null, true);
        assertThat(active.areas()).hasSize(1);
        assertThat(active.areas().get(0).listings()).isNotEmpty();

        assertThatThrownBy(() -> cityAreaListingsService.getAreaListings(
                INACTIVE_CITY, List.of(INACTIVE_AREA), null, null, null, null, null, null, null, true))
                .hasMessageContaining("unknown_city");

        assertThatThrownBy(() -> cityAreaListingsService.getAreaListings(
                UNKNOWN_CITY, List.of(UNKNOWN_AREA), null, null, null, null, null, null, null, true))
                .hasMessageContaining("unknown_city");
    }

    // ── 5. /api/discover/agri-map-listings ──────────────────────────────────

    @Test
    @DisplayName("agri-map-listings: inactive city == unknown city (empty listings); active city returns the agri listing")
    void agriMapListings_inactiveEqualsUnknown_activeReturnsData() {
        AgriMapListingsResponse active = discoverAgriMapListingsService.findAgriMapListings(
                ACTIVE_CITY, List.of(ACTIVE_AREA), Optional.empty(), true, null);
        AgriMapListingsResponse inactive = discoverAgriMapListingsService.findAgriMapListings(
                INACTIVE_CITY, List.of(INACTIVE_AREA), Optional.empty(), true, null);
        AgriMapListingsResponse unknown = discoverAgriMapListingsService.findAgriMapListings(
                UNKNOWN_CITY, List.of(UNKNOWN_AREA), Optional.empty(), true, null);

        assertThat(active.listings()).hasSize(1);
        assertThat(inactive.listings()).isEmpty();
        assertThat(unknown.listings()).isEmpty();
    }

    // ── 6. /api/discover/cities/{city}/regions ──────────────────────────────

    @Test
    @DisplayName("regions: inactive city == unknown city (cityId=null, empty regions)")
    void regions_inactiveEqualsUnknown() {
        RegionSummaryResponse inactive = regionSummaryService.getRegions(INACTIVE_CITY);
        RegionSummaryResponse unknown = regionSummaryService.getRegions(UNKNOWN_CITY);

        assertThat(inactive.cityId()).isNull();
        assertThat(inactive.regions()).isEmpty();
        assertThat(unknown.cityId()).isNull();
        assertThat(unknown.regions()).isEmpty();
    }

    // ── 7. /api/discover/regional-area-groups (CityActivationGuard, Pattern C) ─

    @Test
    @DisplayName("regional-area-groups: inactive city == unknown city (empty groups); active city returns the corridor")
    void regionalAreaGroups_inactiveEqualsUnknown_activeReturnsData() {
        RegionalAreaGroupsResponse active =
                regionalAreaGroupsService.getRegionalGroups(ACTIVE_CITY, "agricultural_land");
        RegionalAreaGroupsResponse inactive =
                regionalAreaGroupsService.getRegionalGroups(INACTIVE_CITY, "agricultural_land");
        RegionalAreaGroupsResponse unknown =
                regionalAreaGroupsService.getRegionalGroups(UNKNOWN_CITY, "agricultural_land");

        assertThat(active.groups()).isNotEmpty();
        assertThat(inactive.groups()).isEmpty();
        assertThat(unknown.groups()).isEmpty();
        assertThat(inactive.groups()).isEqualTo(unknown.groups());
    }

    // ── 8. /api/trends/options (CityActivationGuard, Pattern C) ────────────

    @Test
    @DisplayName("trends/options: inactive city == unknown city (empty); active city returns the area")
    void trendsOptions_inactiveEqualsUnknown_activeReturnsData() {
        TrendsOptionsResponse active = areaOverviewService.getOptions(ACTIVE_CITY, 3);
        TrendsOptionsResponse inactive = areaOverviewService.getOptions(INACTIVE_CITY, 3);
        TrendsOptionsResponse unknown = areaOverviewService.getOptions(UNKNOWN_CITY, 3);

        assertThat(active.defaultAreas()).isNotEmpty();
        assertThat(inactive.defaultAreas()).isEmpty();
        assertThat(unknown.defaultAreas()).isEmpty();
    }

    // ── 9. /api/public/areas/{areaKey}/overview (CityActivationGuard, Pattern C) ─

    @Test
    @DisplayName("trends/overview: inactive-city area throws the SAME AreaNotFoundException(areaKey) as an unknown area (404 parity)")
    void areaOverview_inactiveEqualsUnknown_activeReturnsData() {
        AreaOverviewResponse active = areaOverviewService.assembleResponse(ACTIVE_AREA);
        assertThat(active.areaKey()).isEqualTo(ACTIVE_AREA);
        assertThat(active.listingCount90d()).isNotNull();

        AreaNotFoundException inactiveEx = catchAreaNotFound(() -> areaOverviewService.assembleResponse(INACTIVE_AREA));
        AreaNotFoundException unknownEx = catchAreaNotFound(() -> areaOverviewService.assembleResponse(UNKNOWN_AREA));

        assertThat(inactiveEx).isNotNull();
        assertThat(unknownEx).isNotNull();
        // Body-shape parity: both exceptions carry the SAME message shape (areaKey echoed back),
        // proving the controller's resulting 404 body cannot distinguish inactive from unknown.
        assertThat(inactiveEx.getMessage()).contains(INACTIVE_AREA);
        assertThat(unknownEx.getMessage()).contains(UNKNOWN_AREA);
    }

    private static AreaNotFoundException catchAreaNotFound(Runnable r) {
        try {
            r.run();
            return null;
        } catch (AreaNotFoundException e) {
            return e;
        }
    }

    // ── 9b. /api/public/areas/trending — #1935 fix (was RED: no city gate at all; now GATED
    //        via areas -> cities JOIN c.is_active = true, added to CityActivationStructuralAntiDriftTest
    //        SCAN_FILES with the allowlist entry REMOVED — the scanner sees this query as
    //        genuinely inline-gated, not exempted) ─────────────────────────────────────────

    @Test
    @DisplayName("trending: active city's area appears; an otherwise-identical INACTIVE city's area is "
            + "absent EVEN WHEN it has a higher listing_count_90d than the active area (proves exclusion "
            + "by the #1935 is_active gate, not by ranking/LIMIT)")
    void trending_activeAreaAppears_inactiveAreaAbsentEvenWithHigherCount() {
        // Give the INACTIVE city's area a HIGHER count than the active one — if the inactive
        // area were merely losing a ranking tie or falling outside LIMIT, raising its count
        // this high (with a generous limit) would make it appear. It must not.
        jdbcTemplate.update(
                "UPDATE area_overview_stats SET listing_count_90d = 500 WHERE area_key = ?", INACTIVE_AREA);
        jdbcTemplate.update(
                "UPDATE area_overview_stats SET listing_count_90d = 5 WHERE area_key = ?", ACTIVE_AREA);

        TrendingAreasResponse response = areaOverviewService.getTrending(12); // TRENDING_MAX_LIMIT

        List<String> areaKeys = response.areas().stream()
                .map(TrendingAreasResponse.TrendingAreaDto::areaKey)
                .toList();

        assertThat(areaKeys)
                .as("active city's area must appear in the global trending feed")
                .contains(ACTIVE_AREA);
        assertThat(areaKeys)
                .as("inactive city's area must be absent EVEN THOUGH its listing_count_90d (500) far "
                        + "exceeds the active area's (5) and the limit (12) is well above 2 total "
                        + "candidate rows — if this failed, it would prove the row is being dropped by "
                        + "ranking/LIMIT rather than by the is_active gate")
                .doesNotContain(INACTIVE_AREA);
    }

    // ── 10. /api/trends/area-intelligence (CityActivationGuard, Pattern C) ──

    @Test
    @DisplayName("area-intelligence: inactive city == unknown city (byte-identical UNAVAILABLE response); "
            + "active city returns the real snapshot")
    void areaIntelligence_inactiveEqualsUnknown_activeReturnsData() {
        BuyerAreaIntelligenceResponse active =
                buyerAreaIntelligenceService.getAreaIntelligence(ACTIVE_CITY, ACTIVE_AREA);
        BuyerAreaIntelligenceResponse inactive =
                buyerAreaIntelligenceService.getAreaIntelligence(INACTIVE_CITY, INACTIVE_AREA);
        BuyerAreaIntelligenceResponse unknown =
                buyerAreaIntelligenceService.getAreaIntelligence(UNKNOWN_CITY, UNKNOWN_AREA);

        assertThat(active.available()).isTrue();
        assertThat(active.metrics().medianPricePaise().value()).isEqualTo(5_000_000L);

        assertThat(inactive.available()).isFalse();
        assertThat(unknown.available()).isFalse();
        // Byte-identical UNAVAILABLE shape except for the echoed citySlug/areaKey/cta.areaKey
        // fields (which differ by construction — the endpoint always echoes the request's own
        // input back, for both an inactive AND an unknown city/area alike).
        assertThat(inactive.confidenceLabel()).isEqualTo(unknown.confidenceLabel());
        assertThat(inactive.metrics()).isEqualTo(unknown.metrics());
        assertThat(inactive.priceComparison()).isEqualTo(unknown.priceComparison());
        assertThat(inactive.areaLabel()).isEqualTo(unknown.areaLabel());
    }

    // ── 11. /api/trends/resolve-area ─────────────────────────────────────────

    @Test
    @DisplayName("resolve-area: inactive city == unknown city (matched=false); active city resolves")
    void resolveArea_inactiveEqualsUnknown_activeReturnsData() {
        ResolveAreaResponse active = buyerAreaIntelligenceService.resolveArea(ACTIVE_CITY, "area1");
        ResolveAreaResponse inactive = buyerAreaIntelligenceService.resolveArea(INACTIVE_CITY, "area1");
        ResolveAreaResponse unknown = buyerAreaIntelligenceService.resolveArea(UNKNOWN_CITY, "area1");

        assertThat(active.matched()).isTrue();
        assertThat(active.areaKey()).isEqualTo(ACTIVE_AREA);

        assertThat(inactive.matched()).isFalse();
        assertThat(inactive.areaKey()).isNull();
        assertThat(unknown.matched()).isFalse();
        assertThat(unknown.areaKey()).isNull();
    }

    // ── 12. /api/public/listings/{id} — Pattern D fail-closed INNER JOIN ──────

    @Test
    @DisplayName("getById: inactive-city listing absent (Optional.empty, same as an unknown id); "
            + "active-city listing found")
    void listingById_inactiveEqualsUnknown_activeReturnsData() {
        UUID activeListingId = jdbcTemplate.queryForObject(
                "SELECT id FROM property_listings WHERE area_key = ? AND property_type = 'house'",
                UUID.class, ACTIVE_AREA);
        UUID inactiveListingId = jdbcTemplate.queryForObject(
                "SELECT id FROM property_listings WHERE area_key = ? AND property_type = 'house'",
                UUID.class, INACTIVE_AREA);

        Optional<Listing> active = listingRepository.findByIdWithActiveCity(activeListingId);
        Optional<Listing> inactive = listingRepository.findByIdWithActiveCity(inactiveListingId);
        Optional<Listing> unknown = listingRepository.findByIdWithActiveCity(UUID.randomUUID());

        assertThat(active).isPresent();
        assertThat(inactive).isEmpty();
        assertThat(unknown).isEmpty();
    }

    // ── 13. /api/public/listings/discovery — Pattern D fail-closed INNER JOIN ─

    @Test
    @DisplayName("getDiscovery: inactive-city listing absent from the feed; active-city listing present")
    void discoveryFeed_inactiveListingAbsent_activeListingPresent() {
        Page<Listing> page = listingRepository.findAllLiveListingsWithActiveCity(PageRequest.of(0, 200));
        List<String> areaKeys = page.getContent().stream().map(Listing::getAreaKey).toList();

        assertThat(areaKeys).contains(ACTIVE_AREA);
        assertThat(areaKeys).doesNotContain(INACTIVE_AREA);
    }

    // ── 14. /api/public/listings/within-polygon — Pattern D-2 fail-closed INNER JOIN ─

    @Test
    @DisplayName("getWithinPolygon: excludes an inactive-city listing inside the queried polygon, "
            + "retains an active-city listing in the same polygon (no regression)")
    void withinPolygon_excludesInactiveCity_retainsActiveCity() {
        // Both fixture listings sit at (lat=13.0, lon=74.0) — a generous box around that point
        // covers both, isolating the assertion to the is_active gate rather than geometry.
        String polygonWkt = "POLYGON((73.5 12.5, 74.5 12.5, 74.5 13.5, 73.5 13.5, 73.5 12.5))";

        Page<Listing> results = listingRepository.findLiveListingsWithinPolygonWithActiveCity(
                polygonWkt, PageRequest.of(0, 200));
        List<String> areaKeys = results.getContent().stream().map(Listing::getAreaKey).toList();

        assertThat(areaKeys).contains(ACTIVE_AREA);
        assertThat(areaKeys).doesNotContain(INACTIVE_AREA);
    }

    // ── 15. No-orphan-LIVE-listing check (backs the Pattern D fail-closed decision) ─

    @Test
    @DisplayName("no LIVE property_listings row has an area_key absent from areas "
            + "(the Pattern D INNER JOIN masking is provably not silently dropping legitimate live inventory)")
    void noOrphanLiveListings() {
        Integer orphanCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings pl "
                        + "WHERE pl.status = 'LIVE' "
                        + "  AND pl.archived_at IS NULL "
                        + "  AND pl.is_duplicate = false "
                        + "  AND NOT EXISTS (SELECT 1 FROM areas a WHERE a.area_key = pl.area_key)",
                Integer.class);

        assertThat(orphanCount)
                .as("every LIVE listing's area_key must resolve to a canonical areas row; a non-zero "
                        + "count here means Pattern D's INNER JOIN (findAllLiveListingsWithActiveCity, "
                        + "findByIdWithActiveCity, findLiveListingsWithinPolygonWithActiveCity) is "
                        + "silently hiding real, otherwise-visible live inventory rather than only "
                        + "hiding inactive-city listings as intended")
                .isEqualTo(0);
    }

    // ── 16. /api/discover/listings, /api/discover/markers,
    //       /api/discover/cities/{city}/school-radius-listings — Tier-1 inline gate via
    //       DiscoverListingPredicateBuilder (code-reviewer-requested coverage; these three
    //       services now also live in CityActivationStructuralAntiDriftTest.SCAN_FILES) ───────

    @Test
    @DisplayName("discover/listings: inactive city == unknown city (empty page, totalElements=0); "
            + "active city returns the seeded listing — no regression")
    void discoverListings_inactiveEqualsUnknown_activeReturnsData() {
        DiscoverListingsService service =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());

        DiscoverListingsPage active = service.getListings(baseListingsQuery(ACTIVE_CITY));
        DiscoverListingsPage inactive = service.getListings(baseListingsQuery(INACTIVE_CITY));
        DiscoverListingsPage unknown = service.getListings(baseListingsQuery(UNKNOWN_CITY));

        // The fixture seeds TWO LIVE listings per area (house + agricultural_land, see setUp()),
        // and this endpoint applies no property-type exclusion — both count.
        assertThat(active.totalElements()).isEqualTo(2L);
        assertThat(active.content()).hasSize(2);
        assertThat(active.content()).allSatisfy(l -> assertThat(l.areaKey()).isEqualTo(ACTIVE_AREA));

        assertThat(inactive.totalElements()).isEqualTo(0L);
        assertThat(inactive.content()).isEmpty();
        assertThat(unknown.totalElements()).isEqualTo(0L);
        assertThat(unknown.content()).isEmpty();
        // Byte-identical shape (page/size/totalPages/aggregates too), status implicitly 200 for both.
        assertThat(inactive).isEqualTo(unknown);
    }

    private static DiscoverListingsQuery baseListingsQuery(String city) {
        return new DiscoverListingsQuery(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, 0, 20, false, null, null);
    }

    @Test
    @DisplayName("discover/markers: inactive city == unknown city (empty markers, byte-identical shape); "
            + "active city returns the seeded marker — no regression")
    void discoverMarkers_inactiveEqualsUnknown_activeReturnsData() {
        DiscoverMarkersService service =
                new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());

        DiscoverMarkersResponse active = service.getMarkers(baseMarkersFilters(ACTIVE_CITY));
        DiscoverMarkersResponse inactive = service.getMarkers(baseMarkersFilters(INACTIVE_CITY));
        DiscoverMarkersResponse unknown = service.getMarkers(baseMarkersFilters(UNKNOWN_CITY));

        // Same two-listing fixture as discover/listings — no property-type exclusion here either.
        assertThat(active.markers()).hasSize(2);
        assertThat(active.returnedElements()).isEqualTo(2);
        assertThat(active.totalFilteredElements()).isEqualTo(2L);

        assertThat(inactive.markers()).isEmpty();
        assertThat(inactive.returnedElements()).isEqualTo(0);
        assertThat(unknown.markers()).isEmpty();
        assertThat(unknown.returnedElements()).isEqualTo(0);
        // Byte-identical shape except the echoed city slug, which both an inactive AND an
        // unknown city echo back verbatim from the request — never fabricated existence.
        assertThat(inactive).usingRecursiveComparison().ignoringFields("city").isEqualTo(unknown);
    }

    private static DiscoverListingPredicateBuilder.Filters baseMarkersFilters(String city) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null, null);
    }

    @Test
    @DisplayName("school-radius-listings: inactive city == unknown city (empty page, hasMore=false); "
            + "active city returns the seeded listing — no regression")
    void schoolRadiusListings_inactiveEqualsUnknown_activeReturnsData() {
        PublicSchoolRadiusListingsService service = new PublicSchoolRadiusListingsService(jdbcTemplate);

        // Fixture listings sit at (lat=13.0, lon=74.0) — a 5km radius around that exact point
        // trivially contains them (distance 0), isolating the assertion to the is_active gate.
        PublicSchoolRadiusListingsPage active =
                service.getListings(ACTIVE_CITY, 13.0, 74.0, 5.0, 0, 20, null);
        PublicSchoolRadiusListingsPage inactive =
                service.getListings(INACTIVE_CITY, 13.0, 74.0, 5.0, 0, 20, null);
        PublicSchoolRadiusListingsPage unknown =
                service.getListings(UNKNOWN_CITY, 13.0, 74.0, 5.0, 0, 20, null);

        assertThat(active.content()).hasSize(1);
        assertThat(active.content().get(0).areaKey()).isEqualTo(ACTIVE_AREA);
        assertThat(active.hasMore()).isFalse();

        assertThat(inactive.content()).isEmpty();
        assertThat(inactive.hasMore()).isFalse();
        assertThat(unknown.content()).isEmpty();
        assertThat(unknown.hasMore()).isFalse();
        // Byte-identical shape (page/size/hasMore/content all equal — content is empty for both).
        assertThat(inactive).isEqualTo(unknown);
    }

    // ── DiscoverSummaryService — #1935 gap FIXED (was RED, now GREEN) ──────────
    //
    // Originally, queryAreaGroupRegions() had no c.is_active check on its cities join and
    // queryCorridorRegions() had no city-activation check at all against
    // regional_area_classifications.city_key — an inactive city's region_key/region_label leaked
    // via GET /api/discover/summary. The backend-engineer has since gated both (Pattern B inline
    // is_active for the area_group path, Pattern C cityActivationGuard short-circuit for the
    // corridor path — see DiscoverSummaryService source). These tests now assert the FIXED
    // contract: inactive-city parity with unknown, and no regression for the active city.

    @Test
    @DisplayName("summary groupBy=area_group: inactive city == unknown city (empty regions, byte-identical); "
            + "active city still returns its real region — no regression from the #1935 fix")
    void discoverSummaryAreaGroupRegions_inactiveEqualsUnknownParity_activeNoRegression() {
        DiscoverSummaryService summaryService = new DiscoverSummaryService(
                jdbcTemplate, cityActivationGuard, new PostgresAreaCountProvider(jdbcTemplate));

        DiscoverSummaryResponse active = summaryService.getSummary(
                new SummaryQuery(ACTIVE_CITY, null, "area_group", 5, null));
        DiscoverSummaryResponse inactive = summaryService.getSummary(
                new SummaryQuery(INACTIVE_CITY, null, "area_group", 5, null));
        DiscoverSummaryResponse unknown = summaryService.getSummary(
                new SummaryQuery(UNKNOWN_CITY, null, "area_group", 5, null));

        // No regression: the active city's real area_group region is still returned with its
        // real listing count.
        assertThat(active.regions()).hasSize(1);
        assertThat(active.regions().get(0).regionKey()).isEqualTo(ACTIVE_CITY + "-group");
        assertThat(active.regions().get(0).listingCount()).isGreaterThan(0L);

        // Parity: inactive city's region_key/region_label no longer leak — same empty shape as
        // an unknown city.
        assertThat(inactive.regions()).isEmpty();
        assertThat(unknown.regions()).isEmpty();
        assertThat(inactive.regions()).isEqualTo(unknown.regions());
        assertThat(inactive).usingRecursiveComparison()
                .ignoringFields("city", "generatedAt")
                .isEqualTo(unknown);
    }

    @Test
    @DisplayName("summary groupBy=corridor: inactive city == unknown city (empty regions, byte-identical); "
            + "active city still returns its real corridor — no regression from the #1935 fix")
    void discoverSummaryCorridorRegions_inactiveEqualsUnknownParity_activeNoRegression() {
        DiscoverSummaryService summaryService = new DiscoverSummaryService(
                jdbcTemplate, cityActivationGuard, new PostgresAreaCountProvider(jdbcTemplate));

        DiscoverSummaryResponse active = summaryService.getSummary(
                new SummaryQuery(ACTIVE_CITY, null, "corridor", 5, null));
        DiscoverSummaryResponse inactive = summaryService.getSummary(
                new SummaryQuery(INACTIVE_CITY, null, "corridor", 5, null));
        DiscoverSummaryResponse unknown = summaryService.getSummary(
                new SummaryQuery(UNKNOWN_CITY, null, "corridor", 5, null));

        // No regression: the active city's real corridor (direction_key='N', seeded by
        // insertRegionalClassification) is still returned.
        assertThat(active.regions()).isNotEmpty();
        assertThat(active.regions()).extracting(DiscoverSummaryResponse.RegionCount::regionKey).contains("N");

        // Parity: inactive city's regional_area_classifications rows no longer leak (guarded via
        // cityActivationGuard.isActiveCitySlug BEFORE the rac.city_key = ? query runs) — same
        // empty shape as an unknown city.
        assertThat(inactive.regions()).isEmpty();
        assertThat(unknown.regions()).isEmpty();
        assertThat(inactive.regions()).isEqualTo(unknown.regions());
        assertThat(inactive).usingRecursiveComparison()
                .ignoringFields("city", "generatedAt")
                .isEqualTo(unknown);
    }
}
