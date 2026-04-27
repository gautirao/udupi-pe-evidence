package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Public (unauthenticated) endpoint: city-first area listings.
 *
 * <p>GET /api/discover/cities/{city}/listings
 * <pre>
 *   ?areaKeys=IN|KA|Udupi|Malpe&areaKeys=IN|KA|Udupi|Manipal&limitPerArea=5
 * </pre>
 *
 * <p>No JWT required — see JwtConfig for the permitAll rule on this path.
 */
@RestController
@RequestMapping("/api/discover")
public class CityAreaListingsController {

    private static final Logger log = LoggerFactory.getLogger(CityAreaListingsController.class);

    private final CityAreaListingsService service;

    public CityAreaListingsController(CityAreaListingsService service) {
        this.service = service;
    }

    /**
     * Returns per-area LIVE listings for the given city, limited to {@code limitPerArea}
     * entries per area (server-clamped to 20).
     *
     * @param city         city slug (e.g. {@code udupi})
     * @param areaKeys     one or more canonical area keys (e.g. {@code IN|KA|Udupi|Malpe})
     * @param limitPerArea max listings per area; default 5, max 20 server-side
     */
    @GetMapping("/cities/{city}/listings")
    public ResponseEntity<CityAreaListingsResponse> getCityAreaListings(
            @PathVariable("city") String city,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            @RequestParam(name = "limitPerArea", required = false) Integer limitPerArea) {

        if (areaKeys == null || areaKeys.isEmpty() || areaKeys.stream().allMatch(String::isBlank)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "areaKeys_required");
        }

        log.debug("GET /api/discover/cities/{}/listings areaKeys={} limitPerArea={}",
                city, areaKeys.size(), limitPerArea);

        CityAreaListingsResponse response = service.getAreaListings(city, areaKeys, limitPerArea);
        return ResponseEntity.ok(response);
    }
}
