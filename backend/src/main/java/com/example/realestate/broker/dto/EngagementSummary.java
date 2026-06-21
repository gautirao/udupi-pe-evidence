package com.example.realestate.broker.dto;

/**
 * Placeholder engagement block.
 *
 * <p>For M28 (#1538) there is no event source. Status is always
 * {@code UNAVAILABLE} and all numeric fields are {@code null}.
 *
 * @param status       AVAILABLE | UNAVAILABLE | LIMITED — always UNAVAILABLE for M28.
 * @param views        null (no event source).
 * @param enquiries    null (no event source).
 * @param enquiryRate  null (no event source).
 */
public record EngagementSummary(
        String status,
        Integer views,
        Integer enquiries,
        Double enquiryRate
) {
    /** Canonical UNAVAILABLE placeholder — use whenever the event source is absent. */
    public static final EngagementSummary UNAVAILABLE =
            new EngagementSummary("UNAVAILABLE", null, null, null);
}
