package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

/**
 * Unit tests for {@link DiscoverAgriMapListingsService}.
 *
 * Verifies: filtering, validation, bbox handling, PII exclusion, and edge cases.
 */
@ExtendWith(MockitoExtension.class)
class DiscoverAgriMapListingsServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private DiscoverAgriMapListingsService service;

    @BeforeEach
    void setUp() {
        service = new DiscoverAgriMapListingsService(jdbcOperations);
    }

    // ── valid request: returns only agri listings ─────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_returnsAgriListingsForCity() throws SQLException {
        AgriMapListingItem item = agriItem("id-1", "2.5-Acre Farm, Kundapur", "IN|KA|Udupi|Area1", 13.3, 74.7,
                "agricultural_land", "Kundapur", "{\"type\":\"Polygon\",...}",
                new BigDecimal("2.5"), "acres", new BigDecimal("2.5"), 5000000L);

        stubQuery(List.of(item));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.city()).isEqualTo("udupi");
        assertThat(resp.listings()).hasSize(1);
        assertThat(resp.truncated()).isFalse();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.id()).isEqualTo("id-1");
        assertThat(returned.propertyType()).isEqualTo("agricultural_land");
    }

    // ── city slug is normalised to lowercase in response ──────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_cityNormalisedToLowercase() throws SQLException {
        stubQuery(List.of());

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "UDUPI", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── 400: blank citySlug ────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_blankCity_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "  ", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    @Test
    void findAgriMapListings_nullCity_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                null, List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── 400: empty areaKeys ────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_emptyAreaKeys_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", List.of(), Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    @Test
    void findAgriMapListings_nullAreaKeys_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", null, Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── 400: areaKeys exceeds maximum (> 50) ──────────────────────────────────

    @Test
    void findAgriMapListings_tooManyAreaKeys_throws400() {
        List<String> bigList = java.util.Collections.nCopies(DiscoverAgriMapListingsService.MAX_AREA_KEYS + 1, "key");
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", bigList, Optional.empty(), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── exactly MAX_AREA_KEYS is allowed ──────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_exactlyMaxAreaKeys_doesNotThrow() throws SQLException {
        stubQuery(List.of());
        List<String> maxList = java.util.Collections.nCopies(DiscoverAgriMapListingsService.MAX_AREA_KEYS, "key");

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", maxList, Optional.empty(), true, null);

        assertThat(resp.listings()).isEmpty();
    }

    // ── 400: malformed bbox ────────────────────────────────────────────────────

    @Test
    void findAgriMapListings_malformedBbox_throws400() {
        assertThatThrownBy(() -> service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.of("not,a,valid"), true, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(BAD_REQUEST));
    }

    // ── valid bbox: accepted without error ────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_validBbox_accepted() throws SQLException {
        stubQuery(List.of());

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"),
                Optional.of("13.0,74.0,14.0,75.0"), true, null); // south,west,north,east

        assertThat(resp.listings()).isEmpty();
    }

    // ── empty result: not an error ─────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_noMatchingListings_returnsEmpty() throws SQLException {
        stubQuery(List.of());

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings()).isEmpty();
        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── boundary GeoJSON present for agri listing with polygon ────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_agriListingWithBoundary_boundaryGeoJsonPopulated() throws SQLException {
        AgriMapListingItem item = agriItem("id-2", null, "IN|KA|Udupi|Area1", 13.3, 74.7,
                "agricultural_land", "Koteshwara", "{\"type\":\"Polygon\"}",
                null, null, null, null);

        stubQuery(List.of(item));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings().get(0).boundaryGeoJson()).isEqualTo("{\"type\":\"Polygon\"}");
    }

    // ── null boundary GeoJSON: included as null (omitted by @JsonInclude NON_NULL) ─

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_listingWithoutBoundary_boundaryGeoJsonNull() throws SQLException {
        AgriMapListingItem item = agriItem("id-3", null, "IN|KA|Udupi|Area1", 13.3, 74.7,
                "agricultural_land", "Koteshwara", null, // no boundary
                null, null, null, null);

        stubQuery(List.of(item));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings().get(0).boundaryGeoJson()).isNull();
    }

    // ── response fields: no PII fields on AgriMapListingItem ─────────────────

    @Test
    void agriMapListingItem_hasNoSellerOrAdminFields() {
        // Verify the record has only the declared public-safe fields
        // by checking that known-safe fields exist and no PII fields exist
        AgriMapListingItem item = new AgriMapListingItem(
                "id", "Test Agri Title", "area", 1.0, 2.0, "agricultural_land", "loc",
                "{}", new BigDecimal("1.0"), "acres", new BigDecimal("1.0"), 100L, "sale",
                "borewell", "wetland", true, false);

        // Safe fields present
        assertThat(item.id()).isNotNull();
        assertThat(item.title()).isNotNull();
        assertThat(item.areaKey()).isNotNull();
        assertThat(item.latitude()).isNotNull();
        assertThat(item.longitude()).isNotNull();
        assertThat(item.propertyType()).isNotNull();
        assertThat(item.pricePaise()).isNotNull();

        // Record component count — must be exactly 17 (no extra fields)
        assertThat(AgriMapListingItem.class.getRecordComponents()).hasSize(17);

        // Verify no fields named after PII or internal fields
        var fieldNames = java.util.Arrays.stream(AgriMapListingItem.class.getRecordComponents())
                .map(c -> c.getName().toLowerCase())
                .toList();
        assertThat(fieldNames).doesNotContain("seller", "owner", "phone", "email",
                "rejectionreason", "internalnotes", "adminstatus",
                "archivedat", "isduplicate", "status");
    }

    // ── multiple areaKeys: results for all matching keys ─────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void findAgriMapListings_multipleAreaKeys_returnsAllMatchingListings() throws SQLException {
        AgriMapListingItem item1 = agriItem("id-1", null, "IN|KA|Udupi|Area1", 13.3, 74.7,
                "agricultural_land", "Area1", null, null, null, null, null);
        AgriMapListingItem item2 = agriItem("id-2", null, "IN|KA|Udupi|Area2", 13.4, 74.8,
                "agricultural_land", "Area2", null, null, null, null, null);

        stubQuery(List.of(item1, item2));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi",
                List.of("IN|KA|Udupi|Area1", "IN|KA|Udupi|Area2"),
                Optional.empty(), true, null);

        assertThat(resp.listings()).hasSize(2);
        assertThat(resp.listings().stream().map(AgriMapListingItem::id))
                .containsExactlyInAnyOrder("id-1", "id-2");
    }

    // ── #1460: LIMIT N+1 truncation ──────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1460 Test A: under-cap — truncated=false, all rows returned")
    void findAgriMapListings_underCap_notTruncated() throws SQLException {
        // Return MAX_LISTINGS_PER_REQUEST - 1 items (under the cap)
        int count = DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST - 1;
        List<AgriMapListingItem> items = buildItems(count);
        stubQuery(items);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.truncated()).isFalse();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        assertThat(resp.listings()).hasSize(count);
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1460 Test B: exactly-cap — truncated=false, all MAX rows returned")
    void findAgriMapListings_exactlyCap_notTruncated() throws SQLException {
        // JDBC returns exactly MAX_LISTINGS_PER_REQUEST rows — not truncated
        int count = DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST;
        List<AgriMapListingItem> items = buildItems(count);
        stubQuery(items);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.truncated()).isFalse();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        assertThat(resp.listings()).hasSize(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1460 Test C: over-cap (N+1 triggered) — truncated=true, exactly MAX rows returned, overflow row stripped")
    void findAgriMapListings_overCap_truncatedAndOverflowRowStripped() throws SQLException {
        // JDBC returns MAX_LISTINGS_PER_REQUEST + 1 rows (the LIMIT N+1 sentinel)
        int count = DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST + 1;
        List<AgriMapListingItem> items = buildItems(count);
        stubQuery(items);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.truncated()).isTrue();
        assertThat(resp.limit()).isEqualTo(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        // overflow row must be stripped — exactly MAX, not MAX+1
        assertThat(resp.listings()).hasSize(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
        // last item should be the 250th (index 249), not the 251st (index 250)
        assertThat(resp.listings().get(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST - 1).id())
                .isEqualTo("item-" + (DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST - 1));
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1460 Test D: anon + over-cap — truncation applied before anon coarsening; return exactly MAX coarsened items")
    void findAgriMapListings_anonOverCap_truncatesFirstThenCoarsens() throws SQLException {
        // Build MAX+1 items with exact-precision coords and a price
        int count = DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST + 1;
        List<AgriMapListingItem> items = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            items.add(agriItem("item-" + i, "Farm " + i, "IN|KA|Udupi|Area1",
                    13.34091 + i * 0.001, 74.74215 + i * 0.001,
                    "agricultural_land", "Shirva", null,
                    new BigDecimal("1.0"), "acres", new BigDecimal("1.0"), 5000000L));
        }
        stubQuery(items);

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), false, null);

        // Truncation: exactly MAX items (not MAX+1)
        assertThat(resp.truncated()).isTrue();
        assertThat(resp.listings()).hasSize(DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);

        // Anon coarsening applied to each of the MAX retained items: pricePaise=null, lat/lng 2dp
        AgriMapListingItem first = resp.listings().get(0);
        assertThat(first.pricePaise()).isNull();
        assertThat(String.valueOf(first.latitude())).matches("-?\\d+\\.\\d{1,2}");

        // Verify the 251st item is NOT in the response (truncation happened before coarsening)
        assertThat(resp.listings().stream().map(AgriMapListingItem::id))
                .doesNotContain("item-" + DiscoverAgriMapListingsService.MAX_LISTINGS_PER_REQUEST);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Builds a list of {@code count} minimal AgriMapListingItem instances with IDs "item-0", "item-1", etc.
     */
    private static List<AgriMapListingItem> buildItems(int count) {
        List<AgriMapListingItem> items = new java.util.ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            items.add(agriItem("item-" + i, "Farm " + i, "IN|KA|Udupi|Area1",
                    13.3 + i * 0.001, 74.7 + i * 0.001,
                    "agricultural_land", "Shirva", null,
                    null, null, null, 1000000L));
        }
        return items;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubQuery(List<AgriMapListingItem> items) throws SQLException {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper rm = inv.getArgument(1);
                    List<Object> result = new java.util.ArrayList<>();
                    for (AgriMapListingItem item : items) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("id")).thenReturn(item.id());
                        when(rs.getString("title")).thenReturn(item.title());
                        when(rs.getString("area_key")).thenReturn(item.areaKey());
                        when(rs.getObject("latitude")).thenReturn(item.latitude());
                        if (item.latitude() != null) {
                            when(rs.getDouble("latitude")).thenReturn(item.latitude());
                        }
                        when(rs.getObject("longitude")).thenReturn(item.longitude());
                        if (item.longitude() != null) {
                            when(rs.getDouble("longitude")).thenReturn(item.longitude());
                        }
                        when(rs.getString("property_type")).thenReturn(item.propertyType());
                        when(rs.getString("locality")).thenReturn(item.locality());
                        when(rs.getString("boundary_geo_json")).thenReturn(item.boundaryGeoJson());
                        when(rs.getBigDecimal("land_area")).thenReturn(item.landArea());
                        when(rs.getString("land_area_unit")).thenReturn(item.landAreaUnit());
                        when(rs.getBigDecimal("computed_area_acres")).thenReturn(item.computedAreaAcres());
                        when(rs.getObject("price_paise")).thenReturn(item.pricePaise());
                        if (item.pricePaise() != null) {
                            when(rs.getLong("price_paise")).thenReturn(item.pricePaise());
                        }
                        when(rs.getString("listing_purpose")).thenReturn(item.listingPurpose());
                        when(rs.getString("water_source")).thenReturn(item.waterSource());
                        when(rs.getString("land_category")).thenReturn(item.landCategory());
                        when(rs.getObject("farmhouse_available")).thenReturn(item.farmhouseAvailable());
                        if (item.farmhouseAvailable() != null) {
                            when(rs.getBoolean("farmhouse_available")).thenReturn(item.farmhouseAvailable());
                        }
                        when(rs.getObject("fencing_done")).thenReturn(item.fencingDone());
                        if (item.fencingDone() != null) {
                            when(rs.getBoolean("fencing_done")).thenReturn(item.fencingDone());
                        }
                        result.add(rm.mapRow(rs, result.size()));
                    }
                    return result;
                });
    }

    private static AgriMapListingItem agriItem(String id, String title, String areaKey,
                                               Double lat, Double lon,
                                               String propertyType, String locality,
                                               String boundaryGeoJson,
                                               BigDecimal landArea, String landAreaUnit,
                                               BigDecimal computedAcres, Long pricePaise) {
        return new AgriMapListingItem(id, title, areaKey, lat, lon, propertyType, locality,
                boundaryGeoJson, landArea, landAreaUnit, computedAcres, pricePaise,
                null, null, null, null, null);
    }

    // ── SQL schema regression: computed_area_acres must be derived, not stored ──

    @Test
    @org.junit.jupiter.api.DisplayName("SQL does not reference pl.computed_area_acres stored column (real-schema 500 regression)")
    void baseSql_derivesComputedAreaAcresViaStar_area_notStoredColumn() {
        // Phase 7A caught: pl.computed_area_acres does not exist in property_listings schema.
        // computedAreaAcres is derive-on-read via ST_Area per #1367. The SQL must use
        // ROUND(ST_Area(pl.boundary) ...) and must NOT reference a bare pl.computed_area_acres column.
        // Mocked-repo tests cannot catch schema drift — this string guard fills the gap.
        assertThat(DiscoverAgriMapListingsService.BASE_SQL)
                .contains("ST_Area(pl.boundary)")
                .doesNotContain("pl.computed_area_acres");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("BASE_SQL SELECT includes pl.title and WHERE clause preserved verbatim")
    void baseSql_includesTitleInSelectAndPreservesWhereClause() {
        // Asserts that title is in the SELECT list
        assertThat(DiscoverAgriMapListingsService.BASE_SQL)
                .contains("pl.title");
        // WHERE clause preservation: LIVE/archived/duplicate filters must not be removed
        assertThat(DiscoverAgriMapListingsService.BASE_SQL)
                .contains("pl.status = 'LIVE'")
                .contains("pl.archived_at IS NULL")
                .contains("pl.is_duplicate = false");
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("Row mapper reads title from ResultSet getString(\"title\")")
    void rowMapper_mapsTitleFromResultSet() throws SQLException {
        AgriMapListingItem item = agriItem("id-title", "5-Acre Rice Farm, Hebri", "IN|KA|Udupi|Area1",
                13.3, 74.7, "agricultural_land", "Hebri", null, null, null, null, null);

        stubQuery(List.of(item));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings()).hasSize(1);
        assertThat(resp.listings().get(0).title()).isEqualTo("5-Acre Rice Farm, Hebri");
    }

    // ── #1454 BE-TC5: ANON map mask — null pricePaise + coarsened lat/lng ─────────

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1454 anon: pricePaise null + lat/lng coarsened to 2dp; zero-PII fields preserved")
    void findAgriMapListings_anonymous_masksPriceAndCoarsensCoords() throws SQLException {
        // Exact source coords with > 2dp precision; price present at source.
        AgriMapListingItem source = agriItem("anon-1", "2.5-Acre Farm, Shirva", "IN|KA|Udupi|Area1",
                13.34091, 74.74215, "agricultural_land", "Shirva", "{\"type\":\"Polygon\"}",
                new BigDecimal("2.5"), "acres", new BigDecimal("2.47"), 5000000L);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        // pricePaise withheld from anonymous callers
        assertThat(returned.pricePaise()).isNull();
        // lat/lng coarsened to 2dp (truncated toward zero) — exact value NOT recoverable
        assertThat(returned.latitude()).isEqualTo(13.34);
        assertThat(returned.longitude()).isEqualTo(74.74);
        assertThat(returned.latitude()).isNotEqualTo(13.34091);
        assertThat(returned.longitude()).isNotEqualTo(74.74215);
        // zero-PII fields preserved
        assertThat(returned.areaKey()).isEqualTo("IN|KA|Udupi|Area1");
        assertThat(returned.title()).isEqualTo("2.5-Acre Farm, Shirva");
        assertThat(returned.boundaryGeoJson()).isEqualTo("{\"type\":\"Polygon\"}");
        assertThat(returned.landArea()).isEqualByComparingTo(new BigDecimal("2.5"));
        assertThat(returned.computedAreaAcres()).isEqualByComparingTo(new BigDecimal("2.47"));
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1454 anon: null lat/lng stays null (no (0,0) marker)")
    void findAgriMapListings_anonymous_nullCoords_stayNull() throws SQLException {
        AgriMapListingItem source = agriItem("anon-null", null, "IN|KA|Udupi|Area1",
                null, null, "agricultural_land", "Hebri", null, null, null, null, 9000000L);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        assertThat(returned.latitude()).as("null coord must NOT become 0.0").isNull();
        assertThat(returned.longitude()).as("null coord must NOT become 0.0").isNull();
        assertThat(returned.pricePaise()).isNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1454 anon: negative coords truncate sign-correctly")
    void findAgriMapListings_anonymous_negativeCoords_truncateSignCorrect() throws SQLException {
        // Forward-safety: Udupi is positive today, but truncation must be sign-correct.
        AgriMapListingItem source = agriItem("anon-neg", null, "IN|KA|Udupi|Area1",
                -13.34091, -74.74215, "agricultural_land", "Synthetic", null,
                null, null, null, 1L);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), false, null);

        AgriMapListingItem returned = resp.listings().get(0);
        // Truncate toward zero: -13.34091 -> -13.34 (NOT -13.35), -74.74215 -> -74.74
        assertThat(returned.latitude()).isEqualTo(-13.34);
        assertThat(returned.longitude()).isEqualTo(-74.74);
    }

    // ── #1454 BE-TC6: AUTHED map full — exact lat/lng + pricePaise ───────────────

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1454 authed: exact lat/lng + pricePaise unchanged (#1452 guard)")
    void findAgriMapListings_authenticated_returnsExactCoordsAndPrice() throws SQLException {
        AgriMapListingItem source = agriItem("auth-1", "5-Acre Farm, Brahmavar", "IN|KA|Udupi|Area1",
                13.34091, 74.74215, "agricultural_land", "Brahmavar", "{\"type\":\"Polygon\"}",
                new BigDecimal("5.0"), "acres", new BigDecimal("5.0"), 12500000L);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        AgriMapListingItem returned = resp.listings().get(0);
        // exact coords retained
        assertThat(returned.latitude()).isEqualTo(13.34091);
        assertThat(returned.longitude()).isEqualTo(74.74215);
        // pricePaise canonical value retained (#1452)
        assertThat(returned.pricePaise()).isEqualTo(12500000L);
    }

    // ── #1494: listingPurpose field — DTO mapper and SQL filter ─────────────

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1494 agri DTO: listingPurpose read from listing_purpose column, other fields not shifted")
    void agriMapListingItem_rowMapper_readsListingPurposeColumn() throws SQLException {
        // Source item with listingPurpose='sale'
        AgriMapListingItem source = new AgriMapListingItem(
                "lp-1", "Farm with purpose", "IN|KA|Udupi|Area1",
                13.3, 74.7, "agricultural_land", "Kundapur",
                "{\"type\":\"Polygon\"}", new BigDecimal("3.0"), "acres",
                new BigDecimal("3.0"), 7500000L, "sale",
                null, null, null, null);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings()).hasSize(1);
        AgriMapListingItem returned = resp.listings().get(0);
        // 13th field must be listingPurpose, not a shifted value from another column
        assertThat(returned.listingPurpose()).isEqualTo("sale");
        // Existing 12 fields must not shift
        assertThat(returned.id()).isEqualTo("lp-1");
        assertThat(returned.title()).isEqualTo("Farm with purpose");
        assertThat(returned.areaKey()).isEqualTo("IN|KA|Udupi|Area1");
        assertThat(returned.latitude()).isEqualTo(13.3);
        assertThat(returned.longitude()).isEqualTo(74.7);
        assertThat(returned.propertyType()).isEqualTo("agricultural_land");
        assertThat(returned.locality()).isEqualTo("Kundapur");
        assertThat(returned.pricePaise()).isEqualTo(7500000L);
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1494 agri DTO: listingPurpose null when column returns null")
    void agriMapListingItem_rowMapper_listingPurposeNullWhenAbsent() throws SQLException {
        AgriMapListingItem source = agriItem("lp-null", "Farm", "IN|KA|Udupi|Area1",
                13.3, 74.7, "agricultural_land", "Malpe", null, null, null, null, null);
        stubQuery(List.of(source));

        AgriMapListingsResponse resp = service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        assertThat(resp.listings().get(0).listingPurpose()).isNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1494 agri filter: listingPurpose='rent' produces AND pl.listing_purpose = ? in SQL")
    void findAgriMapListings_listingPurposeRent_producesWhereClause() throws Exception {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        org.mockito.ArgumentCaptor<String> sqlCaptor =
                org.mockito.ArgumentCaptor.forClass(String.class);

        service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, "rent");

        org.mockito.Mockito.verify(jdbcOperations)
                .query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));

        assertThat(sqlCaptor.getValue()).contains("pl.listing_purpose = ?");
    }

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1494 agri filter: listingPurpose=null → no listing_purpose WHERE predicate in SQL")
    void findAgriMapListings_listingPurposeNull_noWhereClause() throws Exception {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        org.mockito.ArgumentCaptor<String> sqlCaptor =
                org.mockito.ArgumentCaptor.forClass(String.class);

        service.findAgriMapListings(
                "udupi", List.of("IN|KA|Udupi|Area1"), Optional.empty(), true, null);

        org.mockito.Mockito.verify(jdbcOperations)
                .query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));

        // pl.listing_purpose appears in the SELECT clause always; but must NOT appear as a WHERE filter
        assertThat(sqlCaptor.getValue()).doesNotContain("pl.listing_purpose = ?");
    }
}
