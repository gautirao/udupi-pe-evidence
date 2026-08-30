package com.example.realestate.poi;

/**
 * Request DTO for POST /api/listings/{listingId}/pois/manual.
 * All fields are nullable at the record level; validation is performed in the controller.
 */
public record ManualPoiRequest(
        String name,
        String category,
        Double latitude,
        Double longitude
) {}
