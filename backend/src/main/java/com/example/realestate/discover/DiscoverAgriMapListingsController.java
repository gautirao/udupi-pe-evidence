package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint: agri map listings.
 *
 * <p>GET /api/discover/agri-map-listings?city={citySlug}&areaKeys={k1}&areaKeys={k2}[&bbox=...]
 *
 * <p>Returns LIVE agricultural_land listings for map rendering, including boundary GeoJSON
 * where available. No authentication required — public anonymous data.
 */
@RestController
@RequestMapping("/api/discover")
public class DiscoverAgriMapListingsController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverAgriMapListingsController.class);

    private final DiscoverAgriMapListingsService service;

    public DiscoverAgriMapListingsController(DiscoverAgriMapListingsService service) {
        this.service = service;
    }

    /**
     * Returns LIVE agricultural_land listings for the given city and area keys.
     *
     * @param city     city slug (e.g. "udupi")
     * @param areaKeys one or more area keys (IN-clause filter, max 50)
     * @param bbox     optional bounding box "minLat,minLon,maxLat,maxLon"
     */
    @GetMapping("/agri-map-listings")
    public ResponseEntity<AgriMapListingsResponse> getAgriMapListings(
            @RequestParam String city,
            @RequestParam List<String> areaKeys,
            @RequestParam(required = false) String bbox) {

        log.debug("GET /api/discover/agri-map-listings city={} areaKeys={} bboxPresent={}",
                city, areaKeys != null ? areaKeys.size() : 0, bbox != null);

        AgriMapListingsResponse result = service.findAgriMapListings(
                city, areaKeys, Optional.ofNullable(bbox));

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic())
                .body(result);
    }
}
