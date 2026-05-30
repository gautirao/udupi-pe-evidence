package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) endpoint that returns skinny listing markers for a city.
 *
 * <p>GET /api/listings/markers?city={citySlug}
 *
 * <p>Response: { city, markers: [{ id, lat, lon, pricePaise }] }
 * Markers use latitude/longitude from property_listings — NOT geo_center from areas.
 */
@RestController
@RequestMapping("/api/listings")
public class ListingMarkersController {

    private static final Logger log = LoggerFactory.getLogger(ListingMarkersController.class);

    private final ListingMarkersService listingMarkersService;

    public ListingMarkersController(ListingMarkersService listingMarkersService) {
        this.listingMarkersService = listingMarkersService;
    }

    /**
     * Returns skinny markers (id, lat, lon, pricePaise) for LIVE/SCRAPED listings in the city.
     *
     * @param city city slug (e.g. {@code udupi}, {@code mangalore})
     * @param bbox optional viewport clip — {@code "south,west,north,east"} decimal degrees
     */
    @GetMapping("/markers")
    public ResponseEntity<ListingMarkersResponse> getMarkers(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "bbox", required = false) String bbox) {

        log.debug("GET /api/listings/markers city={} bbox={}", city, bbox);
        double[] b = parseBbox(bbox);
        ListingMarkersResponse response = b != null
                ? listingMarkersService.getMarkersForCityInBbox(city, b[0], b[1], b[2], b[3])
                : listingMarkersService.getMarkersForCity(city);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(response);
    }

    /** Parses {@code "south,west,north,east"} → double[4], or returns null on invalid input. */
    static double[] parseBbox(String bbox) {
        if (bbox == null || bbox.isBlank()) return null;
        String[] parts = bbox.split(",", -1);
        if (parts.length != 4) return null;
        try {
            double south = Double.parseDouble(parts[0].trim());
            double west  = Double.parseDouble(parts[1].trim());
            double north = Double.parseDouble(parts[2].trim());
            double east  = Double.parseDouble(parts[3].trim());
            if (south >= north || west >= east) return null;
            return new double[]{south, west, north, east};
        } catch (NumberFormatException e) {
            log.debug("Ignoring unparseable bbox={}", bbox);
            return null;
        }
    }
}
