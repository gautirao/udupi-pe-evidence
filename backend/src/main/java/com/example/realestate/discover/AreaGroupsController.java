package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) endpoint that returns area groups for a city.
 *
 * <p>GET /api/discover/area-groups?city={citySlug}
 */
@RestController
@RequestMapping("/api/discover")
public class AreaGroupsController {

    private static final Logger log = LoggerFactory.getLogger(AreaGroupsController.class);

    private final AreaGroupsService areaGroupsService;

    public AreaGroupsController(AreaGroupsService areaGroupsService) {
        this.areaGroupsService = areaGroupsService;
    }

    /**
     * Returns all active area groups for the given city slug, ordered by display_order.
     * Each group contains an ordered list of area keys.
     * Returns {@code {"city": "...", "groups": []}} (200 OK) when city is unknown.
     *
     * @param city city slug (e.g. {@code udupi}, {@code bangalore})
     */
    @GetMapping("/area-groups")
    public ResponseEntity<AreaGroupsResponse> getAreaGroups(
            @RequestParam(name = "city") String city) {

        log.debug("GET /api/discover/area-groups city={}", city);
        AreaGroupsResponse response = areaGroupsService.getGroupsByCity(city);
        return ResponseEntity.ok(response);
    }
}
