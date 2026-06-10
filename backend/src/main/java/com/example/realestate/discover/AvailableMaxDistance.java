package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * A single cumulative distance tier within a corridor group.
 *
 * <p>{@code agriAcreage} is omitted from JSON when null
 * ({@code @JsonInclude(NON_NULL)}): null means no parseable acreage exists
 * in any included band for this tier.
 *
 * <p>{@code includedBandCodes} lists every distance-band key whose listings
 * are accumulated into this tier (e.g. ["0_10","10_25"] for the 25 km tier).
 * Canonical band codes: "0_10", "10_25", "25_50", "50_up".
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AvailableMaxDistance(
        /** Maximum cumulative distance in km for this tier (10, 25, 50, or 100). */
        int maxKm,
        /** Human-readable label, e.g. "Within 10 km" or "Up to 25 km". */
        String distanceLabel,
        /** All band_keys whose listings are included in this cumulative tier. */
        List<String> includedBandCodes,
        /** Total LIVE listing count across all included bands. */
        long listingCount,
        /**
         * Sum of parseable acreage in acres across all included bands.
         * Null when no parseable land_area row exists (omitted from JSON via NON_NULL).
         */
        Double agriAcreage,
        /** Union of area_keys across all included bands (order-preserving, deduped). */
        List<String> areaKeys
) {}
