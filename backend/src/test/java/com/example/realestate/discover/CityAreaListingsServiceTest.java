package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

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

    /** Stubs jdbc.query(sql, RowCallbackHandler, params) to drive the handler over one row. */
    private void stubSingleRow(String areaKey, String areaName, UUID listingId,
                                Double latitude, Double longitude) throws Exception {
        when(jdbc.queryForObject(anyString(), org.mockito.ArgumentMatchers.eq(Integer.class),
                org.mockito.ArgumentMatchers.<Object>any()))
                .thenReturn(1);

        doAnswer(inv -> {
                    RowCallbackHandler rch = inv.getArgument(1);
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getString("area_key")).thenReturn(areaKey);
                    when(rs.getString("area_name")).thenReturn(areaName);
                    when(rs.getString("listing_id")).thenReturn(listingId.toString());
                    when(rs.getObject("price_paise")).thenReturn(5_000_000L);
                    when(rs.getLong("price_paise")).thenReturn(5_000_000L);
                    when(rs.getString("property_type")).thenReturn("house");
                    when(rs.getString("locality")).thenReturn("Malpe");
                    when(rs.getString("primary_image_url")).thenReturn(null);
                    when(rs.getString("listing_purpose")).thenReturn("sale");
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
                    when(rs.getObject("total_floors")).thenReturn(null);
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
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, false);

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
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, true);

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
                "udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, false);

        AreaListingCard card = resp.areas().get(0).listings().get(0);
        assertThat(card.latitude()).isNull();
        assertThat(card.longitude()).isNull();
    }
}
