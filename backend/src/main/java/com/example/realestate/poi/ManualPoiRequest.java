package com.example.realestate.poi;

/** Request body for dealer-added manual POIs. */
public record ManualPoiRequest(
        String name,
        String category,
        double latitude,
        double longitude
) {}
