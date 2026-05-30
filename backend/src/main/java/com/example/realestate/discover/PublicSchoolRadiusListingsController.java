package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint returning school-radius listings crossing area boundaries.
 *
 * <p>GET /api/discover/cities/{city}/school-radius-listings
 *
 * <p>Required: schoolLat + schoolLon (must be provided together).
 * Optional: schoolRadiusKm (default 2.0, server-clamped to [0, 10]),
 *           page (default 0, must be >= 0),
 *           size (default 20, server-clamped to [1, 50]).
 */
@RestController
@RequestMapping("/api/discover/cities/{city}/school-radius-listings")
public class PublicSchoolRadiusListingsController {

    private static final Logger log = LoggerFactory.getLogger(PublicSchoolRadiusListingsController.class);

    private static final double DEFAULT_RADIUS_KM = 2.0;
    private static final double MAX_RADIUS_KM = 10.0;
    private static final int DEFAULT_SIZE = 20;
    private static final int MIN_SIZE = 1;
    private static final int MAX_SIZE = 50;
    private static final int MAX_PAGE = 1000;

    // Valid coordinate ranges for early rejection
    private static final double MAX_ABS_LAT = 90.0;
    private static final double MAX_ABS_LON = 180.0;

    private final PublicSchoolRadiusListingsService service;

    public PublicSchoolRadiusListingsController(PublicSchoolRadiusListingsService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<PublicSchoolRadiusListingsPage> getSchoolRadiusListings(
            @PathVariable("city") String city,
            @RequestParam(name = "schoolLat", required = false) Double schoolLat,
            @RequestParam(name = "schoolLon", required = false) Double schoolLon,
            @RequestParam(name = "schoolRadiusKm", required = false) Double schoolRadiusKm,
            @RequestParam(name = "page", required = false, defaultValue = "0") int page,
            @RequestParam(name = "size", required = false, defaultValue = "20") int size
    ) {
        log.debug("GET /api/discover/cities/{}/school-radius-listings schoolLat={} schoolLon={} radiusKm={} page={} size={}",
                city, schoolLat, schoolLon, schoolRadiusKm, page, size);

        // schoolLat and schoolLon are both required — reject if only one is present
        if (schoolLat == null || schoolLon == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "school_lat_and_lon_required");
        }

        // Coordinate range validation
        if (Math.abs(schoolLat) > MAX_ABS_LAT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "school_lat_out_of_range");
        }
        if (Math.abs(schoolLon) > MAX_ABS_LON) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "school_lon_out_of_range");
        }

        // Negative page → 400
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page_must_be_non_negative");
        }
        // Page upper-bound: prevent massive OFFSET on public unauthenticated path
        if (page > MAX_PAGE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page_exceeds_max");
        }

        // Server-clamp radius: 0.0 is valid (exact-location match), max is 10.0
        double effectiveRadius = schoolRadiusKm != null
                ? Math.max(0.0, Math.min(schoolRadiusKm, MAX_RADIUS_KM))
                : DEFAULT_RADIUS_KM;

        // Server-clamp size: [1, 50]
        int effectiveSize = Math.max(MIN_SIZE, Math.min(size, MAX_SIZE));

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS).cachePublic())
                .body(service.getListings(city, schoolLat, schoolLon, effectiveRadius, page, effectiveSize));
    }
}
