package com.example.realestate.listing.area;

import com.example.realestate.discover.AreaResolution;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.discover.GeocodedAreaKeyFormat;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.listing.core.Listing;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

/**
 * Resolves and stamps {@code area_key}/{@code area_label}/{@code area_resolution_status}/
 * {@code area_resolution_method} on broker-created listings (#2263).
 *
 * <p>Every broker create/update overload in {@code ListingCrudService} sets latitude/longitude
 * directly from a caller-supplied map pin but never touched {@code area_key} — so every
 * broker-approved listing failed {@code PublicListingController}'s area-key-based public
 * visibility join and 404'd for anonymous visitors. This service reuses the same forward-geocode
 * ({@link GeocodingPort}) + canonical lookup ({@link AreaResolutionService}) the scraper ingestion
 * pipeline already relies on ({@code ListingIngestionService}), keyed off the broker-supplied
 * {@code locality} text rather than lat/lng — lat/lng on the broker path come from an explicit map
 * pin and are intentionally left untouched here.
 */
@Service
public class ListingAreaResolutionService {

    private static final Logger log = LoggerFactory.getLogger(ListingAreaResolutionService.class);

    private final GeocodingPort geocodingPort;
    private final AreaResolutionService areaResolutionService;
    private final JdbcOperations jdbcOperations;

    public ListingAreaResolutionService(
            GeocodingPort geocodingPort,
            AreaResolutionService areaResolutionService,
            JdbcOperations jdbcOperations) {
        this.geocodingPort = geocodingPort;
        this.areaResolutionService = areaResolutionService;
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Resolves {@code listing}'s area_key from its {@code locality} text, in place. No-op when
     * the listing already carries a RESOLVED area_key (idempotent across repeated submit/approve
     * calls — avoids re-geocoding on every call), when locality is blank, or when geocoding fails
     * to produce a result — in every skip case the listing's existing area fields (possibly null)
     * are left untouched. Never throws: any failure is logged and treated as a skip, matching
     * {@link AreaResolutionService#resolve}'s own defensive contract.
     *
     * <p>#2268: {@link AreaResolutionService#resolveByAliasAnyCity} is tried FIRST, before
     * geocoding runs at all. It only needs the raw {@code locality} text (no geocode output), so a
     * locality with a curated {@code area_alias} row resolves even when the geocoder is down,
     * unreachable, or would otherwise fail — not merely when it succeeds but can't map its
     * resulting city name to a {@code cities} row (the original #2268 Manipal failure mode).
     * Geocoding only runs as a fallback when this alias-first lookup misses or is ambiguous.
     */
    public void resolveAndApply(Listing listing) {
        if ("RESOLVED".equals(listing.getAreaResolutionStatus()) && listing.getAreaKey() != null) {
            return;
        }

        String locality = listing.getLocality();
        if (locality == null || locality.isBlank()) {
            log.warn("ListingAreaResolutionService: cannot resolve area_key, locality is blank listingId={}",
                    listing.getId());
            return;
        }

        AreaResolution aliasFirst = areaResolutionService.resolveByAliasAnyCity(locality);
        if (aliasFirst.isResolved()) {
            listing.setAreaKey(aliasFirst.canonicalAreaKey());
            listing.setAreaLabel(areaResolutionService.areaLabelForKey(aliasFirst.canonicalAreaKey()));
            listing.setAreaResolutionStatus("RESOLVED");
            listing.setAreaResolutionMethod(aliasFirst.method().name());
            return;
        }

        GeocodingService.GeoResult geoResult;
        try {
            geoResult = geocodingPort.geocode(locality);
        } catch (Exception e) {
            log.warn("ListingAreaResolutionService: geocoding failed listingId={} locality={}: {}",
                    listing.getId(), locality, e.getMessage());
            return;
        }
        if (geoResult == null) {
            log.warn("ListingAreaResolutionService: geocoding returned null listingId={} locality={}",
                    listing.getId(), locality);
            return;
        }

        String geocodedAreaKey = GeocodedAreaKeyFormat.computeAreaKey(geoResult);
        String areaLabel = GeocodedAreaKeyFormat.computeAreaLabel(geoResult);
        Integer cityId = GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, geoResult);

        if (cityId == null) {
            // aliasFirst (above) already tried and missed/was-ambiguous for this same locality
            // text before geocoding ran, so there is nothing further to rescue with here.
            log.warn("ListingAreaResolutionService: UNRESOLVED (no cities row for geocoded city) "
                            + "listingId={} city={} geocodedAreaKey={} locality={}",
                    listing.getId(), geoResult.city(), geocodedAreaKey, locality);
            listing.setAreaKey(geocodedAreaKey);
            listing.setAreaLabel(areaLabel);
            listing.setAreaResolutionStatus("UNRESOLVED");
            listing.setAreaResolutionMethod(null);
            return;
        }

        AreaResolution resolution = areaResolutionService.resolve(cityId, null, null, geocodedAreaKey, locality);
        listing.setAreaLabel(areaLabel);
        if (resolution.isResolved()) {
            listing.setAreaKey(resolution.canonicalAreaKey());
            listing.setAreaResolutionStatus("RESOLVED");
            listing.setAreaResolutionMethod(resolution.method().name());
        } else {
            listing.setAreaKey(geocodedAreaKey);
            listing.setAreaResolutionStatus("UNRESOLVED");
            listing.setAreaResolutionMethod(null);
            log.warn("ListingAreaResolutionService: UNRESOLVED cityId={} listingId={} geocodedAreaKey={} "
                    + "locality={}", cityId, listing.getId(), geocodedAreaKey, locality);
        }
    }
}
