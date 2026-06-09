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
 * Public (unauthenticated) endpoint that returns regional area groups for a city.
 *
 * <p>GET /api/discover/regional-area-groups?city={citySlug}&propertyType={propertyType}
 *
 * <p>Typical use: propertyType=agricultural_land.
 * Returns groups ordered by distance band then direction, with live listing counts.
 */
@RestController
@RequestMapping("/api/discover")
public class RegionalAreaGroupsController {

    private static final Logger log = LoggerFactory.getLogger(RegionalAreaGroupsController.class);

    private final RegionalAreaGroupsService regionalAreaGroupsService;

    public RegionalAreaGroupsController(RegionalAreaGroupsService regionalAreaGroupsService) {
        this.regionalAreaGroupsService = regionalAreaGroupsService;
    }

    /**
     * Returns regional area groups for the given city and property type.
     * Only groups with at least one live listing are included.
     * Cache-Control: public, max-age=120 (matches curated area-groups pattern).
     *
     * @param city         city slug (e.g. {@code udupi}, {@code bangalore})
     * @param propertyType property type filter (e.g. {@code agricultural_land})
     */
    @GetMapping("/regional-area-groups")
    public ResponseEntity<RegionalAreaGroupsResponse> getRegionalAreaGroups(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "propertyType") String propertyType) {

        log.debug("GET /api/discover/regional-area-groups city={} propertyType={}", city, propertyType);
        RegionalAreaGroupsResponse response =
                regionalAreaGroupsService.getRegionalGroups(city, propertyType);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic())
                .body(response);
    }
}
