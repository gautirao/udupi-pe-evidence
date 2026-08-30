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
        long schoolCount,
        // #1371: total approved agri acreage for this area. Non-null only when the agri
        // filter (propertyType=agricultural_land) is active AND at least one matching
        // listing has a parseable land_area + recognised unit. @JsonInclude(NON_NULL)
        // omits it on the blended path and for agri areas with no parseable rows.
        Double agriAcreage
) {}
