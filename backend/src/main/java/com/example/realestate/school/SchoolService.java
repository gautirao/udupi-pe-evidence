package com.example.realestate.school;

import com.example.realestate.area.AreaNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for {@link School} business logic.
 * Provides autocomplete search, nearby spatial queries, and single-school lookup.
 */
@Service
public class SchoolService {

    private static final Logger log = LoggerFactory.getLogger(SchoolService.class);

    /** Default search result limit for autocomplete. */
    private static final int DEFAULT_SEARCH_LIMIT = 10;

    /** Maximum allowed radius in km for nearby queries (prevents abuse). */
    private static final double MAX_RADIUS_KM = 50.0;

    /** Fixed 2 km radius used for area-scoped queries. */
    private static final double AREA_RADIUS_METERS = 2000.0;

    private final SchoolRepository repository;

    public SchoolService(SchoolRepository repository) {
        this.repository = repository;
    }

    /**
     * Autocomplete search by school name (case-insensitive substring match).
     *
     * @param query  search string
     * @param limit  max results (clamped to 1..50)
     * @return matching schools as response DTOs
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> search(String query, int limit) {
        int clampedLimit = Math.max(1, Math.min(50, limit));
        log.debug("search query='{}' limit={}", query, clampedLimit);

        return repository.findByNameContainingIgnoreCase(query, PageRequest.of(0, clampedLimit))
                .stream()
                .map(SchoolResponse::from)
                .toList();
    }

    /**
     * Finds schools within a given radius of a point.
     *
     * @param lat       latitude of the centre point
     * @param lon       longitude of the centre point
     * @param radiusKm  radius in kilometres (clamped to 0.1..50)
     * @return nearby schools with distance, ordered closest first
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> findNearby(double lat, double lon, double radiusKm) {
        double clampedRadiusKm = Math.max(0.1, Math.min(MAX_RADIUS_KM, radiusKm));
        double radiusMeters = clampedRadiusKm * 1000.0;

        log.debug("findNearby lat={} lon={} radiusKm={}", lat, lon, clampedRadiusKm);

        return repository.findNearbySchools(lat, lon, radiusMeters)
                .stream()
                .map(p -> new SchoolResponse(
                        p.getId().toString(),
                        p.getName(),
                        p.getBoardType(),
                        p.getBoard(),
                        p.getLatitude(),
                        p.getLongitude(),
                        p.getAddress(),
                        p.getDistanceKm() != null
                                ? Math.round(p.getDistanceKm() * 100.0) / 100.0
                                : null,
                        p.getProminenceTier(),
                        p.getSchoolCategory()
                ))
                .toList();
    }

    /**
     * Returns a single school by ID.
     */
    @Transactional(readOnly = true)
    public Optional<SchoolResponse> findById(UUID id) {
        return repository.findById(id).map(SchoolResponse::from);
    }

