package com.example.realestate.trust;

import java.util.List;

/**
 * Response body for GET /api/listings/{id}/trust-progress (authenticated, owner-only).
 *
 * <p>{@code cta} is the dimensionType of the first AVAILABLE or PENDING badge in canonical order,
 * or {@code null} if all badges are in a terminal state (EARNED / EXPIRED / SUSPENDED).
 *
 * <p>Never includes trustTier or rankingScore.
 */
public record TrustProgressResponse(List<TrustProgressBadgeDto> badges, String cta) {}
