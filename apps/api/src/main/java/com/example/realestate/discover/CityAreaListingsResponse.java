package com.example.realestate.discover;

import java.util.List;

/**
 * Top-level response for GET /api/discover/cities/{city}/listings.
 *
 * @param city         city slug as supplied in the path (lowercased)
 * @param limitPerArea effective limit applied per area (clamped to max 20); in the bbox-only
 *                     mode (#2015, {@code areaKeys} absent and {@code bbox} present) this
 *                     instead carries the global result cap
 *                     ({@value CityAreaListingsService#BBOX_ONLY_MAX_RESULTS})
 * @param areas        one entry per requested areaKey, in request order; in the bbox-only mode
 *                     (#2015) there is no requested areaKey list, so entries are instead one
 *                     per area actually discovered within the viewport, ordered by first
 *                     occurrence in the result set
 */
public record CityAreaListingsResponse(
        String city,
        int limitPerArea,
        List<AreaListingsEntry> areas
) {}
