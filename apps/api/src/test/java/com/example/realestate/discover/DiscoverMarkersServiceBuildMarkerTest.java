package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link DiscoverMarkersService#buildMarker} — the shared #1726
 * DTO-construction funnel used by both the Postgres row-mapper (this service) and
 * {@code OpenSearchHitMapper.toMarker}, so the dormant {@code discover.opensearch.enabled}
 * path cannot reintroduce the exact-pin leak if ever turned on.
 */
class DiscoverMarkersServiceBuildMarkerTest {

    @Test
    void buildMarker_coarsensLatLng() {
        DiscoverMarker marker = DiscoverMarkersService.buildMarker(
                "id-1", 13.34091, 74.74215, 5_000_000L, "Malpe", "house", null, null);

        assertThat(marker.latitude()).isEqualTo(13.34);
        assertThat(marker.longitude()).isEqualTo(74.74);
        assertThat(marker.latitude()).isNotEqualTo(13.34091);
        assertThat(marker.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    void buildMarker_preservesNonCoordinateFields() {
        DiscoverMarker marker = DiscoverMarkersService.buildMarker(
                "id-2", 13.3, 74.7, 5_000_000L, "Malpe", "agricultural_land", "{\"type\":\"Polygon\"}", null);

        assertThat(marker.id()).isEqualTo("id-2");
        assertThat(marker.pricePaise()).isEqualTo(5_000_000L);
        assertThat(marker.locality()).isEqualTo("Malpe");
        assertThat(marker.propertyType()).isEqualTo("agricultural_land");
        assertThat(marker.boundaryGeoJson()).isEqualTo("{\"type\":\"Polygon\"}");
    }
}
