package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.school.SchoolResponse;
import com.example.realestate.school.SchoolService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Public (unauthenticated) listing endpoints.
 * These paths are explicitly permitted in JwtConfig — no JWT is required.
 *
 * <p>CRITICAL: Only LIVE listings are exposed. Any other status returns 404
 * to prevent leaking DRAFT / PENDING_REVIEW / REJECTED / ARCHIVED data.
 */
@RestController
@RequestMapping("/api/public/listings")
public class PublicListingController {

    private static final Logger log = LoggerFactory.getLogger(PublicListingController.class);

    private final ListingRepository listingRepository;
    private final ListingResponseMapper listingResponseMapper;
    private final PriceChangeLogRepository priceChangeLogRepository;
    private final SchoolService schoolService;

    public PublicListingController(ListingRepository listingRepository,
                                   ListingResponseMapper listingResponseMapper,
                                   PriceChangeLogRepository priceChangeLogRepository,
                                   SchoolService schoolService) {
        this.listingRepository = listingRepository;
        this.listingResponseMapper = listingResponseMapper;
        this.priceChangeLogRepository = priceChangeLogRepository;
        this.schoolService = schoolService;
    }

    /**
     * Returns a LIVE listing by ID.
     * Returns 404 for any non-LIVE status (DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED) or unknown ID.
     *
     * <p>JWT-aware: callers presenting a valid JWT receive the full {@link ListingResponse};
     * anonymous callers receive the teaser {@link ListingTeaserResponse} (no location, no PII).
     * Invalid/expired JWTs are rejected by {@code BearerTokenAuthenticationFilter} before this
     * method runs — the controller does not need to handle that case.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return notFound();
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = auth != null
                && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken);

        log.debug("GET /api/public/listings/{} authenticated={} -> 200", id, isAuthenticated);
        if (isAuthenticated) {
            return ResponseEntity.ok(listingResponseMapper.toPublicResponse(listing));
        } else {
            return ResponseEntity.ok(listingResponseMapper.toTeaserResponse(listing));
        }
    }

    /**
     * Returns the price history for a LIVE listing, sorted oldest-first.
     * Returns 404 for unknown IDs, soft-deleted listings, or any non-LIVE status
     * (DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED) — consistent with the detail endpoint.
     * Returns an empty array when no price changes have been recorded for the listing.
     *
     * <p>JWT-aware: anonymous callers on agricultural listings receive an empty array
     * (200), mirroring the price/pricePaise gate applied in {@link #getById} →
     * {@code toTeaserResponse}. This prevents the price-history endpoint from acting as a
     * side-channel that leaks agri price data the teaser response withholds. Authenticated
     * callers and all non-agricultural listings are unaffected.
     */
    @GetMapping("/{id}/price-history")
    public ResponseEntity<?> getPriceHistory(@PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return notFound();
        }

        // Anonymous callers on agricultural listings receive no price-history
        // (mirrors the price/pricePaise gate in getById → toTeaserResponse).
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAuthenticated = auth != null
                && auth.isAuthenticated()
                && !(auth instanceof AnonymousAuthenticationToken);
        boolean isAgri = "agricultural_land".equals(listing.getPropertyType());
        if (!isAuthenticated && isAgri) {
            return ResponseEntity.ok(List.of());
        }

