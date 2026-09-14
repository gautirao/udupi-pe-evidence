package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationCacheProperties;
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
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for #2516 (project the allowlisted Commercial facts onto the
 * anon city/area card feed) and #2506 (which stored copy of a fact wins).
 *
 * <h2>Why a real database, restated because it is the whole point of this file</h2>
 *
 * <p>Every claim here is a claim about SQL semantics, and two of them are unreachable by a
 * mocked {@code ResultSet} on principle:
 *
 * <ul>
 *   <li><b>The {@code numeric} abort.</b> {@code rs.getObject(col, Double.class)} is rejected
 *       by pgjdbc on a {@code numeric} column and throws on the FIRST row, aborting the entire
 *       query — which once turned every authenticated {@code GET /api/discover/listings} into a
 *       500 for every city, commercial rows or not. The throw keys on the column's TYPE, not
 *       its value, so an all-NULL commercial fixture gives ZERO protection; the arms below
 *       write real {@code numeric} values into {@code road_frontage_ft} and
 *       {@code warehouse_clear_height_ft} so the read is genuinely exercised.</li>
 *   <li><b>The dual-storage fallback.</b> A mock returns whatever it was told to return for a
 *       column name, so it cannot distinguish "the query selected this column" from "the query
 *       forgot to". Only a real row authored through ONE storage path can show that the other
 *       path renders blank.</li>
 * </ul>
 *
 * <h2>The #2506 fixture requirement, met literally</h2>
 *
 * <p>#2506 asks for "a test that includes a row authored through each path — a test using only
 * V104-authored rows passes while V102-authored rows render blank." Both exist here and are
 * asserted separately:
 *
 * <ul>
 *   <li>{@link #SHOP_V104_ID} — flat V104 columns only, no typed facts.</li>
 *   <li>{@link #OFFICE_V102_ID} — typed V102 child-table facts only, no V104 columns.</li>
 *   <li>{@link #LEGACY_FLAT_ONLY_ID} — neither: only the V32 flat columns V102 backfilled FROM,
 *       and no typed projection row at all. This is the row that renders blank if the query
 *       reads only the typed tables, which is what the authenticated feed did.</li>
 *   <li>{@link #DIVERGENT_TOTAL_FLOORS_ID} — BOTH copies populated, with DIFFERENT values, so
 *       the precedence rule is falsifiable rather than merely satisfied by agreement.</li>
 * </ul>
 *
 * <p>{@link #APARTMENT_ID} is the control arm. Without it, "Commercial rows carry facts and no
 * bathrooms" could pass vacuously on a fixture where nothing carries bathrooms at all.
 */
// Deliberately NOT annotated @Tag("integration") — surefire's <excludedGroups>integration</...>
// is a literal, so a tagged test cannot be run from the CLI and only executes under an opt-in
// profile (#1794). The surefire <includes> already carries **/*IT.java, so an untagged IT runs
// in the DEFAULT suite, which is what a permanent regression guard should do.
// Same rationale and wording as CityAreaListingsCommercialSubtype2433IT.
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
class CityAreaListingsCommercialFacts2516IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2516facts";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|FactArea";
    private static final String EMPTY_AREA_KEY = "QA|QA|" + CITY_SLUG + "|EmptyArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    /** Authored through the V104 flat write path ONLY. */
    private static final UUID SHOP_V104_ID = UUID.fromString("25160001-0000-0000-0000-000000000001");
    /** Authored through the V102 typed child table ONLY. */
    private static final UUID OFFICE_V102_ID = UUID.fromString("25160002-0000-0000-0000-000000000002");
    /** Warehouse carrying BOTH `numeric` columns with real values — the abort guard. */
    private static final UUID WAREHOUSE_ID = UUID.fromString("25160003-0000-0000-0000-000000000003");
    /** Commercial row with NO typed projection row: only the V32 flat columns. */
    private static final UUID LEGACY_FLAT_ONLY_ID = UUID.fromString("25160004-0000-0000-0000-000000000004");
    /** Both copies of total_floors populated, with DIFFERENT values. */
    private static final UUID DIVERGENT_TOTAL_FLOORS_ID = UUID.fromString("25160005-0000-0000-0000-000000000005");
    /** Residential control — proves the Commercial-only assertions are not vacuous. */
    private static final UUID APARTMENT_ID = UUID.fromString("25160006-0000-0000-0000-000000000006");

    /** The typed value on {@link #DIVERGENT_TOTAL_FLOORS_ID}; must WIN. */
    private static final int TYPED_TOTAL_FLOORS = 3;
    /** The flat value on {@link #DIVERGENT_TOTAL_FLOORS_ID}; must LOSE. */
    private static final int FLAT_TOTAL_FLOORS = 9;
    /** The only copy on {@link #LEGACY_FLAT_ONLY_ID}; must therefore be used. */
    private static final int LEGACY_ONLY_TOTAL_FLOORS = 7;
    /**
     * Flat {@code floor_number} on {@link #LEGACY_FLAT_ONLY_ID}, with no typed copy.
     *
     * <p>Added after review: {@code floor_number} is the THIRD dual-storage fact (V32 flat,
     * V102 backfilled the typed column from it, and the write path still fills it), but the
     * first cut of this class resolved only {@code total_floors} and {@code road_frontage_ft}.
     * The fixture could not catch that, because it never set a flat floor number — so the arm
     * below asserted two of three facts falling back and stayed silent about the third.
     */
    private static final int LEGACY_ONLY_FLOOR_NUMBER = 2;

    /** A {@code commercial_land} row — the ONLY fixture that reaches the last COALESCE arm. */
    private static final UUID COMMERCIAL_LAND_ID = UUID.fromString("25160007-0000-0000-0000-000000000007");
    /** Road frontage on {@link #COMMERCIAL_LAND_ID}, carried ONLY by {@code lcld}. */
    private static final double LAND_ROAD_FRONTAGE_FT = 55.5;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityAreaListingsService cityAreaService;
    private DiscoverListingsController listingsController;

    @BeforeEach
    void setUp() {
        for (String table : List.of("listing_commercial_space_details",
                "listing_commercial_building_details",
                "listing_warehouse_details",
                "listing_commercial_land_details")) {
            jdbcTemplate.update("DELETE FROM " + table + " WHERE listing_id IN ("
                    + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        }
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId, AREA_KEY, "Fact Area");
        insertArea(cityId, EMPTY_AREA_KEY, "Empty Area");

        // ── V104-authored: flat columns only, no typed facts ──────────────────────────
        insertLiveListing(SHOP_V104_ID, "commercial", 0, null, null);
        insertCommercialSpaceDetail(SHOP_V104_ID, "SHOP", null, null, null);
        jdbcTemplate.update("UPDATE property_listings SET floor_choice = ?, hub_type = ?, "
                        + "occupancy_status = ?, commercial_zoning = ? WHERE id = ?",
                "GROUND", "HIGH_STREET", "VACANT", "COMMERCIAL", SHOP_V104_ID);

        // ── V102-authored: typed child facts only, no V104 columns ────────────────────
        insertLiveListing(OFFICE_V102_ID, "commercial", 0, null, null);
        insertCommercialSpaceDetail(OFFICE_V102_ID, "OFFICE", 2, 5, 30.5);

        // ── The numeric-abort guard: real values in BOTH `numeric` columns ────────────
        insertLiveListing(WAREHOUSE_ID, "warehouse", 0, null, null);
        jdbcTemplate.update("UPDATE property_listings SET warehouse_clear_height_ft = ?, "
                        + "warehouse_loading_bays = ? WHERE id = ?",
                24.5, 3, WAREHOUSE_ID);
        jdbcTemplate.update("INSERT INTO public.listing_warehouse_details "
                        + "(listing_id, total_floors, road_frontage_ft) VALUES (?, ?, ?)",
                WAREHOUSE_ID, 1, 40.0);

        // ── Flat-legacy only: no typed projection row at all ──────────────────────────
        insertLiveListing(LEGACY_FLAT_ONLY_ID, "commercial", 0, LEGACY_ONLY_TOTAL_FLOORS, 12.5);
        // The third dual-storage fact. Set separately rather than as another positional
        // parameter on insertLiveListing, because only this one row needs it and a sixth
        // same-typed positional argument is how the Bbox(south, west, north, east) swap that
        // silently emptied the bbox arm happened earlier in this same file.
        jdbcTemplate.update("UPDATE property_listings SET floor_number = ? WHERE id = ?",
                LEGACY_ONLY_FLOOR_NUMBER, LEGACY_FLAT_ONLY_ID);

        // ── commercial_land: the ONLY row that reaches the LAST arm of the four-way
        // road-frontage COALESCE (lcsd -> lcbd -> lwd -> lcld). Without it that branch is
        // joined and compiled but never the winning source in any assertion.
        insertLiveListing(COMMERCIAL_LAND_ID, "commercial_land", 0, null, null);
        jdbcTemplate.update("INSERT INTO public.listing_commercial_land_details "
                        + "(listing_id, road_frontage_ft) VALUES (?, ?)",
                COMMERCIAL_LAND_ID, LAND_ROAD_FRONTAGE_FT);

        // ── Both copies populated and DISAGREEING ─────────────────────────────────────
        insertLiveListing(DIVERGENT_TOTAL_FLOORS_ID, "commercial", 0, FLAT_TOTAL_FLOORS, null);
        insertCommercialSpaceDetail(DIVERGENT_TOTAL_FLOORS_ID, "SHOP", null, TYPED_TOTAL_FLOORS, null);

        // ── Residential control ───────────────────────────────────────────────────────
        insertLiveListing(APARTMENT_ID, "apartment", 2, 4, null);

        // Fixture-authenticity preconditions, asserted BEFORE anything under test runs, so a
        // broken fixture fails HERE rather than as a misleading assertion further down.
        assertThat(flatTotalFloors(DIVERGENT_TOTAL_FLOORS_ID))
                .as("precondition: the divergence fixture must genuinely disagree, otherwise the "
                        + "precedence assertion passes no matter which source wins")
                .isEqualTo(FLAT_TOTAL_FLOORS)
                .isNotEqualTo(TYPED_TOTAL_FLOORS);
        assertThat(hasAnyTypedRow(LEGACY_FLAT_ONLY_ID))
                .as("precondition: the flat-only fixture must genuinely have NO typed row — "
                        + "otherwise it duplicates the divergence case instead of covering the "
                        + "blank-render case #2506 is about")
                .isFalse();
        assertThat(storedBathrooms(SHOP_V104_ID))
                .as("precondition: the commercial fixture must carry the 0 that production "
                        + "carries — a NULL here would make the suppression assertion vacuous")
                .isZero();
        assertThat(storedBathrooms(APARTMENT_ID))
                .as("precondition: the residential control must carry a real bathroom count, "
                        + "otherwise 'bathrooms survive for Residential' cannot fail")
                .isEqualTo(2);

        cityAreaService = new CityAreaListingsService(jdbcTemplate);

        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        listingsController = new DiscoverListingsController(
                listingsService, new ObjectMapper(), cache,
                new PolygonGeographicSafetyPolicy(jdbcTemplate));
    }

    // ── #2516: the card feed carries the facts at all ────────────────────────────────

    @Test
    @DisplayName("#2516: a V104-authored Shop card carries its flat facts — the feed that "
            + "previously returned identity only")
    void v104AuthoredRow_carriesItsFlatFacts() {
        DiscoverCommercialFacts facts = factsOf(areaCards(), SHOP_V104_ID);

        assertThat(facts).isNotNull();
        assertThat(facts.floorChoice()).isEqualTo("GROUND");
        assertThat(facts.hubType()).isEqualTo("HIGH_STREET");
        assertThat(facts.occupancyStatus()).isEqualTo("VACANT");
        assertThat(facts.commercialZoning()).isEqualTo("COMMERCIAL");
    }

    @Test
    @DisplayName("#2506 (the required arm): a V102-authored Office card carries its TYPED facts — "
            + "a query reading only the V104 flat columns renders this row blank")
    void v102AuthoredRow_carriesItsTypedFacts() {
        DiscoverCommercialFacts facts = factsOf(areaCards(), OFFICE_V102_ID);

        assertThat(facts).isNotNull();
        assertThat(facts.floorNumber()).isEqualTo(2);
        assertThat(facts.totalFloors()).isEqualTo(5);
        assertThat(facts.roadFrontageFt()).isEqualTo(30.5);
        // The V104 half is genuinely absent for this row — honest absence, not a fabricated 0.
        assertThat(facts.floorChoice()).isNull();
        assertThat(facts.floorMode()).isNull();
    }

    @Test
    @DisplayName("#2506: a commercial row with NO typed projection row falls back to the V32 flat "
            + "columns rather than rendering blank")
    void flatLegacyOnlyRow_fallsBackRatherThanRenderingBlank() {
        DiscoverCommercialFacts facts = factsOf(areaCards(), LEGACY_FLAT_ONLY_ID);

        assertThat(facts)
                .as("a row authored before the typed write path existed still has facts to show")
                .isNotNull();
        assertThat(facts.totalFloors()).isEqualTo(LEGACY_ONLY_TOTAL_FLOORS);
        assertThat(facts.roadFrontageFt()).isEqualTo(12.5);
        // The third fact. This assertion is the one that fails without resolveFloorNumber:
        // the typed copy is absent on this row, so reading only lcsd.floor_number renders a
        // blank floor while the two facts above fall back correctly — a partial application
        // of the very rule this class exists to state.
        assertThat(facts.floorNumber())
                .as("floor_number must fall back to the V32 flat copy like the other two facts")
                .isEqualTo(LEGACY_ONLY_FLOOR_NUMBER);
    }

    @Test
    @DisplayName("#2516: a commercial_land row resolves road frontage from lcld — the LAST arm of "
            + "the four-way COALESCE, which no other fixture reaches")
    void commercialLandRowReachesTheLastCoalesceArm() {
        DiscoverCommercialFacts facts = factsOf(areaCards(), COMMERCIAL_LAND_ID);

        assertThat(facts)
                .as("a commercial_land listing carries facts like any other Commercial row")
                .isNotNull();
        assertThat(facts.roadFrontageFt())
                .as("the value lives ONLY in listing_commercial_land_details, so reading it "
                        + "proves the COALESCE falls through lcsd -> lcbd -> lwd to lcld")
                .isEqualTo(LAND_ROAD_FRONTAGE_FT);
    }

    @Test
    @DisplayName("#2506 (precedence, falsifiable): when BOTH copies of total_floors exist and "
            + "disagree, the V102 typed value wins on BOTH feeds")
    void whenBothCopiesDisagree_typedWins_onBothFeeds() {
        Integer cardValue = factsOf(areaCards(), DIVERGENT_TOTAL_FLOORS_ID).totalFloors();
        Integer authValue = authFactsOf(authListings(), DIVERGENT_TOTAL_FLOORS_ID).totalFloors();

        assertThat(cardValue).isEqualTo(TYPED_TOTAL_FLOORS);
        assertThat(authValue).isEqualTo(TYPED_TOTAL_FLOORS);
        assertThat(cardValue)
                .as("the flat copy must lose — if this reads %d the precedence is inverted",
                        FLAT_TOTAL_FLOORS)
                .isNotEqualTo(FLAT_TOTAL_FLOORS);
    }

    @Test
    @DisplayName("#2516 (the reason this issue exists): both Discover feeds report the SAME facts "
            + "for the SAME listing — a shopper cannot see two different cards in one session")
    void bothDiscoverFeedsAgreeOnTheFacts() {
        List<AreaListingCard> cards = areaCards();
        List<DiscoverListingResponse> auth = authListings();

        // COMMERCIAL_LAND_ID belongs in this list, and its absence was a real gap: it is the
        // ONLY row whose road frontage comes from the lcld arm of the four-way COALESCE, and
        // that COALESCE is hand-written in THREE separate SELECTs. A typo in one copy is
        // precisely the cross-feed divergence this arm exists to catch, and lcld is the arm
        // with the least coverage anywhere else.
        for (UUID id : List.of(SHOP_V104_ID, OFFICE_V102_ID, WAREHOUSE_ID,
                LEGACY_FLAT_ONLY_ID, DIVERGENT_TOTAL_FLOORS_ID, COMMERCIAL_LAND_ID)) {
            DiscoverCommercialFacts cardFacts = factsOf(cards, id);

            // Assert non-null BEFORE asserting equality. Without this the arm passes when BOTH
            // feeds return null — and "both null" is exactly what a regression in the shared
            // reader or the alias contract looks like, since one change hits both feeds at
            // once. An arm that advertises itself as the anti-divergence guard must not be
            // satisfiable by total, symmetric absence.
            assertThat(cardFacts)
                    .as("facts for %s must be PRESENT on the card feed — a null here would make "
                            + "the equality assertion below vacuously true", id)
                    .isNotNull();

            assertThat(cardFacts)
                    .as("facts for %s must be identical on the card feed and the authenticated "
                            + "feed — equality of the whole record, not of a chosen field", id)
                    .isEqualTo(authFactsOf(auth, id));
        }
    }

    // ── The numeric abort ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("#2516 (the 500-on-every-request guard): the query survives real `numeric` values "
            + "in road_frontage_ft and warehouse_clear_height_ft and returns them exactly")
    void numericColumnsAreReadWithoutAbortingTheQuery() {
        // Reaching this line at all is half the assertion: getObject(col, Double.class) on a
        // `numeric` column throws on the FIRST row and aborts the whole query, so a regression
        // here surfaces as an exception out of areaCards(), not as a wrong value.
        List<AreaListingCard> cards = areaCards();

        assertThat(cards)
                .as("the query must return rows — an abort would surface as an exception above, "
                        + "but an empty list here would make every assertion below vacuous")
                .isNotEmpty();

        DiscoverCommercialFacts warehouse = factsOf(cards, WAREHOUSE_ID);
        assertThat(warehouse).isNotNull();
        assertThat(warehouse.warehouseClearHeightFt()).isEqualTo(24.5);
        assertThat(warehouse.warehouseLoadingBays()).isEqualTo(3);
        assertThat(warehouse.roadFrontageFt()).isEqualTo(40.0);
    }

    // ── The Residential semantic leak ────────────────────────────────────────────────

    @Test
    @DisplayName("#2516: a Commercial card reports NO bathrooms — production stores 0, which "
            + "rendered '0 bathrooms' on a live Showroom")
    void commercialCardSuppressesBathrooms() {
        assertThat(cardOf(areaCards(), SHOP_V104_ID).bathrooms())
                .as("a Showroom has washrooms, not bathrooms; 0 is a stored default, not a fact")
                .isNull();
        assertThat(cardOf(areaCards(), WAREHOUSE_ID).bathrooms()).isNull();
        assertThat(cardOf(areaCards(), OFFICE_V102_ID).bathrooms()).isNull();
    }

    @Test
    @DisplayName("#2516 (control): a Residential card still reports its bathrooms and carries NO "
            + "commercialFacts — the suppression is Commercial-only, not a blanket drop")
    void residentialCardKeepsBathroomsAndHasNoCommercialFacts() {
        AreaListingCard apartment = cardOf(areaCards(), APARTMENT_ID);

        assertThat(apartment.bathrooms())
                .as("if this is null the suppression is over-broad and has silently deleted a "
                        + "Residential fact from every card")
                .isEqualTo(2);
        assertThat(apartment.commercialFacts())
                .as("a Residential row must not acquire a Commercial summary from the legacy "
                        + "flat-column fallback, which Residential rows also populate")
                .isNull();
        assertThat(apartment.totalFloors())
                .as("the top-level Residential totalFloors still resolves from the flat column")
                .isEqualTo(4);

        // The AUTHENTICATED half of the same gate. Until this line the auth-side narrowing was
        // the one part of this change with no assertion anywhere in the suite — documented
        // only, on the argument that it is API-unreachable. That argument still holds, but it
        // is one line and the fixture already exists, and this lane's whole position is that
        // documented is weaker than tested.
        assertThat(authFactsOf(authListings(), APARTMENT_ID))
                .as("the authenticated feed applies the SAME Commercial-family gate, so a "
                        + "Residential row carries no commercialFacts there either — otherwise "
                        + "the two feeds disagree in the one direction this issue is about")
                .isNull();
    }

    // ── Regressions on the three new LEFT JOINs ──────────────────────────────────────

    @Test
    @DisplayName("#2516 (regression): an area with ZERO live listings still returns its entry — "
            + "three more LEFT JOINs must not convert the outer LEFT JOIN to an inner one")
    void emptyAreaStillReturnsItsEntry() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY, EMPTY_AREA_KEY), 50, null, null, null, null, null,
                null, null, null, null, false);

        AreaListingsEntry empty = response.areas().stream()
                .filter(a -> EMPTY_AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("the empty area vanished from the response"));

        assertThat(empty.unknown()).isNull();
        assertThat(empty.listings()).isEmpty();
    }

    @Test
    @DisplayName("#2516 (no row multiplication): four 1:0..1 PK joins cannot duplicate a listing, "
            + "so the per-area cap still counts real listings")
    void projectionJoinsDoNotMultiplyRows() {
        List<AreaListingCard> cards = areaCards();

        assertThat(cards).hasSize(liveListingCount(AREA_KEY));
        assertThat(cards.stream().map(AreaListingCard::id).distinct().count())
                .isEqualTo(cards.size());
    }

    @Test
    @DisplayName("#2516: the bbox-only 'Search this area' path carries the facts too — it is a "
            + "separate hand-built SQL shape, so fixing the area-grouped one proves nothing here")
    void bboxOnlyPathAlsoCarriesTheFacts() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, null, 50, null, null, null, null, null, null, null, null,
                // Bbox is (south, west, north, east) — LATITUDE first, not the (west, south,
                // east, north) order the ST_MakeEnvelope bind sequence inside the service
                // uses. Four same-typed doubles means the compiler cannot catch a swap, and a
                // swapped box silently selects an empty region of the planet rather than
                // failing: the first cut of this arm built a box at south=73.5/west=12.5 and
                // returned zero rows. That is why the assertion below checks the result is
                // non-empty before checking any fact — a vacuous pass here would have looked
                // exactly like a working bbox path.
                new DiscoverListingPredicateBuilder.Bbox(
                        CENTRE_LAT - 0.5, CENTRE_LON - 0.5, CENTRE_LAT + 0.5, CENTRE_LON + 0.5),
                false);

        List<AreaListingCard> cards = response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("bbox-only path returned no fixture area"))
                .listings();

        assertThat(cards)
                .as("an empty result would make every assertion below vacuous")
                .isNotEmpty();
        assertThat(factsOf(cards, OFFICE_V102_ID).totalFloors()).isEqualTo(5);
        assertThat(factsOf(cards, LEGACY_FLAT_ONLY_ID).totalFloors())
                .isEqualTo(LEGACY_ONLY_TOTAL_FLOORS);
        assertThat(factsOf(cards, WAREHOUSE_ID).warehouseClearHeightFt()).isEqualTo(24.5);
        assertThat(cardOf(cards, SHOP_V104_ID).bathrooms()).isNull();
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────

    private List<AreaListingCard> areaCards() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, null, null, null,
                null, null, null, null, false);
        return response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture area not returned"))
                .listings();
    }

    private List<DiscoverListingResponse> authListings() {
        DiscoverListingsPage page = listingsController.getListings(
                CITY_SLUG, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                0, 50, false, null, null, null, null, null, null, null).getBody();
        assertThat(page).isNotNull();
        return page.content();
    }

    private static AreaListingCard cardOf(List<AreaListingCard> cards, UUID id) {
        return cards.stream()
                .filter(c -> id.equals(c.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id + " not returned"));
    }

    private static DiscoverCommercialFacts factsOf(List<AreaListingCard> cards, UUID id) {
        return cardOf(cards, id).commercialFacts();
    }

    private static DiscoverCommercialFacts authFactsOf(List<DiscoverListingResponse> listings, UUID id) {
        return listings.stream()
                .filter(l -> id.toString().equals(l.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id
                        + " not returned by the authenticated path"))
                .commercialFacts();
    }

    private Integer flatTotalFloors(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT total_floors FROM property_listings WHERE id = ?", Integer.class, listingId);
    }

    private Integer storedBathrooms(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT bathrooms FROM property_listings WHERE id = ?", Integer.class, listingId);
    }

    /** True when the listing has a row in ANY of the four typed commercial projections. */
    private boolean hasAnyTypedRow(UUID listingId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT (SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?)"
                        + "     + (SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?)"
                        + "     + (SELECT COUNT(*) FROM listing_warehouse_details WHERE listing_id = ?)"
                        + "     + (SELECT COUNT(*) FROM listing_commercial_land_details WHERE listing_id = ?)",
                Integer.class, listingId, listingId, listingId, listingId);
        return count != null && count > 0;
    }

    private int liveListingCount(String areaKey) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ? AND status = 'LIVE'",
                Integer.class, areaKey);
        return count == null ? 0 : count;
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId, String areaKey, String name) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                areaKey, cityId, name, CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    /**
     * Inserts a LIVE listing, including the V32 FLAT columns ({@code total_floors},
     * {@code road_frontage_ft}) that V102 backfilled the typed tables FROM. Those two are
     * parameters rather than a fixed value because the whole #2506 question is which copy a
     * consumer reads, and a fixture that cannot set them independently cannot ask it.
     */
    private void insertLiveListing(UUID id, String propertyType, Integer bathrooms,
                                   Integer flatTotalFloors, Double flatRoadFrontageFt) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, bathrooms, total_floors, "
                        + " road_frontage_ft, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, 5000000, ?, ?, ?, ?, ?)",
                id, AREA_KEY, propertyType, CENTRE_LAT, CENTRE_LON, bathrooms,
                flatTotalFloors, flatRoadFrontageFt, now, now);
    }

    /**
     * Writes the V102 typed commercial projection row. A {@code null} subtype reproduces the
     * V102 backfill shape exactly; null facts reproduce a row authored purely through V104.
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
