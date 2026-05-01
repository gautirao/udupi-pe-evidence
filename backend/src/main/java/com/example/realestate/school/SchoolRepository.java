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

    /**
     * Returns notable schools scoped to the city identified by {@code citySlug}.
     *
     * <p>City scoping uses the district join:
     * {@code schools.district IN (SELECT DISTINCT a.district FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = ?)}.
     * This is safe because {@code areas.district} maps 1:N to cities.
     *
     * <p>Results are ordered {@code name ASC, id ASC} for stable, deterministic output.
     *
     * @param citySlug the city slug (e.g. "udupi")
     * @param limit    maximum number of results to return
     * @return notable schools in the city, ordered by name then id
     */
    @Query(value = """
            SELECT s.*
            FROM schools s
            WHERE s.prominence_tier = 'notable'
              AND s.district IN (
                  SELECT DISTINCT a.district
                  FROM areas a
                  JOIN cities c ON c.id = a.city_id
                  WHERE c.slug = :citySlug
              )
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<School> findPopularByCity(
            @Param("citySlug") String citySlug,
            @Param("limit") int limit);

    /**
     * Returns {@code true} if the {@code areas} table contains a row for {@code areaKey}.
     * Used to distinguish "unknown area" (404) from "valid area with no nearby schools" (200 empty).
     *
     * @param areaKey pipe-separated area key
     * @return 1 if the area exists, 0 otherwise
     */
    @Query(value = "SELECT COUNT(*) FROM areas WHERE area_key = :areaKey", nativeQuery = true)
    int countByAreaKey(@Param("areaKey") String areaKey);

    /**
     * Returns notable schools within 2 km of the area centroid for the given {@code areaKey}.
     *
     * <p>The area centroid is resolved from {@code areas.geo_center_lat / geo_center_lon}.
     * If no row exists for {@code areaKey}, the query returns an empty list; callers are
     * responsible for distinguishing "unknown area" from "area with no nearby schools"
     * by first verifying that the area exists.
     *
     * <p>Results are ordered {@code name ASC, id ASC} for stable, deterministic output.
     *
     * @param areaKey      pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param radiusMeters proximity radius in metres (typically 2000)
     * @param limit        maximum number of results to return
     * @return notable schools near the area centroid, ordered by name then id
     */
    @Query(value = """
            SELECT s.*
            FROM schools s
            JOIN areas a ON a.area_key = :areaKey
            WHERE s.prominence_tier = 'notable'
              AND ST_DWithin(
                  ST_Point(s.longitude, s.latitude)::geography,
                  ST_Point(a.geo_center_lon, a.geo_center_lat)::geography,
                  :radiusMeters
              )
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<School> findPopularByArea(
            @Param("areaKey") String areaKey,
            @Param("radiusMeters") double radiusMeters,
            @Param("limit") int limit);
}
