package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraphLoader;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for issue #2459: the contextual square-foot filter resolves each
 * row's PRIMARY area in SQL, and listings, the page total, the aggregates and the markers all
 * inherit that one membership.
 *
 * <p><b>Why a real database.</b> Every claim here is a claim about SQL semantics — that a
 * {@code CASE} over {@code property_type} picks the right column pair, that
 * {@code ROUND(land_area * 435.6, 6) >= 1089} is inclusive at the boundary, and above all that a
 * {@code NULL} area makes BOTH bound comparisons {@code NULL} rather than {@code TRUE}. A mocked
 * {@code JdbcTemplate} would assert the string I wrote, not what Postgres does with it.
 *
 * <p><b>Fixture shape.</b> Every branch the resolution can take, including the ones designed to
 * fail if the predicate takes a shortcut:
 *
 * <ul>
 *   <li>an apartment with built_area 1200 sqft AND a DIFFERENT land_area — if the predicate read
 *       {@code land_area} (or {@code area_sqft}, which is derived from it) this row would land in
 *       the wrong bucket;</li>
 *   <li>an apartment measured in sqm — proves the unit conversion, not just the column choice;</li>
 *   <li>a plot measured in cent at EXACTLY the inclusive boundary (2.5 cent = 1089 sq ft);</li>
 *   <li>a plot measured in acre — the dominant stored land unit;</li>
 *   <li>a legacy {@code commercial} row with NO subtype row at all, whose meaning resolves by
 *       CONVERGENCE (both admissible subtypes mean built-up) without its subtype being inferred;</li>
 *   <li>a warehouse — built pair, different label;</li>
 *   <li>commercial land — land pair;</li>
 *   <li>{@code other} — UNRESOLVED even though BOTH its area columns are populated;</li>
 *   <li>an apartment with NO built_area but a populated land_area — the anti-coalescing control;</li>
 *   <li>an apartment whose unit is {@code SQ_YD}, writable vocabulary with no conversion path.</li>
 * </ul>
 */
