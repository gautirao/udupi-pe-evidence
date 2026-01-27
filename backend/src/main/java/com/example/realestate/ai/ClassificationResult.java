package com.example.realestate.ai;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ClassificationResult(
        @JsonProperty("is_real_estate") boolean isRealEstate,
        @JsonProperty("property_type") String propertyType,
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
        @JsonProperty("confidence_score") int confidenceScore
) {
}
