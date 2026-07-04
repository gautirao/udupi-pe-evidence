package com.example.realestate.discover;

/**
 * Query parameters for {@link DiscoverSummaryPort#getSummary(SummaryQuery)} (#1745 P5, P5-addendum).
 *
 * @param city           city slug (required)
 * @param propertyType   optional singular property type filter; blank/whitespace-only is normalised
 *                       to {@code null} by the caller (blended, all-types)
 * @param groupBy        region grouping axis; one of {@code "area_group"} or {@code "corridor"}.
 *                       Validated as a whitelist at the controller layer — never interpolated into SQL.
 * @param hotspotLimit   number of top areas to return in {@code hotspots}; clamped to [1,20] by the
 *                       controller
 * @param listingPurpose optional {@code "sale"}/{@code "rent"} filter — independent of
 *                       {@code propertyType}; blank/invalid values are normalised to {@code null}
 *                       (blended, all-purposes) by {@link DiscoverSummaryService#getSummary}
 */
public record SummaryQuery(
        String city,
        String propertyType,
        String groupBy,
        int hotspotLimit,
        String listingPurpose
) {

    /**
     * Backward-compatible 4-arg constructor for call sites predating the {@code listingPurpose}
     * filter (#1745 P5-addendum) — defaults to {@code null} (blended, all-purposes).
     */
    public SummaryQuery(String city, String propertyType, String groupBy, int hotspotLimit) {
        this(city, propertyType, groupBy, hotspotLimit, null);
    }
}
