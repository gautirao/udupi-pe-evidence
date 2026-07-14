package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) endpoint for the city-region summary rollup (#1882 Track A PR1).
 *
 * <p>GET /api/discover/cities/{citySlug}/regions?listingPurpose=
 *
 * <p>Unknown/unonboarded {@code citySlug} returns 200 with an empty {@code regions} list —
 * mirroring {@link DiscoverSummaryController}'s unknown-city contract, never 404.
 *
 * <p>{@code listingPurpose} (#1882 rework — region-level counts must not silently blend buy/rent)
 * is an independent optional filter — {@code "sale"} or {@code "rent"} — passed through
 * unnormalised to {@link RegionSummaryService}, which validates it against the same allowed set
 * {@link DiscoverSummaryService} uses and falls back to blended (all-purposes) for blank/invalid
 * values, mirroring that endpoint's {@code listingPurpose} param exactly. Region geometry,
 * membership, ordering, and {@code boundsStatus} are unaffected — only {@code listingCount}.
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
    public RegionSummaryResponse getRegions(
            @PathVariable("citySlug") String citySlug,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose) {
        log.debug("GET /api/discover/cities/{}/regions listingPurpose={}", citySlug, listingPurpose);
        return regionSummaryService.getRegions(citySlug, listingPurpose);
    }
}
