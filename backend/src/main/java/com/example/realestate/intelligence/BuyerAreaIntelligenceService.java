package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Buyer-facing area-intelligence read service.
 *
 * <p>Looks up a pre-computed {@link AreaIntelligenceSnapshot} by composite key
 * {@code (citySlug, areaKey)} and maps it to a {@link BuyerAreaIntelligenceResponse}.
 *
 * <p>When no snapshot row exists the method returns a coherent UNAVAILABLE response
 * ({@code available=false}, all metric values null) rather than throwing. This keeps the
 * controller simple and ensures a consistent JSON shape regardless of row presence.
 *
 * <p>demand_score is NEVER read or exposed — it is reserved for issue #1532.
 */
@Service
public class BuyerAreaIntelligenceService {

    private static final Logger log = LoggerFactory.getLogger(BuyerAreaIntelligenceService.class);

    /**
     * Soft price-comparison wording. Buyer-facing only. No hard claims.
     * Forbidden language: "is above", "below average", "guaranteed", "outperform".
     */
    static final String PRICE_COMPARISON_WORDING =
            "This area may be above similar visible listings";

    private static final String NOT_ENOUGH_DATA =
            BuyerConfidenceLabel.NOT_ENOUGH_DATA.getDisplayLabel();

    /** CTA label prefix used when an area display label is available. */
    private static final String CTA_LABEL_PREFIX = "View listings in ";

    /** CTA label used in the no-row unavailable response (no display label available). */
    private static final String CTA_LABEL_FALLBACK = "View listings in this area";

    private final AreaIntelligenceSnapshotRepository repository;

    public BuyerAreaIntelligenceService(AreaIntelligenceSnapshotRepository repository) {
        this.repository = repository;
    }

    /**
     * Returns buyer-facing area intelligence for the given city/area pair.
     *
     * <p>Always returns a populated response — never throws for missing rows.
     * The {@code available} field distinguishes "data present" from "no data".
     *
     * @param citySlug city slug (e.g. "udupi"), already validated non-blank by caller
     * @param areaKey  pipe-delimited area key (e.g. "IN|KA|Udupi|Manipal"), already validated
     * @return populated or UNAVAILABLE response
     */
    @Transactional(readOnly = true)
    public BuyerAreaIntelligenceResponse getAreaIntelligence(String citySlug, String areaKey) {
        Optional<AreaIntelligenceSnapshot> optional =
                repository.findById(new AreaIntelligenceSnapshotId(citySlug, areaKey));

        if (optional.isEmpty()) {
            log.debug("No area-intelligence snapshot for city={} areaKey={}", citySlug, areaKey);
            return buildUnavailableResponse(citySlug, areaKey);
        }

        return mapSnapshot(optional.get());
    }

    /**
     * Resolves a (citySlug, areaSlug) pair to the matching area's stored identifiers.
     *
     * <p>Loads all snapshot rows for the city, re-sorts them deterministically
     * (active_listing_count DESC, then area_key ASC for tie-breaking), derives the
     * canonical slug for each row, and returns the first match in sorted order.
     *
     * <p>An unknown slug returns {@code matched=false} with a 200 response — NOT a 404.
     * A k-anon-suppressed area (below threshold) still resolves matched=true; suppression
     * governs metric visibility, not existence.
     *
     * <p>Warns when more than one row maps to the same slug (collision observability).
     *
     * @param citySlug requested city slug, already validated non-blank by caller
     * @param areaSlug requested area slug (e.g. "malpe"), already validated non-blank by caller
     * @return resolution response; never null
     */
    @Transactional(readOnly = true)
    public ResolveAreaResponse resolveArea(String citySlug, String areaSlug) {
        List<AreaIntelligenceSnapshot> rows =
                repository.findByCitySlugOrderByActiveListingCountDesc(citySlug);

        // Deterministic sort: active_listing_count DESC (already from repo), then area_key ASC
        List<AreaIntelligenceSnapshot> sorted = rows.stream()
                .sorted(Comparator
                        .comparingInt(AreaIntelligenceSnapshot::getActiveListingCount).reversed()
                        .thenComparing(AreaIntelligenceSnapshot::getAreaKey))
                .toList();

        // Collision observability: count how many rows map to the requested slug
        long collisionCount = sorted.stream()
                .filter(s -> deriveSlug(s).equals(areaSlug))
                .count();
        if (collisionCount > 1) {
            log.warn("resolveArea: slug collision — {} rows in city='{}' map to slug='{}'; "
                    + "returning deterministic winner (area_key ASC in sorted order)",
                    collisionCount, citySlug, areaSlug);
        }

        // Select the first match in deterministic sorted order
        Optional<AreaIntelligenceSnapshot> match = sorted.stream()
                .filter(s -> deriveSlug(s).equals(areaSlug))
                .findFirst();

        if (match.isPresent()) {
            AreaIntelligenceSnapshot s = match.get();
            log.debug("resolveArea matched: city={} slug={} -> areaKey={}", citySlug, areaSlug, s.getAreaKey());
            return new ResolveAreaResponse(citySlug, areaSlug, s.getAreaKey(), s.getAreaLabel(), true);
        }

        log.debug("resolveArea no match: city={} slug={}", citySlug, areaSlug);
        return new ResolveAreaResponse(citySlug, areaSlug, null, null, false);
    }

