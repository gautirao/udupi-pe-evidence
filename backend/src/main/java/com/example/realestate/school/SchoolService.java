package com.example.realestate.school;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
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
                        p.getLatitude(),
                        p.getLongitude(),
                        p.getAddress(),
                        p.getDistanceKm() != null
                                ? Math.round(p.getDistanceKm() * 100.0) / 100.0
                                : null,
                        p.getProminenceTier()
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
}
