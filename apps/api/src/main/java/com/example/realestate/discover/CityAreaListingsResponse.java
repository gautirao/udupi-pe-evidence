package com.example.realestate.discover;

import java.util.List;

/**
 * Top-level response for GET /api/discover/cities/{city}/listings.
 *
 * @param city         city slug as supplied in the path (lowercased)
 * @param limitPerArea effective limit applied per area (clamped to max 20)
 * @param areas        one entry per requested areaKey, in request order
 */
public record CityAreaListingsResponse(
        String city,
        int limitPerArea,
        List<AreaListingsEntry> areas
) {}
