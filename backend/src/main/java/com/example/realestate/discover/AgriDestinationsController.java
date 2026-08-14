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
 * Public (unauthenticated) endpoint: agri destination buckets (#2151 PR C, decision D_C1/O2 — this
 * shape was RULED by the plan gate; do not redesign it).
 *
 * <p>GET /api/discover/agri-destinations?city={citySlug}[&direction=N][&maxKm=25][&listingPurpose=sale]
 *
 * <p>1:1 mapping onto {@link AgriDestinationPort#findDestinations} via {@link AgriDestinationsService}
 * — see that class's javadoc for why AC7 parity holds by construction here.
 */
@RestController
@RequestMapping("/api/discover")
public class AgriDestinationsController {

    private static final Logger log = LoggerFactory.getLogger(AgriDestinationsController.class);

    private final AgriDestinationsService agriDestinationsService;

    public AgriDestinationsController(AgriDestinationsService agriDestinationsService) {
        this.agriDestinationsService = agriDestinationsService;
    }

    /**
     * Returns destination buckets (direction/distance corridor entries with live parcel counts) for
     * the given city.
     *
     * <p><b>Three-way city behaviour (#1935 parity; #2151 PR B correction pass B2).</b> This is
     * enforced entirely inside {@link AgriDestinationPortPostgresAdapter#findDestinations} — this
     * controller/service add no additional gating:
     * <ul>
     *   <li>inactive OR unknown city → empty {@code destinations} 200, indistinguishable from each
     *       OTHER (never from the 503 case below) — {@link CityActivationGuard} runs first inside
     *       the port;</li>
     *   <li>active city that has NEVER been promoted through Agri City Launch → 503
     *       {@code AGRI_DESTINATIONS_NOT_YET_PROMOTED}, propagated by
     *       {@link AgriDestinationsService} unchanged (never caught/wrapped/suppressed into a 200
     *       here);</li>
     *   <li>active, promoted city with no match for the given scope/filters → empty
     *       {@code destinations} 200 — a genuine zero-result.</li>
     * </ul>
     *
     * <p><b>Cache-Control (#2151 PR C, C-B6): {@code public, max-age=120}</b> — same policy as
     * {@code regional-area-groups}. Unlike {@code agri-map-listings} (whose body differs by auth —
     * exact vs coarsened coordinates, price present vs withheld), an
     * {@link AgriDestinationBucketResponse} carries no price and no exact parcel coordinates: its
     * {@code distanceKm}/{@code bearingDeg} are precomputed CORRIDOR geometry from the city's
     * configured origin (#2151 PR A), not a parcel location. Its content is therefore IDENTICAL for
     * anonymous and authenticated callers, so this single public cache policy is safe — there is no
     * cached-authed-body-served-to-anon risk (S1) because there is no authed variant to leak, and no
     * auth-scope literal is needed in any cache key on this path.
     *
     * @param city           city slug (required)
     * @param direction      OPTIONAL compass direction key (N/NE/E/SE/S/SW/W/NW); absent = all
     *                       directions
     * @param maxKm          OPTIONAL maximum distance in km from the city origin; absent = no upper
     *                       bound
     * @param listingPurpose OPTIONAL {@code "sale"} or {@code "rent"}; absent = no intent filter
     */
    @GetMapping("/agri-destinations")
    public ResponseEntity<AgriDestinationsResponse> getAgriDestinations(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "direction", required = false) String direction,
            @RequestParam(name = "maxKm", required = false) Double maxKm,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose) {

        log.debug("GET /api/discover/agri-destinations city={} direction={} maxKm={} listingPurpose={}",
                city, direction, maxKm, listingPurpose);

        AgriDestinationsResponse response =
                agriDestinationsService.getDestinations(city, direction, maxKm, listingPurpose);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic())
                .body(response);
    }
}
