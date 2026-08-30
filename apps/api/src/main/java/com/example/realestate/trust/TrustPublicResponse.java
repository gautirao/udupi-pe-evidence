package com.example.realestate.trust;

import java.util.List;

/**
 * Response body for GET /api/listings/{id}/trust (public, unauthenticated).
 * Lists only EARNED badges. Never includes trustTier or rankingScore.
 */
public record TrustPublicResponse(List<EarnedBadgeDto> badges) {}
