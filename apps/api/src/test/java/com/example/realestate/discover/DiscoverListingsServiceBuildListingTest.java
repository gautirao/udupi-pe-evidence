package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

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
                null, null, null, null, null,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE", null);

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
                null, null, null, null, null,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE", null);

        assertThat(listing.latitude()).isNull();
        assertThat(listing.longitude()).isNull();
    }

    @Test
    void buildListing_preservesNonCoordinateFields() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-3", "L-003", "apartment", "Nice Flat", "Malpe", "IN|KA|Udupi|Malpe",
                8_000_000L, null, null, 900.0, "sq ft", 2,
                13.3, 74.7, "https://cdn.example.com/img.jpg",
                null, null, null, null, null,
                10, true, "RERA123", true, "B", "READY", "broker", "rent", "LIVE", null);

        assertThat(listing.id()).isEqualTo("id-3");
        assertThat(listing.pricePaise()).isEqualTo(8_000_000L);
        assertThat(listing.heroImageUrl()).isEqualTo("https://cdn.example.com/img.jpg");
        assertThat(listing.reraValid()).isTrue();
        // Raw "B" is projected to the public badge word "trusted" — see #1567 / TrustBadge.
        assertThat(listing.trustBadge()).isEqualTo("trusted");
    }

    @Test
    void buildListing_dTier_yieldsNoBadge() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-4", "L-004", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null, null,
                5, false, null, false, "D", "READY", "owner", "sale", "LIVE", null);

        assertThat(listing.trustBadge()).isNull();
    }

    @Test
    void buildListing_unknownOrNullRawTier_yieldsNoBadge_neverInventsATier() {
        DiscoverListingResponse unknown = DiscoverListingsService.buildListing(
                "id-5", "L-005", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null, null,
                5, false, null, false, "Z", "READY", "owner", "sale", "LIVE", null);
        DiscoverListingResponse nullTier = DiscoverListingsService.buildListing(
                "id-6", "L-006", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null, null,
                5, false, null, false, null, "READY", "owner", "sale", "LIVE", null);

        assertThat(unknown.trustBadge()).isNull();
        assertThat(nullTier.trustBadge()).isNull();
    }

    // ===== #1794 Phase 1: confirmedAt propagation on the card-feed DTO =====

    @Test
    void buildListing_confirmedAtPresent_isExposedOnTheCardDto() {
        OffsetDateTime confirmedAt = OffsetDateTime.now().minusDays(2);

        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-7", "L-007", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null, confirmedAt,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE", null);

        assertThat(listing.confirmedAt()).isEqualTo(confirmedAt);
    }

    @Test
    void buildListing_confirmedAtNull_staysNull_honestAbsence() {
        DiscoverListingResponse listing = DiscoverListingsService.buildListing(
                "id-8", "L-008", "house", "Title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null, null,
                5, false, null, false, "A", "READY", "owner", "sale", "LIVE", null);

        assertThat(listing.confirmedAt()).isNull();
    }
}
