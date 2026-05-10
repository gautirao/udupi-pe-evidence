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
     * Includes the computed distance in kilometres and school_category.
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
        String getSchoolCategory();
    }

    /**
     * Projection interface for by-area school query results.
     * Uses schools.geog directly (ST_DWithin on the stored geography column).
     */
    interface AreaSchoolProjection {
        UUID getId();
        String getName();
        String getBoardType();
        String getBoard();
        Double getLatitude();
        Double getLongitude();
        String getAddress();
        String getProminenceTier();
        String getSchoolCategory();
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
                s.school_category AS "schoolCategory",
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
     * Returns 1 if the {@code areas} table contains a row for {@code areaKey}, 0 otherwise.
     * Used by {@code getSchoolsByArea} as a fallback check when the proximity query returns
     * an empty list, to distinguish "area not found" (404) from "area with no matching schools"
     * (200 empty).
     *
     * @param areaKey pipe-separated area key
     * @return 1 if the area exists, 0 otherwise
     */
    @Query(value = "SELECT COUNT(*) FROM areas WHERE area_key = :areaKey", nativeQuery = true)
    int countByAreaKey(@Param("areaKey") String areaKey);

    /**
     * Returns notable schools assigned to the given {@code areaKey} via FK matching.
     *
     * <p>Query shape: {@code FROM schools s WHERE s.area_key = :areaKey AND s.prominence_tier = 'notable'
     * ORDER BY s.name ASC, s.id ASC}. This uses the deterministic area_key FK assignment from
     * the V79 migration (nearest_configured_area_within_district algorithm).
     *
     * <p>An empty result does NOT signal whether the area exists; callers must use {@code countByAreaKey}
     * separately to distinguish "area not found" (404) from "area with no notable schools" (200 empty).
     *
     * <p>Results are ordered {@code s.name ASC, s.id ASC} for stable, deterministic output.
     *
     * @param areaKey pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param limit   maximum number of results to return
     * @return notable schools assigned to this area
     */
    @Query(value = """
            SELECT
                s.id,
                s.name,
                s.board_type      AS "boardType",
                s.board           AS "board",
                s.latitude,
                s.longitude,
                s.address,
                s.prominence_tier AS "prominenceTier",
                s.school_category AS "schoolCategory"
            FROM schools s
            WHERE s.area_key = :areaKey
              AND s.prominence_tier = 'notable'
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<AreaSchoolProjection> findPopularByAreaKey(
            @Param("areaKey") String areaKey,
            @Param("limit") int limit);

    /**
     * Returns schools assigned to {@code areaKey} via FK matching,
     * with optional board and category filters. Does NOT filter by prominence_tier.
     *
     * <p>Uses {@code schools.area_key} FK for deterministic assignment (from V79 migration).
     *
     * <p>Board and category filters are applied only when the respective lists are non-empty.
     * An empty {@code boards} or {@code categories} list means "no filter on that dimension".
     *
     * @param areaKey    pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param boards     board values to include (empty = all boards)
     * @param categories category values to include (empty = all categories)
     * @param offset     pagination offset
     * @param limit      page size (clamped by caller to [1, 50])
     * @return schools assigned to this area matching all filters
     */
    @Query(value = """
            SELECT
                s.id,
                s.name,
                s.board_type      AS "boardType",
                s.board           AS "board",
                s.latitude,
                s.longitude,
                s.address,
                s.prominence_tier AS "prominenceTier",
                s.school_category AS "schoolCategory"
            FROM schools s
            WHERE s.area_key = :areaKey
              AND (:#{#boards.isEmpty()} = true  OR upper(s.board) IN :boards)
              AND (:#{#categories.isEmpty()} = true OR s.school_category IN :categories)
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<AreaSchoolProjection> findByAreaKey(
            @Param("areaKey") String areaKey,
            @Param("boards") List<String> boards,
            @Param("categories") List<String> categories,
            @Param("offset") int offset,
            @Param("limit") int limit);

    /**
     * Returns notable schools scoped to the city identified by {@code citySlug},
     * with optional board and category filters. Preserves all existing city-scoping
     * behaviour (district-based JOIN) and prominence_tier='notable' filter.
     *
     * @param citySlug   city slug (e.g. "udupi")
     * @param boards     board values to include (empty = all boards)
     * @param categories category values to include (empty = all categories)
     * @param limit      maximum results
     * @return notable schools matching all filters
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
              AND (:#{#boards.isEmpty()} = true  OR upper(s.board) IN :boards)
              AND (:#{#categories.isEmpty()} = true OR s.school_category IN :categories)
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<School> findPopularByCityWithFilters(
            @Param("citySlug") String citySlug,
            @Param("boards") List<String> boards,
            @Param("categories") List<String> categories,
            @Param("limit") int limit);
}
