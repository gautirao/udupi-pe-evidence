package com.example.realestate.ai;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum PropertyType {

    HOUSE("house"),
    APARTMENT("apartment"),
    LAND("land"),
    COMMERCIAL("commercial"),
    COMMERCIAL_BUILDING("commercial_building"),
    WAREHOUSE("warehouse"),
    COMMERCIAL_LAND("commercial_land"),
    OTHER("other"),
    AGRICULTURAL_LAND("agricultural_land");

    private final String value;

    PropertyType(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static PropertyType fromValue(String value) {
        if (value == null) {
            throw new IllegalArgumentException("property_type must not be null");
        }
        for (PropertyType type : values()) {
            if (type.value.equalsIgnoreCase(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown property_type: " + value);
    }
}
