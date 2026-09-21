package com.example.realestate.poi;

/**
 * Public read-only view of a {@link ListingPoi}.
 * Returned by the public GET /api/listings/{listingId}/pois endpoint.
 */
public record PoiResponse(
        String id,
        String name,
        String category,
        Integer distanceMeters,
        Double latitude,
        Double longitude,
        boolean pinned,
        boolean approved,
        boolean brokerAdded
) {
    public static PoiResponse from(ListingPoi p) {
        return new PoiResponse(
                p.getId().toString(),
                p.getName(),
                p.getCategory(),
                p.getDistanceMeters(),
                p.getLatitude(),
                p.getLongitude(),
                Boolean.TRUE.equals(p.getPinned()),
                Boolean.TRUE.equals(p.getApproved()),
                "manual".equals(p.getSource())
        );
    }
}
