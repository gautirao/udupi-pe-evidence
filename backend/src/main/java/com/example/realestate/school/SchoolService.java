package com.example.realestate.school;

import com.example.realestate.area.AreaNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

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

    /** Radius used when counting nearby listings for popular-school responses. */
    public static final double LISTING_COUNT_RADIUS_KM = 1.0;

    private final SchoolRepository repository;

    public SchoolService(SchoolRepository repository) {
        this.repository = repository;
    }

    /**
     * Batch-fetches nearby listing counts for a list of school IDs.
     *
     * <p>Returns a map from school ID → count. Schools with no nearby listings are returned
     * by the LEFT JOIN query with count=0, so callers can use {@link Map#getOrDefault} safely.
     *
     * @param schoolIds list of school UUIDs to count for
     * @return map from school UUID to listing count (empty map if schoolIds is empty)
     */
    private Map<UUID, Integer> fetchListingCounts(List<UUID> schoolIds) {
        if (schoolIds.isEmpty()) {
            return Map.of();
        }
        return repository.countNearbyListings(
                        new HashSet<>(schoolIds),
                        LISTING_COUNT_RADIUS_KM * 1000)
                .stream()
                .collect(Collectors.toMap(
                        SchoolRepository.SchoolListingCountProjection::getSchoolId,
                        SchoolRepository.SchoolListingCountProjection::getListingCount));
    }

    /**
     * Autocomplete search by school name (case-insensitive substring match).
     *
     * <p>When {@code city} is present and non-blank, results are additionally scoped to that
     * city using the same district-based city JOIN as {@link #findPopularByCity}. A null or
     * blank {@code city} preserves the original globally-unscoped behaviour.
     *
     * @param query  search string
     * @param limit  max results (clamped to 1..50)
     * @param city   optional city slug to scope results to (e.g. "udupi"); null/blank = unscoped
     * @return matching schools as response DTOs
     */
    @Transactional(readOnly = true)
    public List<SchoolResponse> search(String query, int limit, String city) {
        int clampedLimit = Math.max(1, Math.min(50, limit));

        if (city != null && !city.isBlank()) {
            String trimmedCity = city.trim();
            log.debug("search query='{}' limit={} city='{}'", query, clampedLimit, trimmedCity);
            return repository.findByNameContainingIgnoreCaseAndCity(query, trimmedCity, clampedLimit)
                    .stream()
                    .map(SchoolResponse::from)
                    .toList();
        }

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
                        p.getSchoolCategory(),
                        null,
                        null
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
        List<School> schools = repository.findPopularByCity(citySlug, clampedLimit);
        List<UUID> ids = schools.stream().map(School::getId).toList();
        Map<UUID, Integer> counts = fetchListingCounts(ids);
        return schools.stream()
                .map(s -> SchoolResponse.from(s, counts.getOrDefault(s.getId(), 0)))
                .toList();
    }

    /**
     * Returns notable schools assigned to the given {@code areaKey} via FK matching.
     *
     * <p>Uses the deterministic area_key FK assignment from the V79 migration
     * (nearest_configured_area_within_district algorithm).
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

        // Check area existence
        if (repository.countByAreaKey(areaKey) == 0) {
            log.warn("findPopularByArea: unknown areaKey='{}'", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

        List<SchoolRepository.AreaSchoolProjection> rows =
                repository.findPopularByAreaKey(areaKey, clampedLimit);

        List<UUID> ids = rows.stream().map(SchoolRepository.AreaSchoolProjection::getId).toList();
        Map<UUID, Integer> counts = fetchListingCounts(ids);

        return rows.stream()
                .map(p -> SchoolResponse.from(p, counts.getOrDefault(p.getId(), 0)))
                .toList();
    }

    /**
     * Returns schools assigned to {@code areaKey} via FK matching,
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

        // Validate area existence first (separate query to distinguish "area not found" from "no schools")
        if (repository.countByAreaKey(areaKey) == 0) {
            log.warn("getSchoolsByArea: unknown areaKey='{}'", areaKey);
            throw new AreaNotFoundException(areaKey);
        }

        List<SchoolRepository.AreaSchoolProjection> rows = repository.findByAreaKey(
                areaKey,
                normalizedBoards, normalizedCategories,
                offset, clampedSize);

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
                        p.getSchoolCategory(),
                        null,
                        null
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

        List<School> schools = repository.findPopularByCityWithFilters(
                citySlug, normalizedBoards, normalizedCategories, clampedLimit);
        List<UUID> ids = schools.stream().map(School::getId).toList();
        Map<UUID, Integer> counts = fetchListingCounts(ids);
        return schools.stream()
                .map(s -> SchoolResponse.from(s, counts.getOrDefault(s.getId(), 0)))
                .toList();
    }
}