    /**
     * Returns notable schools scoped to the city identified by {@code citySlug},
     * ordered by name ASC then id ASC for stable output.
     *
     * <p>An unknown city slug returns an empty list (200) — not an error.
     *
     * @param citySlug city slug (e.g. "udupi")
     * @param limit    maximum results (clamped to 1..50)
     * @return matching schools as response DTOs with distanceKm=null
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> findPopularByCity(String citySlug, int limit) {
        int clampedLimit = Math.max(1, Math.min(50, limit));
        log.debug("findPopularByCity citySlug='{}' limit={}", citySlug, clampedLimit);
        return repository.findPopularByCity(citySlug, clampedLimit)
                .stream()
                .map(SchoolResponse::from)
                .toList();
    }

    /**
     * Returns notable schools within 2 km of the area centroid for the given {@code areaKey}.
     *
     * <p>Uses a single LEFT JOIN query (areas → schools) to eliminate the TOCTOU race that
     * would exist if area existence were checked in a separate {@code countByAreaKey} query.
     * An empty result set means the area itself does not exist.
     *
     * @param areaKey pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param limit   maximum results (clamped to 1..50)
     * @return matching schools as response DTOs with distanceKm=null
     * @throws AreaNotFoundException if no area row exists for the given areaKey
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> findPopularByArea(String areaKey, int limit) {
        int clampedLimit = Math.max(1, Math.min(50, limit));
        log.debug("findPopularByArea areaKey='{}' limit={}", areaKey, clampedLimit);

        List<SchoolRepository.AreaSchoolProjection> rows =
                repository.findPopularByArea(areaKey, AREA_RADIUS_METERS, clampedLimit);

        // Empty result → area_key not found in areas table
        if (rows.isEmpty()) {
            log.warn("findPopularByArea: unknown areaKey='{}'", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

        // LEFT JOIN: single row with null id → area found but no nearby notable schools
        return rows.stream()
                .filter(p -> p.getId() != null)
                .map(p -> new SchoolResponse(
                        p.getId().toString(),
                        p.getName(),
                        p.getBoardType(),
                        p.getBoard(),
                        p.getLatitude(),
                        p.getLongitude(),
                        p.getAddress(),
                        null,
                        p.getProminenceTier(),
                        p.getSchoolCategory()
                ))
                .toList();
    }

    /**
     * Returns schools within 2 km of the area centroid for the given {@code areaKey},
     * with optional board and category filters. Does NOT filter by prominence_tier.
     *
     * @param areaKey    pipe-separated area key (e.g. "IN|KA|Udupi|Manipal")
     * @param boards     board values to filter by (empty = all); normalized to uppercase
     * @param categories category values to filter by (empty = all)
     * @param page       zero-based page number
     * @param size       page size (clamped to [1, 50])
     * @return matching schools as response DTOs
     * @throws AreaNotFoundException if no area row exists for the given areaKey
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> getSchoolsByArea(
            String areaKey,
            List<String> boards,
            List<String> categories,
            int page,
            int size) {

        int clampedSize = Math.max(1, Math.min(50, size));
        int clampedPage = Math.max(0, page);
        int offset = clampedPage * clampedSize;

        List<String> normalizedBoards = boards == null ? List.of()
                : boards.stream()
                        .filter(b -> b != null && !b.isBlank())
                        .map(b -> b.trim().toUpperCase(Locale.ROOT))
                        .toList();

        List<String> normalizedCategories = categories == null ? List.of()
                : categories.stream()
                        .filter(c -> c != null && !c.isBlank())
                        .map(String::trim)
                        .toList();

        log.debug("getSchoolsByArea areaKey='{}' boards={} categories={} page={} size={}",
                areaKey, normalizedBoards, normalizedCategories, clampedPage, clampedSize);

        // findByAreaProximity uses INNER JOIN on areas — empty result means area not found.
        // Validate area existence via a separate count only when the result is empty to avoid
        // returning 404 on a valid area that has no matching schools after filtering.
        List<SchoolRepository.AreaSchoolProjection> rows = repository.findByAreaProximity(
                areaKey, AREA_RADIUS_METERS,
                normalizedBoards, normalizedCategories,
                offset, clampedSize);

        if (rows.isEmpty() && repository.countByAreaKey(areaKey) == 0) {
            log.warn("getSchoolsByArea: unknown areaKey='{}'", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

        return rows.stream()
                .map(p -> new SchoolResponse(
                        p.getId().toString(),
                        p.getName(),
                        p.getBoardType(),
                        p.getBoard(),
                        p.getLatitude(),
                        p.getLongitude(),
                        p.getAddress(),
                        null,
                        p.getProminenceTier(),
                        p.getSchoolCategory()
                ))
                .toList();
    }

    /**
     * Returns notable schools scoped to the city identified by {@code citySlug},
     * with optional board and category filters. Preserves prominence_tier='notable'
     * and all existing city-scoping behaviour.
     *
     * @param citySlug   city slug (e.g. "udupi")
     * @param boards     board values to filter by (empty = all); normalized to uppercase
     * @param categories category values to filter by (empty = all)
     * @param limit      maximum results (clamped to 1..50)
     * @return matching schools as response DTOs
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> getPopularSchoolsWithFilters(
            String citySlug,
            List<String> boards,
            List<String> categories,
            int limit) {

        int clampedLimit = Math.max(1, Math.min(50, limit));

        List<String> normalizedBoards = boards == null ? List.of()
                : boards.stream()
                        .filter(b -> b != null && !b.isBlank())
                        .map(b -> b.trim().toUpperCase(Locale.ROOT))
                        .toList();

        List<String> normalizedCategories = categories == null ? List.of()
                : categories.stream()
                        .filter(c -> c != null && !c.isBlank())
                        .map(String::trim)
                        .toList();

        log.debug("getPopularSchoolsWithFilters citySlug='{}' boards={} categories={} limit={}",
                citySlug, normalizedBoards, normalizedCategories, clampedLimit);

        return repository.findPopularByCityWithFilters(citySlug, normalizedBoards, normalizedCategories, clampedLimit)
                .stream()
                .map(SchoolResponse::from)
                .toList();
    }
}