// Deliberately NOT annotated @Tag("integration") — same rationale, same wording, as
// CommercialSubtypeFilter2431IT: surefire's <excludedGroups> is a literal, so a tagged test cannot
// run from the CLI. This is a permanent regression guard on filter membership.
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
class ContextualAreaFilter2459IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2459area";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|AreaFilter";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    /** apartment, built 1200 sqft; land_area deliberately DIFFERENT (5000 sqft). */
    private static final UUID APT_1200_SQFT = id(1);
    /** apartment, built 100 sqm = 1076.391042 sqft. */
    private static final UUID APT_100_SQM = id(2);
    /** residential_plot, land 2.5 cent = EXACTLY 1089 sqft. */
    private static final UUID PLOT_1089_CENT = id(3);
    /** residential_plot, land 1 acre = 43560 sqft. */
    private static final UUID PLOT_1_ACRE = id(4);
    /** commercial with NO subtype row — resolves to built-up by convergence; built 900 sqft. */
    private static final UUID COMMERCIAL_NO_SUBTYPE = id(5);
    /** warehouse, built 5000 sqft. */
    private static final UUID WAREHOUSE_5000 = id(6);
    /** commercial_land, land 3000 sqft. */
    private static final UUID COMMERCIAL_LAND_3000 = id(7);
    /** other — UNRESOLVED, with BOTH area columns populated at 1200 sqft. */
    private static final UUID OTHER_BOTH_POPULATED = id(8);
    /** apartment with NO built_area but land_area 1200 sqft — the anti-coalescing control. */
    private static final UUID APT_LAND_ONLY = id(9);
    /** apartment, built 1200 in SQ_YD — writable unit with no conversion path. */
    private static final UUID APT_UNKNOWN_UNIT = id(10);

    private static UUID id(int n) {
        return UUID.fromString(String.format("24590000-0000-0000-0000-%012d", n));
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverListingsController listingsController;
    private DiscoverMarkersController markersController;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM listing_commercial_space_details WHERE listing_id IN ("
                + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId);

        insert(APT_1200_SQFT, "apartment", "1200", "sqft", "5000", "sqft");
        insert(APT_100_SQM, "apartment", "100", "sqm", null, null);
        insert(PLOT_1089_CENT, "residential_plot", null, null, "2.5", "cent");
        insert(PLOT_1_ACRE, "residential_plot", null, null, "1", "acre");
        insert(COMMERCIAL_NO_SUBTYPE, "commercial", "900", "sqft", null, null);
        insert(WAREHOUSE_5000, "warehouse", "5000", "sqft", null, null);
        insert(COMMERCIAL_LAND_3000, "commercial_land", null, null, "3000", "sqft");
        insert(OTHER_BOTH_POPULATED, "other", "1200", "sqft", "1200", "sqft");
        insert(APT_LAND_ONLY, "apartment", null, null, "1200", "sqft");
        insert(APT_UNKNOWN_UNIT, "apartment", "1200", "SQ_YD", null, null);

        // ── Fixture-authenticity preconditions, asserted BEFORE any query under test runs.
        assertThat(storedBuiltArea(APT_1200_SQFT)).isNotNull();
        assertThat(storedLandArea(APT_1200_SQFT))
                .as("the discriminating control only discriminates if land_area genuinely differs "
                        + "from built_area — otherwise reading the wrong column would still pass")
                .isNotNull()
                .isNotEqualByComparingTo(storedBuiltArea(APT_1200_SQFT));
        assertThat(storedBuiltArea(APT_LAND_ONLY))
                .as("the anti-coalescing control must genuinely have NO built_area")
                .isNull();
        assertThat(storedLandArea(APT_LAND_ONLY)).isNotNull();
        assertThat(hasDetailRow(COMMERCIAL_NO_SUBTYPE))
                .as("the convergence fixture must genuinely carry no subtype row, or it proves "
                        + "nothing about resolving MEANING without a subtype")
                .isFalse();

        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        DiscoverMarkersService markersService =
                new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class),
                new com.example.realestate.discover.navigation.NavigationCacheProperties());
        ObjectMapper objectMapper = new ObjectMapper();
        PolygonGeographicSafetyPolicy policy = new PolygonGeographicSafetyPolicy(jdbcTemplate);
        listingsController = new DiscoverListingsController(listingsService, objectMapper, cache, policy, new AreaSummaryService(jdbcTemplate));
        markersController = new DiscoverMarkersController(markersService, objectMapper, cache, policy, new AreaSummaryService(jdbcTemplate));
    }

    // ── AC5: Any size shows everything ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC5: with no bound, every listing is visible — including the ones with no "
            + "resolvable primary area")
    void anySize_showsEveryListing() {
        assertThat(listingIds(null, null)).containsExactlyInAnyOrder(
                APT_1200_SQFT.toString(), APT_100_SQM.toString(), PLOT_1089_CENT.toString(),
                PLOT_1_ACRE.toString(), COMMERCIAL_NO_SUBTYPE.toString(), WAREHOUSE_5000.toString(),
                COMMERCIAL_LAND_3000.toString(), OTHER_BOTH_POPULATED.toString(),
                APT_LAND_ONLY.toString(), APT_UNKNOWN_UNIT.toString());
    }

    // ── AC1/AC2/AC3: the meaning follows the row ───────────────────────────────────────────────

    @Test
    @DisplayName("AC1/AC2: a 1000-1500 sq ft bound selects the rows whose PRIMARY area is in range, "
            + "reading built_area for dwellings and land_area for plots")
    void bound_selectsByPerRowPrimaryArea() {
        assertThat(listingIds(1000, 1500)).containsExactlyInAnyOrder(
                APT_1200_SQFT.toString(),   // built 1200 sqft — NOT its 5000 sqft land_area
                APT_100_SQM.toString(),     // built 100 sqm = 1076.39 sqft
                PLOT_1089_CENT.toString()); // land 2.5 cent = 1089 sqft
    }

    @Test
    @DisplayName("AC1: a dwelling is matched on built_area, never on land_area — the row whose "
            + "land_area alone falls in range must NOT appear")
    void dwellingIsMatchedOnBuiltAreaOnly() {
        // APT_1200_SQFT has land_area 5000 sqft. A 4000-6000 bound would catch it if the predicate
        // read land_area for an apartment; it must catch only the warehouse (built 5000 sqft).
        assertThat(listingIds(4000, 6000))
                .containsExactly(WAREHOUSE_5000.toString());
    }

    @Test
    @DisplayName("AC3: a warehouse is bounded on its built/covered area, and commercial land on its "
            + "plot size")
    void warehouseAndCommercialLandUseTheirOwnMeanings() {
        assertThat(listingIds(2500, 3500)).containsExactly(COMMERCIAL_LAND_3000.toString());
        assertThat(listingIds(5000, 5000)).containsExactly(WAREHOUSE_5000.toString());
    }

    @Test
    @DisplayName("acre-measured plot converts correctly (1 acre = 43,560 sq ft)")
    void acreConversionReachesSql() {
        assertThat(listingIds(43560, 43560)).containsExactly(PLOT_1_ACRE.toString());
        assertThat(listingIds(43561, null)).isEmpty();
    }

    // ── The convergence ruling, end to end ─────────────────────────────────────────────────────

    @Test
    @DisplayName("owner ruling: a commercial row with NO recorded subtype is filterable on built-up "
            + "area, because both admissible subtypes converge on that meaning")
    void commercialWithNoSubtype_isFilterableByConvergence() {
        assertThat(listingIds(850, 950))
                .as("meaning resolved by convergence; the subtype itself is still never inferred")
                .containsExactly(COMMERCIAL_NO_SUBTYPE.toString());
        assertThat(storedSubtypeCount(COMMERCIAL_NO_SUBTYPE))
                .as("and nothing wrote a subtype into the row to achieve it")
                .isZero();
    }

    // ── AC5: UNRESOLVED and missing areas are excluded honestly, never coalesced ────────────────

    @Test
    @DisplayName("AC5: an UNRESOLVED row is excluded by ANY bound, even though both of its area "
            + "columns are populated and would satisfy it")
    void unresolvedRowIsExcludedUnderEveryBound() {
        assertThat(listingIds(1000, 1500)).doesNotContain(OTHER_BOTH_POPULATED.toString());
        assertThat(listingIds(0, null)).doesNotContain(OTHER_BOTH_POPULATED.toString());
        assertThat(listingIds(null, 1000000)).doesNotContain(OTHER_BOTH_POPULATED.toString());
        // Non-vacuous: it IS in the dataset, and its columns DO satisfy the bound.
        assertThat(listingIds(null, null)).contains(OTHER_BOTH_POPULATED.toString());
        assertThat(storedBuiltArea(OTHER_BOTH_POPULATED)).isNotNull();
        assertThat(storedLandArea(OTHER_BOTH_POPULATED)).isNotNull();
    }

    @Test
    @DisplayName("AC5: a dwelling with no built_area is NOT rescued by its land_area — no COALESCE "
            + "across meanings")
    void missingPrimaryAreaIsNeverCoalescedFromTheOtherColumn() {
        assertThat(listingIds(1000, 1500))
                .as("APT_LAND_ONLY's land_area is 1200 sqft, squarely inside the bound; it appears "
                        + "only if the predicate borrowed a quantity the row was never measured on")
                .doesNotContain(APT_LAND_ONLY.toString());
        assertThat(listingIds(null, null)).contains(APT_LAND_ONLY.toString());
    }

    @Test
    @DisplayName("AC5: an unrecognised unit is UNRESOLVED, never coerced to sq ft")
    void unrecognisedUnitIsExcludedRatherThanAssumedSqft() {
        assertThat(listingIds(1000, 1500))
                .as("SQ_YD has no conversion path; treating 1200 SQ_YD as 1200 sqft would be a "
                        + "silent ~9x understatement that keeps the row in the result")
                .doesNotContain(APT_UNKNOWN_UNIT.toString());
        assertThat(listingIds(null, null)).contains(APT_UNKNOWN_UNIT.toString());
    }

    // ── Inclusive boundaries ───────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("both bounds are INCLUSIVE at an exactly-representable boundary")
    void boundsAreInclusive() {
        assertThat(listingIds(1089, null)).contains(PLOT_1089_CENT.toString());
        assertThat(listingIds(null, 1089)).contains(PLOT_1089_CENT.toString());
        assertThat(listingIds(1090, null)).doesNotContain(PLOT_1089_CENT.toString());
        assertThat(listingIds(null, 1088)).doesNotContain(PLOT_1089_CENT.toString());
    }

    // ── AC4: one membership across listings, total, aggregates and markers ─────────────────────

    @Test
    @DisplayName("AC4: listings, the page total, the locality aggregates and the markers all return "
            + "the SAME membership for the same bounds")
    void listingsTotalAggregatesAndMarkersAgree() {
        for (int[] bound : new int[][]{{1000, 1500}, {0, 1000000}, {850, 950}, {43560, 43560}}) {
            Integer min = bound[0];
            Integer max = bound[1];

            DiscoverListingsPage page = rawListings(min, max, true).getBody();
            assertThat(page).isNotNull();
            List<String> cardIds = page.content().stream()
                    .map(DiscoverListingResponse::id).toList();
            List<String> pinIds = markerIds(min, max);

            assertThat(pinIds)
                    .as("markers vs cards for bound " + min + ".." + max)
                    .containsExactlyInAnyOrderElementsOf(cardIds);
            assertThat(page.totalElements())
                    .as("the independent COUNT query must agree with the page for bound "
                            + min + ".." + max)
                    .isEqualTo(cardIds.size());

            long aggregated = page.aggregates().topLocalities().stream()
                    .mapToLong(DiscoverListingsAggregates.LocalityCount::count).sum();
            assertThat(aggregated)
                    .as("the aggregates run the SAME WHERE fragment for bound " + min + ".." + max)
                    .isEqualTo(cardIds.size());
        }
    }

    @Test
    @DisplayName("AC4 non-vacuity guard: the compared sets are neither empty nor the whole fixture")
    void theAgreementComparisonIsNotVacuous() {
        List<String> bounded = listingIds(1000, 1500);
        assertThat(bounded).hasSize(3);
        assertThat(listingIds(null, null)).hasSize(10);
    }

    // ── Param validation, shared by both endpoints ─────────────────────────────────────────────

    @Test
    @DisplayName("a negative or inverted range is rejected identically by listings and markers")
    void bothEndpointsRejectTheSameInvalidRanges() {
        assertThatThrownBy(() -> rawListings(-1, null, false))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("area_min_sqft_must_be_non_negative");
        assertThatThrownBy(() -> rawMarkers(-1, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("area_min_sqft_must_be_non_negative");

        assertThatThrownBy(() -> rawListings(2000, 1000, false))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("area_min_sqft_exceeds_area_max_sqft");
        assertThatThrownBy(() -> rawMarkers(2000, 1000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("area_min_sqft_exceeds_area_max_sqft");

        assertThatThrownBy(() -> rawMarkers(-1, null))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────────────────────

    private List<String> listingIds(Integer min, Integer max) {
        DiscoverListingsPage page = rawListings(min, max, false).getBody();
        assertThat(page).isNotNull();
        return page.content().stream().map(DiscoverListingResponse::id).toList();
    }

    private ResponseEntity<DiscoverListingsPage> rawListings(Integer min, Integer max,
                                                              boolean includeAggregates) {
        return listingsController.getListings(
                CITY_SLUG, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, 0, 50, includeAggregates, null, null, null,
                null, null, min, max, null);
    }

    private List<String> markerIds(Integer min, Integer max) {
        DiscoverMarkersResponse body = rawMarkers(min, max).getBody();
        assertThat(body).isNotNull();
        return body.markers().stream().map(DiscoverMarker::id).toList();
    }

    private ResponseEntity<DiscoverMarkersResponse> rawMarkers(Integer min, Integer max) {
        return markersController.getMarkers(
                CITY_SLUG, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, min, max, null);
    }

    private BigDecimal storedBuiltArea(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT built_area FROM property_listings WHERE id = ?", BigDecimal.class, listingId);
    }

    private BigDecimal storedLandArea(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT land_area FROM property_listings WHERE id = ?", BigDecimal.class, listingId);
    }

    private boolean hasDetailRow(UUID listingId) {
        return storedSubtypeCount(listingId) > 0;
    }

    private int storedSubtypeCount(UUID listingId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                Integer.class, listingId);
        return count == null ? 0 : count;
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                AREA_KEY, cityId, "Area Filter", CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    private void insert(UUID id, String propertyType,
                        String builtArea, String builtAreaUnit,
                        String landArea, String landAreaUnit) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, built_area, built_area_unit, "
                        + " land_area, land_area_unit, locality, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, 5000000, "
                        + " CAST(? AS NUMERIC), ?, CAST(? AS NUMERIC), ?, ?, ?, ?)",
                id, AREA_KEY, propertyType, CENTRE_LAT, CENTRE_LON,
                builtArea, builtAreaUnit, landArea, landAreaUnit, "QA Locality", now, now);
    }
}
