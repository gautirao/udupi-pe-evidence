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
     * Returns notable schools within 2 km of the area centroid for the given {@code areaKey},
     * using a single LEFT JOIN query that also signals area existence.
     *
     * <p>Query shape: {@code FROM areas a LEFT JOIN schools s ON proximity + notable filter
     * WHERE a.area_key = :areaKey}. This eliminates the TOCTOU race that existed when a
     * separate {@code countByAreaKey} check preceded the schools query.
     *
     * <p>Result interpretation:
     * <ul>
     *   <li>Empty result (0 rows) → area does not exist → caller throws AreaNotFoundException.</li>
     *   <li>1 row with {@code id = NULL} → area exists but has no nearby notable schools → return
     *       empty list.</li>
     *   <li>N rows with non-null {@code id} → area exists with schools → map and return.</li>
     * </ul>
     *
     * <p>Uses {@code s.geog} directly (backed by {@code idx_schools_geog_gist}) for index
     * utilisation. The area centroid is resolved from {@code areas.geo_center_lat /
     * geo_center_lon}.
     *
     * <p>Results are ordered {@code s.name ASC, s.id ASC} for stable, deterministic output.
     *
     * @param areaKey      pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param radiusMeters proximity radius in metres (typically 2000)
     * @param limit        maximum number of results to return
     * @return rows from the LEFT JOIN; check {@code getId()} for null to detect "area found, no schools"
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
            FROM areas a
            LEFT JOIN schools s
                ON s.prominence_tier = 'notable'
               AND ST_DWithin(s.geog, ST_Point(a.geo_center_lon, a.geo_center_lat)::geography, :radiusMeters)
            WHERE a.area_key = :areaKey
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<AreaSchoolProjection> findPopularByArea(
            @Param("areaKey") String areaKey,
            @Param("radiusMeters") double radiusMeters,
            @Param("limit") int limit);

    /**
     * Returns schools within a given radius of the area centroid for {@code areaKey},
     * with optional board and category filters. Does NOT filter by prominence_tier.
     *
     * <p>Uses {@code schools.geog} column directly (GENERATED ALWAYS AS, backed by
     * {@code idx_schools_geog_gist}) for maximum index utilisation.
     *
     * <p>Board and category filters are applied only when the respective lists are non-empty.
     * An empty {@code boards} or {@code categories} list means "no filter on that dimension".
     *
     * @param areaKey      pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param radiusMeters proximity radius in metres (typically 2000)
     * @param boards       board values to include (empty = all boards)
     * @param categories   category values to include (empty = all categories)
     * @param offset       pagination offset
     * @param limit        page size (clamped by caller to [1, 50])
     * @return schools near the area centroid matching all filters
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
            JOIN areas a ON a.area_key = :areaKey
            WHERE s.geog IS NOT NULL
              AND ST_DWithin(s.geog, ST_Point(a.geo_center_lon, a.geo_center_lat)::geography, :radiusMeters)
              AND (:#{#boards.isEmpty()} = true  OR upper(s.board) IN :boards)
              AND (:#{#categories.isEmpty()} = true OR s.school_category IN :categories)
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit OFFSET :offset
            """, nativeQuery = true)
    List<AreaSchoolProjection> findByAreaProximity(
            @Param("areaKey") String areaKey,
            @Param("radiusMeters") double radiusMeters,
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
