package com.example.realestate.discover;

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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers real-DB proof for issue #2450: the AREA (SQ FT) control on the anonymous
 * city-area endpoint must actually narrow, and must narrow on the row's PRIMARY area.
 *
 * <h2>The defect</h2>
 *
 * <p>{@code GET /api/discover/cities/{city}/listings} never declared {@code areaMinSqft} /
 * {@code areaMaxSqft}, so Spring discarded them silently. The chip latched, looked applied, and the
 * result set did not move — measured in production against {@code origin/main} at
 * {@code 00c80022}: {@code ?propertyType=apartment} returned 19 rows and
 * {@code &areaMinSqft=999999} returned the same 19, while {@code &bedrooms=2} returned 10 (the
 * positive control proving the endpoint does read query params at all). #2450's rule is that a
 * design-only filter control must never ship.
 *
 * <h2>Why a real database rather than a SQL-text assertion</h2>
 *
 * <p>A mocked-JdbcTemplate test proves which SQL TEXT was emitted. Every claim below is about ROW
 * MEMBERSHIP under Postgres three-valued logic and per-row unit conversion — which column a row's
 * {@code property_type} designates, what {@code NULL >= 1000} evaluates to, what 3 cent is in sq ft.
 * None of that can be executed by a mock.
 *
 * <h2>Why these particular rows</h2>
 *
 * <p>The predicate under test is NOT {@code built_area >= ?}. It is a bound on the row's primary
 * area, resolved per row by {@link DiscoverPrimaryArea}. A fixture of nothing but sq-ft apartments
 * would pass against a naive {@code built_area} reimplementation and prove nothing, so two rows
 * exist purely to discriminate against that:
 *
 * <ul>
 *   <li>{@link #LAND_2400_TINY_BUILT} — a plot of 2,400 sq ft that also carries a 100 sq ft
 *       {@code built_area}. Under {@code min=1000} a {@code built_area} implementation DROPS it
 *       (100 &lt; 1000) where the correct one KEEPS it (2,400 ≥ 1000); under {@code max=500} the
 *       two swap. It discriminates in both directions, so neither arm can pass by luck.</li>
 *   <li>{@link #LAND_THREE_CENT} — 3 cent, i.e. 1,306.8 sq ft. Its raw column value is 3, so any
 *       implementation that compares the stored number instead of converting it excludes the row
 *       from {@code min=1000}.</li>
 * </ul>
 *
 * <p>Three rows cover AC5 (an unresolved row matches NEITHER bound) by three DIFFERENT routes —
 * unresolved by meaning, by unrecognised unit, and by absence — because a fix could plausibly get
 * one right and another wrong. {@link #UNRESOLVED_OTHER} in particular carries in-range values in
 * BOTH area columns, so its exclusion can only be the meaning resolution, never missing data.
 *
 * <p>{@link #anySize_returnsEveryRow} is the control for every arm below: without it, an assertion
 * that some row is absent under a bound could be satisfied by a broken fixture, an empty area, or a
 * filter that removed everything.
 *
 * <p><b>Both assembly paths are covered.</b> The area-grouped query builds its filters into a LEFT
 * JOIN ON clause and the bbox-only query builds its own independent WHERE clause; they share
 * helpers but nothing else, so fixing one demonstrably does not fix the other. Same rationale as
 * {@code CityAreaListingsBedroomsPerShape2537IT#bboxOnlyPath_appliesBedroomsPerShapeToo}.
 */
// Deliberately NOT annotated @Tag("integration") — surefire's <excludedGroups>integration</...> is
// a literal, so a tagged test only executes under an opt-in profile (#1794) and would run NOWHERE
// in the default suite. The surefire <includes> already carries **/*IT.java. Same rationale and
// same wording as CityAreaListingsBedroomsPerShape2537IT.
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
class CityAreaListingsAreaBounds2450IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2450area";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|AreaBound";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    /** A dwelling comfortably inside a 1,000–2,000 sq ft window. Primary area = built-up = 1,200. */
    private static final UUID APARTMENT_1200 =
            UUID.fromString("24500001-0000-0000-0000-000000000001");
    /** A dwelling BELOW the lower bound — its exclusion is what makes the min arm falsifiable. */
    private static final UUID APARTMENT_400 =
            UUID.fromString("24500002-0000-0000-0000-000000000002");
    /**
     * THE anti-reimplementation row: a 2,400 sq ft plot carrying a 100 sq ft {@code built_area}.
     * Its primary area is the LAND (2,400), so it belongs to {@code min=1000} and not to
     * {@code max=500} — the exact opposite of what reading {@code built_area} would conclude, in
     * both directions.
     */
    private static final UUID LAND_2400_TINY_BUILT =
            UUID.fromString("24500003-0000-0000-0000-000000000003");
    /** A warehouse: a THIRD meaning, reading {@code built_area} but labelled separately. */
    private static final UUID WAREHOUSE_5000 =
            UUID.fromString("24500004-0000-0000-0000-000000000004");
    /**
     * 3 cent = 1,306.8 sq ft. The raw stored value is 3, so an implementation that compares the
     * column instead of converting it puts this row below every bound in the suite.
     */
    private static final UUID LAND_THREE_CENT =
            UUID.fromString("24500005-0000-0000-0000-000000000005");
    /**
     * AC5, route 1 — unresolved by MEANING. {@code other} maps to no primary area, yet this row
     * carries an in-range value in BOTH area columns, so its exclusion under a bound cannot be
     * mistaken for missing data. A "helpful" COALESCE across the two columns would readmit it.
     */
    private static final UUID UNRESOLVED_OTHER =
            UUID.fromString("24500006-0000-0000-0000-000000000006");
    /**
     * AC5, route 2 — unresolved by UNRECOGNISED UNIT. An in-range number in a unit nobody can read
     * must not be defaulted to sq ft.
     */
    private static final UUID UNRESOLVED_BAD_UNIT =
            UUID.fromString("24500007-0000-0000-0000-000000000007");
    /** AC5, route 3 — unresolved by ABSENCE: a dwelling whose area was simply never recorded. */
    private static final UUID UNRESOLVED_NO_AREA =
            UUID.fromString("24500008-0000-0000-0000-000000000008");

    private static final List<UUID> UNRESOLVED_ROWS =
            List.of(UNRESOLVED_OTHER, UNRESOLVED_BAD_UNIT, UNRESOLVED_NO_AREA);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityAreaListingsService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM listing_commercial_space_details WHERE listing_id IN ("
                + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId, AREA_KEY, "Area Bound");

        insertLiveListing(APARTMENT_1200, "apartment", bd(1200), "sqft", null, null);
        insertLiveListing(APARTMENT_400, "apartment", bd(400), "sqft", null, null);
        insertLiveListing(LAND_2400_TINY_BUILT, "land", bd(100), "sqft", bd(2400), "sqft");
        insertLiveListing(WAREHOUSE_5000, "warehouse", bd(5000), "sqft", null, null);
        insertLiveListing(LAND_THREE_CENT, "land", null, null, bd(3), "cent");
        insertLiveListing(UNRESOLVED_OTHER, "other", bd(1500), "sqft", bd(1500), "sqft");
        insertLiveListing(UNRESOLVED_BAD_UNIT, "apartment", bd(1200), "furlongs", null, null);
        insertLiveListing(UNRESOLVED_NO_AREA, "apartment", null, null, null, null);

        // Fixture-authenticity preconditions, asserted BEFORE anything under test runs, by
        // evaluating the SAME expression the predicate uses. Without these, an arm could pass for
        // the wrong reason: a row that resolves to NULL because the fixture failed to write its
        // columns is indistinguishable, from the outside, from one excluded by a working bound.
        assertThat(primaryAreaSqft(APARTMENT_1200))
                .as("a dwelling's primary area is its BUILT-UP area")
                .isEqualByComparingTo("1200");
        assertThat(primaryAreaSqft(APARTMENT_400)).isEqualByComparingTo("400");
        assertThat(primaryAreaSqft(LAND_2400_TINY_BUILT))
                .as("precondition that carries the whole anti-reimplementation argument: this row's "
                        + "primary area must be its LAND (2400), NOT the 100 sq ft sitting in its "
                        + "built_area column")
                .isEqualByComparingTo("2400");
        assertThat(primaryAreaSqft(WAREHOUSE_5000)).isEqualByComparingTo("5000");
        assertThat(primaryAreaSqft(LAND_THREE_CENT))
                .as("3 cent must be CONVERTED to 1306.8 sq ft, not compared as the raw value 3")
                .isEqualByComparingTo("1306.8");
        assertThat(primaryAreaSqft(UNRESOLVED_OTHER))
                .as("unresolved by MEANING — and the row genuinely holds in-range values in both "
                        + "area columns, so any later exclusion is the meaning resolution's doing")
                .isNull();
        assertThat(storedBuiltArea(UNRESOLVED_OTHER)).isEqualByComparingTo("1500");
        assertThat(storedLandArea(UNRESOLVED_OTHER)).isEqualByComparingTo("1500");
        assertThat(primaryAreaSqft(UNRESOLVED_BAD_UNIT))
                .as("an unrecognised unit must yield NULL, never be defaulted to sq ft")
                .isNull();
        assertThat(storedBuiltArea(UNRESOLVED_BAD_UNIT)).isEqualByComparingTo("1200");
        assertThat(primaryAreaSqft(UNRESOLVED_NO_AREA)).isNull();

        service = new CityAreaListingsService(jdbcTemplate);
    }

    // ── The control ──────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("#2450: no bound (\"Any size\") returns every row, unresolved rows included")
    void anySize_returnsEveryRow() {
        // THE CONTROL for every arm below, and simultaneously the first half of AC5.
        assertThat(idsFor(null, null)).containsExactlyInAnyOrder(
                APARTMENT_1200, APARTMENT_400, LAND_2400_TINY_BUILT, WAREHOUSE_5000,
                LAND_THREE_CENT, UNRESOLVED_OTHER, UNRESOLVED_BAD_UNIT, UNRESOLVED_NO_AREA);
    }

    // ── The bound actually narrows ───────────────────────────────────────────────────

    @Test
    @DisplayName("#2450 (THE issue): a lower bound narrows the result — it is no longer inert")
    void minBound_narrows() {
        List<UUID> ids = idsFor(1000, null);

        assertThat(ids).containsExactlyInAnyOrder(
                APARTMENT_1200, LAND_2400_TINY_BUILT, WAREHOUSE_5000, LAND_THREE_CENT);
        assertThat(ids)
                .as("the defect: before this fix the param was discarded and EVERY row came back")
                .doesNotContain(APARTMENT_400);

        // BOUNDARY — the bound is INCLUSIVE. APARTMENT_1200's primary area is exactly 1200, asserted
        // in setUp() through the production expression itself, so this pins `>=` rather than `>`.
        //
        // Why this earns an assertion instead of trusting the operator: buyers type round numbers
        // and listings are stored at round numbers, so were `>=` ever to become `>`, the rows
        // silently dropped would be exactly the ones AT the figure the buyer entered — the same
        // defect class this class exists to catch, not a milder one.
        //
        // NOTE ON WHAT DISCRIMINATES IT: the neutralisation mutation (a no-op clause) canNOT — with
        // no clause emitted every row returns and `contains` passes either way. Its discriminating
        // mutation is the operator flip `>=`→`>` in DiscoverPrimaryArea.areaBoundSql, which was run.
        assertThat(idsFor(1200, null))
                .as("inclusive lower bound: a row whose primary area EQUALS the bound must match")
                .contains(APARTMENT_1200);
    }

    @Test
    @DisplayName("#2450: an upper bound narrows the result")
    void maxBound_narrows() {
        assertThat(idsFor(null, 500)).containsExactly(APARTMENT_400);

        // BOUNDARY — the mirror of the lower-bound case above, pinning `<=` rather than `<`. Same
        // reasoning and the same row: APARTMENT_1200 sits exactly ON the bound, so an off-by-one
        // would drop the listing at precisely the size the buyer asked for. Discriminated by the
        // `<=`→`<` half of the operator-flip mutation, not by the neutralisation mutation.
        assertThat(idsFor(null, 1200))
                .as("inclusive upper bound: a row whose primary area EQUALS the bound must match")
                .contains(APARTMENT_1200);
    }

    @Test
    @DisplayName("#2450: a min+max window keeps only rows inside it")
    void rangeBound_narrowsFromBothEnds() {
        assertThat(idsFor(1000, 2000))
                .containsExactlyInAnyOrder(APARTMENT_1200, LAND_THREE_CENT);
    }

    @Test
    @DisplayName("#2450: an absurd floor removes everything — the exact production probe that "
            + "returned an unchanged 19 rows against origin/main")
    void absurdFloor_removesEverything() {
        assertThat(idsFor(999999, null)).isEmpty();
    }

    // ── The bound follows the ROW, not one column ────────────────────────────────────

    @Test
    @DisplayName("#2450: the bound reads the row's PRIMARY area — a plot is judged on its land, "
            + "not on the built_area column")
    void primaryAreaFollowsTheRow_notTheBuiltAreaColumn() {
        // This row is 2400 sq ft of LAND carrying a 100 sq ft built_area. Both assertions below
        // fail on an `AND pl.built_area >= ?` implementation, in opposite directions — which is
        // what makes them a test of the resolution rather than of the plumbing.
        assertThat(idsFor(1000, null))
                .as("kept: its land is 2400 ≥ 1000. A built_area implementation drops it (100 < 1000)")
                .contains(LAND_2400_TINY_BUILT);
        assertThat(idsFor(null, 500))
                .as("dropped: its land is 2400 > 500. A built_area implementation keeps it (100 ≤ 500)")
                .doesNotContain(LAND_2400_TINY_BUILT);
    }

    @Test
    @DisplayName("#2450: the stored unit is converted, not compared raw — 3 cent is 1306.8 sq ft")
    void storedUnitIsConverted_notComparedRaw() {
        assertThat(idsFor(1000, null))
                .as("raw value 3 is below every bound here; only conversion puts this row above 1000")
                .contains(LAND_THREE_CENT);
        assertThat(idsFor(null, 1000))
                .as("and the conversion binds in the other direction too — 1306.8 exceeds 1000")
                .doesNotContain(LAND_THREE_CENT);
    }

    // ── AC5: an unresolved row matches NEITHER bound ─────────────────────────────────

    @Test
    @DisplayName("#2459 AC5: rows with no resolvable primary area are visible under \"Any size\" "
            + "and excluded under ANY bound — by meaning, by bad unit, and by absence alike")
    void unresolvedRows_visibleUnderAnySize_absentUnderEveryBound() {
        assertThat(idsFor(null, null))
                .as("visible when no bound is active — they are not broken rows, they are rows "
                        + "whose area was never measured in a way this filter can judge")
                .containsAll(UNRESOLVED_ROWS);

        assertThat(idsFor(1000, null))
                .as("AC5 under a lower bound")
                .doesNotContainAnyElementsOf(UNRESOLVED_ROWS);
        assertThat(idsFor(null, 100000))
                .as("AC5 under an upper bound so generous it admits every RESOLVED row — the "
                        + "unresolved ones must still drop out, which is what distinguishes "
                        + "\"matches neither bound\" from \"happens to be out of range\"")
                .doesNotContainAnyElementsOf(UNRESOLVED_ROWS)
                .contains(APARTMENT_1200, APARTMENT_400, LAND_2400_TINY_BUILT,
                        WAREHOUSE_5000, LAND_THREE_CENT);
        assertThat(idsFor(1, 100000))
                .as("AC5 under a range covering every resolved row")
                .doesNotContainAnyElementsOf(UNRESOLVED_ROWS);
    }

    // ── The second, independent assembly ─────────────────────────────────────────────

    @Test
    @DisplayName("#2450: the bbox-only path builds its own WHERE clause and must apply the same "
            + "bound — fixing the area-grouped path proves nothing about this one")
    void bboxOnlyPath_appliesAreaBoundsToo() {
        // Bbox is (south, west, north, east) — LATITUDE first, not the (west, south, …) order the
        // ST_MakeEnvelope call it feeds uses. Getting this backwards yields an envelope in empty
        // ocean and an empty result, which looks exactly like a filter that removed everything.
        DiscoverListingPredicateBuilder.Bbox bbox = new DiscoverListingPredicateBuilder.Bbox(
                CENTRE_LAT - 0.05, CENTRE_LON - 0.05, CENTRE_LAT + 0.05, CENTRE_LON + 0.05);

        assertThat(bboxOnlyIds(bbox, null, null))
                .as("control: the viewport alone returns the whole fixture")
                .containsExactlyInAnyOrder(
                        APARTMENT_1200, APARTMENT_400, LAND_2400_TINY_BUILT, WAREHOUSE_5000,
                        LAND_THREE_CENT, UNRESOLVED_OTHER, UNRESOLVED_BAD_UNIT, UNRESOLVED_NO_AREA);

        List<UUID> bounded = bboxOnlyIds(bbox, 1000, null);
        assertThat(bounded).containsExactlyInAnyOrder(
                APARTMENT_1200, LAND_2400_TINY_BUILT, WAREHOUSE_5000, LAND_THREE_CENT);
        assertThat(bounded)
                .as("AC5 holds on this assembly too")
                .doesNotContainAnyElementsOf(UNRESOLVED_ROWS);
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────

    private List<UUID> idsFor(Integer areaMinSqft, Integer areaMaxSqft) {
        CityAreaListingsResponse response = service.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, null, null, null,
                null, null, null, areaMinSqft, areaMaxSqft, null, false);
        return response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture area not returned"))
                .listings().stream()
                .map(AreaListingCard::id)
                .toList();
    }

    private List<UUID> bboxOnlyIds(DiscoverListingPredicateBuilder.Bbox bbox,
                                   Integer areaMinSqft, Integer areaMaxSqft) {
        CityAreaListingsResponse response = service.getAreaListings(
                CITY_SLUG, null, 50, null, null, null, null, null,
                null, null, null, areaMinSqft, areaMaxSqft, bbox, false);
        return response.areas().stream()
                .flatMap(a -> a.listings().stream())
                .map(AreaListingCard::id)
                .toList();
    }

    /**
     * Evaluates the SAME expression the predicate under test uses, for ONE row. Asserting the
     * fixture through the production expression is what makes the preconditions meaningful: a
     * hand-computed expectation could agree with a wrong expression.
     */
    private BigDecimal primaryAreaSqft(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT " + DiscoverPrimaryArea.primaryAreaSqftSql("pl")
                        + " FROM property_listings pl WHERE pl.id = ?",
                BigDecimal.class, listingId);
    }

    private BigDecimal storedBuiltArea(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT built_area FROM property_listings WHERE id = ?", BigDecimal.class, listingId);
    }

    private BigDecimal storedLandArea(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT land_area FROM property_listings WHERE id = ?", BigDecimal.class, listingId);
    }

    private static BigDecimal bd(int value) {
        return BigDecimal.valueOf(value);
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId, String areaKey, String name) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                areaKey, cityId, name, CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    /**
     * Mirrors {@code CityAreaListingsBedroomsPerShape2537IT#insertLiveListing}, with the four area
     * columns added — that class never writes them, so every row it seeds is UNRESOLVED and it
     * cannot express this issue's fixture at all.
     */
    private void insertLiveListing(UUID id, String propertyType,
                                   BigDecimal builtArea, String builtAreaUnit,
                                   BigDecimal landArea, String landAreaUnit) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " built_area, built_area_unit, land_area, land_area_unit, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, ?, ?, ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, propertyType, builtArea, builtAreaUnit, landArea, landAreaUnit,
                CENTRE_LAT, CENTRE_LON, now, now);
    }
}
