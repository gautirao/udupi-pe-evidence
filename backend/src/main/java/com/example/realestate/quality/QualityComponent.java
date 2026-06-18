package com.example.realestate.quality;

/**
 * Score result for a single quality dimension.
 *
 * @param type     The dimension being scored.
 * @param score    Dimension score in the range [0, 100]. Meaningful only when
 *                 {@code applied=true}; callers MUST ignore this value when
 *                 {@code applied=false}.
 * @param weightBp Weight of this dimension in basis points. Copied from
 *                 {@link QualityComponentType#getWeightBp()} at compute time so the
 *                 serialised breakdown is self-describing.
 * @param applied  {@code true} when this dimension contributed to the overall score
 *                 denominator. {@code false} for dimensions that are not applicable
 *                 (e.g. AGRI_COMPLETENESS on a non-agricultural listing, or
 *                 PRICE_SANITY when no comparable is available).
 * @param finding  Human-readable explanation of the score. Must contain only the
 *                 dimension result and guidance — never PII (no owner name, phone,
 *                 email, survey number, or coordinates).
 */
public record QualityComponent(
        QualityComponentType type,
        int score,
        int weightBp,
        boolean applied,
        String finding
) {}
