package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link PublicSchoolRadiusListingsService}.
 *
 * <p>Uses Mockito to stub {@link JdbcOperations} — no DB required. Tests cover:
 * <ul>
 *   <li>size+1 probe pagination (hasMore logic)</li>
 *   <li>correct SQL SELECT columns (no SELECT *, all 20 approved fields only)</li>
 *   <li>correct predicate builder usage (city + school coords forwarded)</li>
 *   <li>radius=0 valid path</li>
 *   <li>empty result set</li>
 *   <li>RowMapper produces correct DTO (no excluded fields)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class PublicSchoolRadiusListingsServiceTest {

    @Mock
    private JdbcOperations jdbc;

    private PublicSchoolRadiusListingsService service;

    @BeforeEach
    void setUp() {
        service = new PublicSchoolRadiusListingsService(jdbc);
    }

    // ── Helper: build a minimal stub card ────────────────────────────────────

    private static PublicSchoolRadiusListingCard stubCard(String id) {
        // priceBand replaces pricePaise — this endpoint is anon-only, exact price is never returned
        return new PublicSchoolRadiusListingCard(
                id, "L-00" + id, "house", "Title " + id, "Malpe",
                "IN|KA|Udupi|Malpe", "₹0–25L",
                null, null, 100.0, "sq m", 3,
                13.3, 74.7, "https://example.com/img.jpg",
                "sale", "READY", 5, false,
                OffsetDateTime.now()
        );
    }

    // ── 1. hasMore=false when results <= size ─────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void hasMoreFalse_whenResultsEqualToSize() {
        // size=2, probe=3, return 2 rows → hasMore=false
        List<PublicSchoolRadiusListingCard> probeResult = List.of(stubCard("1"), stubCard("2"));
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(probeResult);

        PublicSchoolRadiusListingsPage page = service.getListings("udupi", 13.3, 74.7, 2.0, 0, 2, null);

        assertThat(page.hasMore()).isFalse();
        assertThat(page.content()).hasSize(2);
        assertThat(page.page()).isEqualTo(0);
        assertThat(page.size()).isEqualTo(2);
    }

    // ── 2. hasMore=true when probe returns size+1 rows ────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void hasMoreTrue_whenProbeReturnsExtraRow() {
        // size=2, probe=3, return 3 rows → hasMore=true, content trimmed to 2
        List<PublicSchoolRadiusListingCard> probeResult = List.of(
                stubCard("1"), stubCard("2"), stubCard("3"));
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(probeResult);

        PublicSchoolRadiusListingsPage page = service.getListings("udupi", 13.3, 74.7, 2.0, 0, 2, null);

        assertThat(page.hasMore()).isTrue();
        assertThat(page.content()).hasSize(2);
        assertThat(page.content().get(0).id()).isEqualTo("1");
        assertThat(page.content().get(1).id()).isEqualTo("2");
    }

    // ── 3. Empty result → 200, hasMore=false ─────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void emptyResult_hasMoreFalse() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        PublicSchoolRadiusListingsPage page = service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, null);

        assertThat(page.hasMore()).isFalse();
        assertThat(page.content()).isEmpty();
    }

    // ── 4. SQL must NOT contain SELECT * — must contain the 20 approved columns ──

    @Test
    @SuppressWarnings("unchecked")
    void selectSql_containsOnly20ApprovedColumns_neverSelectStar() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, null);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // Must not use wildcard
        assertThat(sql).doesNotContain("SELECT *");
        assertThat(sql).doesNotContain("select *");

        // All 20 approved columns must appear
        assertThat(sql).contains("pl.id");
        assertThat(sql).contains("pl.listing_number");
        assertThat(sql).contains("pl.property_type");
        assertThat(sql).contains("pl.title");
        assertThat(sql).contains("pl.locality");
        assertThat(sql).contains("pl.area_key");
        assertThat(sql).contains("pl.price_paise");
        assertThat(sql).contains("pl.land_area");
        assertThat(sql).contains("pl.land_area_unit");
        assertThat(sql).contains("pl.built_area");
        assertThat(sql).contains("pl.built_area_unit");
        assertThat(sql).contains("pl.bedrooms");
        assertThat(sql).contains("pl.latitude");
        assertThat(sql).contains("pl.longitude");
        assertThat(sql).contains("hero_image_url");
        assertThat(sql).contains("pl.listing_purpose");
        assertThat(sql).contains("pl.possession_status");
        assertThat(sql).contains("pl.created_at");
        assertThat(sql).contains("pl.first_published_at");
        assertThat(sql).contains("pl.back_to_market_at");

        // Extract just the SELECT column projection (between SELECT and FROM)
        // to avoid false positives from WHERE-clause expressions like pl.status = 'LIVE'
        int fromIdx = sql.indexOf("FROM property_listings");
        assertThat(fromIdx).as("SQL must contain FROM property_listings").isGreaterThan(0);
        String selectClause = sql.substring(0, fromIdx);

        // Excluded columns must NOT appear in the SELECT projection
        assertThat(selectClause).doesNotContain("trust_tier");
        assertThat(selectClause).doesNotContain("rera_number");
        assertThat(selectClause).doesNotContain("seller_type");
        // pl.status must not be SELECTed (it is used in WHERE by the predicate builder but not projected)
        // Check the projection clause only — WHERE clause legitimately uses pl.status = 'LIVE'
        assertThat(selectClause).doesNotContain("pl.status");
        assertThat(selectClause).doesNotContain("pl.updated_at");
        assertThat(selectClause).doesNotContain("pl.last_updated_at");
    }

    // ── 5. City and school coords forwarded to predicate builder ─────────────

    @Test
    @SuppressWarnings("unchecked")
    void predicateContainsCityAndSchoolCoords() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getListings("udupi", 13.3456, 74.7891, 3.5, 0, 20, null);

        ArgumentCaptor<Object[]> paramsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), paramsCaptor.capture());
        Object[] params = paramsCaptor.getValue();

        // params[0] = city slug (from city predicate)
        assertThat(params[0]).isEqualTo("udupi");
        // schoolLon, schoolLat, radiusMetres are injected by DiscoverListingPredicateBuilder
        // in that order (lon first per PostGIS ST_MakePoint convention)
        // Find the radius in metres among the params
        boolean foundRadiusMetres = false;
        for (Object p : params) {
            if (p instanceof Double d && Math.abs(d - 3500.0) < 0.001) {
                foundRadiusMetres = true;
            }
        }
        assertThat(foundRadiusMetres).as("radius 3.5km should appear as 3500.0m in params").isTrue();
    }

    // ── 6. radius=0 is forwarded correctly (not floored to 1) ────────────────

    @Test
    @SuppressWarnings("unchecked")
    void radiusZero_forwardedAsZeroMetres() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getListings("udupi", 13.3, 74.7, 0.0, 0, 20, null);

        ArgumentCaptor<Object[]> paramsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), paramsCaptor.capture());
        Object[] params = paramsCaptor.getValue();

        // 0km → 0.0m; must appear in params
        boolean foundZeroMetres = false;
        for (Object p : params) {
            if (p instanceof Double d && d == 0.0) {
                foundZeroMetres = true;
            }
        }
        assertThat(foundZeroMetres).as("radius=0 should appear as 0.0m in params (not floored)").isTrue();
    }

    // ── 7. Pagination offset: page 1 with size 5 → OFFSET 5 ─────────────────

    @Test
    @SuppressWarnings("unchecked")
    void paginationOffset_correctForPage1Size5() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getListings("udupi", 13.3, 74.7, 2.0, 1, 5, null);

        ArgumentCaptor<Object[]> paramsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), paramsCaptor.capture());
        Object[] params = paramsCaptor.getValue();

        // Last two params are LIMIT (probe=6) and OFFSET (5)
        Object limitParam = params[params.length - 2];
        Object offsetParam = params[params.length - 1];
        assertThat(limitParam).isEqualTo(6);        // size+1 probe
        assertThat(offsetParam).isEqualTo(5L);       // page * size = 1 * 5
    }

    // ── 8. RowMapper produces DTO with correct field mapping ─────────────────

    @Test
    @SuppressWarnings("unchecked")
    void rowMapper_producesCorrectDto() throws Exception {
        // Capture the RowMapper and call it against a stubbed ResultSet
        ArgumentCaptor<RowMapper<PublicSchoolRadiusListingCard>> mapperCaptor =
                ArgumentCaptor.forClass(RowMapper.class);

        when(jdbc.query(anyString(), mapperCaptor.capture(), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<PublicSchoolRadiusListingCard> mapper = mapperCaptor.getValue();
                    ResultSet rs = mock(ResultSet.class);
                    Timestamp now = Timestamp.from(Instant.now());
                    when(rs.getString("id")).thenReturn("xyz");
                    when(rs.getString("listing_number")).thenReturn("L-999");
                    when(rs.getString("property_type")).thenReturn("apartment");
                    when(rs.getString("title")).thenReturn("Nice flat");
                    when(rs.getString("locality")).thenReturn("Kinnimulki");
                    when(rs.getString("area_key")).thenReturn("IN|KA|Udupi|Kinnimulki");
                    when(rs.getObject("price_paise")).thenReturn(8_000_000L);
                    when(rs.getLong("price_paise")).thenReturn(8_000_000L);
                    when(rs.getObject("land_area")).thenReturn(null);
                    when(rs.getString("land_area_unit")).thenReturn(null);
                    when(rs.getObject("built_area")).thenReturn(75.0);
                    when(rs.getDouble("built_area")).thenReturn(75.0);
                    when(rs.getString("built_area_unit")).thenReturn("sq m");
                    when(rs.getObject("bedrooms")).thenReturn(2);
                    when(rs.getInt("bedrooms")).thenReturn(2);
                    when(rs.getObject("latitude")).thenReturn(13.35);
                    when(rs.getDouble("latitude")).thenReturn(13.35);
                    when(rs.getObject("longitude")).thenReturn(74.72);
                    when(rs.getDouble("longitude")).thenReturn(74.72);
                    when(rs.getString("hero_image_url")).thenReturn("https://cdn.example.com/img.jpg");
                    when(rs.getString("listing_purpose")).thenReturn("sale");
                    when(rs.getString("possession_status")).thenReturn("READY");
                    when(rs.getTimestamp("created_at")).thenReturn(now);
                    when(rs.getTimestamp("first_published_at")).thenReturn(now);
                    when(rs.getTimestamp("back_to_market_at")).thenReturn(null);
                    return List.of(mapper.mapRow(rs, 0));
                });

        PublicSchoolRadiusListingsPage page = service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, null);

        assertThat(page.content()).hasSize(1);
        PublicSchoolRadiusListingCard card = page.content().get(0);
        assertThat(card.id()).isEqualTo("xyz");
        assertThat(card.listingNumber()).isEqualTo("L-999");
        assertThat(card.propertyType()).isEqualTo("apartment");
        // pricePaise is no longer a field — price is coarsened to priceBand for all anon responses.
        // price_paise=8_000_000L (₹80,000 = 0.8L) → "₹0–25L" band.
        // Wait — 8_000_000 paise = ₹80,000 which is well under ₹25L. Correct band: "₹0–25L".
        assertThat(card.priceBand()).isEqualTo("₹0–25L");
        assertThat(card.landArea()).isNull();
        assertThat(card.builtArea()).isEqualTo(75.0);
        assertThat(card.bedrooms()).isEqualTo(2);
        assertThat(card.latitude()).isEqualTo(13.35);
        assertThat(card.longitude()).isEqualTo(74.72);
        assertThat(card.heroImageUrl()).isEqualTo("https://cdn.example.com/img.jpg");
        assertThat(card.listingPurpose()).isEqualTo("sale");
        assertThat(card.possessionStatus()).isEqualTo("READY");
        assertThat(card.backOnMarket()).isFalse();
        assertThat(card.createdAt()).isNotNull();
    }

    // ── #1726: exact lat/lng from DB must be coarsened before leaving the server ──

    @Test
    @SuppressWarnings("unchecked")
    @org.junit.jupiter.api.DisplayName("#1726: high-precision lat/lng from DB is coarsened to 2dp (this endpoint is anon-only)")
    void rowMapper_coarsensHighPrecisionLatLng() throws Exception {
        ArgumentCaptor<RowMapper<PublicSchoolRadiusListingCard>> mapperCaptor =
                ArgumentCaptor.forClass(RowMapper.class);

        when(jdbc.query(anyString(), mapperCaptor.capture(), any(Object[].class)))
                .thenAnswer(inv -> {
                    RowMapper<PublicSchoolRadiusListingCard> mapper = mapperCaptor.getValue();
                    ResultSet rs = mock(ResultSet.class);
                    Timestamp now = Timestamp.from(Instant.now());
                    when(rs.getString("id")).thenReturn("precise-1");
                    when(rs.getString("listing_number")).thenReturn("L-1");
                    when(rs.getString("property_type")).thenReturn("house");
                    when(rs.getString("title")).thenReturn("Precise House");
                    when(rs.getString("locality")).thenReturn("Malpe");
                    when(rs.getString("area_key")).thenReturn("IN|KA|Udupi|Malpe");
                    when(rs.getObject("price_paise")).thenReturn(5_000_000L);
                    when(rs.getLong("price_paise")).thenReturn(5_000_000L);
                    when(rs.getObject("land_area")).thenReturn(null);
                    when(rs.getString("land_area_unit")).thenReturn(null);
                    when(rs.getObject("built_area")).thenReturn(null);
                    when(rs.getString("built_area_unit")).thenReturn(null);
                    when(rs.getObject("bedrooms")).thenReturn(null);
                    when(rs.getObject("latitude")).thenReturn(13.34091);
                    when(rs.getDouble("latitude")).thenReturn(13.34091);
                    when(rs.getObject("longitude")).thenReturn(74.74215);
                    when(rs.getDouble("longitude")).thenReturn(74.74215);
                    when(rs.getString("hero_image_url")).thenReturn(null);
                    when(rs.getString("listing_purpose")).thenReturn("sale");
                    when(rs.getString("possession_status")).thenReturn("READY");
                    when(rs.getTimestamp("created_at")).thenReturn(now);
                    when(rs.getTimestamp("first_published_at")).thenReturn(now);
                    when(rs.getTimestamp("back_to_market_at")).thenReturn(null);
                    return List.of(mapper.mapRow(rs, 0));
                });

        PublicSchoolRadiusListingsPage page = service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, null);

        PublicSchoolRadiusListingCard card = page.content().get(0);
        assertThat(card.latitude()).isEqualTo(13.34);
        assertThat(card.longitude()).isEqualTo(74.74);
        assertThat(card.latitude()).isNotEqualTo(13.34091);
        assertThat(card.longitude()).isNotEqualTo(74.74215);
    }

    // ── 9. #1494 listingPurpose filter: 'sale' → AND pl.listing_purpose = ? in SQL ─

    @Test
    @SuppressWarnings("unchecked")
    void listingPurposeSale_producesListingPurposeClause() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);

        service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, "sale");

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).contains("pl.listing_purpose = ?");
    }

    // ── 10. #1494 listingPurpose filter: null → no listing_purpose WHERE predicate ──

    @Test
    @SuppressWarnings("unchecked")
    void listingPurposeNull_noListingPurposeClause() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);

        service.getListings("udupi", 13.3, 74.7, 2.0, 0, 20, null);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        // pl.listing_purpose appears in the SELECT clause always; must NOT appear as a WHERE filter
        assertThat(sqlCaptor.getValue()).doesNotContain("pl.listing_purpose = ?");
    }
}
