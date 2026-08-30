package com.example.realestate.school;

/**
 * Public read-only view of a {@link School}.
 * Returned by all school search and nearby endpoints.
 *
 * <p>{@code nearbyListingCount} is populated only for {@code /popular} responses
 * (count of SCRAPED/LIVE listings within 1 km). All other endpoints return {@code null}.
 *
 * <p>{@code inScope} (issue #1812) is populated only for group-scoped
 * {@code GET /api/public/schools/search?areaKeys=...} results: {@code true} when the school's
 * {@code areaKey} is a member of the requested {@code areaKeys}, {@code false} otherwise. It is
 * {@code null} for every other endpoint and for unscoped/city-only search, preserving backward
 * compatibility (AC6).
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
        String schoolCategory,
        Integer nearbyListingCount,
        String areaKey,
        Boolean inScope
) {
    /**
     * Legacy 12-arg constructor, preserved additively for backward compatibility with existing
     * callers (production and test) that construct {@code SchoolResponse} directly without an
     * {@code inScope} value. Delegates to the canonical constructor with {@code inScope=null}.
     */
    public SchoolResponse(
            String id,
            String name,
            String boardType,
            String board,
            double latitude,
            double longitude,
            String address,
            Double distanceKm,
            String prominenceTier,
            String schoolCategory,
            Integer nearbyListingCount,
            String areaKey
    ) {
        this(id, name, boardType, board, latitude, longitude, address, distanceKm,
                prominenceTier, schoolCategory, nearbyListingCount, areaKey, null);
    }

    /** Converts a School entity to a response DTO (without distance, without listing count). */
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
                s.getSchoolCategory(),
                null,
                s.getAreaKey()
        );
    }

    /** Converts a School entity to a response DTO with a nearby listing count. */
    public static SchoolResponse from(School s, Integer nearbyListingCount) {
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
                s.getSchoolCategory(),
                nearbyListingCount,
                s.getAreaKey()
        );
    }

    /** Converts a School entity to a response DTO with a computed distance (no listing count). */
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
                s.getSchoolCategory(),
                null,
                s.getAreaKey()
        );
    }

    /**
     * Converts an {@link SchoolRepository.AreaSchoolProjection} to a response DTO
     * with a nearby listing count.
     */
    public static SchoolResponse from(SchoolRepository.AreaSchoolProjection p, Integer nearbyListingCount) {
        return new SchoolResponse(
                p.getId().toString(),
                p.getName(),
                p.getBoardType(),
                p.getBoard(),
                p.getLatitude(),
                p.getLongitude(),
                p.getAddress(),
                null,
                p.getProminenceTier(),
                p.getSchoolCategory(),
                nearbyListingCount,
                null
        );
    }

    /**
     * Converts a {@link SchoolRepository.ScopedSchoolProjection} (group-scoped search, issue
     * #1812) to a response DTO, carrying the computed {@code inScope} flag through.
     */
    public static SchoolResponse from(SchoolRepository.ScopedSchoolProjection p) {
        return new SchoolResponse(
                p.getId().toString(),
                p.getName(),
                p.getBoardType(),
                p.getBoard(),
                p.getLatitude(),
                p.getLongitude(),
                p.getAddress(),
                null,
                p.getProminenceTier(),
                p.getSchoolCategory(),
                null,
                p.getAreaKey(),
                p.getInScope()
        );
    }
}
