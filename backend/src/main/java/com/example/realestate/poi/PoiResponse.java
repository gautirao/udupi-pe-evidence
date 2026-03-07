package com.example.realestate.poi;

import java.util.UUID;

/** Public-facing POI DTO — only approved, non-sensitive fields. */
public record PoiResponse(
        UUID id,
        String name,
        String category,
        int distanceMeters,
        double latitude,
        double longitude,
        boolean pinned
) {
    static PoiResponse from(ListingPoi p) {
        return new PoiResponse(
                p.getId(),
                p.getName(),
                p.getCategory(),
                p.getDistanceMeters() != null ? p.getDistanceMeters() : 0,
                p.getLatitude() != null ? p.getLatitude() : 0.0,
                p.getLongitude() != null ? p.getLongitude() : 0.0,
                p.isPinned()
        );
    }
}
