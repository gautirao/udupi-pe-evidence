package com.example.realestate.area;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) Trends API — no JWT required.
 *
 * <p>GET /api/trends/options?city=X  — default areas for the Trends page dropdown.
 * <p>GET /api/trends/overview?areaKey=K — full trend overview for a single area.
 *
 * <p>Both endpoints are declared public in {@link com.example.realestate.security.JwtConfig}.
 */
@RestController
@RequestMapping("/api/trends")
public class TrendsController {

    private static final Logger log = LoggerFactory.getLogger(TrendsController.class);

    private final AreaOverviewService areaOverviewService;

    public TrendsController(AreaOverviewService areaOverviewService) {
        this.areaOverviewService = areaOverviewService;
    }

    /**
     * Returns the top trending areas for the given city.
     *
     * <p>Used by the Trends page to populate the area dropdown and seed the initial
     * URL when no {@code areaKey} query param is present.
     *
     * @param city  city slug (e.g. "udupi", "mangalore") — required, matched case-insensitively
     * @param limit max areas to return (default 3, clamped to 6)
     * @return 200 with options; 400 if city is blank
     */
    @GetMapping("/options")
    public ResponseEntity<TrendsOptionsResponse> getOptions(
            @RequestParam String city,
            @RequestParam(defaultValue = "3") int limit) {

        if (city.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        log.debug("GET /api/trends/options city={} limit={}", city, limit);
        return ResponseEntity.ok(areaOverviewService.getOptions(city, limit));
    }

    /**
     * Returns the full trend overview for a single area.
     *
     * <p>Delegates to the same logic as {@code GET /api/public/areas/{areaKey}/overview}
     * but accepts {@code areaKey} as a query parameter rather than a path variable.
     *
     * @param areaKey URL-encoded pipe-delimited area key (e.g. IN%7CKA%7CUdupi%7CManipal)
     * @return 200 with overview; 400 if areaKey is blank; 404 if no stats row exists
     */
    @GetMapping("/overview")
    public ResponseEntity<AreaOverviewResponse> getOverview(
            @RequestParam String areaKey) {

        if (areaKey.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        log.debug("GET /api/trends/overview areaKey={}", areaKey);
        AreaOverviewResponse response = areaOverviewService.assembleResponse(areaKey);
        return ResponseEntity.ok(response);
    }
}
