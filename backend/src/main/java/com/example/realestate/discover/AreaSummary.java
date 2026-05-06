package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaSummary(
        String areaKey,
        String name,
        double geoCenterLat,
        double geoCenterLon,
        Double minLat,
        Double minLon,
        Double maxLat,
        Double maxLon,
        long listingCount,
        Long medianPricePaise,
        String trendDirection,
        String confidenceTier,
        long schoolCount
) {}