    /**
     * Derives the canonical slug for a snapshot row.
     * Uses area_label when present; falls back to slugify of the last pipe segment of area_key.
     */
    private static String deriveSlug(AreaIntelligenceSnapshot s) {
        if (s.getAreaLabel() != null) {
            return AreaSlug.slugify(s.getAreaLabel());
        }
        return AreaSlug.slugifyFromAreaKey(s.getAreaKey());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Resolves the overall buyer confidence display label from the snapshot's stored confidence
     * string. Defensive: if the stored value is null or an unrecognised/drifted enum name,
     * {@code ofLabel} throws {@link IllegalArgumentException}; we catch it, log a WARN, and
     * return {@code NOT_ENOUGH_DATA} so the request never propagates a 500.
     *
     * <p>The metric values (price, quality, etc.) are still mapped from the row — a drifted
     * confidence column does not mean the numeric data is invalid.
     */
    private String resolveOverallLabel(AreaIntelligenceSnapshot s) {
        try {
            return BuyerConfidenceLabel.ofLabel(s.getConfidence()).getDisplayLabel();
        } catch (IllegalArgumentException ex) {
            log.warn("Unrecognised confidence '{}' for city={} areaKey={}; defaulting to NOT_ENOUGH_DATA",
                    s.getConfidence(), s.getCitySlug(), s.getAreaKey());
            return NOT_ENOUGH_DATA;
        }
    }

    /**
     * Maps a present snapshot row to the populated DTO.
     * demand_score is deliberately not accessed.
     */
    private BuyerAreaIntelligenceResponse mapSnapshot(AreaIntelligenceSnapshot s) {
        String overallLabel = resolveOverallLabel(s);

        // k-anon suppression signal: isPriceComparisonSupported() is set to false at write time
        // exactly when activeListingCount < K_ANON_MIN (see #1526). When suppressed, we must also
        // suppress the count fields — returning an exact count (e.g. 7) for a suppressed area
        // would allow a caller to infer the population size of the correlated suppressed metrics,
        // defeating the k-anonymity coarsening on this public endpoint.
        boolean suppressed = !s.isPriceComparisonSupported();

        BuyerAreaIntelligenceResponse.Metrics metrics = new BuyerAreaIntelligenceResponse.Metrics(
                metricOf(s.getMedianPricePaise(), overallLabel),
                metricOf(s.getDominantPropertyType(), overallLabel),
                // k-anon: suppress exact count when area is below threshold (suppressed == true)
                countMetric(s.getActiveListingCount(), suppressed, overallLabel),
                countMetric(s.getFreshListingCount(), suppressed, overallLabel),
                // avgListingQuality: null when no scored rows — guard before use
                metricOf(s.getAvgListingQuality(), overallLabel),
                // mostSearchedBudget: always unavailable — no reliable source on main (#1527 decision)
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA)
        );

        boolean priceSupported = s.isPriceComparisonSupported();
        BuyerAreaIntelligenceResponse.PriceComparison priceComparison =
                new BuyerAreaIntelligenceResponse.PriceComparison(
                        priceSupported,
                        priceSupported ? PRICE_COMPARISON_WORDING : null
                );

        String displayLabel = s.getAreaLabel() != null ? s.getAreaLabel() : s.getAreaKey();
        BuyerAreaIntelligenceResponse.ListingsCta cta =
                new BuyerAreaIntelligenceResponse.ListingsCta(
                        s.getAreaKey(),
                        CTA_LABEL_PREFIX + displayLabel
                );

        return new BuyerAreaIntelligenceResponse(
                s.getCitySlug(),
                s.getAreaKey(),
                s.getAreaLabel(),
                true,
                overallLabel,
                metrics,
                priceComparison,
                cta
        );
    }

    /**
     * Coherent UNAVAILABLE response for the no-row case.
     * Shape is identical to a populated response — only values differ.
     */
    private BuyerAreaIntelligenceResponse buildUnavailableResponse(String citySlug, String areaKey) {
        BuyerAreaIntelligenceResponse.Metrics metrics = new BuyerAreaIntelligenceResponse.Metrics(
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA),
                new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA)
        );

        BuyerAreaIntelligenceResponse.PriceComparison priceComparison =
                new BuyerAreaIntelligenceResponse.PriceComparison(false, null);

        BuyerAreaIntelligenceResponse.ListingsCta cta =
                new BuyerAreaIntelligenceResponse.ListingsCta(areaKey, CTA_LABEL_FALLBACK);

        return new BuyerAreaIntelligenceResponse(
                citySlug,
                areaKey,
                null,
                false,
                NOT_ENOUGH_DATA,
                metrics,
                priceComparison,
                cta
        );
    }

    /**
     * Wraps a nullable value in a {@link BuyerAreaIntelligenceResponse.Metric}.
     * When value is null the metric label is always "Not enough data yet".
     * When value is non-null the overall snapshot label is used.
     *
     * <p>For primitive-returning getters (int) the caller boxes the value via autoboxing
     * before passing it here, so Integer.valueOf(0) is a real zero, not a suppression signal.
     */
    private <T> BuyerAreaIntelligenceResponse.Metric<T> metricOf(T value, String overallLabel) {
        if (value == null) {
            return new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA);
        }
        return new BuyerAreaIntelligenceResponse.Metric<>(value, overallLabel);
    }

    /**
     * Wraps an integer count metric with k-anonymity suppression.
     *
     * <p>When {@code suppressed} is true the exact count is withheld and replaced with
     * {@code null + "Not enough data yet"} — exposing an exact population size for a
     * k-anon-suppressed area would let callers correlate the count with the suppressed
     * price/type fields, defeating the coarsening on this public endpoint.
     *
     * <p>When {@code suppressed} is false the count is emitted normally with the overall label.
     */
    private BuyerAreaIntelligenceResponse.Metric<Integer> countMetric(
            int value, boolean suppressed, String overallLabel) {
        if (suppressed) {
            return new BuyerAreaIntelligenceResponse.Metric<>(null, NOT_ENOUGH_DATA);
        }
        return new BuyerAreaIntelligenceResponse.Metric<>(value, overallLabel);
    }
}
