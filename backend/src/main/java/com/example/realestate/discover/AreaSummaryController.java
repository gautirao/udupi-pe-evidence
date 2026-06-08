package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint that returns all seeded areas for a city,
 * joined with current stats when available.
 *
 * <p>GET /api/discover/areas?city={citySlug}
 */
@RestController
@RequestMapping("/api/discover")
public class AreaSummaryController {

    private static final Logger log = LoggerFactory.getLogger(AreaSummaryController.class);

    private final AreaSummaryService areaSummaryService;

    public AreaSummaryController(AreaSummaryService areaSummaryService) {
        this.areaSummaryService = areaSummaryService;
    }

    /**
     * Returns all areas for the given city slug, ordered by listing activity descending.
     * Areas with no stats yet are included with {@code listingCount90d = 0}.
     * Returns {@code {"city": "...", "areas": []}} (200 OK) when city is unknown.
     *
     * @param city         city slug (e.g. {@code udupi}, {@code mangalore}, {@code bangalore})
     * @param propertyType optional singular property type filter (#1371). When set to the
     *                     literal {@code agricultural_land}, per-area listing counts are
     *                     scoped to approved agri listings and an additive {@code agriAcreage}
     *                     field is computed. Blank/whitespace → no filter (blended counts,
     *                     today's behaviour). The distinct query string is the HTTP cache key;
     *                     Cache-Control (public, max-age=120) is identical on both variants.
     */
    @GetMapping("/areas")
    public ResponseEntity<AreaSummaryResponse> getAreas(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "propertyType", required = false) String propertyType) {

        log.debug("GET /api/discover/areas city={} propertyType={}", city, propertyType);
        AreaSummaryResponse response = areaSummaryService.getAreasByCity(city, propertyType);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic())
                .body(response);
    }
}
