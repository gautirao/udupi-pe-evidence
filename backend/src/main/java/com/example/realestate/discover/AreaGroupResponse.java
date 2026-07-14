package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTO record for a single area group returned by GET /api/discover/area-groups.
 * Focus/bounds and description fields are nullable and omitted from JSON when null
 * (@JsonInclude NON_NULL).
 *
 * <p>{@code regionKey} is derived AT READ time from {@code city_region_memberships}
 * (materialized by {@code CityRegionOnboardingService.apply}, #1882 Track A PR1) — it is
 * never a stored column, so it always reflects the group's CURRENT membership even if
 * {@code area_group_members} has been edited since the last onboarding apply(). It is
 * {@code null} when no member has a materialized region membership (DEGENERATE), the sole
 * region_key when every classified member agrees (UNIFIED), or the plurality region_key
 * (highest member count, ties broken by {@code city_regions.display_order} then
 * {@code region_key}) when members span more than one region (SPLIT). See
 * {@link AreaGroupsService} for the derivation and
 * {@link CityRegionOnboardingReport.GroupCategorization} for the UNIFIED/SPLIT/DEGENERATE
 * semantics this reuses.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaGroupResponse(
        String slug,
        String name,
        String subtitle,
        String regionLabel,
        int displayOrder,
        List<String> areaKeys,
        String regionKey,  // nullable; derived at read from city_region_memberships (#1882)
        Double focusLat,
        Double focusLon,
        Double minLat,
        Double minLon,
        Double maxLat,
        Double maxLon,
        String description  // nullable; omitted from JSON when null
) {}
