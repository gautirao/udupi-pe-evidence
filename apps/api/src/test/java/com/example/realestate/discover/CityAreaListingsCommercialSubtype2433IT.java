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
 * Testcontainers real-DB proof for issue #2433: the ANON city-area Discover read path projects
 * {@code commercialSubtype}, spells it the same way the authenticated path does, and does not
 * disturb the empty-area or per-area-cap behaviour that path already guaranteed.
 *
 * <h2>Why this endpoint needed the field at all</h2>
 *
 * <p>{@code PropertyCard} is fed by three different backends and, before this change, only
 * {@code /api/discover/listings} could express a subtype. That is not a cosmetic gap. The card's
 * summary model falls back to a legacy-generic branch when the subtype is absent, and that branch
 * asserts a claim about the DATA — "this row's Shop-vs-Office was never recorded". Reached through
 * this endpoint it would have stated that falsely for a listing whose subtype IS recorded,
 * indistinguishable from a genuine V102 legacy row. Honest absence only works if absence means
 * absence, which is why the field is projected rather than the card being taught to guess.
 *
 * <p>This is the READ-MODEL counterpart of #2509, which covers only the query direction (this
 * endpoint still cannot be FILTERED by subtype). Scope expansion into {@code CityAreaListingsService}
 * was explicitly authorised for the single-field append; the fact set is deliberately NOT added here.
 *
 * <h2>Why a real database rather than a mocked JdbcTemplate</h2>
 *
 * <p>Every claim under test is a claim about SQL semantics: that a LEFT JOIN onto a projection table
 * keyed by {@code listing_id} PK cannot multiply a row or drop one, and — the case a mock cannot
 * reach at all — that an area with ZERO live listings still returns its row after a second LEFT JOIN
 * was added beneath the first. A mock would assert the string that was written, not what Postgres
 * does with it.
 *
 * <p>That distinction is not hypothetical on this issue. #2433's first backend cut passed three
 * mock-based unit tests while every authenticated {@code GET /api/discover/listings} returned 500,
 * because {@code getObject(col, Double.class)} is rejected by pgjdbc on a {@code numeric} column.
 * Mocks cannot execute SQL, so they cannot catch SQL defects.
 *
 * <p><b>If facts are later added to this service</b> (they are out of scope here):
 * {@code road_frontage_ft} and {@code warehouse_clear_height_ft} are {@code numeric} on this path
 * too, so they must go through {@code DiscoverListingsService#nullableDouble}, never
 * {@code getObject(..., Double.class)}.
 */
// Deliberately NOT annotated @Tag("integration") — surefire's <excludedGroups>integration</...> is a
// literal, so a tagged test cannot be run from the CLI and only executes under an opt-in profile
// (#1794). The surefire <includes> already carries **/*IT.java, so an untagged IT runs in the
// DEFAULT suite, which is what a permanent regression guard should do.
// @Testcontainers(disabledWithoutDocker = true) makes it skip gracefully where Docker is absent.
// Same rationale and same wording as CommercialSubtypeFilter2431IT.
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
class CityAreaListingsCommercialSubtype2433IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2433cards";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|CardArea";
    /** A second area with NO live listings — the LEFT JOIN regression target. */
    private static final String EMPTY_AREA_KEY = "QA|QA|" + CITY_SLUG + "|EmptyArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    private static final UUID SHOP_ID = UUID.fromString("24330001-0000-0000-0000-000000000001");
    private static final UUID OFFICE_ID = UUID.fromString("24330002-0000-0000-0000-000000000002");
    /** Legacy commercial row WITH a projection row whose subtype is NULL (the V102 backfill shape). */
    private static final UUID LEGACY_NULL_SUBTYPE_ID = UUID.fromString("24330003-0000-0000-0000-000000000003");
    /** Legacy commercial row with NO projection row at all. */
    private static final UUID LEGACY_NO_ROW_ID = UUID.fromString("24330004-0000-0000-0000-000000000004");
    /** Non-commercial control, so "only shops carry a subtype" cannot pass vacuously. */
    private static final UUID APARTMENT_ID = UUID.fromString("24330005-0000-0000-0000-000000000005");
    /** Subtype stored LOWER case — the column carries no CHECK constraint, so this is representable. */
    private static final UUID LOWERCASE_SHOP_ID = UUID.fromString("24330006-0000-0000-0000-000000000006");
    /** A self-describing Commercial family type, which carries no subtype on any axis. */
    private static final UUID WAREHOUSE_ID = UUID.fromString("24330007-0000-0000-0000-000000000007");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityAreaListingsService cityAreaService;
    private DiscoverListingsController listingsController;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM listing_commercial_space_details WHERE listing_id IN ("
                + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId, AREA_KEY, "Card Area");
        insertArea(cityId, EMPTY_AREA_KEY, "Empty Area");

        insertLiveListing(SHOP_ID, "commercial");
        insertLiveListing(OFFICE_ID, "commercial");
        insertLiveListing(LEGACY_NULL_SUBTYPE_ID, "commercial");
        insertLiveListing(LEGACY_NO_ROW_ID, "commercial");
        insertLiveListing(APARTMENT_ID, "apartment");
        insertLiveListing(LOWERCASE_SHOP_ID, "commercial");
        insertLiveListing(WAREHOUSE_ID, "warehouse");

        insertCommercialDetail(SHOP_ID, "SHOP");
        insertCommercialDetail(OFFICE_ID, "OFFICE");
        insertCommercialDetail(LEGACY_NULL_SUBTYPE_ID, null);
        insertCommercialDetail(LOWERCASE_SHOP_ID, "shop");
        // LEGACY_NO_ROW_ID, APARTMENT_ID and WAREHOUSE_ID deliberately get NO projection row.

        // Fixture-authenticity preconditions, asserted BEFORE anything under test runs, so a broken
        // fixture fails here rather than as a misleading assertion further down.
        assertThat(storedSubtype(SHOP_ID)).isEqualTo("SHOP");
        assertThat(storedSubtype(LOWERCASE_SHOP_ID)).isEqualTo("shop");
        assertThat(storedSubtype(LEGACY_NULL_SUBTYPE_ID)).isNull();
        assertThat(hasDetailRow(LEGACY_NO_ROW_ID))
                .as("precondition: the no-projection-row fixture must genuinely have no row — "
                        + "otherwise it duplicates the NULL-subtype case instead of covering its own")
                .isFalse();
        assertThat(liveListingCount(EMPTY_AREA_KEY))
                .as("precondition: the empty-area fixture must genuinely have zero LIVE listings — "
                        + "otherwise the LEFT JOIN regression test below cannot fail")
                .isZero();

        cityAreaService = new CityAreaListingsService(jdbcTemplate);

        // Built exactly as CommercialSubtypeFilter2431IT builds it, so the authenticated arm of
        // the parity test below exercises the real controller path rather than a shortcut.
        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        listingsController = new DiscoverListingsController(
                listingsService, new ObjectMapper(), cache,
                new PolygonGeographicSafetyPolicy(jdbcTemplate));
    }

    @Test
    @DisplayName("AC: the anon city-area card carries commercialSubtype for a Shop and an Office, "
            + "and reports honest absence — never a fabricated value — for every other shape")
    void areaCards_carrySubtype_andReportHonestAbsence() {
        List<AreaListingCard> cards = areaCards();

        assertThat(subtypeOf(cards, SHOP_ID)).isEqualTo("SHOP");
        assertThat(subtypeOf(cards, OFFICE_ID)).isEqualTo("OFFICE");

        // All three absence shapes must be null, and null must not be confused between them —
        // the caller separates them using propertyType, which is NOT NULL.
        assertThat(subtypeOf(cards, LEGACY_NULL_SUBTYPE_ID))
                .as("legacy commercial WITH a projection row whose subtype is NULL")
                .isNull();
        assertThat(subtypeOf(cards, LEGACY_NO_ROW_ID))
                .as("legacy commercial with NO projection row at all")
                .isNull();
        assertThat(subtypeOf(cards, APARTMENT_ID))
                .as("not a commercial listing")
                .isNull();
        assertThat(subtypeOf(cards, WAREHOUSE_ID))
                .as("self-describing Commercial family type — resolves from propertyType, "
                        + "carries no subtype on any axis")
                .isNull();
    }

    @Test
    @DisplayName("AC: a lower-case stored subtype is canonicalised to UPPER case, so the card "
            + "surface never has to know the column lacks a CHECK constraint")
    void areaCards_canonicaliseStoredCase() {
        assertThat(subtypeOf(areaCards(), LOWERCASE_SHOP_ID)).isEqualTo("SHOP");
    }

    @Test
    @DisplayName("AC (the reason this test exists): the anon card path and the authenticated "
            + "listings path return the SAME spelling of the subtype for the SAME listing")
    void bothDiscoverReadPathsAgreeOnTheSubtypeSpelling() {
        List<AreaListingCard> cards = areaCards();
        List<DiscoverListingResponse> authListings = authListings();

        // Asserted as EQUALITY per listing, not "both non-null": a both-present assertion passes
        // even when one path says "SHOP" and the other says "shop", which is exactly the drift
        // that duplicating normalizeCommercialSubtype across two services could introduce.
        for (UUID id : List.of(SHOP_ID, OFFICE_ID, LOWERCASE_SHOP_ID, LEGACY_NULL_SUBTYPE_ID,
                LEGACY_NO_ROW_ID, APARTMENT_ID, WAREHOUSE_ID)) {
            assertThat(subtypeOf(cards, id))
                    .as("anon card path and authenticated listings path must agree for " + id)
                    .isEqualTo(authSubtypeOf(authListings, id));
        }
    }

    @Test
    @DisplayName("AC (regression): an area with ZERO live listings still returns its entry — the "
            + "new LEFT JOIN must not convert the outer LEFT JOIN on property_listings to an inner one")
    void emptyAreaStillReturnsItsEntry() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY, EMPTY_AREA_KEY), 20, null, null, null, null, null,
                null, null, null, false);

        assertThat(response.areas().stream().map(AreaListingsEntry::areaKey))
                .as("both requested areas must be present, including the one with no listings")
                .containsExactlyInAnyOrder(AREA_KEY, EMPTY_AREA_KEY);

        AreaListingsEntry empty = response.areas().stream()
                .filter(a -> EMPTY_AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow();
        assertThat(empty.listings())
                .as("the empty area's entry must carry zero listings, not a phantom row")
                .isEmpty();
    }

    @Test
    @DisplayName("AC (no row multiplication): the projection LEFT JOIN is 1:0..1 on a PK, so each "
            + "listing appears exactly once and the per-area cap still counts real listings")
    void projectionJoinDoesNotMultiplyRows() {
        List<AreaListingCard> cards = areaCards();

        assertThat(cards.stream().map(AreaListingCard::id))
                .as("every fixture listing appears exactly once")
                .containsExactlyInAnyOrder(SHOP_ID, OFFICE_ID, LEGACY_NULL_SUBTYPE_ID,
                        LEGACY_NO_ROW_ID, APARTMENT_ID, LOWERCASE_SHOP_ID, WAREHOUSE_ID);

        // The per-area cap is applied by ROW_NUMBER() inside the subquery. If the join could
        // duplicate a row, the cap would silently count duplicates and drop real listings.
        CityAreaListingsResponse capped = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 3, null, null, null, null, null, null, null, null, false);
        assertThat(capped.areas()).hasSize(1);
        assertThat(capped.areas().get(0).listings())
                .as("limitPerArea=3 must return 3 DISTINCT listings")
                .hasSize(3);
        assertThat(capped.areas().get(0).listings().stream().map(AreaListingCard::id).distinct().count())
                .isEqualTo(3L);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private List<AreaListingCard> areaCards() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, null, null, null, null, null, null, false);
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
                0, 50, false, null, null, null, null, null).getBody();
        assertThat(page).isNotNull();
        return page.content();
    }

    private static String subtypeOf(List<AreaListingCard> cards, UUID id) {
        return cards.stream()
                .filter(c -> id.equals(c.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id + " not returned"))
                .commercialSubtype();
    }

    private static String authSubtypeOf(List<DiscoverListingResponse> listings, UUID id) {
        return listings.stream()
                .filter(l -> id.toString().equals(l.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id
                        + " not returned by the authenticated path"))
                .commercialSubtype();
    }

    private String storedSubtype(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM listing_commercial_space_details WHERE listing_id = ?",
                String.class, listingId);
    }

    private boolean hasDetailRow(UUID listingId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                Integer.class, listingId);
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

    private void insertLiveListing(UUID id, String propertyType) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, propertyType, CENTRE_LAT, CENTRE_LON, now, now);
    }

    /**
     * Writes the typed commercial projection row. Mirrors what
     * {@code CommercialSpaceDetailRepository#upsertFromListing} writes for the same inputs; a
     * {@code null} subtype reproduces the V102 backfill shape exactly.
     */
    private void insertCommercialDetail(UUID listingId, String subtype) {
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details (listing_id, commercial_subtype) "
                        + "VALUES (?, ?)",
                listingId, subtype);
    }
}
