package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link DiscoverListingsService#buildListing} — the shared #1726
 * DTO-construction funnel used by both the Postgres row-mapper (this service) and
 * {@code OpenSearchHitMapper.toListing}, so the dormant {@code discover.opensearch.enabled}
 * path cannot reintroduce the exact-pin leak if ever turned on.
 */
class DiscoverListingsServiceBuildListingTest {

    @Test
    void buildListing_coarsensLatLng() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-1", "L-001", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.34091, 74.74215, null,
                null, null, null, null,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE");

        assertThat(listing.latitude()).isEqualTo(13.34);
        assertThat(listing.longitude()).isEqualTo(74.74);
        assertThat(listing.latitude()).isNotEqualTo(13.34091);
        assertThat(listing.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    void buildListing_nullLatLng_staysNull() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-2", "L-002", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                null, null, null,
                null, null, null, null,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE");

        assertThat(listing.latitude()).isNull();
        assertThat(listing.longitude()).isNull();
    }

    @Test
    void buildListing_preservesNonCoordinateFields() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-3", "L-003", "apartment", "Nice Flat", "Malpe", "IN|KA|Udupi|Malpe",
                8_000_000L, null, null, 900.0, "sq ft", 2,
                13.3, 74.7, "https://cdn.example.com/img.jpg",
                null, null, null, null,
                10, true, "RERA123", true, "B", "READY", "broker", "rent", "LIVE");

        assertThat(listing.id()).isEqualTo("id-3");
        assertThat(listing.pricePaise()).isEqualTo(8_000_000L);
        assertThat(listing.heroImageUrl()).isEqualTo("https://cdn.example.com/img.jpg");
        assertThat(listing.reraValid()).isTrue();
        assertThat(listing.trustTier()).isEqualTo("B");
    }
}
