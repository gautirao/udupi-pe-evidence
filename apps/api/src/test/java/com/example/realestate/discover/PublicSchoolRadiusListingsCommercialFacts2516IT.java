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
 * Real-Postgres coverage for issue #2516's remaining gap: {@code
 * PublicSchoolRadiusListingsService} — until this fix, the ONE Discover read path that carried
 * neither {@code commercialSubtype} nor the allowlisted Commercial fact columns, even though the
 * City/Area feed ({@code CityAreaListingsService}/{@code AreaListingCard}) got them in
 * #2433/#2586.
 *
 * <p>Mocked-repository tests cannot execute SQL and therefore cannot reproduce the #2506
 * {@code numeric}-column abort ({@link #numericColumnsAreReadWithoutAbortingTheQuery}) — that
 * defect keys on Postgres column TYPE, not value, so only a real {@code numeric} column over a
 * real driver can catch it. Hence Testcontainers, not a mocked {@code ResultSet}.
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
class PublicSchoolRadiusListingsCommercialFacts2516IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2516school";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|FactArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    /** V104-authored Shop: flat commercial columns + an lcsd row carrying only the subtype. */
    private static final UUID SHOP_V104_ID = UUID.fromString("25160101-0000-0000-0000-000000000001");
    /** V102-authored Office: typed lcsd facts only, no V104 flat facts. */
    private static final UUID OFFICE_V102_ID = UUID.fromString("25160102-0000-0000-0000-000000000002");
    /** Legacy commercial row: no lcsd row at all, so subtype absent and facts fall back to flat. */
    private static final UUID LEGACY_FLAT_ONLY_ID = UUID.fromString("25160103-0000-0000-0000-000000000003");
    /** Warehouse carrying real `numeric` values in both trap columns — the abort guard. */
    private static final UUID WAREHOUSE_ID = UUID.fromString("25160104-0000-0000-0000-000000000004");
    /** Residential control — proves the Commercial-only assertions are not vacuous. */
    private static final UUID APARTMENT_ID = UUID.fromString("25160105-0000-0000-0000-000000000005");

    private static final int LEGACY_ONLY_TOTAL_FLOORS = 7;
    private static final double LEGACY_ONLY_ROAD_FRONTAGE_FT = 33.0;
    private static final double WAREHOUSE_CLEAR_HEIGHT_FT = 24.5;
    private static final double WAREHOUSE_ROAD_FRONTAGE_FT = 40.0;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private PublicSchoolRadiusListingsService service;

    @BeforeEach
    void setUp() {
        service = new PublicSchoolRadiusListingsService(jdbcTemplate);

        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key = ?", AREA_KEY);
        jdbcTemplate.update("DELETE FROM areas WHERE area_key = ?", AREA_KEY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId);

        // SHOP_V104_ID — V104 flat facts + an lcsd row carrying ONLY the subtype (no typed
        // floor/total_floors/road_frontage_ft), reproducing a row authored purely through the
        // current commercial author flow with no V102 backfill remnant.
        insertLiveListing(SHOP_V104_ID, "commercial", null, null);
        jdbcTemplate.update(
                "UPDATE property_listings SET floor_choice = ?, floor_mode = ?, hub_type = ?, "
                        + "occupancy_status = ?, commercial_zoning = ? WHERE id = ?",
                "GROUND", "TOKEN", "HIGH_STREET", "VACANT", "COMMERCIAL", SHOP_V104_ID);
        insertCommercialSpaceDetail(SHOP_V104_ID, "SHOP", null, null, null);

        // OFFICE_V102_ID — typed lcsd facts only; V104 flat columns left null. Proves the query
        // does not read the V104 columns as the only source (the CityAreaListingsService sibling
        // defect this fixture design is copied from).
        insertLiveListing(OFFICE_V102_ID, "commercial", null, null);
        insertCommercialSpaceDetail(OFFICE_V102_ID, "OFFICE", 3, 5, 20.0);

        // LEGACY_FLAT_ONLY_ID — a pre-V102 commercial row: no lcsd row at all, only the V32 flat
        // columns. commercialSubtype must be absent (never fabricated) and totalFloors/
        // roadFrontageFt must fall back to the flat value rather than rendering blank.
        insertLiveListing(LEGACY_FLAT_ONLY_ID, "commercial", LEGACY_ONLY_TOTAL_FLOORS, LEGACY_ONLY_ROAD_FRONTAGE_FT);

        // WAREHOUSE_ID — real `numeric` values in road_frontage_ft (V32 flat) and
        // warehouse_clear_height_ft (V104 flat). rs.getObject(col, Double.class) throws on the
        // FIRST row of a `numeric` column and aborts the entire query; an all-NULL fixture would
        // give zero protection, so both columns carry genuine non-null values here.
        insertLiveListing(WAREHOUSE_ID, "warehouse", null, WAREHOUSE_ROAD_FRONTAGE_FT);
        jdbcTemplate.update(
                "UPDATE property_listings SET warehouse_clear_height_ft = ?, warehouse_loading_bays = ? "
                        + "WHERE id = ?",
                WAREHOUSE_CLEAR_HEIGHT_FT, 3, WAREHOUSE_ID);

        // APARTMENT_ID — Residential control. Must keep resolving normally and must NOT acquire
        // a commercialSubtype or commercialFacts object.
        insertLiveListing(APARTMENT_ID, "apartment", null, null);
    }

    @Test
    @DisplayName("#2516: a V104-authored Shop row carries its subtype and flat facts — this "
            + "endpoint previously returned neither")
    void v104AuthoredRow_carriesSubtypeAndFlatFacts() {
        PublicSchoolRadiusListingCard card = cardOf(listings(), SHOP_V104_ID);

        assertThat(card.commercialSubtype()).isEqualTo("SHOP");
        assertThat(card.commercialFacts()).isNotNull();
        assertThat(card.commercialFacts().floorChoice()).isEqualTo("GROUND");
        assertThat(card.commercialFacts().hubType()).isEqualTo("HIGH_STREET");
        assertThat(card.commercialFacts().occupancyStatus()).isEqualTo("VACANT");
        assertThat(card.commercialFacts().commercialZoning()).isEqualTo("COMMERCIAL");
    }

    @Test
    @DisplayName("#2506 (the required arm): a V102-authored Office row carries its TYPED facts — "
            + "a query reading only the V104 flat columns renders this row blank")
    void v102AuthoredRow_carriesTypedFacts() {
        PublicSchoolRadiusListingCard card = cardOf(listings(), OFFICE_V102_ID);

        assertThat(card.commercialSubtype()).isEqualTo("OFFICE");
        assertThat(card.commercialFacts()).isNotNull();
        assertThat(card.commercialFacts().floorNumber()).isEqualTo(3);
        assertThat(card.commercialFacts().totalFloors()).isEqualTo(5);
        assertThat(card.commercialFacts().roadFrontageFt()).isEqualTo(20.0);
    }

    @Test
    @DisplayName("#2506: a legacy commercial row with NO typed projection row falls back to the "
            + "V32 flat columns rather than rendering blank, and never fabricates a subtype")
    void legacyFlatOnlyRow_fallsBackRatherThanRenderingBlank() {
        PublicSchoolRadiusListingCard card = cardOf(listings(), LEGACY_FLAT_ONLY_ID);

        // No lcsd row at all, so the subtype was genuinely never recorded — must stay null,
        // never guessed at.
        assertThat(card.commercialSubtype()).isNull();
        assertThat(card.commercialFacts()).isNotNull();
        assertThat(card.commercialFacts().totalFloors()).isEqualTo(LEGACY_ONLY_TOTAL_FLOORS);
        assertThat(card.commercialFacts().roadFrontageFt()).isEqualTo(LEGACY_ONLY_ROAD_FRONTAGE_FT);
    }

    @Test
    @DisplayName("#2516 (the 500-on-every-request guard): the query survives real `numeric` "
            + "values in road_frontage_ft and warehouse_clear_height_ft and returns them exactly")
    void numericColumnsAreReadWithoutAbortingTheQuery() {
        // Reaching this line at all is half the assertion: rs.getObject(col, Double.class) on a
        // `numeric` column throws on the FIRST row and aborts the whole query, so a regression
        // here surfaces as an exception out of listings(), not as a wrong value.
        List<PublicSchoolRadiusListingCard> content = listings();

        assertThat(content)
                .as("the query must return rows — an abort would surface as an exception above, "
                        + "but an empty list here would make the assertions below vacuous")
                .isNotEmpty();

        PublicSchoolRadiusListingCard warehouse = cardOf(content, WAREHOUSE_ID);
        assertThat(warehouse.commercialFacts()).isNotNull();
        assertThat(warehouse.commercialFacts().warehouseClearHeightFt()).isEqualTo(WAREHOUSE_CLEAR_HEIGHT_FT);
        assertThat(warehouse.commercialFacts().roadFrontageFt()).isEqualTo(WAREHOUSE_ROAD_FRONTAGE_FT);
    }

    @Test
    @DisplayName("#2516 (control): a Residential row carries NO commercialSubtype and NO "
            + "commercialFacts — the projection is Commercial-only, not a blanket addition")
    void residentialRowHasNoCommercialProjection() {
        PublicSchoolRadiusListingCard card = cardOf(listings(), APARTMENT_ID);

        assertThat(card.commercialSubtype()).isNull();
        assertThat(card.commercialFacts()).isNull();
    }

    private List<PublicSchoolRadiusListingCard> listings() {
        return service.getListings(CITY_SLUG, CENTRE_LAT, CENTRE_LON, 5.0, 0, 50, null).content();
    }

    private static PublicSchoolRadiusListingCard cardOf(List<PublicSchoolRadiusListingCard> cards, UUID id) {
        return cards.stream()
                .filter(c -> c.id().equals(id.toString()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no card for listing " + id));
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                AREA_KEY, cityId, "FactArea", CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    /**
     * Inserts a LIVE listing, including the V32 FLAT columns ({@code total_floors},
     * {@code road_frontage_ft}) that V102 backfilled the typed tables FROM. Those two are
     * parameters, mirroring {@code CityAreaListingsCommercialFacts2516IT}'s fixture, because the
     * whole #2506 question is which copy a consumer reads.
     */
    private void insertLiveListing(UUID id, String propertyType, Integer flatTotalFloors, Double flatRoadFrontageFt) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, total_floors, road_frontage_ft, "
                        + " created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, 5000000, ?, ?, ?, ?)",
                id, AREA_KEY, propertyType, CENTRE_LAT, CENTRE_LON,
                flatTotalFloors, flatRoadFrontageFt, now, now);
    }

    /**
     * Writes the V102 typed commercial projection row. A {@code null} subtype/facts reproduces
     * a row authored purely through V104 with no typed projection at all.
     */
    private void insertCommercialSpaceDetail(UUID listingId, String subtype, Integer floorNumber,
                                              Integer typedTotalFloors, Double typedRoadFrontageFt) {
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details "
                        + "(listing_id, commercial_subtype, floor_number, total_floors, road_frontage_ft) "
                        + "VALUES (?, ?, ?, ?, ?)",
                listingId, subtype, floorNumber, typedTotalFloors, typedRoadFrontageFt);
    }
}
