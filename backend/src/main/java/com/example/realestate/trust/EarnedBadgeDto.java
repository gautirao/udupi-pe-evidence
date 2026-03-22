package com.example.realestate.trust;

import java.time.OffsetDateTime;

/**
 * DTO for a single earned badge in the public /trust response.
 * Contains only dimensionType and grantedAt — never trustTier or rankingScore.
 */
public record EarnedBadgeDto(String dimensionType, OffsetDateTime grantedAt) {}