        List<PriceChangeLog> logs = priceChangeLogRepository.findByListingIdOrderByChangedAtAsc(id);
        List<PriceHistoryEntry> entries = buildPriceHistory(logs);
        return ResponseEntity.ok(entries);
    }

    /**
     * Returns LIVE listings whose coordinates fall within a user-drawn polygon.
     * The polygon is a JSON-encoded array of [lat, lng] pairs.
     * Minimum 3 vertices required. The polygon is auto-closed (first point appended if not present).
     *
     * <p>Uses PostGIS ST_Contains for precise point-in-polygon testing (Supabase includes PostGIS).
     *
     * @param polygon JSON array of [lat, lng] pairs, e.g. {@code [[13.35,74.79],[13.36,74.80],[13.34,74.80]]}
     * @param page    page number (0-based, default 0)
     * @param size    page size (default 50, max 200)
     */
    @GetMapping("/within-polygon")
    public ResponseEntity<?> getWithinPolygon(
            @RequestParam String polygon,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        // Clamp page size to [1, 200]
        int clampedSize = Math.max(1, Math.min(200, size));

        List<double[]> coordinates;
        try {
            coordinates = parsePolygon(polygon);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        String wkt = toPolygonWkt(coordinates);
        log.debug("GET /api/public/listings/within-polygon — {} vertices, page={}, size={}",
                coordinates.size(), page, clampedSize);

        Page<Listing> results = listingRepository.findLiveListingsWithinPolygon(
                wkt, PageRequest.of(page, clampedSize));

        List<ListingTeaserResponse> content = listingResponseMapper.toTeaserResponseList(results.getContent());
        return ResponseEntity.ok(Map.of(
                "content", content,
                "totalElements", results.getTotalElements(),
                "totalPages", results.getTotalPages(),
                "page", results.getNumber(),
                "size", results.getSize()
        ));
    }

    /**
     * Returns a paginated feed of all LIVE listings as anonymous teasers.
     * No auth required. Ordered by creation date descending.
     *
     * @param page page number (0-based, default 0)
     * @param size page size (default 50, max 200)
     */
    @GetMapping("/discovery")
    public ResponseEntity<ListingDiscoveryResponse> getDiscovery(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        int clampedSize = Math.max(1, Math.min(200, size));

        log.debug("GET /api/public/listings/discovery page={}, size={}", page, clampedSize);

        Page<Listing> results = listingRepository.findAllLiveListings(PageRequest.of(page, clampedSize));
        List<ListingTeaserResponse> content = listingResponseMapper.toTeaserResponseList(results.getContent());

        return ResponseEntity.ok(new ListingDiscoveryResponse(
                content,
                results.getTotalElements(),
                results.getTotalPages(),
                results.getNumber(),
                results.getSize()
        ));
    }

    /**
     * Returns nearby schools for a LIVE listing.
     * Looks up the listing's coordinates, then delegates to SchoolService for spatial query.
     * Returns 404 for non-LIVE or missing listings, 400 if the listing has no coordinates.
     *
     * @param id       listing ID
     * @param radiusKm search radius in kilometres (default 2, clamped to 0.1..50)
     * @return count + list of nearby schools
     */
    @GetMapping("/{id}/nearby-schools")
    public ResponseEntity<?> getNearbySchools(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "2") double radiusKm) {

        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return notFound();
        }

        if (listing.getLatitude() == null || listing.getLongitude() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Listing has no coordinates"));
        }

        List<SchoolResponse> schools = schoolService.findNearby(
                listing.getLatitude(), listing.getLongitude(), radiusKm);

        log.debug("GET /api/public/listings/{}/nearby-schools radiusKm={} count={}",
                id, radiusKm, schools.size());

        return ResponseEntity.ok(Map.of(
                "count", schools.size(),
                "schools", schools
        ));
    }

    // ===== Helpers =====

    /** Maximum number of polygon vertices to accept (prevents abuse with huge polygons). */
    private static final int MAX_POLYGON_VERTICES = 500;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * Parses and validates a JSON polygon string into a list of [lat, lng] coordinate pairs.
     * Auto-closes the polygon if the last point does not equal the first.
     *
     * @throws IllegalArgumentException if the polygon is malformed, has fewer than 3 vertices,
     *         or contains coordinates outside valid WGS84 ranges
     */
    static List<double[]> parsePolygon(String polygonJson) {
        List<List<Double>> raw;
        try {
            raw = OBJECT_MAPPER.readValue(polygonJson, new TypeReference<>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid polygon JSON: expected array of [lat,lng] pairs");
        }

        if (raw == null || raw.size() < 3) {
            throw new IllegalArgumentException("Polygon must have at least 3 vertices");
        }
        if (raw.size() > MAX_POLYGON_VERTICES) {
            throw new IllegalArgumentException("Polygon must have at most " + MAX_POLYGON_VERTICES + " vertices");
        }

        List<double[]> coords = new ArrayList<>(raw.size() + 1);
        for (List<Double> pair : raw) {
            if (pair == null || pair.size() != 2 || pair.get(0) == null || pair.get(1) == null) {
                throw new IllegalArgumentException("Each polygon vertex must be a [lat, lng] pair");
            }
            double lat = pair.get(0);
            double lng = pair.get(1);
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                throw new IllegalArgumentException("Coordinates out of range: lat must be [-90,90], lng must be [-180,180]");
            }
            coords.add(new double[]{lat, lng});
        }

        // Auto-close the polygon ring if not already closed
        double[] first = coords.get(0);
        double[] last = coords.get(coords.size() - 1);
        if (first[0] != last[0] || first[1] != last[1]) {
            coords.add(new double[]{first[0], first[1]});
        }

        return coords;
    }

    /**
     * Converts a list of [lat, lng] coordinate pairs into a WKT POLYGON string.
     * PostGIS WKT uses (longitude latitude) order, so we swap the pair order.
     */
    static String toPolygonWkt(List<double[]> coords) {
        String ring = coords.stream()
                .map(c -> String.format(Locale.US, "%f %f", c[1], c[0])) // WKT = lng lat
                .collect(Collectors.joining(", "));
        return "POLYGON((" + ring + "))";
    }

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
    }

    private List<PriceHistoryEntry> buildPriceHistory(List<PriceChangeLog> logs) {
        List<PriceHistoryEntry> entries = new ArrayList<>(logs.size());
        for (PriceChangeLog pcl : logs) {
            BigDecimal newPriceRupees = paiseToRupees(pcl.getNewPricePaise());
            BigDecimal oldPriceRupees = paiseToRupees(pcl.getOldPricePaise());
            BigDecimal delta = (newPriceRupees != null && oldPriceRupees != null)
                    ? newPriceRupees.subtract(oldPriceRupees)
                    : null;
            entries.add(new PriceHistoryEntry(pcl.getChangedAt(), newPriceRupees, delta));
        }
        return entries;
    }

    /** Convert a paise value to rupees with 2 decimal places, or null if input is null. */
    private static BigDecimal paiseToRupees(Long paise) {
        if (paise == null) {
            return null;
        }
        return new BigDecimal(paise).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    // ===== DTOs =====

    /**
     * A single price change event.
     *
     * @param date  when the price changed
     * @param price the new price after the change
     * @param delta newPrice - oldPrice (positive = increase, negative = reduction, null if either price is null)
     */
    public record PriceHistoryEntry(
            OffsetDateTime date,
            BigDecimal price,
            BigDecimal delta
    ) {}

    /**
     * Paginated feed response for listing discovery.
     */
    public record ListingDiscoveryResponse(
            List<ListingTeaserResponse> content,
            long totalElements,
            int totalPages,
            int page,
            int size
    ) {}
}
