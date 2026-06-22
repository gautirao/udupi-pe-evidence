package com.example.realestate.intelligence;

/**
 * Immutable value object representing one top-gap bucket for an area.
 *
 * <p>Sourced from {@code area_demand_signal} rows where {@code gap_score IS NOT NULL}
 * (i.e. non-suppressed), ordered by {@code gap_score DESC} with a stable tie-break.
 * The top-3 such buckets per (city_slug, area_key) are surfaced in
 * {@link AreaIntelligenceResponse#topGaps()}.
 *
 * @param propertyType   property type token (e.g. {@code "apartment"})
 * @param listingPurpose listing purpose: {@code "sale"} or {@code "rent"}
 * @param budgetBand     canonical budget band label (e.g. {@code "UNDER_5L"})
 * @param signalType     signal classification: one of {@code supply_gap | information_gap |
 *                       price_signal | possible_gap}
 * @param gapScore       gap score in [-3, 3]; never null (suppressed buckets are excluded)
 * @param confidence     demand volume confidence: {@code enough_data | limited_data}
 *                       (never {@code insufficient_data} — those have null gap_score)
 */
public record AreaTopGap(
        String propertyType,
        String listingPurpose,
        String budgetBand,
        String signalType,
        Double gapScore,
        String confidence
) {
}
