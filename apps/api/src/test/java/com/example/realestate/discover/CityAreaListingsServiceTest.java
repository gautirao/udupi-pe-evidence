package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CityAreaListingsService}, focused on the #1726 exact-pin fix:
 * {@code AreaListingCard.latitude/longitude} must always be coarsened, regardless of the
 * caller's authentication state — this is a fully public (permitAll) browse endpoint with no
 * per-listing ownership concept, unlike the single-listing detail page.
 */
@ExtendWith(MockitoExtension.class)
class CityAreaListingsServiceTest {

    @Mock
    private JdbcOperations jdbc;

    private CityAreaListingsService service;

    @BeforeEach
    void setUp() {
        service = new CityAreaListingsService(jdbc);
    }

    /** Stubs jdbc.query(sql, RowCallbackHandler, params) to drive the handler over one SALE row. */
    private void stubSingleRow(String areaKey, String areaName, UUID listingId,
                                Double latitude, Double longitude) throws Exception {
        stubSingleRow(areaKey, areaName, listingId, latitude, longitude,
                "sale", 5_000_000L, null);
    }

    /**
     * Stubs jdbc.query(sql, RowCallbackHandler, params) to drive the handler over one row with
     * an explicit listingPurpose, price_paise and monthly_rent (issue #2051 — the price source
     * is selected by listingPurpose, not by which column is non-null, so callers can set BOTH
     * to exercise AC14's mixed-column case).
     */
    private void stubSingleRow(String areaKey, String areaName, UUID listingId,
                                Double latitude, Double longitude,
                                String listingPurpose, Long pricePaise, Long monthlyRent) throws Exception {
        when(jdbc.queryForObject(anyString(), org.mockito.ArgumentMatchers.eq(Integer.class),
                org.mockito.ArgumentMatchers.<Object>any()))
                .thenReturn(1);

        doAnswer(inv -> {
                    RowCallbackHandler rch = inv.getArgument(1);
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getString("area_key")).thenReturn(areaKey);
                    when(rs.getString("area_name")).thenReturn(areaName);
                    when(rs.getString("listing_id")).thenReturn(listingId.toString());
                    when(rs.getObject("price_paise")).thenReturn(pricePaise);
                    if (pricePaise != null) {
                        when(rs.getLong("price_paise")).thenReturn(pricePaise);
                    }
                    when(rs.getString("property_type")).thenReturn("house");
                    when(rs.getString("locality")).thenReturn("Malpe");
                    when(rs.getString("primary_image_url")).thenReturn(null);
                    when(rs.getString("listing_purpose")).thenReturn(listingPurpose);
                    when(rs.getObject("bedrooms")).thenReturn(3);
                    when(rs.getInt("bedrooms")).thenReturn(3);
                    when(rs.getString("title")).thenReturn("Nice House");
                    when(rs.getObject("bathrooms")).thenReturn(2);
                    when(rs.getInt("bathrooms")).thenReturn(2);
                    when(rs.getObject("built_area")).thenReturn(1200.0);
                    when(rs.getDouble("built_area")).thenReturn(1200.0);
                    when(rs.getString("built_area_unit")).thenReturn("sq ft");
                    when(rs.getObject("land_area")).thenReturn(null);
                    when(rs.getString("land_area_unit")).thenReturn(null);
                    // #2516: the card's totalFloors is no longer read straight off a
                    // `total_floors` column. It is resolved by CommercialFactAuthority from
                    // BOTH stored copies, so the mock answers the alias contract the SQL
                    // actually exposes. The old single-column stub is gone rather than kept
                    // alongside: under STRICT_STUBS a stub nothing calls is itself a failure,
                    // which is the one useful thing this mock can tell us about the change.
                    //
                    // What this mock CANNOT tell us, and why the real proof of #2516/#2506
                    // lives in CityAreaListingsCommercialFacts2516IT: a stub returns whatever
                    // it is told for a column name, so it cannot distinguish "the query
                    // SELECTed this column" from "the query forgot to" — and it cannot
                    // reproduce the pgjdbc `numeric` abort at all, because that throw keys on
                    // the column's TYPE, which a mock has no notion of.
                    when(rs.getObject("typed_total_floors", Integer.class)).thenReturn(null);
                    when(rs.getObject("legacy_total_floors", Integer.class)).thenReturn(null);
                    when(rs.getObject("parking_count")).thenReturn(null);
                    when(rs.getString("furnishing_status")).thenReturn(null);
                    when(rs.getTimestamp("created_at")).thenReturn(Timestamp.from(Instant.now()));
                    when(rs.getString("trust_tier")).thenReturn("A");
                    when(rs.getObject("latitude")).thenReturn(latitude);
                    if (latitude != null) {
                        when(rs.getDouble("latitude")).thenReturn(latitude);
                    }
                    when(rs.getObject("longitude")).thenReturn(longitude);
                    if (longitude != null) {
                        when(rs.getDouble("longitude")).thenReturn(longitude);
                    }
                    when(rs.getObject("monthly_rent")).thenReturn(monthlyRent);
                    if (monthlyRent != null) {
                        when(rs.getLong("monthly_rent")).thenReturn(monthlyRent);
                    }
                    rch.processRow(rs);
                    return null;
                }).when(jdbc).query(anyString(), any(RowCallbackHandler.class), any(Object[].class));
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: AreaListingCard lat/lng always coarsened for anonymous callers")
    void getAreaListings_anonymous_coarsensLatLng() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);

        AreaListingCard card = resp.areas().get(0).listings().get(0);
        assertThat(card.latitude()).isEqualTo(13.34);
        assertThat(card.longitude()).isEqualTo(74.74);
        assertThat(card.latitude()).isNotEqualTo(13.34091);
        assertThat(card.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: AreaListingCard lat/lng coarsened even for authenticated callers (no ownership concept on a browse list)")
    void getAreaListings_authenticated_stillCoarsensLatLng() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        AreaListingCard card = resp.areas().get(0).listings().get(0);
        assertThat(card.latitude()).isEqualTo(13.34);
        assertThat(card.longitude()).isEqualTo(74.74);
        // Price projection is still auth-aware (unaffected by the coordinate fix)
        assertThat(card.pricePaise()).isEqualTo(5_000_000L);
        assertThat(card.priceBand()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: null lat/lng stays null (no (0,0) marker)")
    void getAreaListings_nullCoords_stayNull() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, null, null);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);

        AreaListingCard card = resp.areas().get(0).listings().get(0);
        assertThat(card.latitude()).isNull();
        assertThat(card.longitude()).isNull();
    }

    // ── #2023 (BLOCKING review fix): readyToMove now filters this endpoint too,
    // consistent with markers/navigation-counts/authenticated Browse-all via
    // DiscoverListingPredicateBuilder (possession_status = 'READY'). ──────────

    @Test
    @org.junit.jupiter.api.DisplayName("#2023: readyToMove=true adds the possession_status = 'READY' predicate to the SQL")
    void getAreaListings_readyToMoveTrue_addsPossessionStatusPredicate() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, null, null);

        service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, true, null, false);

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).contains("pl.possession_status = 'READY'");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2023: readyToMove absent (null) does NOT add the possession_status predicate")
    void getAreaListings_readyToMoveAbsent_noPossessionStatusPredicate() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, null, null);

        service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).doesNotContain("possession_status");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2023: readyToMove=false does NOT add the possession_status predicate")
    void getAreaListings_readyToMoveFalse_noPossessionStatusPredicate() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, null, null);

        service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, false, null, false);

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).doesNotContain("possession_status");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1567: trustBadge is the public-safe projection of trust_tier ('A' -> 'verified'), "
            + "identical for anonymous and authenticated callers, never the raw letter grade")
    void getAreaListings_trustBadge_projectedAndIdenticalRegardlessOfAuth() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);

        CityAreaListingsResponse anonResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse authedResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        AreaListingCard anonCard = anonResp.areas().get(0).listings().get(0);
        AreaListingCard authedCard = authedResp.areas().get(0).listings().get(0);

        // stubSingleRow sets trust_tier="A" — the projected public badge must be "verified",
        // never the raw letter "A", and must be identical for anon and authed callers.
        assertThat(anonCard.trustBadge()).isEqualTo("verified");
        assertThat(authedCard.trustBadge()).isEqualTo("verified");
        assertThat(anonCard.trustBadge()).isEqualTo(authedCard.trustBadge());
    }

    // ── #2051 AC16: sale x rent x lease crossed with anon x authed (6 combinations) ──

    private static final Long SALE_PRICE_PAISE = 6_000_000_00L; // ₹60L → "₹50L–1Cr" band
    private static final Long RENT_MONTHLY_RENT = 25_000L;      // ₹25,000/mo → "₹20–35K" band

    static Stream<Arguments> saleRentLeaseAnonAuthedMatrix() {
        return Stream.of(
                // purpose, isAuthenticated, expectedPricePaise, expectedPriceBand, expectedRentRupees, expectedRentBand
                Arguments.of("sale", false, null, "₹50L–1Cr", null, null),
                Arguments.of("sale", true, SALE_PRICE_PAISE, null, null, null),
                Arguments.of("rent", false, null, null, null, "₹20–35K"),
                Arguments.of("rent", true, null, null, RENT_MONTHLY_RENT, null),
                Arguments.of("lease", false, null, null, null, "₹20–35K"),
                Arguments.of("lease", true, null, null, RENT_MONTHLY_RENT, null)
        );
    }

    @ParameterizedTest(name = "purpose={0} authenticated={1}")
    @MethodSource("saleRentLeaseAnonAuthedMatrix")
    @org.junit.jupiter.api.DisplayName("#2051 AC16: full sale x rent x lease x anon x authed contract matrix")
    void getAreaListings_saleRentLeaseAnonAuthedMatrix(String purpose, boolean isAuthenticated,
                                                        Long expectedPricePaise, String expectedPriceBand,
                                                        Long expectedRentRupees, String expectedRentBand) throws Exception {
        UUID listingId = UUID.randomUUID();
        // Sale rows carry price_paise only; rent/lease rows carry monthly_rent only — the
        // mixed-column case (AC14) is covered separately below.
        Long pricePaise = "sale".equals(purpose) ? SALE_PRICE_PAISE : null;
        Long monthlyRent = "sale".equals(purpose) ? null : RENT_MONTHLY_RENT;
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215,
                purpose, pricePaise, monthlyRent);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, isAuthenticated);

        AreaListingCard card = resp.areas().get(0).listings().get(0);
        assertThat(card.listingPurpose()).isEqualTo(purpose);
        assertThat(card.pricePaise()).isEqualTo(expectedPricePaise);
        assertThat(card.priceBand()).isEqualTo(expectedPriceBand);
        assertThat(card.monthlyRentRupees()).isEqualTo(expectedRentRupees);
        assertThat(card.monthlyRentBand()).isEqualTo(expectedRentBand);
    }

    // ── #2051 AC14: rent row that ALSO carries a non-null price_paise must NOT render a ──
    // ── sale-derived priceBand/pricePaise — the source is selected by listing_purpose ────

    @Test
    @org.junit.jupiter.api.DisplayName("#2051 AC14: rent row with BOTH monthly_rent AND non-null price_paise "
            + "renders the rent value, never a sale-derived priceBand")
    void getAreaListings_rentRowWithMixedPriceColumns_neverRendersSaleBand() throws Exception {
        UUID listingId = UUID.randomUUID();
        // Both columns populated on a 'rent' row — nothing in the schema prevents this (R11).
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215,
                "rent", SALE_PRICE_PAISE, RENT_MONTHLY_RENT);

        CityAreaListingsResponse anonResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse authedResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        AreaListingCard anonCard = anonResp.areas().get(0).listings().get(0);
        AreaListingCard authedCard = authedResp.areas().get(0).listings().get(0);

        // Anon: rent band present, NEVER a sale priceBand despite the non-null price_paise.
        assertThat(anonCard.monthlyRentBand()).isEqualTo("₹20–35K");
        assertThat(anonCard.priceBand()).isNull();
        assertThat(anonCard.pricePaise()).isNull();
        assertThat(anonCard.monthlyRentRupees()).isNull();

        // Authed: exact rent present, NEVER the sale pricePaise despite the non-null column.
        assertThat(authedCard.monthlyRentRupees()).isEqualTo(RENT_MONTHLY_RENT);
        assertThat(authedCard.pricePaise()).isNull();
        assertThat(authedCard.priceBand()).isNull();
        assertThat(authedCard.monthlyRentBand()).isNull();
    }

    // ── #2051 AC5/R16: rent monthly_rent NULL / 0 / negative — never fabricated into a band ──

    @Test
    @org.junit.jupiter.api.DisplayName("#2051 AC4: rent listing with NULL monthly_rent — no rent field populated for either caller")
    void getAreaListings_rentNullMonthlyRent_noRentFieldsPopulated() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215,
                "rent", null, null);

        CityAreaListingsResponse anonResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse authedResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        assertThat(anonResp.areas().get(0).listings().get(0).monthlyRentBand()).isNull();
        assertThat(anonResp.areas().get(0).listings().get(0).monthlyRentRupees()).isNull();
        assertThat(authedResp.areas().get(0).listings().get(0).monthlyRentRupees()).isNull();
        assertThat(authedResp.areas().get(0).listings().get(0).monthlyRentBand()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2051 AC5/R16: rent monthly_rent = 0 — neither rent field populated for "
            + "either caller; anon must NOT get '₹0–10K' and authed must NOT get an exact 0")
    void getAreaListings_rentZeroMonthlyRent_neitherRentFieldPopulated() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215,
                "rent", null, 0L);

        CityAreaListingsResponse anonResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse authedResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        AreaListingCard anonCard = anonResp.areas().get(0).listings().get(0);
        assertThat(anonCard.monthlyRentBand()).isNull();
        assertThat(anonCard.monthlyRentRupees()).isNull();

        AreaListingCard authedCard = authedResp.areas().get(0).listings().get(0);
        assertThat(authedCard.monthlyRentRupees()).isNull();
        assertThat(authedCard.monthlyRentBand()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2051 AC5/R16: rent monthly_rent negative — neither rent field populated for either caller")
    void getAreaListings_rentNegativeMonthlyRent_neitherRentFieldPopulated() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215,
                "rent", null, -1000L);

        CityAreaListingsResponse anonResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse authedResp = service.getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, true);

        AreaListingCard anonCard = anonResp.areas().get(0).listings().get(0);
        assertThat(anonCard.monthlyRentBand()).isNull();
        assertThat(anonCard.monthlyRentRupees()).isNull();

        AreaListingCard authedCard = authedResp.areas().get(0).listings().get(0);
        assertThat(authedCard.monthlyRentRupees()).isNull();
        assertThat(authedCard.monthlyRentBand()).isNull();
    }

    // ── #2015: bbox-only "Search this area" viewport path (areaKeys absent, bbox present) ──

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: areaKeys=null + bbox present routes to the bbox-only path; "
            + "response groups by the row's own area_key and lat/lng stays coarsened")
    void getAreaListings_bboxOnly_areaKeysNull_routesToBboxOnlyPath_coarsensLatLng() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", null, null, null, null, null, null, null, null, null, bbox, false);

        assertThat(resp.areas()).hasSize(1);
        AreaListingsEntry entry = resp.areas().get(0);
        assertThat(entry.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(entry.areaName()).isEqualTo("Malpe");
        assertThat(entry.unknown()).isNull();
        AreaListingCard card = entry.listings().get(0);
        assertThat(card.latitude()).isEqualTo(13.34);
        assertThat(card.longitude()).isEqualTo(74.74);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: empty areaKeys list (not null) with bbox present also routes to the bbox-only path")
    void getAreaListings_bboxOnly_emptyAreaKeysList_alsoRoutesToBboxOnlyPath() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of(), null, null, null, null, null, null, null, null, bbox, false);

        assertThat(resp.areas()).hasSize(1);
        assertThat(resp.limitPerArea()).isEqualTo(20);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: blank-only areaKeys entries (e.g. areaKeys= with no value) with bbox present "
            + "also route to the bbox-only path, same as null/empty")
    void getAreaListings_bboxOnly_blankOnlyAreaKeysList_alsoRoutesToBboxOnlyPath() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of("", "  "), null, null, null, null, null, null, null, null, bbox, false);

        assertThat(resp.areas()).hasSize(1);
        assertThat(resp.limitPerArea()).isEqualTo(20);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: bbox-only SQL filters property_listings directly by the bbox rectangle "
            + "(no areaKeys IN-clause) and binds the global BBOX_ONLY_MAX_RESULTS cap as the LIMIT, "
            + "in west/south/east/north order")
    void getAreaListings_bboxOnly_sqlUsesBboxPredicateAndBindsGlobalCapAsLimit() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        // Bbox(south, west, north, east) — see DiscoverListingPredicateBuilder.Bbox.
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        service.getAreaListings(
                "udupi", null, null, null, null, null, null, null, null, null, bbox, false);

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.ArgumentCaptor<Object[]> paramsCaptor = org.mockito.ArgumentCaptor.forClass(Object[].class);
        org.mockito.Mockito.verify(jdbc)
                .query(sqlCaptor.capture(), any(RowCallbackHandler.class), paramsCaptor.capture());

        assertThat(sqlCaptor.getValue()).contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
        assertThat(sqlCaptor.getValue()).doesNotContain(" IN (");

        // No optional filters set here: [city, bbox.west, bbox.south, bbox.east, bbox.north, LIMIT].
        Object[] params = paramsCaptor.getValue();
        assertThat(params).containsExactly("udupi", 74.70, 13.30, 74.80, 13.40, 20);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: bbox-only response's limitPerArea carries the global cap "
            + "(BBOX_ONLY_MAX_RESULTS=20), not a per-area limit — even when a per-area limitPerArea is supplied")
    void getAreaListings_bboxOnly_limitPerAreaFieldCarriesGlobalCapRegardlessOfRawLimit() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        // limitPerArea=3 has no effect on the bbox-only path — the global cap always wins.
        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", null, 3, null, null, null, null, null, null, null, bbox, false);

        assertThat(resp.limitPerArea()).isEqualTo(20);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#2015: bbox-only path unconditionally excludes agricultural_land, "
            + "same as the area-grouped path")
    void getAreaListings_bboxOnly_excludesAgriculturalLand() throws Exception {
        UUID listingId = UUID.randomUUID();
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", listingId, 13.34091, 74.74215);
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        service.getAreaListings(
                "udupi", null, null, null, null, null, null, null, null, null, bbox, false);

        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).containsIgnoringCase("agricultural_land");
    }

    // ── #2836: listingPurpose reaches SQL as a BOUND parameter on both query paths ──────────────
    // Replaces the legacy issue-1956-pr4-price-auth-contract.spec.ts purpose-filter row (S2-9).
    // Before this, no test captured the SQL for a non-null purpose: deleting either
    // `pl.listing_purpose = ?` clause (CityAreaListingsService area path and bbox-only path)
    // left the whole suite green. Each path is a separate hand-built SQL shape, so each has its own arm.

    private static final String PURPOSE_CLAUSE = "AND pl.listing_purpose = ?";

    private record CapturedQuery(String sql, Object[] params) { }

    /** Drives one single-row query on the requested path and captures the SQL + bound params. */
    private CapturedQuery captureQuery(boolean bboxPath, String listingPurpose) throws Exception {
        stubSingleRow("IN|KA|Udupi|Malpe", "Malpe", UUID.randomUUID(), 13.34091, 74.74215);
        if (bboxPath) {
            DiscoverListingPredicateBuilder.Bbox bbox =
                    new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);
            service.getAreaListings(
                    "udupi", null, null, null, null, null, null, null, listingPurpose, null, bbox, false);
        } else {
            service.getAreaListings(
                    "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null,
                    listingPurpose, null, null, false);
        }
        org.mockito.ArgumentCaptor<String> sqlCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.ArgumentCaptor<Object[]> paramsCaptor = org.mockito.ArgumentCaptor.forClass(Object[].class);
        org.mockito.Mockito.verify(jdbc)
                .query(sqlCaptor.capture(), any(RowCallbackHandler.class), paramsCaptor.capture());
        return new CapturedQuery(sqlCaptor.getValue(), paramsCaptor.getValue());
    }

    /**
     * The COMPLETE expected positional bind sequence for {@link #captureQuery}'s fixed request
     * (city "udupi", one areaKey / the Malpe bbox, no other filters). JDBC binds {@code ?}
     * left-to-right, so slot order IS the contract, and the two paths differ:
     * <ul>
     *   <li>area path: filters live in the LEFT JOIN ON clause and bind FIRST, then city, areaKey, rn limit
     *       (DEFAULT_LIMIT = 5): {@code [purpose?, city, areaKey, 5]}</li>
     *   <li>bbox-only path: city leads the WHERE clause, then the filters, then the global cap (20):
     *       {@code [city, west, south, east, north, purpose?, 20]}</li>
     * </ul>
     * Written out literally (not derived from the service) so it is an independent oracle.
     */
    private static Object[] expectedParams(boolean bboxPath, String boundPurpose) {
        List<Object> p = new java.util.ArrayList<>();
        if (bboxPath) {
            p.add("udupi");
            p.add(74.70);
            p.add(13.30);
            p.add(74.80);
            p.add(13.40);
            if (boundPurpose != null) {
                p.add(boundPurpose);
            }
            p.add(20);
        } else {
            if (boundPurpose != null) {
                p.add(boundPurpose);
            }
            p.add("udupi");
            p.add("IN|KA|Udupi|Malpe");
            p.add(5);
        }
        return p.toArray();
    }

    private static long countPlaceholders(String sql) {
        return sql.chars().filter(c -> c == '?').count();
    }

    /** Asserts the complete bind sequence, and that every {@code ?} has exactly one bind. */
    private static void assertBindSequence(CapturedQuery q, boolean bboxPath, String boundPurpose) {
        assertThat(q.params()).containsExactly(expectedParams(bboxPath, boundPurpose));
        assertThat(countPlaceholders(q.sql())).isEqualTo(q.params().length);
    }

    /** Asserts the purpose value sits at the slot of the purpose placeholder itself. */
    private static void assertPurposeBoundAtItsPlaceholder(CapturedQuery q, String boundPurpose) {
        int clauseAt = q.sql().indexOf(PURPOSE_CLAUSE);
        assertThat(clauseAt).isGreaterThanOrEqualTo(0);
        // the '?' belonging to the clause is the last char of PURPOSE_CLAUSE
        int placeholderIndex = (int) countPlaceholders(q.sql().substring(0, clauseAt + PURPOSE_CLAUSE.length())) - 1;
        assertThat(q.params()[placeholderIndex]).isEqualTo(boundPurpose);
    }

    @ParameterizedTest(name = "[{index}] bboxPath={0}")
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.DisplayName("#2836 S2-9: listingPurpose='rent' adds the purpose clause and BINDS 'rent' at the purpose "
            + "placeholder's own slot (complete positional sequence pinned)")
    void getAreaListings_rentPurpose_addsClauseAndBindsValue(boolean bboxPath) throws Exception {
        CapturedQuery q = captureQuery(bboxPath, "rent");

        assertThat(q.sql()).contains(PURPOSE_CLAUSE);
        // The value is a bound parameter, not spliced into the statement text.
        assertThat(q.sql()).doesNotContain("'rent'");
        assertBindSequence(q, bboxPath, "rent");
        assertPurposeBoundAtItsPlaceholder(q, "rent");
    }

    @ParameterizedTest(name = "[{index}] bboxPath={0}")
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.DisplayName("#2836 S2-9: the bound value follows the request ('sale' binds 'sale', not a fixed 'rent')")
    void getAreaListings_salePurpose_bindsSaleNotRent(boolean bboxPath) throws Exception {
        CapturedQuery q = captureQuery(bboxPath, "sale");

        assertThat(q.sql()).contains(PURPOSE_CLAUSE);
        assertThat(q.params()).doesNotContain("rent");
        assertBindSequence(q, bboxPath, "sale");
        assertPurposeBoundAtItsPlaceholder(q, "sale");
    }

    @ParameterizedTest(name = "[{index}] bboxPath={0}")
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.DisplayName("#2836 S2-9: a padded purpose is trimmed before binding")
    void getAreaListings_paddedPurpose_boundTrimmed(boolean bboxPath) throws Exception {
        CapturedQuery q = captureQuery(bboxPath, "  rent  ");

        assertThat(q.sql()).contains(PURPOSE_CLAUSE);
        assertThat(q.params()).doesNotContain("  rent  ");
        assertBindSequence(q, bboxPath, "rent");
        assertPurposeBoundAtItsPlaceholder(q, "rent");
    }

    @ParameterizedTest(name = "[{index}] bboxPath={0}")
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.DisplayName("#2836 S2-9: null purpose adds no purpose clause and binds no purpose value")
    void getAreaListings_nullPurpose_noClauseNoBind(boolean bboxPath) throws Exception {
        CapturedQuery q = captureQuery(bboxPath, null);

        assertThat(q.sql()).doesNotContain(PURPOSE_CLAUSE);
        assertThat(q.params()).doesNotContain("rent", "sale");
        assertBindSequence(q, bboxPath, null);
    }

    @ParameterizedTest(name = "[{index}] bboxPath={0}")
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.DisplayName("#2836 S2-9: blank purpose is treated as absent (no clause, nothing bound)")
    void getAreaListings_blankPurpose_noClauseNoBind(boolean bboxPath) throws Exception {
        CapturedQuery q = captureQuery(bboxPath, "   ");

        assertThat(q.sql()).doesNotContain(PURPOSE_CLAUSE);
        assertThat(q.params()).doesNotContain("rent", "sale", "   ", "");
        assertBindSequence(q, bboxPath, null);
    }
}
