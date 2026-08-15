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
 * <p><b>#2151 PR B cutover, PR C legacy-param removal.</b> This class is now a COMPOSER over
 * {@link AgriDestinationPort} — it no longer owns any SQL. It is responsible for:
 * <ul>
 *   <li>validating the canonical scope param (single {@code areaKey} — the legacy {@code areaKeys[]}
 *       array was removed in PR C; see {@link #findAgriMapListings} javadoc, oq_c3),</li>
 *   <li>mapping {@link AgriDestinationPort.AgriParcel} (exact coordinates/price ALWAYS populated
 *       by the port) to the public {@link AgriMapListingItem} shape, and</li>
 *   <li>the #1454/#1551 anonymous projection (coarsened lat/lng, withheld price) — applied HERE,
 *       ABOVE the port, so exactly one place in the system decides public exposure.</li>
 * </ul>
 */
@Service
public class DiscoverAgriMapListingsService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverAgriMapListingsService.class);

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
     * <p>#2151 PR C: the legacy {@code areaKeys[]} array param is REMOVED. {@code areaKey} (single,
     * canonical) is now the ONLY drill-down scope param this method accepts.
     *
     * <p><b>oq_c3 decision (#2151 PR C, explicitly ruled — not left emergent):</b> a caller that
     * sends ONLY the legacy {@code areaKeys} (so {@code areaKey} arrives {@code null}/blank here —
     * the removed controller param is never bound to anything) is REJECTED with 400
     * ({@code area_key_required_legacy_area_keys_param_removed}), NOT silently treated as "no
     * scope"/ignored. Reasoning: this is a public, unauthenticated endpoint; silently ignoring a
     * stale client's only scope param would return a response that LOOKS like a valid answer (an
     * empty-scope 400 would instead be indistinguishable from "this drill-down genuinely has no
     * listings" if it were downgraded to an empty 200) while actually serving nothing useful to a
     * caller who has not yet cut over — the same fail-loud-not-fail-silent discipline this PR
     * applies elsewhere (see {@code AgriDestinationPortPostgresAdapter#findDestinations}'s 503 vs
     * silent-empty correction, #2151 PR B B2). The frontend cutover away from {@code areaKeys}
     * lands in this SAME PR (#2151 PR C), so this is not expected to be reachable in production
     * once both halves ship together.
     *
     * <p>#1454 auth-aware gating unchanged: anonymous callers receive NO {@code pricePaise} and
     * COARSENED lat/lng; authenticated callers receive exact lat/lng and pricePaise.
     *
     * @throws ResponseStatusException HTTP 400 on validation failure
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse findAgriMapListings(String citySlug,
                                                       String areaKey,
                                                       Optional<String> bbox,
                                                       boolean isAuthenticated,
                                                       String listingPurpose) {
        return findAgriMapListings(citySlug, areaKey, bbox, isAuthenticated, listingPurpose, null);
    }

    /**
     * Revision-scoped overload (#2151 PR B Track 2) backing {@code
     * AdminCityLaunchPreviewController}'s {@code .../preview/agri-map-listings} endpoint.
     * {@code revisionId == null} is byte-identical to the original 5-arg overload above.
     *
     * <p><b>Auth note:</b> these preview endpoints are {@code @IsAdmin}-gated already — callers on
     * the preview path pass {@code isAuthenticated = true} explicitly (the exact-coords/real-price
     * branch), never derived from the anonymous-coarsening logic this class applies to the public
     * endpoint.
     *
     * @param revisionId {@code null} for production (unchanged); non-null for an Admin City Launch
     *                   preview revision — the port skips {@link CityActivationGuard} for it (see
     *                   {@link AgriDestinationPortPostgresAdapter}), but parcels themselves still
     *                   come from the LIVE {@code property_listings} table, scoped by
     *                   {@code citySlug} — a revision preview scopes GEOGRAPHY, not inventory.
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse findAgriMapListings(String citySlug,
                                                       String areaKey,
                                                       Optional<String> bbox,
                                                       boolean isAuthenticated,
                                                       String listingPurpose,
                                                       Long revisionId) {
        if (citySlug == null || citySlug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "city_must_not_be_blank");
        }

        if (areaKey == null || areaKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "area_key_required_legacy_area_keys_param_removed");
        }
        List<String> resolvedAreaKeys = List.of(areaKey);

        DiscoverListingPredicateBuilder.Bbox parsedBbox = bbox.isPresent()
                ? BboxParser.parse(bbox.get())
                : null;
        AgriDestinationPort.GeoBox viewport = parsedBbox != null
                ? new AgriDestinationPort.GeoBox(
                        parsedBbox.south(), parsedBbox.west(), parsedBbox.north(), parsedBbox.east())
                : null;

        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        log.debug("findAgriMapListings city={} areaKeys={} bboxPresent={} revisionId={}",
                citySlug, resolvedAreaKeys.size(), viewport != null, revisionId);

        AgriDestinationPort.ParcelPage page = agriDestinationPort.findParcels(
                new AgriDestinationPort.ParcelQuery(
                        citySlug,
                        resolvedAreaKeys,
                        new AgriDestinationPort.AgriDestinationFilters(normPurpose),
                        new AgriDestinationPort.PageSpec(0, MAX_LISTINGS_PER_REQUEST),
                        viewport,
                        revisionId));

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
