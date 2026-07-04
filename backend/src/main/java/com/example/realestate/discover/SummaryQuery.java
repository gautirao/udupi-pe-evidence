package com.example.realestate.discover;

/**
 * Query parameters for {@link DiscoverSummaryPort#getSummary(SummaryQuery)} (#1745 P5).
 *
 * @param city         city slug (required)
 * @param propertyType optional singular property type filter; blank/whitespace-only is normalised
 *                     to {@code null} by the caller (blended, all-types)
 * @param groupBy      region grouping axis; one of {@code "area_group"} or {@code "corridor"}.
 *                     Validated as a whitelist at the controller layer — never interpolated into SQL.
 * @param hotspotLimit number of top areas to return in {@code hotspots}; clamped to [1,20] by the
 *                     controller
 */
public record SummaryQuery(
        String city,
        String propertyType,
        String groupBy,
        int hotspotLimit
) {}
