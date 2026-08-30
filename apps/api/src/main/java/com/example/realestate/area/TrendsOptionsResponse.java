package com.example.realestate.area;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Response DTO for GET /api/trends/options?city=X.
 *
 * <p>Returns the top trending areas for the given city, used by the Trends page
 * to populate the area dropdown and to seed the initial URL when no areaKey is present.
 */
public record TrendsOptionsResponse(
        @JsonProperty("city")         String city,
        @JsonProperty("defaultAreas") List<TrendsOptionDto> defaultAreas
) {

    public record TrendsOptionDto(
            @JsonProperty("areaKey")   String areaKey,
            @JsonProperty("areaLabel") String areaLabel
    ) {}
}
