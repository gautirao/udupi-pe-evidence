package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) endpoint for the city-region summary rollup (#1882 Track A PR1).
 *
 * <p>GET /api/discover/cities/{citySlug}/regions
 *
 * <p>Unknown/unonboarded {@code citySlug} returns 200 with an empty {@code regions} list —
 * mirroring {@link DiscoverSummaryController}'s unknown-city contract, never 404.
 */
@RestController
@RequestMapping("/api/discover")
public class RegionSummaryController {

    private static final Logger log = LoggerFactory.getLogger(RegionSummaryController.class);

    private final RegionSummaryService regionSummaryService;

    public RegionSummaryController(RegionSummaryService regionSummaryService) {
        this.regionSummaryService = regionSummaryService;
    }

    @GetMapping("/cities/{citySlug}/regions")
    public RegionSummaryResponse getRegions(@PathVariable("citySlug") String citySlug) {
        log.debug("GET /api/discover/cities/{}/regions", citySlug);
        return regionSummaryService.getRegions(citySlug);
    }
}
