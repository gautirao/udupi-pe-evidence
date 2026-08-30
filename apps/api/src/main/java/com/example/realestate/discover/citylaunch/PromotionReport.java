package com.example.realestate.discover.citylaunch;

import java.time.Instant;

/**
 * Response body for {@code POST .../launch} (#1911 PR5). Returned both on a genuine first-time
 * promotion and on an idempotent no-op retry ({@code idempotentNoop=true}, echoing the
 * ALREADY-committed {@code promoted_at} and per-table counts as zero, since nothing was written
 * this call) — see {@link CityLaunchPromotionService#launch}.
 */
public record PromotionReport(
        Long revisionId,
        String lifecycleStatus,
        Instant promotedAt,
        int areasPromoted,
        int aliasesPromoted,
        int regionsPromoted,
        int membershipsPromoted,
        int groupsPromoted,
        int groupMembersPromoted,
        int navigationNodesPromoted,
        int agriDestinationsPromoted,
        boolean cityActivated,
        boolean idempotentNoop) {
}
