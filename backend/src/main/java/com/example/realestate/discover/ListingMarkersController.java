package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
     * @param bbox reserved for future viewport-clipping — accepted but currently unused
     */
    @GetMapping("/markers")
    public ResponseEntity<ListingMarkersResponse> getMarkers(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "bbox", required = false) String bbox) {

        log.debug("GET /api/listings/markers city={}", city);
        ListingMarkersResponse response = listingMarkersService.getMarkersForCity(city);
        return ResponseEntity.ok(response);
    }
}
