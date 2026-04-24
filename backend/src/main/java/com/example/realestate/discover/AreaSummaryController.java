package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
     * @param city city slug (e.g. {@code udupi}, {@code mangalore}, {@code bangalore})
     */
    @GetMapping("/areas")
    public ResponseEntity<AreaSummaryResponse> getAreas(
            @RequestParam(name = "city") String city) {

        log.debug("GET /api/discover/areas city={}", city);
        AreaSummaryResponse response = areaSummaryService.getAreasByCity(city);
        return ResponseEntity.ok(response);
    }
}
