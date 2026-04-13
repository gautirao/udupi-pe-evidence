package com.example.realestate.area;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) area endpoints — no JWT required.
 *
 * <p>GET /api/public/areas/{areaKey}/overview — composite overview for a single area.
 * <p>GET /api/public/areas/trending          — top areas by 30-day listing activity.
 *
 * <p>The areaKey path variable uses pipe characters (|) as separators.
 * Callers must URL-encode pipes as %7C (e.g. IN%7CKA%7CUdupi%7CManipal).
 * Spring decodes %7C → | automatically before binding the variable.
 */
@RestController
@RequestMapping("/api/public/areas")
public class AreaOverviewController {

    private static final Logger log = LoggerFactory.getLogger(AreaOverviewController.class);

    private final AreaOverviewService areaOverviewService;

    public AreaOverviewController(AreaOverviewService areaOverviewService) {
        this.areaOverviewService = areaOverviewService;
    }

    /**
     * Returns a composite overview for the given area key.
     *
     * @param areaKey pipe-separated area key, URL-encoded (e.g. IN%7CKA%7CUdupi%7CManipal)
     * @return 200 with overview, 404 if no stats row exists for this key
     */
    @GetMapping("/{areaKey}/overview")
    public ResponseEntity<AreaOverviewResponse> getOverview(
            @PathVariable("areaKey") String areaKey) {

        log.debug("GET /api/public/areas/{}/overview", areaKey);
        AreaOverviewResponse response = areaOverviewService.assembleResponse(areaKey);
        return ResponseEntity.ok(response);
    }

    /**
     * Returns the top areas ranked by 30-day listing activity.
     *
     * <p>The {@code limit} parameter is silently clamped to [1, 12].
     * Areas with zero or NULL listing count are excluded.
     * Returns {@code { "areas": [] }} (200 OK) when the table is empty — never 404.
     *
     * @param limit maximum number of areas to return (default 6, max 12)
     * @return 200 with trending areas list
     */
    @GetMapping("/trending")
    public ResponseEntity<TrendingAreasResponse> getTrending(
            @RequestParam(name = "limit", defaultValue = "6") int limit) {

        log.debug("GET /api/public/areas/trending limit={}", limit);
        TrendingAreasResponse response = areaOverviewService.getTrending(limit);
        return ResponseEntity.ok(response);
    }
}
