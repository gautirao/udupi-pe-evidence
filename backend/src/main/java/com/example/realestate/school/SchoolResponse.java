package com.example.realestate.school;

/**
 * Public read-only view of a {@link School}.
 * Returned by all school search and nearby endpoints.
 */
public record SchoolResponse(
        String id,
        String name,
        String boardType,
        String board,
        double latitude,
        double longitude,
        String address,
        Double distanceKm,
        String prominenceTier,
        String schoolCategory
) {
    /** Converts a School entity to a response DTO (without distance). */
    public static SchoolResponse from(School s) {
        return new SchoolResponse(
                s.getId().toString(),
                s.getName(),
                s.getBoardType(),
                s.getBoard(),
                s.getLatitude(),
                s.getLongitude(),
                s.getAddress(),
                null,
                s.getProminenceTier(),
                s.getSchoolCategory()
        );
    }

    /** Converts a School entity to a response DTO with a computed distance. */
    public static SchoolResponse from(School s, Double distanceKm) {
        return new SchoolResponse(
                s.getId().toString(),
                s.getName(),
                s.getBoardType(),
                s.getBoard(),
                s.getLatitude(),
                s.getLongitude(),
                s.getAddress(),
                distanceKm,
                s.getProminenceTier(),
                s.getSchoolCategory()
        );
    }
}
