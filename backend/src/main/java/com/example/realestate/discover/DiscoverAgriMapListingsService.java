package com.example.realestate.discover;

import com.example.realestate.geo.GeoCoarsener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

/**
 * Service for GET /api/discover/agri-map-listings.
 *
 * <p><b>#2151 PR B cutover.</b> This class is now a COMPOSER over {@link AgriDestinationPort} — it
 * no longer owns any SQL. It is responsible for:
 * <ul>
 *   <li>resolving the canonical scope param (single {@code areaKey}) vs the legacy
 *       {@code areaKeys[]} array,</li>
 *   <li>mapping {@link AgriDestinationPort.AgriParcel} (exact coordinates/price ALWAYS populated
 *       by the port) to the public {@link AgriMapListingItem} shape, and</li>
 *   <li>the #1454/#1551 anonymous projection (coarsened lat/lng, withheld price) — applied HERE,
 *       ABOVE the port, so exactly one place in the system decides public exposure.</li>
 * </ul>
 */
@Service
public class DiscoverAgriMapListingsService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverAgriMapListingsService.class);

    /** Maximum number of areaKeys allowed in one request — single owner is now
     *  {@link AgriDestinationPort#MAX_DESTINATION_AREA_KEYS} (#2151 PR B); mirrored here so
     *  existing tests/call sites that reference this constant keep compiling. */
    static final int MAX_AREA_KEYS = AgriDestinationPort.MAX_DESTINATION_AREA_KEYS;

    /**
     * Maximum number of listings returned in a single response — single owner is now
     * {@link AgriDestinationPort#MAX_PARCELS_PER_PAGE}.
     */
    static final int MAX_LISTINGS_PER_REQUEST = AgriDestinationPort.MAX_PARCELS_PER_PAGE;

    /**
     * Number of decimal places to which anonymous lat/lng is truncated (#1454).
     * 2 dp ≈ 1.1 km granularity — markers still render approximately but the exact
     * parcel coordinates never leave the server for anonymous callers.
     */
    static final int ANON_COORD_DECIMALS = 2;

    private final AgriDestinationPort agriDestinationPort;

    public DiscoverAgriMapListingsService(AgriDestinationPort agriDestinationPort) {
        this.agriDestinationPort = agriDestinationPort;
    }

    /**
     * Finds LIVE agricultural_land listings for the given city and scope.
     *
     * <p>#2151 PR B: the drill-down scope is now the stable {@code areaKey} (canonical) with the
     * client-supplied {@code areaKeys} array retained as LEGACY/DEPRECATED (removed in PR C).
     * Exactly one of {@code areaKey}/{@code areaKeys} must be present; if both are present they
     * must agree (a single-element {@code areaKeys} equal to {@code areaKey}) or the request is
     * rejected with 400.
     *
     * <p>#1454 auth-aware gating unchanged: anonymous callers receive NO {@code pricePaise} and
     * COARSENED lat/lng; authenticated callers receive exact lat/lng and pricePaise.
     *
     * @throws ResponseStatusException HTTP 400 on validation failure
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse findAgriMapListings(String citySlug,
                                                       String areaKey,
                                                       List<String> areaKeys,
                                                       Optional<String> bbox,
                                                       boolean isAuthenticated,
                                                       String listingPurpose) {
        if (citySlug == null || citySlug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city_must_not_be_blank");
        }

        List<String> resolvedAreaKeys = resolveAreaKeys(areaKey, areaKeys);
        if (resolvedAreaKeys.size() > MAX_AREA_KEYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "area_keys_exceeds_maximum_of_" + MAX_AREA_KEYS);
        }

        DiscoverListingPredicateBuilder.Bbox parsedBbox = bbox.isPresent()
                ? BboxParser.parse(bbox.get())
                : null;
        AgriDestinationPort.GeoBox viewport = parsedBbox != null
                ? new AgriDestinationPort.GeoBox(
                        parsedBbox.south(), parsedBbox.west(), parsedBbox.north(), parsedBbox.east())
                : null;

        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        log.debug("findAgriMapListings city={} areaKeys={} bboxPresent={}",
                citySlug, resolvedAreaKeys.size(), viewport != null);

        AgriDestinationPort.ParcelPage page = agriDestinationPort.findParcels(
                new AgriDestinationPort.ParcelQuery(
                        citySlug,
                        resolvedAreaKeys,
                        new AgriDestinationPort.AgriDestinationFilters(normPurpose),
                        new AgriDestinationPort.PageSpec(0, MAX_LISTINGS_PER_REQUEST),
                        viewport));

        List<AgriMapListingItem> listings = page.content().stream()
                .map(DiscoverAgriMapListingsService::toItem)
                .toList();

        // #1454/#1551: anonymous gating — withhold pricePaise and coarsen exact coordinates.
        // Post-read projection only, applied ABOVE the port (the port always returns exact data).
        if (!isAuthenticated) {
            listings = listings.stream()
                    .map(DiscoverAgriMapListingsService::toAnonItem)
                    .toList();
        }

        // #2151 PR B: truncated is derived from the port's hasMore rather than a local N+1 probe.
        log.debug("findAgriMapListings city={} returned={} authenticated={} truncated={}",
                citySlug, listings.size(), isAuthenticated, page.hasMore());
        return new AgriMapListingsResponse(citySlug.toLowerCase(), listings, page.hasMore(), MAX_LISTINGS_PER_REQUEST);
    }

    /**
     * Resolves the canonical {@code areaKey} vs the legacy {@code areaKeys[]} array into a single
     * list for the port. Exactly one must be present; both present and disagreeing is rejected.
     */
    private static List<String> resolveAreaKeys(String areaKey, List<String> areaKeys) {
        boolean hasSingle = areaKey != null && !areaKey.isBlank();
        boolean hasLegacy = areaKeys != null && !areaKeys.isEmpty();

        if (!hasSingle && !hasLegacy) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }
        if (hasSingle && hasLegacy) {
            boolean agree = areaKeys.size() == 1 && areaKeys.get(0).equals(areaKey);
            if (!agree) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "area_key_and_area_keys_must_not_both_be_present");
            }
            return List.of(areaKey);
        }
        return hasSingle ? List.of(areaKey) : areaKeys;
    }

    private static AgriMapListingItem toItem(AgriDestinationPort.AgriParcel p) {
        return new AgriMapListingItem(
                p.id(), p.title(), p.areaKey(), p.latitude(), p.longitude(), p.propertyType(),
                p.locality(), p.boundaryGeoJson(), p.landArea(), p.landAreaUnit(),
                p.computedAreaAcres(), p.pricePaise(), p.listingPurpose(), p.waterSource(),
                p.landCategory(), p.farmhouseAvailable(), p.fencingDone(), p.roadAccess(),
                p.soilType(), p.cultivationStatus(), p.ownershipType(), p.updatedAt());
    }

    /**
     * Anonymous projection (#1454 / #1551): null pricePaise + coarsened lat/lng.
     * All other fields are non-PII / non-price / non-coordinate and pass through unchanged.
     */
    private static AgriMapListingItem toAnonItem(AgriMapListingItem item) {
        return new AgriMapListingItem(
                item.id(),
                item.title(),
                item.areaKey(),
                GeoCoarsener.coarsen(item.latitude()),
                GeoCoarsener.coarsen(item.longitude()),
                item.propertyType(),
                item.locality(),
                item.boundaryGeoJson(),
                item.landArea(),
                item.landAreaUnit(),
                item.computedAreaAcres(),
                null, // pricePaise withheld from anonymous callers (#1454)
                item.listingPurpose(),
                item.waterSource(),
                item.landCategory(),
                item.farmhouseAvailable(),
                item.fencingDone(),
                item.roadAccess(),
                item.soilType(),
                item.cultivationStatus(),
                item.ownershipType(),
                item.updatedAt());
    }

}
