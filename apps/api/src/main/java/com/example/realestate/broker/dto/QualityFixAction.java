package com.example.realestate.broker.dto;

/**
 * One fix-plan entry for an applied component that scores below the needs-work threshold.
 *
 * @param component    The {@link com.example.realestate.quality.QualityComponentType} name.
 * @param impact       HIGH / MEDIUM / LOW — derived from impactScore = weightBp * (100 - componentScore).
 * @param action       Human-readable action copy (server-side authored, not from breakdown).
 * @param editDeepLink Link to the broker edit page for this listing, e.g. {@code /broker/listings/{id}/edit}.
 */
public record QualityFixAction(
        String component,
        String impact,
        String action,
        String editDeepLink
) {}
