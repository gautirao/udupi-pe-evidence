package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint: agri map listings.
 *
 * <p>GET /api/discover/agri-map-listings?city={citySlug}&areaKey={k1}[&bbox=...]
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
     * Returns LIVE agricultural_land listings for the given city and scope.
     *
     * <p>#2151 PR C: the legacy {@code areaKeys[]} array param has been REMOVED (it was retained as
     * deprecated-but-accepted through PR B; PR C is its documented removal point). {@code areaKey}
     * is now the ONLY drill-down scope param. A request that sends only the legacy {@code areaKeys}
     * (no {@code areaKey}) is REJECTED with 400, not silently ignored — see
     * {@link DiscoverAgriMapListingsService#findAgriMapListings} javadoc (oq_c3) for the reasoning.
     * Spring simply drops an unrecognised {@code areaKeys} query param; it is never bound to
     * anything on this controller method.
     *
     * @param city     city slug (e.g. "udupi")
     * @param areaKey  CANONICAL, and now ONLY, stable destination area key
     * @param bbox     optional bounding box "minLat,minLon,maxLat,maxLon"
     */
    @GetMapping("/agri-map-listings")
    public ResponseEntity<AgriMapListingsResponse> getAgriMapListings(
            @RequestParam String city,
            @RequestParam(required = false) String areaKey,
            @RequestParam(required = false) String bbox,
            @RequestParam(required = false) String listingPurpose) {

        // #1454: JWT-aware. Mirror PublicListingController.getById exactly — the
        // !(auth instanceof AnonymousAuthenticationToken) guard is load-bearing; without it
        // every caller is treated as authenticated and the anon coarsening gate silently no-ops.
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = auth != null
                && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken);

        log.debug("GET /api/discover/agri-map-listings city={} areaKeyPresent={} bboxPresent={} authenticated={}",
                city, areaKey != null, bbox != null, isAuthenticated);

        AgriMapListingsResponse result = service.findAgriMapListings(
                city, areaKey, Optional.ofNullable(bbox), isAuthenticated, listingPurpose);

        // #1454 cache semantics: the authenticated response carries full-precision lat/lng and
        // pricePaise — it MUST NOT be stored by a shared/CDN cache (a cached authed body could be
        // served to an anonymous caller, defeating the coarsening). Anonymous responses are already
        // coarsened/price-stripped, so they remain publicly cacheable for 120s.
        CacheControl cacheControl = isAuthenticated
                ? CacheControl.noStore()
                : CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic();

        return ResponseEntity.ok()
                .cacheControl(cacheControl)
                .body(result);
    }
}
