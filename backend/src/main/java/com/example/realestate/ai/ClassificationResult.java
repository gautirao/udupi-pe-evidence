package com.example.realestate.ai;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

/**
 * Strict mapping of the AI tool-call response.
 * No unknown properties are tolerated — malformed responses will throw.
 */
public record ClassificationResult(
        @JsonProperty(value = "is_real_estate", required = true) boolean isRealEstate,
        @JsonProperty(value = "property_type", required = true) PropertyType propertyType,
        @JsonProperty("price") BigDecimal price,
        @JsonProperty("price_unit") String priceUnit,
        @JsonProperty("locality") String locality,
        @JsonProperty("bedrooms") Integer bedrooms,
        @JsonProperty("bathrooms") Integer bathrooms,
        @JsonProperty("land_area") BigDecimal landArea,
        @JsonProperty("land_area_unit") String landAreaUnit,
        @JsonProperty("built_area") BigDecimal builtArea,
        @JsonProperty("built_area_unit") String builtAreaUnit,
        @JsonProperty("contact_phone") String contactPhone,
        @JsonProperty("contact_info") String contactInfo,
        @JsonProperty("description") String description,
        @JsonProperty(value = "confidence_score", required = true) int confidenceScore
) {
}
