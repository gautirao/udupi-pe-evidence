package com.example.realestate.trust;

import java.time.OffsetDateTime;

/**
 * DTO for a single badge entry in the owner-only /trust-progress response.
 *
 * <p>{@code autoGranted} is Boolean (nullable):
 * <ul>
 *   <li>{@code true} for AUTHORITY on owner-type listings (auto-granted by the system)</li>
 *   <li>{@code null} for all other badges</li>
 * </ul>
 *
 * <p>Never includes trustTier or rankingScore.
 */
public record TrustProgressBadgeDto(
        String dimensionType,
        String badgeState,
        OffsetDateTime grantedAt,
        Boolean autoGranted) {}
