package com.example.realestate.area;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Response DTO for GET /api/public/areas/trending.
 *
 * <p>Areas are sorted by {@code listingCount90d} descending. Rows with a zero
 * or NULL listing count are excluded by the service query.
 */
public record TrendingAreasResponse(
        @JsonProperty("areas") List<TrendingAreaDto> areas
) {

    /**
     * Per-area entry in the trending response.
     *
     * <p>Field names match the API spec exactly; {@code @JsonProperty} annotations
     * are present to guarantee the camelCase contract even if Jackson's naming
     * strategy is ever overridden at the application level.
     */
    public record TrendingAreaDto(
            @JsonProperty("areaKey")          String  areaKey,
            @JsonProperty("areaLabel")        String  areaLabel,
            @JsonProperty("districtLabel")    String  districtLabel,
            @JsonProperty("medianPricePaise") Long    medianPricePaise,
            @JsonProperty("listingCount90d")  Integer listingCount90d
    ) {}
}
