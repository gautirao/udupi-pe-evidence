package com.example.realestate.discover;

import java.util.List;

/**
 * Result of {@link CityRegionOnboardingService#dryRun(int)} (also computed internally, then
 * re-validated, by {@link CityRegionOnboardingService#apply(int)}) (#1882).
 *
 * <p>{@code regionModel} is {@code null} when the city has no {@code city_region_policy} row
 * yet — {@code apply()} treats that as a hard blocker. {@code classificationsPresent} is
 * {@code false} when {@code regional_area_classifications} has zero rows for the city (the
 * backfill has not run yet) — also a hard blocker for {@code apply()}.
 *
 * @param cityId                 the city's integer id
 * @param citySlug               resolved city slug, or {@code null} if the city id doesn't exist
 * @param cityName               resolved city display name, or {@code null} if unknown
 * @param regionModel            the city's region_model, or {@code null} if no policy row exists
 * @param centralRadiusKm        the city's CENTRAL-bucket radius (meaningless if regionModel is null)
 * @param classificationsPresent whether the selected classification source (legacy table or
 *                               computed canonical geometry, #2163) yielded at least one
 *                               eligible area for this city
 * @param areaProjections        every eligible (4-segment) classified area, with its projected region_key
 * @param groupCategorizations   every active area_group's UNIFIED/SPLIT/DEGENERATE categorization,
 *                               based on the raw (pre-override) projection
 */
record CityRegionOnboardingReport(
        int cityId,
        String citySlug,
        String cityName,
        String regionModel,
        double centralRadiusKm,
        boolean classificationsPresent,
        List<AreaProjection> areaProjections,
        List<GroupCategorization> groupCategorizations
) {

    enum GroupCategory { UNIFIED, SPLIT, DEGENERATE }

    /**
     * @param geoCenterLat area's geo_center_lat (nullable, mirrors the areas table)
     * @param minLat       area's bbox min_lat (nullable; falls back to geoCenterLat when absent)
     */
    record AreaProjection(
            String areaKey,
            String regionKey,
            double distanceKm,
            String directionKey,
            Double geoCenterLat,
            Double geoCenterLon,
            Double minLat,
            Double minLon,
            Double maxLat,
            Double maxLon
    ) {}

    /**
     * @param distinctRegionKeys the distinct raw-projected regions among the group's eligible
     *                           (classified) members — empty for DEGENERATE, size 1 for UNIFIED,
     *                           size &ge;2 for SPLIT
     */
    record GroupCategorization(
            String groupSlug,
            String groupName,
            GroupCategory category,
            List<String> distinctRegionKeys,
            List<String> memberAreaKeys
    ) {}
}
