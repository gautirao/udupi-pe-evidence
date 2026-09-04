package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One candidate area for the AREA_SET "nearby suggestions" chip strip (#2017).
 *
 * <p>{@code eligibleListingCount} is scoped to the SAME active discover filter predicate used by
 * the map/listing endpoints ({@link DiscoverListingPredicateBuilder#build}), so a candidate's
 * count agrees with what the user would actually see if they added this area to their selection.
 * {@code schoolCount} reuses {@link AreaSummaryService#SCHOOL_COUNT_SUBQUERY} verbatim.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NearbyAreaCandidate(
        String areaKey,
        String name,
        double geoCenterLat,
        double geoCenterLon,
        long eligibleListingCount,
        long schoolCount
) {}
