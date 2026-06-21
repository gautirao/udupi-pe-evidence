package com.example.realestate.broker.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Quality summary for a single listing, returned inside {@link ListingQualityResponse}.
 *
 * @param listingId    Listing UUID.
 * @param title        Listing title (may be null for incomplete drafts).
 * @param status       Listing lifecycle status string (DRAFT, LIVE, etc.).
 * @param scoreStatus  SCORED | NOT_SCORED.
 * @param qualityScore Overall quality score [0, 100]; null when NOT_SCORED.
 * @param band         BUYER_READY | NEEDS_IMPROVEMENT | PRIORITY_FIX | UNSCORED.
 * @param computedAt   When the score was last computed; null when NOT_SCORED.
 * @param findings     Applied-component findings (empty when NOT_SCORED).
 * @param fixPlan      Fix actions for below-threshold applied components (empty when NOT_SCORED).
 * @param engagement   Always UNAVAILABLE for M28.
 */
public record ListingQualityItem(
        UUID listingId,
        String title,
        String status,
        String scoreStatus,
        Integer qualityScore,
        String band,
        Instant computedAt,
        List<QualityFinding> findings,
        List<QualityFixAction> fixPlan,
        EngagementSummary engagement
) {}
