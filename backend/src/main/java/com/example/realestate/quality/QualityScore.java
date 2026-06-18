package com.example.realestate.quality;

import java.time.Instant;
import java.util.List;

/**
 * The complete quality-score result for one listing computation.
 *
 * <p>Components are always in {@link QualityComponentType} declaration order — the
 * same deterministic order produced by {@link QualityScoreService#compute}.
 *
 * <h3>JSON serialisation</h3>
 * {@link QualityScoreService} provides {@link QualityScoreService#toCanonicalJson(QualityScore)}
 * which returns a byte-identical JSON string across calls (fields in a fixed order,
 * no locale-dependent formatting). Use that method when persisting {@code quality_breakdown}.
 *
 * @param overall     Weighted score in [0, 100] over the applied components.
 * @param components  One entry per {@link QualityComponentType}, in enum order.
 * @param computedAt  Echo of {@link QualityScoreInputs#now()} supplied by the caller.
 */
public record QualityScore(
        int overall,
        List<QualityComponent> components,
        Instant computedAt
) {}
