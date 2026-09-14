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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers real-DB proof for issue #2537: a bedroom predicate applies PER SHAPE, never as a
 * global conjunct across a mixed selection.
 *
 * <h2>The defect, and why it is invisible from a SQL-text test</h2>
 *
 * <p>{@code CityAreaListingsService#appendBedroomsClause} appended {@code AND (pl.bedrooms IN (…))}
 * to the same {@code ClauseBuilder} as every other filter, so it constrained the WHOLE query. A
 * Shop carries {@code bedrooms} NULL, and {@code NULL IN (3)} is NULL — not TRUE — so every Shop in
 * a mixed Apartment + Shop selection was eliminated. HTTP 200, no error, and no reason the buyer
 * could see.
 *
 * <p>The owner ruling on #2537 requires the shape-aware membership
 * {@code (bedroom-capable selected shapes AND bedroom predicate) OR (selected non-bedroom-capable
 * shapes)}, with every other predicate constraining BOTH arms normally.
 *
 * <p><b>Why a real database rather than the mocked-JdbcTemplate style of
 * {@code CityAreaListingsServiceIT}.</b> That class proves which SQL TEXT was emitted and which
 * params were bound to it. The ruling's requirement is a claim about ROW MEMBERSHIP under
 * three-valued logic — specifically that a NULL-bedrooms row survives — and a mock cannot execute
 * {@code NULL IN (3)}. The retention half of the mixed arm is therefore only provable here.
 *
 * <p><b>Why the mixed arm asserts BOTH directions.</b> The ruling is explicit that an arm proving
 * only "a wrong-bedroom-count Apartment is excluded" passes on the UNFIXED code and proves nothing:
 * the global conjunct excludes that Apartment too. Only the paired assertion — wrong-count
 * Apartment excluded AND {@code bedrooms}-NULL Shop retained — discriminates. Each mixed arm below
 * therefore carries both, and {@link #noBedroomSelection_doesNotRemoveNonDwellings} is the control
 * that rules out the whole fixture passing by emptiness.
 *
 * <p><b>Both assembly paths are covered.</b> The area-grouped query builds its filters into a LEFT
 * JOIN ON clause and the bbox-only query builds its own independent WHERE clause; they share
 * {@code appendBedroomsClause} but nothing else. Fixing one demonstrably does not fix the other,
 * which is why {@link #bboxOnlyPath_appliesBedroomsPerShapeToo} exists as a separate arm rather
 * than being assumed.
 */
// Deliberately NOT annotated @Tag("integration") — surefire's <excludedGroups>integration</...> is
// a literal, so a tagged test only executes under an opt-in profile (#1794) and would run NOWHERE
// in the default suite. The surefire <includes> already carries **/*IT.java. Same rationale and
// same wording as CityAreaListingsCommercialSubtype2433IT.
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
class CityAreaListingsBedroomsPerShape2537IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2537beds";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|BedArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    /** The dwelling the buyer asked for. */
    private static final UUID APARTMENT_3BHK = UUID.fromString("25370001-0000-0000-0000-000000000001");
    /**
     * A dwelling of a SELECTED, bedroom-capable shape carrying the WRONG count. Its exclusion is
     * half of what every mixed arm must prove — without it, "bedrooms still narrow the dwellings"
     * would be unfalsifiable and the fix could silently drop the predicate altogether.
     */
    private static final UUID APARTMENT_2BHK = UUID.fromString("25370002-0000-0000-0000-000000000002");
    /**
     * The row this issue is about: a selected Commercial shape whose {@code bedrooms} is NULL. It
     * must be RETAINED under a mixed selection, because a Shop does not have bedrooms and so cannot
     * be judged against a bedroom predicate.
     */
    private static final UUID SHOP_NULL_BEDS = UUID.fromString("25370003-0000-0000-0000-000000000003");
    /** A self-describing Commercial family shape, so the mixed-Commercial arm is not Shop-specific. */
    private static final UUID WAREHOUSE_NULL_BEDS = UUID.fromString("25370004-0000-0000-0000-000000000004");
    /** The non-Commercial half of "non-bedroom-capable": a plot has no bedrooms either. */
    private static final UUID PLOT_NULL_BEDS = UUID.fromString("25370005-0000-0000-0000-000000000005");
    /** A SECOND bedroom-capable shape, so "multiple dwelling shapes" is not one shape twice. */
    private static final UUID VILLA_3BHK = UUID.fromString("25370006-0000-0000-0000-000000000006");
    /** A second dwelling with the wrong count, so the multi-dwelling arm can exclude on both shapes. */
    private static final UUID VILLA_4BHK = UUID.fromString("25370007-0000-0000-0000-000000000007");

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
        insertArea(cityId, AREA_KEY, "Bed Area");

        insertLiveListing(APARTMENT_3BHK, "apartment", 3);
        insertLiveListing(APARTMENT_2BHK, "apartment", 2);
        insertLiveListing(SHOP_NULL_BEDS, "commercial", null);
        insertLiveListing(WAREHOUSE_NULL_BEDS, "warehouse", null);
        insertLiveListing(PLOT_NULL_BEDS, "residential_plot", null);
        insertLiveListing(VILLA_3BHK, "villa", 3);
        insertLiveListing(VILLA_4BHK, "villa", 4);

        insertCommercialDetail(SHOP_NULL_BEDS, "SHOP");

        // Fixture-authenticity preconditions, asserted BEFORE anything under test runs. The whole
        // issue turns on `bedrooms` being genuinely NULL on the non-dwelling rows: were the column
        // defaulted to 0, "the Shop was retained" could pass for the wrong reason and the fix would
        // be measured against a fixture that cannot express the defect.
        assertThat(storedBedrooms(SHOP_NULL_BEDS))
                .as("precondition: a Commercial row must carry bedrooms NULL — this is the value "
                        + "`NULL IN (3)` evaluates to NULL for, which is what eliminates the row")
                .isNull();
        assertThat(storedBedrooms(WAREHOUSE_NULL_BEDS)).isNull();
        assertThat(storedBedrooms(PLOT_NULL_BEDS)).isNull();
        assertThat(storedBedrooms(APARTMENT_3BHK)).isEqualTo(3);
        assertThat(storedBedrooms(APARTMENT_2BHK)).isEqualTo(2);

        service = new CityAreaListingsService(jdbcTemplate);
    }

    // ── The ruling's seven required cases ────────────────────────────────────────────

    @Test
    @DisplayName("#2537: Apartment only + bedrooms — normal bedroom filtering, unchanged")
    void apartmentOnly_bedroomsNarrowNormally() {
        List<UUID> ids = idsFor(List.of("apartment"), null, List.of(3));

        assertThat(ids).containsExactly(APARTMENT_3BHK);
        assertThat(ids)
                .as("a bedroom-capable shape with the wrong count is still excluded — the per-shape "
                        + "rule scopes the predicate, it does not weaken it")
                .doesNotContain(APARTMENT_2BHK);
    }

    @Test
    @DisplayName("#2537: Shop only — the selection returns its shops (bedrooms are not submitted)")
    void shopOnly_returnsShops() {
        assertThat(idsFor(List.of("commercial"), List.of("SHOP"), null))
                .containsExactly(SHOP_NULL_BEDS);
    }

    @Test
    @DisplayName("#2537 (THE issue): Apartment + Shop + 3BHK returns 3-BHK apartments OR all "
            + "selected shops — the wrong-count apartment is excluded AND the NULL-bedrooms shop is kept")
    void apartmentPlusShop_appliesBedroomsPerShape() {
        List<UUID> ids = idsFor(List.of("apartment", "commercial"), null, List.of(3));

        // BOTH halves, per the ruling. The first alone passes on the unfixed global conjunct.
        assertThat(ids)
                .as("the bedroom predicate must still narrow the dwelling arm")
                .contains(APARTMENT_3BHK)
                .doesNotContain(APARTMENT_2BHK);
        assertThat(ids)
                .as("THE DEFECT: a selected Shop carries bedrooms NULL and must never be eliminated "
                        + "by a predicate that does not apply to its shape")
                .contains(SHOP_NULL_BEDS);
    }

    @Test
    @DisplayName("#2537: Apartment + Plot + 3BHK returns 3-BHK apartments OR all selected plots")
    void apartmentPlusPlot_appliesBedroomsPerShape() {
        List<UUID> ids = idsFor(List.of("apartment", "residential_plot"), null, List.of(3));

        assertThat(ids).contains(APARTMENT_3BHK).doesNotContain(APARTMENT_2BHK);
        assertThat(ids)
                .as("a plot has no bedrooms either — the rule is about shape, not about Commercial")
                .contains(PLOT_NULL_BEDS);
    }

    @Test
    @DisplayName("#2537: multiple dwelling shapes + bedrooms — the predicate applies to EVERY "
            + "bedroom-capable selected shape, not just the first")
    void multipleDwellingShapes_bedroomsApplyToAllOfThem() {
        List<UUID> ids = idsFor(List.of("apartment", "villa"), null, List.of(3));

        assertThat(ids).containsExactlyInAnyOrder(APARTMENT_3BHK, VILLA_3BHK);
        // The failure this rules out is the mirror image of the defect: a fix that scoped the
        // predicate to ONE capable shape would let the other shape's wrong-count rows through.
        assertThat(ids)
                .as("both dwelling shapes must be narrowed, so neither wrong-count row survives")
                .doesNotContain(APARTMENT_2BHK, VILLA_4BHK);
    }

    @Test
    @DisplayName("#2537: mixed Commercial / non-Commercial — Apartment + Warehouse + 3BHK keeps "
            + "the warehouse, which is a self-describing Commercial shape carrying no subtype")
    void mixedCommercialAndNonCommercial_appliesBedroomsPerShape() {
        List<UUID> ids = idsFor(List.of("apartment", "warehouse"), null, List.of(3));

        assertThat(ids).contains(APARTMENT_3BHK).doesNotContain(APARTMENT_2BHK);
        assertThat(ids).contains(WAREHOUSE_NULL_BEDS);
    }

    @Test
    @DisplayName("#2537: a no-bedroom selection must not silently remove non-dwelling results")
    void noBedroomSelection_doesNotRemoveNonDwellings() {
        List<UUID> ids = idsFor(List.of("apartment", "commercial"), null, null);

        // THE CONTROL for every mixed arm above. Without a bedroom predicate the whole selection
        // comes back, so any absence above is the predicate's doing rather than a broken fixture,
        // an empty area, or a selection that matches nothing.
        assertThat(ids).containsExactlyInAnyOrder(APARTMENT_3BHK, APARTMENT_2BHK, SHOP_NULL_BEDS);
    }

    // ── The second, independent assembly ─────────────────────────────────────────────

    @Test
    @DisplayName("#2537: the bbox-only path builds its own WHERE clause and must apply the same "
            + "per-shape rule — fixing the area-grouped path proves nothing about this one")
    void bboxOnlyPath_appliesBedroomsPerShapeToo() {
        // Bbox is (south, west, north, east) — LATITUDE first, not the (west, south, …) order the
        // ST_MakeEnvelope call it feeds uses. Getting this backwards yields an envelope in empty
        // ocean and an empty result, which looks exactly like a filter that removed everything.
        DiscoverListingPredicateBuilder.Bbox bbox = new DiscoverListingPredicateBuilder.Bbox(
                CENTRE_LAT - 0.05, CENTRE_LON - 0.05, CENTRE_LAT + 0.05, CENTRE_LON + 0.05);

        CityAreaListingsResponse response = service.getAreaListings(
                CITY_SLUG, null, 50, null, null, List.of(3),
                List.of("apartment", "commercial"), null, null, null, null, bbox, false);

        List<UUID> ids = response.areas().stream()
                .flatMap(a -> a.listings().stream())
                .map(AreaListingCard::id)
                .toList();

        assertThat(ids).contains(APARTMENT_3BHK).doesNotContain(APARTMENT_2BHK);
        assertThat(ids).contains(SHOP_NULL_BEDS);
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────

    private List<UUID> idsFor(List<String> propertyTypes, List<String> subtypes, List<Integer> bedrooms) {
        CityAreaListingsResponse response = service.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, bedrooms, propertyTypes, subtypes,
                null, null, null, null, false);
        return response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture area not returned"))
                .listings().stream()
                .map(AreaListingCard::id)
                .toList();
    }

    private Integer storedBedrooms(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT bedrooms FROM property_listings WHERE id = ?", Integer.class, listingId);
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
     * Mirrors {@code CityAreaListingsCommercialSubtype2433IT#insertLiveListing}, with {@code
     * bedrooms} added — that class never writes the column, so every row it seeds is NULL there and
     * it cannot express this issue's fixture at all.
     */
    private void insertLiveListing(UUID id, String propertyType, Integer bedrooms) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " bedrooms, latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, propertyType, bedrooms, CENTRE_LAT, CENTRE_LON, now, now);
    }

    private void insertCommercialDetail(UUID listingId, String subtype) {
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details (listing_id, commercial_subtype) "
                        + "VALUES (?, ?)",
                listingId, subtype);
    }
}
