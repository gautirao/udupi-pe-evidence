package com.example.realestate.intelligence;

import java.math.BigDecimal;

/**
 * Buyer-facing area-intelligence response DTO.
 *
 * <p>Returned by {@link BuyerAreaIntelligenceController} for
 * {@code GET /api/trends/area-intelligence?city=X&areaKey=Y}.
 *
 * <p>All metric value fields use BOXED types so Jackson serialises absent/suppressed
 * values as JSON {@code null}, never as {@code 0} or a surrogate. This is binding.
 *
 * <p>demand_score is intentionally absent — it is reserved for issue #1532.
 */
public record BuyerAreaIntelligenceResponse(
        String citySlug,
        String areaKey,
        String areaLabel,
        boolean available,
        String confidenceLabel,
        Metrics metrics,
        PriceComparison priceComparison,
        ListingsCta listingsCta
) {

    /**
     * Per-metric wrapper. {@code value} is null when the metric is suppressed or unavailable;
     * {@code confidenceLabel} reflects the overall snapshot confidence when value is present,
     * or "Not enough data yet" when value is null.
     *
     * @param <T> metric value type (Long, Integer, BigDecimal, String)
     */
    public record Metric<T>(T value, String confidenceLabel) {}

    /**
     * Bundle of all buyer-visible metrics. Each metric carries its own confidenceLabel so the
     * UI can render per-metric badges without additional logic.
     */
    public record Metrics(
            Metric<Long> medianPricePaise,
            Metric<String> dominantPropertyType,
            Metric<Integer> activeListingCount,
            Metric<Integer> freshListingCount,
            Metric<BigDecimal> avgListingQuality,
            Metric<Void> mostSearchedBudget
    ) {}

    /**
     * Price comparison availability and soft-form wording.
     * {@code wording} is null when {@code supported} is false.
     */
    public record PriceComparison(boolean supported, String wording) {}

    /**
     * CTA directing buyers to listings for this area.
     * {@code label} is buyer-friendly and neutral — no broker/agent language.
     */
    public record ListingsCta(String areaKey, String label) {}
}
