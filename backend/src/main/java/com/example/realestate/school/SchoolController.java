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
