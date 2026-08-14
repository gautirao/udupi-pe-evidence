package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service for GET /api/discover/agri-destinations (#2151 PR C, decision D_C1/O2).
 *
 * <p>Thin composer over {@link AgriDestinationPort#findDestinations} — calls that ONE port method
 * and nothing else: no second query, no second predicate, no separately-maintained count path.
 * AC7 parity (this endpoint's {@code parcelCount} sum vs the parcel drill-down's unique-id count)
 * holds BY CONSTRUCTION as a result, exactly as it does for {@link RegionalAreaGroupsService} and
 * {@link DiscoverAgriMapListingsService} — see {@link AgriDestinationPort}'s javadoc.
 *
 * <p>Does NOT call {@link CityActivationGuard} itself — {@link AgriDestinationPort#findDestinations}
 * (via {@link AgriDestinationPortPostgresAdapter}) already runs that guard first and short-circuits
 * the inactive/unknown case with the empty-shape {@link AgriDestinationPort.DestinationScope} before
 * this class ever sees a result. Adding a second guard call here would itself be a second query path
 * outside the "findDestinations and nothing else" contract this class exists to preserve.
 *
 * <p>The port's 503 {@code ResponseStatusException} (active city, never promoted through Agri City
 * Launch — see {@link AgriDestinationPortPostgresAdapter#AGRI_DESTINATIONS_NOT_YET_PROMOTED}) is
 * deliberately NOT caught here. It propagates unchanged to {@code GlobalExceptionHandler}, which
 * preserves the status code and reason — never regressing into a silently empty 200.
 */
@Service
public class AgriDestinationsService {

    private static final Logger log = LoggerFactory.getLogger(AgriDestinationsService.class);

    private final AgriDestinationPort agriDestinationPort;

    public AgriDestinationsService(AgriDestinationPort agriDestinationPort) {
        this.agriDestinationPort = agriDestinationPort;
    }

    /**
     * Returns destination buckets for the given city, optionally scoped by direction/maxKm/
     * listingPurpose.
     *
     * @param city           city slug (required)
     * @param direction      optional compass direction key; blank/null = all directions
     * @param maxKm          optional maximum distance in km from the city origin; null = no upper
     *                       bound
     * @param listingPurpose optional {@code "sale"}/{@code "rent"} intent filter; blank/null = no
     *                       intent filter
     * @throws ResponseStatusException 400 if {@code city} is blank; 503 (propagated from the port,
     *         see class javadoc) if the city is active but was never promoted through Agri City
     *         Launch
     */
    @Transactional(readOnly = true)
    public AgriDestinationsResponse getDestinations(
            String city, String direction, Double maxKm, String listingPurpose) {
        if (city == null || city.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city_must_not_be_blank");
        }
        String normalizedCity = city.trim().toLowerCase();
        String normalizedDirection = (direction != null && !direction.isBlank())
                ? direction.trim() : null;
        String normalizedPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        log.debug("getDestinations city={} direction={} maxKm={} listingPurpose={}",
                normalizedCity, normalizedDirection, maxKm, normalizedPurpose);

        // ── The ONE port call — see class javadoc for why nothing else may be added here.
        AgriDestinationPort.DestinationScope scope = agriDestinationPort.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(
                        normalizedCity, normalizedDirection, maxKm,
                        new AgriDestinationPort.AgriDestinationFilters(normalizedPurpose),
                        true));

        return new AgriDestinationsResponse(
                scope.city(),
                scope.destinations().stream().map(AgriDestinationsService::toResponse).toList());
    }

    private static AgriDestinationBucketResponse toResponse(AgriDestinationPort.DestinationBucket b) {
        return new AgriDestinationBucketResponse(
                b.areaKey(), b.displayName(), b.distanceKm(), b.bearingDeg(), b.direction(),
                b.parcelCount(), b.parcelAcreage());
    }
}
