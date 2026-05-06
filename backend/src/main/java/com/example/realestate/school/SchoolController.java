package com.example.realestate.school;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Public (unauthenticated) school search and nearby endpoints.
 * These paths are explicitly permitted in JwtConfig — no JWT is required.
 *
 * <ul>
 *   <li>GET /api/public/schools/search?q=&amp;limit= — autocomplete search</li>
 *   <li>GET /api/public/schools/nearby?lat=&amp;lon=&amp;radiusKm= — spatial nearby</li>
 *   <li>GET /api/public/schools/popular?city=&amp;limit=&amp;areaKey=&amp;board[]=&amp;category[] — notable schools</li>
 *   <li>GET /api/public/schools/by-area?areaKey=&amp;board[]=&amp;category[]=&amp;page=&amp;size= — all schools near area</li>
 *   <li>GET /api/public/schools/{id} — single school detail</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/public/schools")
public class SchoolController {

    private static final Logger log = LoggerFactory.getLogger(SchoolController.class);

    private final SchoolService schoolService;

    public SchoolController(SchoolService schoolService) {
        this.schoolService = schoolService;
    }

    /**
     * Autocomplete search for schools by name.
     *
     * @param q     search query (required, minimum 1 character)
     * @param limit max results (default 10, clamped to 1..50)
     * @return matching schools
     */
    @GetMapping("/search")
    public ResponseEntity<?> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int limit) {

        if (q == null || q.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Query parameter 'q' is required"));
        }

        List<SchoolResponse> results = schoolService.search(q.trim(), limit);
        log.debug("GET /api/public/schools/search q='{}' limit={} results={}", q, limit, results.size());
        return ResponseEntity.ok(results);
    }

    /**
     * Finds schools within a given radius of a geographic point.
     *
     * @param lat       latitude (required, -90..90)
     * @param lon       longitude (required, -180..180)
     * @param radiusKm  search radius in kilometres (default 2, clamped to 0.1..50)
     * @return nearby schools with distance, ordered closest first
     */
    @GetMapping("/nearby")
    public ResponseEntity<?> nearby(
            @RequestParam double lat,
            @RequestParam double lon,
            @RequestParam(defaultValue = "2") double radiusKm) {

        if (lat < -90 || lat > 90) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "lat must be between -90 and 90"));
        }
        if (lon < -180 || lon > 180) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "lon must be between -180 and 180"));
        }

        List<SchoolResponse> results = schoolService.findNearby(lat, lon, radiusKm);
        log.debug("GET /api/public/schools/nearby lat={} lon={} radiusKm={} results={}",
                lat, lon, radiusKm, results.size());
        return ResponseEntity.ok(results);
    }

    /**
     * Returns notable schools for a city, optionally narrowed to those within 2 km of an area
     * centroid, and optionally filtered by board and/or category.
     *
     * <p>Routing rules:
     * <ul>
     *   <li>{@code city} is required — missing or blank returns 400.</li>
     *   <li>{@code limit} defaults to 10, clamped to [1, 50] by the service.</li>
     *   <li>{@code areaKey} is optional. When present, results are scoped to schools within 2 km of
     *       the area centroid. An invalid areaKey returns 404.</li>
     *   <li>When {@code board} and {@code category} are both absent: routes to the existing
     *       {@code getPopularByCity} / {@code findPopularByArea} methods — byte-for-byte
     *       unchanged behaviour.</li>
     *   <li>When either {@code board} or {@code category} is present: routes to
     *       {@code getPopularSchoolsWithFilters} (city-scoped only; areaKey ignored for
     *       filtered popular — use /by-area for area-scoped unfiltered/filtered queries).</li>
     *   <li>An unknown city slug with no matching districts returns 200 with an empty array.</li>
     * </ul>
     *
     * @param city       city slug (required, e.g. "udupi")
     * @param limit      max results (default 10, clamped to 1..50)
     * @param areaKey    optional pipe-separated area key for proximity narrowing
     * @param boards     optional board filter list (e.g. board[]=CBSE&amp;board[]=ICSE)
     * @param categories optional category filter list
     * @return notable schools, ordered by name ASC then id ASC
     */
    @GetMapping("/popular")
    public ResponseEntity<?> popular(
            @RequestParam(required = false) String city,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String areaKey,
            @RequestParam(value = "board", required = false) List<String> boards,
            @RequestParam(value = "category", required = false) List<String> categories) {

        if (city == null || city.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Query parameter 'city' is required"));
        }

        boolean hasFilters = (boards != null && !boards.isEmpty())
                || (categories != null && !categories.isEmpty());

        List<SchoolResponse> results;
        if (hasFilters) {
            // Filtered popular: uses new method preserving prominence + city scoping
            results = schoolService.getPopularSchoolsWithFilters(city.trim(), boards, categories, limit);
        } else if (areaKey != null && !areaKey.isBlank()) {
            // Area-narrowing without filters: existing behaviour (AreaNotFoundException → 404)
            results = schoolService.findPopularByArea(areaKey, limit);
        } else {
            // No filters, no areaKey: existing city-only behaviour unchanged
            results = schoolService.findPopularByCity(city.trim(), limit);
        }

        log.debug("GET /api/public/schools/popular city='{}' areaKey='{}' boards={} categories={} limit={} results={}",
                city, areaKey, boards, categories, limit, results.size());
        return ResponseEntity.ok(results);
    }

    /**
     * Returns all schools within 2 km of the area centroid for the given {@code areaKey},
     * with optional board and category filters. Does NOT filter by prominence_tier.
     *
     * <p>Pagination is supported via {@code page} (zero-based) and {@code size} (clamped to
     * [1, 50] by the service). An unknown {@code areaKey} returns 404.
     *
     * @param areaKey    pipe-separated area key (required, e.g. "IN|KA|Udupi|Manipal")
     * @param boards     optional board filter list (e.g. board[]=CBSE&amp;board[]=ICSE)
     * @param categories optional category filter list
     * @param page       zero-based page (default 0)
     * @param size       page size (default 20, clamped to [1, 50])
     * @return schools near the area centroid matching all filters
     */
    @GetMapping("/by-area")
    public ResponseEntity<?> byArea(
            @RequestParam String areaKey,
            @RequestParam(value = "board", required = false) List<String> boards,
            @RequestParam(value = "category", required = false) List<String> categories,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        if (areaKey == null || areaKey.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Query parameter 'areaKey' is required"));
        }

        // AreaNotFoundException propagates to GlobalExceptionHandler → 404
        List<SchoolResponse> results = schoolService.getSchoolsByArea(areaKey, boards, categories, page, size);
        log.debug("GET /api/public/schools/by-area areaKey='{}' boards={} categories={} page={} size={} results={}",
                areaKey, boards, categories, page, size, results.size());
        return ResponseEntity.ok(results);
    }

    /**
     * Returns a single school by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id) {
        return schoolService.findById(id)
                .map(s -> ResponseEntity.ok((Object) s))
                .orElseGet(() -> ResponseEntity.status(404)
                        .body(Map.of("error", "School not found")));
    }
}
