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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for issue #2431: the Discover query path can narrow the generic
 * Commercial family to SHOP or OFFICE, cards and markers agree on membership, and a legacy
 * {@code property_type='commercial'} row whose subtype was never recorded is never classified as
 * either one.
 *
 * <p><b>Why a real database rather than a mocked JdbcTemplate.</b> Every claim under test is a
 * claim about SQL semantics — that {@code NULL IN ('SHOP')} excludes rather than includes, that a
 * {@code LEFT JOIN} on a primary key cannot duplicate a page row, that {@code UPPER()} on the
 * column matches a lower-case stored value. A mock would assert the string I wrote, not what
 * Postgres does with it, and would pass just as happily if the predicate were wrong.
 *
 * <p><b>Fixture shape.</b> Six listings in one Area of one city, covering every branch the
 * predicate can take:
 *
 * <ul>
 *   <li>a commercial listing with subtype {@code SHOP};</li>
 *   <li>a commercial listing with subtype {@code OFFICE};</li>
 *   <li>a commercial listing with a projection row whose {@code commercial_subtype} is NULL —
 *       the exact shape V102's backfill leaves behind for every pre-existing commercial row;</li>
 *   <li>a commercial listing with NO projection row at all — the shape a row has before it is
 *       first edited through the typed write path;</li>
 *   <li>an apartment — a non-commercial control, so "the filter returns only shops" cannot pass
 *       merely because the fixture contains nothing else;</li>
 *   <li>a commercial listing whose subtype is stored LOWER-case, which the column's lack of a
 *       CHECK constraint permits.</li>
 * </ul>
 *
 * <p>The projection rows are written through {@code listing_commercial_space_details} directly
 * rather than through {@code ListingCrudService}, because this test exercises the READ path and a
 * full create-through-the-API fixture would drag the whole listing write stack (validation,
 * approval, image handling) into a query test. The column values written here are exactly what
 * {@code CommercialSpaceDetailRepository#upsertFromListing} writes for the same inputs — the
 * canonical upper-case stamps produced by {@code ListingController#resolveCommercialSubtype} —
 * except for the deliberately lower-case row, whose whole purpose is to be non-canonical.
 */
// Deliberately NOT annotated @Tag("integration"): surefire's <excludedGroups>integration</
// excludedGroups> (pom.xml L155) is a literal, not a ${property}, so a tagged test cannot be run
// from the CLI at all and only executes under an opt-in profile (documented at length in #1794).
// The surefire <includes> already carries **/*IT.java, so an untagged IT runs in the DEFAULT
// suite — which is what this one should do: it is a permanent regression guard on filter
// membership, not a one-off evidence artifact. @Testcontainers(disabledWithoutDocker = true)
// makes it skip gracefully where Docker is absent. Same rationale, same wording, as the existing
// ListingPurposeOpenSearchIT and MarkersExcludePropertyTypeIT.
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
class CommercialSubtypeFilter2431IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2431commercial";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|CommercialArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    private static final UUID SHOP_ID = UUID.fromString("24310001-0000-0000-0000-000000000001");
    private static final UUID OFFICE_ID = UUID.fromString("24310002-0000-0000-0000-000000000002");
    /** Legacy commercial row WITH a projection row whose subtype is NULL (the V102 backfill shape). */
    private static final UUID LEGACY_NULL_SUBTYPE_ID = UUID.fromString("24310003-0000-0000-0000-000000000003");
    /** Legacy commercial row with NO projection row at all. */
    private static final UUID LEGACY_NO_ROW_ID = UUID.fromString("24310004-0000-0000-0000-000000000004");
    /** Non-commercial control. */
    private static final UUID APARTMENT_ID = UUID.fromString("24310005-0000-0000-0000-000000000005");
    /** Commercial row whose subtype is stored lower-case (no CHECK constraint prevents it). */
    private static final UUID LOWERCASE_SHOP_ID = UUID.fromString("24310006-0000-0000-0000-000000000006");

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

        insertLiveListing(SHOP_ID, "commercial");
        insertLiveListing(OFFICE_ID, "commercial");
        insertLiveListing(LEGACY_NULL_SUBTYPE_ID, "commercial");
        insertLiveListing(LEGACY_NO_ROW_ID, "commercial");
        insertLiveListing(APARTMENT_ID, "apartment");
        insertLiveListing(LOWERCASE_SHOP_ID, "commercial");

        insertCommercialDetail(SHOP_ID, "SHOP");
        insertCommercialDetail(OFFICE_ID, "OFFICE");
        insertCommercialDetail(LEGACY_NULL_SUBTYPE_ID, null);
        insertCommercialDetail(LOWERCASE_SHOP_ID, "shop");
        // LEGACY_NO_ROW_ID and APARTMENT_ID deliberately get NO projection row.

        // ── Fixture-authenticity preconditions, asserted BEFORE any query under test runs, so a
        // broken fixture fails here rather than as a misleading assertion further down.
        assertThat(storedSubtype(SHOP_ID)).isEqualTo("SHOP");
        assertThat(storedSubtype(OFFICE_ID)).isEqualTo("OFFICE");
        assertThat(storedSubtype(LEGACY_NULL_SUBTYPE_ID)).isNull();
        assertThat(storedSubtype(LOWERCASE_SHOP_ID)).isEqualTo("shop");
        assertThat(hasDetailRow(LEGACY_NO_ROW_ID))
                .as("precondition: the no-projection-row fixture must genuinely have no row — "
                        + "otherwise it duplicates the NULL-subtype case instead of covering its own")
                .isFalse();
        assertThat(hasDetailRow(APARTMENT_ID)).isFalse();

        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        DiscoverMarkersService markersService =
                new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new com.example.realestate.discover.navigation.NavigationCacheProperties());
        ObjectMapper objectMapper = new ObjectMapper();
        PolygonGeographicSafetyPolicy policy = new PolygonGeographicSafetyPolicy(jdbcTemplate);
        listingsController = new DiscoverListingsController(listingsService, objectMapper, cache, policy);
        markersController = new DiscoverMarkersController(markersService, objectMapper, cache, policy);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read model
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC: commercialSubtype is present on the Discover DTO for a Shop and an Office, "
            + "and absent — not fabricated — for legacy and non-commercial listings")
    void readModel_carriesSubtype_andReportsHonestAbsence() {
        List<DiscoverListingResponse> all = listings(null);

        assertThat(subtypeOf(all, SHOP_ID)).isEqualTo("SHOP");
        assertThat(subtypeOf(all, OFFICE_ID)).isEqualTo("OFFICE");

        assertThat(subtypeOf(all, LEGACY_NULL_SUBTYPE_ID))
                .as("a legacy commercial row whose subtype was never recorded must report null, "
                        + "never a guessed SHOP/OFFICE")
                .isNull();
        assertThat(subtypeOf(all, LEGACY_NO_ROW_ID))
                .as("a commercial row with no projection row at all must also report null")
                .isNull();
        assertThat(subtypeOf(all, APARTMENT_ID))
                .as("a non-commercial listing has no subtype")
                .isNull();
    }

    @Test
    @DisplayName("AC: a lower-case stored subtype is canonicalised to upper case on the DTO, so the "
            + "read model has one spelling per subtype")
    void readModel_canonicalisesStoredCase() {
        assertThat(subtypeOf(listings(null), LOWERCASE_SHOP_ID)).isEqualTo("SHOP");
    }

    @Test
    @DisplayName("AC (no N+1, no row multiplication): the LEFT JOIN added for the subtype projection "
            + "cannot duplicate a listing, so the page's ids stay distinct and its total still "
            + "matches the independent COUNT query")
    void readModel_leftJoinDoesNotMultiplyRows() {
        ResponseEntity<DiscoverListingsPage> response = rawListings(null);
        DiscoverListingsPage page = response.getBody();
        assertThat(page).isNotNull();

        List<String> ids = page.content().stream().map(DiscoverListingResponse::id).toList();
        assertThat(ids)
                .as("listing_id is the PRIMARY KEY of listing_commercial_space_details, so the join "
                        + "is 1:0..1 — a duplicate id here would mean the join changed cardinality")
                .doesNotHaveDuplicates()
                .hasSize(6);

        // totalElements comes from a SEPARATE COUNT query that does NOT carry the join. If the
        // join could multiply rows, the page content and this number would disagree.
        assertThat(page.totalElements()).isEqualTo(6L);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Filter membership
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC: commercialSubtypes=SHOP returns only shops — excluding offices, legacy "
            + "NULL-subtype rows, and non-commercial listings")
    void filter_shop_returnsOnlyShops() {
        assertThat(idsOf(listings(List.of("SHOP"))))
                .containsExactlyInAnyOrder(SHOP_ID.toString(), LOWERCASE_SHOP_ID.toString());
    }

    @Test
    @DisplayName("AC: commercialSubtypes=OFFICE returns only offices")
    void filter_office_returnsOnlyOffices() {
        assertThat(idsOf(listings(List.of("OFFICE"))))
                .containsExactly(OFFICE_ID.toString());
    }

    @Test
    @DisplayName("AC: input case does not matter — ?commercialSubtypes=shop is the same query as SHOP")
    void filter_inputIsCaseInsensitive() {
        assertThat(idsOf(listings(List.of("shop"))))
                .isEqualTo(idsOf(listings(List.of("SHOP"))));
    }

    @Test
    @DisplayName("AC (the one that matters most): selecting BOTH Shop and Office still excludes "
            + "legacy NULL-subtype rows — it does not collapse to 'no filter'")
    void filter_bothSubtypes_doesNotCollapseToNoFilter() {
        List<String> both = idsOf(listings(List.of("SHOP", "OFFICE")));

        assertThat(both).containsExactlyInAnyOrder(
                SHOP_ID.toString(), LOWERCASE_SHOP_ID.toString(), OFFICE_ID.toString());

        assertThat(both)
                .as("collapsing to no-clause would readmit the legacy rows the buyer just excluded, "
                        + "fabricating a Shop/Office classification the data does not support")
                .doesNotContain(
                        LEGACY_NULL_SUBTYPE_ID.toString(),
                        LEGACY_NO_ROW_ID.toString(),
                        APARTMENT_ID.toString());

        // Negative control: without the filter, those three ARE returned — so the assertion above
        // is proving the filter's effect, not an empty fixture.
        assertThat(idsOf(listings(null)))
                .contains(LEGACY_NULL_SUBTYPE_ID.toString(), LEGACY_NO_ROW_ID.toString(),
                        APARTMENT_ID.toString());
    }

    @Test
    @DisplayName("AC: omitting the param leaves membership byte-for-byte unchanged — no existing "
            + "Discover journey is affected by this change")
    void filter_absent_isUnchangedBehaviour() {
        assertThat(idsOf(listings(null))).hasSize(6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Cards / markers agreement
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC: markers and listings return the SAME membership for the same subtype filter, "
            + "correlated by id rather than by count")
    void markersAndListingsAgreeOnMembership() {
        for (List<String> filter : List.of(List.of("SHOP"), List.of("OFFICE"), List.of("SHOP", "OFFICE"))) {
            assertThat(markerIds(filter))
                    .as("map markers and result cards must agree for commercialSubtypes=%s", filter)
                    .containsExactlyInAnyOrderElementsOf(idsOf(listings(filter)));
        }
    }

    @Test
    @DisplayName("AC: markers exclude legacy NULL-subtype rows too — the map cannot show a pin the "
            + "card list omits")
    void markers_excludeLegacyNullSubtype() {
        assertThat(markerIds(List.of("SHOP", "OFFICE")))
                .doesNotContain(LEGACY_NULL_SUBTYPE_ID.toString(), LEGACY_NO_ROW_ID.toString());
    }

    @Test
    @DisplayName("AC (marker read model): a marker CARRIES commercialSubtype, so the popover can "
            + "render Shop vs Office without a second round-trip")
    void markers_carrySubtypeOnThePayload() {
        List<DiscoverMarker> all = markers(null);

        assertThat(markerSubtypeOf(all, SHOP_ID)).isEqualTo("SHOP");
        assertThat(markerSubtypeOf(all, OFFICE_ID)).isEqualTo("OFFICE");
        assertThat(markerSubtypeOf(all, LOWERCASE_SHOP_ID))
                .as("stored lower case is canonicalised on the marker exactly as on the card")
                .isEqualTo("SHOP");

        assertThat(markerSubtypeOf(all, LEGACY_NULL_SUBTYPE_ID))
                .as("a legacy commercial row whose subtype was never recorded reports null on the "
                        + "marker too — never a guessed SHOP/OFFICE")
                .isNull();
        assertThat(markerSubtypeOf(all, LEGACY_NO_ROW_ID)).isNull();
        assertThat(markerSubtypeOf(all, APARTMENT_ID)).isNull();
    }

    @Test
    @DisplayName("AC (card/marker read-model agreement): for every listing the marker's subtype "
            + "equals the card's — one listing cannot be a Shop on the map and an Office in the list")
    void markerAndCardAgreeOnTheSubtypeValue() {
        List<DiscoverListingResponse> cards = listings(null);
        List<DiscoverMarker> pins = markers(null);

        for (DiscoverListingResponse card : cards) {
            DiscoverMarker pin = pins.stream()
                    .filter(m -> m.id().equals(card.id()))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("no marker for listing " + card.id()));
            assertThat(pin.commercialSubtype())
                    .as("marker vs card subtype for listing %s", card.id())
                    .isEqualTo(card.commercialSubtype());
        }

        // Non-vacuous: at least one compared value is genuinely non-null, so the loop above is not
        // trivially satisfied by every listing having no subtype at all.
        assertThat(cards).anyMatch(c -> c.commercialSubtype() != null);
    }

    @Test
    @DisplayName("AC (no marker row multiplication): the LEFT JOIN added for the marker subtype "
            + "cannot duplicate a pin, so the counts still match the distinct id count")
    void markers_leftJoinDoesNotMultiplyRows() {
        DiscoverMarkersResponse response = rawMarkers(null);

        List<String> ids = response.markers().stream().map(DiscoverMarker::id).toList();
        assertThat(ids).doesNotHaveDuplicates().hasSize(6);
        // returnedElements and totalFilteredElements derive from the fetched row count and a
        // COUNT query that does NOT carry the join. A join that multiplied rows would
        // desynchronise them from the distinct-id count above.
        assertThat(response.returnedElements()).isEqualTo(6);
        assertThat(response.totalFilteredElements()).isEqualTo(6L);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Contradictory request
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Documented behaviour: a subtype filter combined with a non-commercial property "
            + "type returns ZERO, rather than silently ignoring the subtype")
    void filter_contradictoryRequest_returnsZero_ratherThanWideningToEverything() {
        List<DiscoverListingResponse> result =
                listings(List.of("SHOP"), List.of("apartment"));

        assertThat(result)
                .as("ignoring the subtype here would return the city's whole apartment inventory "
                        + "presented as though it matched a Shop filter")
                .isEmpty();

        // Negative control: the apartment IS returned when the contradictory subtype is dropped,
        // so the empty result above is the subtype filter's doing and not a broken fixture.
        assertThat(idsOf(listings(null, List.of("apartment"))))
                .containsExactly(APARTMENT_ID.toString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deterministic rejection of unknown values
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC: an unknown subtype fails deterministically with 400 on BOTH endpoints, rather "
            + "than returning a silently empty page")
    void unknownSubtype_rejectedWith400_onBothEndpoints() {
        assertThatThrownBy(() -> listings(List.of("RESTAURANT")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> markerIds(List.of("RESTAURANT")))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("AC: BUILDING/WAREHOUSE/LAND are rejected as Discover subtypes — they are "
            + "addressable through their own property types, not through this filter")
    void nonAmbiguousSubtypes_areRejected() {
        for (String value : List.of("BUILDING", "WAREHOUSE", "LAND")) {
            assertThatThrownBy(() -> listings(List.of(value)))
                    .as("%s is not one of the two values property_type='commercial' is ambiguous "
                            + "between, so it must not be a valid Discover subtype filter", value)
                    .isInstanceOf(ResponseStatusException.class);
        }
    }

    @Test
    @DisplayName("AC: a present-but-empty param and an over-long list are both rejected with 400")
    void malformedSubtypeParams_rejectedWith400() {
        assertThatThrownBy(() -> listings(List.of()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> listings(List.of("SHOP", "OFFICE", "SHOP")))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private List<DiscoverListingResponse> listings(List<String> commercialSubtypes) {
        return listings(commercialSubtypes, null);
    }

    private List<DiscoverListingResponse> listings(List<String> commercialSubtypes,
                                                    List<String> propertyTypes) {
        DiscoverListingsPage page = rawListings(commercialSubtypes, propertyTypes).getBody();
        assertThat(page).isNotNull();
        return page.content();
    }

    private ResponseEntity<DiscoverListingsPage> rawListings(List<String> commercialSubtypes) {
        return rawListings(commercialSubtypes, null);
    }

    private ResponseEntity<DiscoverListingsPage> rawListings(List<String> commercialSubtypes,
                                                              List<String> propertyTypes) {
        return listingsController.getListings(
                CITY_SLUG, propertyTypes, commercialSubtypes, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                0, 50, false, null, null, null, null, null);
    }

    private DiscoverMarkersResponse rawMarkers(List<String> commercialSubtypes) {
        ResponseEntity<DiscoverMarkersResponse> response = markersController.getMarkers(
                CITY_SLUG, null, commercialSubtypes, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null);
        DiscoverMarkersResponse body = response.getBody();
        assertThat(body).isNotNull();
        return body;
    }

    private List<DiscoverMarker> markers(List<String> commercialSubtypes) {
        return rawMarkers(commercialSubtypes).markers();
    }

    private List<String> markerIds(List<String> commercialSubtypes) {
        return markers(commercialSubtypes).stream().map(DiscoverMarker::id).toList();
    }

    private static String markerSubtypeOf(List<DiscoverMarker> markers, UUID id) {
        return markers.stream()
                .filter(m -> id.toString().equals(m.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture marker " + id + " not returned"))
                .commercialSubtype();
    }

    private static List<String> idsOf(List<DiscoverListingResponse> listings) {
        return listings.stream().map(DiscoverListingResponse::id).toList();
    }

    private static String subtypeOf(List<DiscoverListingResponse> listings, UUID id) {
        return listings.stream()
                .filter(l -> id.toString().equals(l.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id + " not returned"))
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
                AREA_KEY, cityId, "Commercial Area", CENTRE_LAT, CENTRE_LON,
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
