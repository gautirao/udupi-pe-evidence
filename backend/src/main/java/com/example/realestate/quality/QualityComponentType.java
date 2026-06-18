package com.example.realestate.quality;

/**
 * The eight quality dimensions evaluated for every listing.
 *
 * <h3>Weights</h3>
 * Each constant carries its weight in basis points (bp, where 10 000 bp = 100%).
 * The declared weights sum to 10 000 over ALL eight dimensions.
 *
 * <h3>Applied-only denominator rule</h3>
 * Two dimensions are conditionally excluded from scoring:
 * <ul>
 *   <li>{@link #AGRI_COMPLETENESS} — only applied when {@code propertyType} is
 *       {@code "agricultural_land"} (case-insensitive). For all other property types
 *       {@code applied=false} and this dimension is excluded from the denominator.</li>
 *   <li>{@link #PRICE_SANITY} — only applied when a median comparable price is
 *       available. When the comparable is {@code null} the dimension is
 *       {@code INDETERMINATE} and excluded from the denominator.</li>
 * </ul>
 *
 * The final score is computed as:
 * <pre>
 *   overall = clamp( round( sum(score_i * weightBp_i) / sum(appliedWeightBp_i) ), 0, 100 )
 * </pre>
 * where the sums run only over dimensions with {@code applied=true}.
 * This guarantees non-agri listings are not penalised for a missing agri dimension,
 * and listings without comparable pricing are neither rewarded nor punished.
 *
 * <h3>Declaration order</h3>
 * The enum declaration order is the CANONICAL output order of components in every
 * {@link QualityScore}. {@link QualityScoreService} iterates {@code values()} to
 * guarantee deterministic ordering — do not reorder constants.
 */
public enum QualityComponentType {

    // name                 weightBp
    TRUST               (2000),
    PHOTOS              (1500),
    DESCRIPTION         (1500),
    KEY_FIELDS          (1500),
    PRICE_SANITY        (1000),
    LOCATION            (1000),
    AGRI_COMPLETENESS   (1000),
    RECENCY             ( 500);

    // -----------------------------------------------------------------------
    // Declared weights: 2000+1500+1500+1500+1000+1000+1000+500 = 10 000 bp ✓
    // -----------------------------------------------------------------------

    private final int weightBp;

    QualityComponentType(int weightBp) {
        this.weightBp = weightBp;
    }

    /** Weight of this dimension in basis points (1 bp = 0.01%). */
    public int getWeightBp() {
        return weightBp;
    }
}
