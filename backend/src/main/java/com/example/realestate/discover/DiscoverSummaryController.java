package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) endpoint for the discover summary rollup (#1745 P5).
 *
 * <p>GET /api/discover/summary?city=&amp;propertyType=&amp;groupBy=&amp;hotspotLimit=&amp;listingPurpose=
 *
 * <p>{@code listingPurpose} (#1745 P5-addendum) is an independent optional filter — {@code "sale"}
 * or {@code "rent"} — separate from {@code propertyType}. It is passed through unnormalised to
 * {@link DiscoverSummaryService}, which validates it against the allowed set and falls back to
 * blended (all-purposes) for blank/invalid values, mirroring {@code propertyType}'s
 * blank-normalisation pattern as an independent code path.
 *
 * <p>{@code groupBy} is validated against a fixed whitelist and never interpolated into SQL.
 * Unknown/empty city returns 200 with empty {@code regions}/{@code hotspots} and
 * {@code totalActiveListings=0} — mirroring {@link AreaSummaryController}'s unknown-city contract
 * (not 404).
 */
@RestController
@RequestMapping("/api/discover")
public class DiscoverSummaryController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverSummaryController.class);

    private static final Set<String> ALLOWED_GROUP_BY = Set.of("area_group", "corridor");
    private static final String DEFAULT_GROUP_BY = "area_group";

    private static final int DEFAULT_HOTSPOT_LIMIT = 8;
    private static final int MIN_HOTSPOT_LIMIT = 1;
    private static final int MAX_HOTSPOT_LIMIT = 20;

    private final DiscoverSummaryPort service;

    public DiscoverSummaryController(DiscoverSummaryPort service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public ResponseEntity<DiscoverSummaryResponse> getSummary(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "propertyType", required = false) String propertyType,
            @RequestParam(name = "groupBy", required = false) String groupBy,
            @RequestParam(name = "hotspotLimit", required = false) Integer hotspotLimit,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose) {

        String effectiveGroupBy = (groupBy != null && !groupBy.isBlank()) ? groupBy.trim() : DEFAULT_GROUP_BY;
        if (!ALLOWED_GROUP_BY.contains(effectiveGroupBy)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "groupBy_must_be_area_group_or_corridor");
        }

        int requestedLimit = hotspotLimit != null ? hotspotLimit : DEFAULT_HOTSPOT_LIMIT;
        int effectiveLimit = Math.max(MIN_HOTSPOT_LIMIT, Math.min(requestedLimit, MAX_HOTSPOT_LIMIT));

        log.debug("GET /api/discover/summary city={} propertyType={} groupBy={} hotspotLimit={} listingPurpose={}",
                city, propertyType, effectiveGroupBy, effectiveLimit, listingPurpose);

        SummaryQuery query = new SummaryQuery(city, propertyType, effectiveGroupBy, effectiveLimit, listingPurpose);
        DiscoverSummaryResponse response = service.getSummary(query);

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(120, TimeUnit.SECONDS).cachePublic())
                .eTag(computeETag(response, listingPurpose))
                .body(response);
    }

    /**
     * Weak content hash used as a cache-validation ETag. Deliberately excludes
     * {@code generatedAt} (a freshness timestamp, not content) so that two responses with
     * identical counts/regions/hotspots produce the same ETag. The response's field ordering is
     * deterministic (stable SQL ORDER BY at every query site), so identical content always
     * produces an identical digest. Not a security control — purely a cache-validation hint.
     *
     * <p>{@code listingPurpose} (#1745 P5-addendum) is folded into the digest even though
     * {@link DiscoverSummaryResponse} does not echo it: {@code totalActiveListings}/{@code regions}/
     * {@code hotspots} can coincidentally be identical across sale/rent/blended for a given
     * city+propertyType+groupBy+hotspotLimit (e.g. a city with zero listings of either purpose),
     * which would otherwise collide two semantically distinct URLs onto the same ETag. Only
     * blank-normalisation (not the {@code sale}/{@code rent} allow-list validated in
     * {@link DiscoverSummaryService}) is applied here — this is a cache-key concern, not a
     * filtering concern, so it deliberately does not duplicate that validation.
     */
    private static String computeETag(DiscoverSummaryResponse response, String listingPurpose) {
        String etagPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;
        String canonical = response.city() + "|" + response.propertyType() + "|" + response.groupBy()
                + "|" + response.totalActiveListings() + "|" + response.regions() + "|" + response.hotspots()
                + "|" + etagPurpose;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return "\"" + hex + "\"";
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; this is unreachable in practice.
            return "\"discover-summary\"";
        }
    }
}
