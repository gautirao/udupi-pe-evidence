package com.example.realestate.poi;

import java.util.List;

/**
 * Result of a single Overpass fetch attempt (amenity or settlement).
 * <p>
 * Distinguishes "the provider was called and returned zero relevant results"
 * from "the provider could not be reached / both endpoints failed" — the two
 * cases the raw {@code List<ListingPoi>} return type could not tell apart.
 */
public record OverpassFetchOutcome(List<ListingPoi> pois, boolean providerFailed) {

    /** No fetch was attempted — a fresh cached result already exists. */
    public static OverpassFetchOutcome cacheHit() {
        return new OverpassFetchOutcome(List.of(), false);
    }

    /** The provider was reached and parsed successfully (result may be empty). */
    public static OverpassFetchOutcome success(List<ListingPoi> pois) {
        return new OverpassFetchOutcome(pois, false);
    }

    /** Both primary and fallback Overpass endpoints failed (network error, timeout, non-200). */
    public static OverpassFetchOutcome providerFailure() {
        return new OverpassFetchOutcome(List.of(), true);
    }
}
