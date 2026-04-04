package com.example.realestate.school;

/**
 * Public read-only view of a {@link School}.
 * Returned by all school search and nearby endpoints.
 */
public record SchoolResponse(
        String id,
        String name,
        String boardType,
        double latitude,
        double longitude,
        String address,
        Double distanceKm,
        String prominenceTier
) {
    /** Converts a School entity to a response DTO (without distance). */
    public static SchoolResponse from(School s) {
        return new SchoolResponse(
                s.getId().toString(),
                s.getName(),
                s.getBoardType(),
                s.getLatitude(),
                s.getLongitude(),
                s.getAddress(),
                null,
                s.getProminenceTier()
        );
    }

    /** Converts a School entity to a response DTO with a computed distance. */
    public static SchoolResponse from(School s, Double distanceKm) {
        return new SchoolResponse(
                s.getId().toString(),
                s.getName(),
                s.getBoardType(),
                s.getLatitude(),
                s.getLongitude(),
                s.getAddress(),
                distanceKm,
                s.getProminenceTier()
        );
    }
}
