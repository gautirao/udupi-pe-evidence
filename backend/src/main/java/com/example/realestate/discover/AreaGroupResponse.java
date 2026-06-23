package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTO record for a single area group returned by GET /api/discover/area-groups.
 * Focus/bounds and description fields are nullable and omitted from JSON when null
 * (@JsonInclude NON_NULL).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaGroupResponse(
        String slug,
        String name,
        String subtitle,
        String regionLabel,
        int displayOrder,
        List<String> areaKeys,
        Double focusLat,
        Double focusLon,
        Double minLat,
        Double minLon,
        Double maxLat,
        Double maxLon,
        String description  // nullable; omitted from JSON when null
) {}
