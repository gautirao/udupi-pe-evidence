package com.example.realestate.school;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;
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

    /**
     * Autocomplete search scoped to a single city, using the same district-based city JOIN
     * as {@link #findPopularByCity}: {@code schools.district IN (SELECT DISTINCT a.district
     * FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = ?)}.
     *
     * <p>Used when a caller supplies a non-blank {@code city} scope to
     * {@code GET /api/public/schools/search}, preventing an unscoped substring match from
     * returning schools outside the requested city (e.g. a Bangalore "heb" search returning
     * Udupi schools).
     *
     * @param name     substring to match against school name (case-insensitive)
     * @param citySlug city slug to scope results to (e.g. "udupi")
     * @param limit    maximum number of results to return
     * @return matching schools within the city, name-substring matched
     */
    @Query(value = """
            SELECT s.*
            FROM schools s
            WHERE s.name ILIKE CONCAT('%', CAST(:name AS text), '%')
              AND s.district IN (
                  SELECT DISTINCT a.district
                  FROM areas a
                  JOIN cities c ON c.id = a.city_id
                  WHERE c.slug = :citySlug
              )
            ORDER BY s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<School> findByNameContainingIgnoreCaseAndCity(
            @Param("name") String name,
            @Param("citySlug") String citySlug,
            @Param("limit") int limit);

    /**
     * Group-scoped autocomplete search (issue #1812): same district-based city JOIN as
     * {@link #findByNameContainingIgnoreCaseAndCity}, but additionally ranks schools whose
     * {@code area_key} is in {@code areaKeys} FIRST, BEFORE the {@code LIMIT} is applied — so
     * an in-scope school that would rank past the city-wide limit still survives.
     *
     * <p>Leaves {@link #findByNameContainingIgnoreCaseAndCity} untouched; this is a NEW method
     * that only activates when the caller has both a non-empty {@code areaKeys} collection and a
     * city (see {@link SchoolService#search(String, int, String, List)}).
     *
     * <p>{@code :areaKeys} is bound as a parameterized collection (JPA expands the {@code IN}
     * clause) — no string interpolation, so a value like {@code area-1" OR "1"="1} is treated as
     * a literal, not parsed as SQL.
     *
     * <p>A {@code null} {@code area_key} never matches the {@code IN} clause (SQL {@code NULL IN
     * (...)} evaluates to {@code NULL}, not {@code TRUE}), so schools with no area assignment are
     * always ranked out-of-scope ({@code in_scope=false}).
     *
     * @param name     substring to match against school name (case-insensitive)
     * @param citySlug city slug to scope results to (e.g. "bangalore")
     * @param areaKeys the focused group's member area keys (non-empty)
     * @param limit    maximum number of results to return (applied AFTER in-scope ranking)
     * @return matching schools within the city, in-scope-first, then name ASC, id ASC
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
                s.school_category AS "schoolCategory",
                s.area_key        AS "areaKey",
                (CASE WHEN s.area_key IN (:areaKeys) THEN true ELSE false END) AS "inScope"
            FROM schools s
            WHERE s.name ILIKE CONCAT('%', CAST(:name AS text), '%')
              AND s.district IN (
                  SELECT DISTINCT a.district
                  FROM areas a
                  JOIN cities c ON c.id = a.city_id
                  WHERE c.slug = :citySlug
              )
            ORDER BY (CASE WHEN s.area_key IN (:areaKeys) THEN 0 ELSE 1 END), s.name ASC, s.id ASC
            LIMIT :limit
            """, nativeQuery = true)
    List<ScopedSchoolProjection> findByNameContainingIgnoreCaseAndCityAndAreaKeys(
            @Param("name") String name,
            @Param("citySlug") String citySlug,
            @Param("areaKeys") List<String> areaKeys,
            @Param("limit") int limit);

    /**
     * Projection interface for {@link #findByNameContainingIgnoreCaseAndCityAndAreaKeys} results.
     * Carries every field {@link SchoolResponse} needs plus the computed {@code in_scope} flag.
     */
    interface ScopedSchoolProjection {
        UUID getId();
        String getName();
        String getBoardType();
        String getBoard();
        Double getLatitude();
        Double getLongitude();
        String getAddress();
        String getProminenceTier();
        String getSchoolCategory();
        String getAreaKey();
        Boolean getInScope();
    }

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
     * Uses PostGIS ST_DWithin against the stored {@code s.geog} geography column so the
     * {@code idx_schools_geog} GiST index (V76) can be used instead of performing a
     * full sequential scan with a recomputed {@code ST_Point(lon,lat)::geography} expression.
     *
     * <p>PostGIS convention: {@code ST_MakePoint(lon, lat)} — longitude first, latitude second.
     * V75 generated {@code s.geog} as {@code ST_MakePoint(longitude, latitude)::geography},
     * so the query-point must use the same lon/lat argument order.
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
                    s.geog,
                    ST_MakePoint(:lon, :lat)::geography
                ) / 1000.0 AS "distanceKm"
            FROM schools s
            WHERE ST_DWithin(
                s.geog,
                ST_MakePoint(:lon, :lat)::geography,
                :radiusMeters
            )
            ORDER BY "distanceKm" ASC
            """, nativeQuery = true)
    List<NearbySchoolProjection> findNearbySchools(
            @Param("lat") double lat,
            @Param("lon") double lon,
            @Param("radiusMeters") double radiusMeters);

    /**
     * Projection interface for the batch listing-count query.
     * Maps each school ID to its count of nearby SCRAPED/LIVE listings.
     */
    interface SchoolListingCountProjection {
        UUID getSchoolId();
        Integer getListingCount();
    }

    /**
     * Counts nearby SCRAPED/LIVE (non-duplicate, valid, non-null geography) property listings
     * for each school in {@code schoolIds} within {@code radiusMeters}.
     *
     * <p>Uses a LEFT JOIN so schools with zero matching listings still appear in the result set,
     * preventing them from being silently dropped (which would cause the service to treat them
     * as missing and default to {@code 0} via {@code getOrDefault}).
     *
     * @param schoolIds    set of school IDs to compute counts for
     * @param radiusMeters radius in metres (typically 1000 for 1 km)
     * @return one projection per school in {@code schoolIds}
     */
    @Query(value = """
            SELECT s.id AS schoolId, COUNT(pl.id) AS listingCount
            FROM schools s
            LEFT JOIN property_listings pl
              ON ST_DWithin(pl.geog, s.geog, :radiusMeters)
             AND pl.status IN ('SCRAPED', 'LIVE')
             AND pl.is_duplicate = false
             AND pl.is_valid = true
             AND pl.geog IS NOT NULL
            WHERE s.id IN (:schoolIds)
            GROUP BY s.id
            """, nativeQuery = true)
    List<SchoolListingCountProjection> countNearbyListings(
            @Param("schoolIds") Set<UUID> schoolIds,
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
