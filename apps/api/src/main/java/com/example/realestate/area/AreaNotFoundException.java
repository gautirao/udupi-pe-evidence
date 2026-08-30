package com.example.realestate.area;

/**
 * Thrown when no area_overview_stats row exists for the requested area key.
 * Mapped to HTTP 404 by GlobalExceptionHandler.
 */
public class AreaNotFoundException extends RuntimeException {

    private final String areaKey;

    public AreaNotFoundException(String areaKey) {
        super("Area not found: " + areaKey);
        this.areaKey = areaKey;
    }

    public String getAreaKey() {
        return areaKey;
    }
}
