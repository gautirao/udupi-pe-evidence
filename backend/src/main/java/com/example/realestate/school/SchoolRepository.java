package com.example.realestate.school;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

/**
 * Repository for {@link School} entities.
 * Provides autocomplete search, board-type filtering, and spatial nearby queries.
 */
public interface SchoolRepository extends JpaRepository<School, UUID> {

    /**
     * Autocomplete search: finds schools whose name contains the query string (case-insensitive).
     * Results are limited by the provided {@link Pageable}.
     */
    List<School> findByNameContainingIgnoreCase(String name, Pageable pageable);

    /** Returns all schools with the given board type. */
    List<School> findByBoardType(String boardType);

    /**
     * Projection interface for nearby school query results.
     * Includes the computed distance in kilometres.
     */
    interface NearbySchoolProjection {
        UUID getId();
        String getName();
        String getBoardType();
        String getBoard();
        Double getLatitude();
        Double getLongitude();
        String getAddress();
        Double getDistanceKm();
        String getProminenceTier();
    }

    /**
     * Finds schools within a given radius of a point, ordered by distance ascending.
     * Uses PostGIS ST_DWithin with geography casts for accurate great-circle distance.
     *
     * @param lat          latitude of the centre point
     * @param lon          longitude of the centre point
     * @param radiusMeters radius in metres
     * @return schools within radius, closest first, with computed distance in km
     */
    @Query(value = """
            SELECT
                s.id,
                s.name,
                s.board_type AS "boardType",
                s.board AS "board",
                s.latitude,
                s.longitude,
                s.address,
                s.prominence_tier AS "prominenceTier",
                ST_Distance(
                    ST_Point(s.longitude, s.latitude)::geography,
                    ST_Point(:lon, :lat)::geography
                ) / 1000.0 AS "distanceKm"
            FROM schools s
            WHERE ST_DWithin(
                ST_Point(s.longitude, s.latitude)::geography,
                ST_Point(:lon, :lat)::geography,
                :radiusMeters
            )
            ORDER BY "distanceKm" ASC
            """, nativeQuery = true)
    List<NearbySchoolProjection> findNearbySchools(
            @Param("lat") double lat,
            @Param("lon") double lon,
            @Param("radiusMeters") double radiusMeters);
}
