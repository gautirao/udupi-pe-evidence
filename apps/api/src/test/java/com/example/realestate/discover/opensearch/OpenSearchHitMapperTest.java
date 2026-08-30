package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarker;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link OpenSearchHitMapper} (#1726).
 *
 * <p>{@code discover.opensearch.enabled} defaults to {@code false} in every known environment
 * (see {@code RoutingDiscoverMarkersService}/{@code RoutingDiscoverListingsService}), so this
 * mapper is currently dormant — but it is a second DTO-construction path for the same
 * {@code GET /api/discover/markers} / {@code GET /api/discover/listings} routes. These tests
 * prove that {@code toMarker}/{@code toListing} route through the same coarsening funnel as the
 * Postgres path ({@code DiscoverMarkersService.buildMarker} / {@code DiscoverListingsService.buildListing})
 * so the leak cannot silently reappear if the flag is ever turned on.
 */
class OpenSearchHitMapperTest {

    @Test
    void toMarker_coarsensLatLng() {
        Map<String, Object> source = new HashMap<>();
        source.put("id", "id-1");
        source.put("latitude", 13.34091);
        source.put("longitude", 74.74215);
        source.put("price_paise", 5_000_000L);
        source.put("locality", "Malpe");
        source.put("property_type", "house");

        DiscoverMarker marker = OpenSearchHitMapper.toMarker(source);

        assertThat(marker).isNotNull();
        assertThat(marker.latitude()).isEqualTo(13.34);
        assertThat(marker.longitude()).isEqualTo(74.74);
        assertThat(marker.latitude()).isNotEqualTo(13.34091);
        assertThat(marker.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    void toListing_coarsensLatLng() {
        Map<String, Object> source = new HashMap<>();
        source.put("id", "id-1");
        source.put("listing_number", "L-001");
        source.put("property_type", "house");
        source.put("title", "Title");
        source.put("locality", "Malpe");
        source.put("area_key", "IN|KA|Udupi|Malpe");
        source.put("price_paise", 5_000_000L);
        source.put("latitude", 13.34091);
        source.put("longitude", 74.74215);
        source.put("status", "LIVE");

        DiscoverListingResponse listing = OpenSearchHitMapper.toListing(source);

        assertThat(listing.latitude()).isEqualTo(13.34);
        assertThat(listing.longitude()).isEqualTo(74.74);
        assertThat(listing.latitude()).isNotEqualTo(13.34091);
        assertThat(listing.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    void toMarker_missingCoordinates_returnsNull() {
        Map<String, Object> source = new HashMap<>();
        source.put("id", "id-1");
        // no latitude/longitude

        assertThat(OpenSearchHitMapper.toMarker(source)).isNull();
    }
}
