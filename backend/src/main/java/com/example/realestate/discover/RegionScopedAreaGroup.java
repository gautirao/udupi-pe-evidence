package com.example.realestate.discover;

import java.util.List;

/**
 * Region-scoped projection of a single {@code area_groups} row's members (#1910 PR1).
 *
 * <p>Unlike {@link AreaGroupResponse} (the group's full, unscoped member list), this record
 * carries ONLY the subset of a group's {@code area_group_members} that are classified into one
 * requested macro region via {@code city_region_memberships} — plus a listingCount/bounds/
 * centroid computed strictly from that subset. It never exposes the group's full unscoped
 * {@code areaKeys}, bounds, or listing count.
 *
 * @param groupSlug          the area_group's slug
 * @param name                the area_group's name
 * @param subtitle            the area_group's subtitle (nullable)
 * @param scopingRegionKey    the requested {@code region_key} this projection is scoped to
 * @param regionDisplayOrder  the region's canonical {@code city_regions.display_order}
 * @param areaKeys            ONLY the group's member area_keys classified into
 *                            {@code scopingRegionKey}, ordered by
 *                            {@code area_group_members.display_order}
 * @param listingCount        {@code COUNT(DISTINCT pl.id)} of LIVE, non-archived, non-duplicate
 *                            listings across exactly this subset's area_keys (guarded by
 *                            {@link DiscoverListingPredicateBuilder}). A listing whose area sits
 *                            in more than one {@code area_group} is legitimately counted once per
 *                            group that contains it — {@code area_group_members} only guarantees
 *                            {@code UNIQUE(area_group_id, area_key)}, not exclusivity of an area
 *                            to a single group (see V77 schema).
 * @param focusLat            centroid (bounds-union midpoint) of the subset's valid-bbox members,
 *                            or {@code null} when {@code boundsStatus == "UNAVAILABLE"}
 * @param focusLon            see {@code focusLat}
 * @param minLat              subset bounds union over valid-bbox members only — see
 *                            {@code boundsStatus}
 * @param minLon              see {@code minLat}
 * @param maxLat              see {@code minLat}
 * @param maxLon              see {@code minLat}
 * @param boundsStatus        {@code "COMPLETE"} when every subset member has a complete, valid
 *                            bbox; {@code "APPROXIMATE"} when some (but not all) do, with bounds
 *                            computed from only the valid subset; {@code "UNAVAILABLE"} when zero
 *                            do — in which case ALL SIX coordinate fields above are {@code null},
 *                            never a fabricated centroid or degenerate point
 */
public record RegionScopedAreaGroup(
        String groupSlug,
        String name,
        String subtitle,
        String scopingRegionKey,
        int regionDisplayOrder,
        List<String> areaKeys,
        long listingCount,
        Double focusLat,
        Double focusLon,
        Double minLat,
        Double minLon,
        Double maxLat,
        Double maxLon,
        String boundsStatus
) {

    public static final String BOUNDS_COMPLETE = "COMPLETE";
    public static final String BOUNDS_APPROXIMATE = "APPROXIMATE";
    public static final String BOUNDS_UNAVAILABLE = "UNAVAILABLE";

    /**
     * Wrapper response for
     * {@code GET /api/discover/cities/{citySlug}/regions/{regionKey}/groups} (#1910 PR1).
     *
     * <p>Unknown {@code citySlug}/{@code regionKey}, or a region with no group having any member
     * in it, yields {@code groups = []} — 200 OK, never 404 — mirroring
     * {@link RegionSummaryResponse}'s unknown-city contract.
     */
    public record Response(String citySlug, String regionKey, List<RegionScopedAreaGroup> groups) {}
}
