package com.example.realestate.poi;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * REST endpoints for listing POIs.
 *
 * <p>Public read:
 * <ul>
 *   <li>GET /api/listings/{listingId}/pois — no auth required</li>
 * </ul>
 *
 * <p>Dealer/admin management (listing owner or admin role required):
 * <ul>
 *   <li>GET    /api/listings/{listingId}/pois/suggestions</li>
 *   <li>PATCH  /api/listings/{listingId}/pois/{poiId}/approve</li>
 *   <li>PATCH  /api/listings/{listingId}/pois/{poiId}/pin</li>
 *   <li>POST   /api/listings/{listingId}/pois/manual</li>
 *   <li>DELETE /api/listings/{listingId}/pois/{poiId}</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/listings/{listingId}/pois")
public class ListingPoiController {

    private static final Logger log = LoggerFactory.getLogger(ListingPoiController.class);
    private static final Set<String> ALLOWED_ROLES = Set.of("dealer", "admin");

    private final ListingPoiService service;
    private final OverpassService overpassService;
    private final ListingService listingService;
    private final ListingRepository listingRepository;

    public ListingPoiController(ListingPoiService service,
                                OverpassService overpassService,
                                ListingService listingService,
                                ListingRepository listingRepository) {
        this.service = service;
        this.overpassService = overpassService;
        this.listingService = listingService;
        this.listingRepository = listingRepository;
    }

    // ===== Public endpoint =====

    /**
     * Public endpoint — no auth required.
     * Returns approved POIs for a listing, ordered pinned DESC then distance ASC, capped at 15.
     */
    @GetMapping
    public ResponseEntity<List<PoiResponse>> getApproved(@PathVariable UUID listingId) {
        return ResponseEntity.ok(service.getApproved(listingId));
    }

    // ===== Dealer/admin endpoints =====

    /**
     * Returns all POIs (approved or not) for a listing.
     * If no Overpass POIs exist yet, triggers a fetch-and-cache before returning.
     * Auth: listing owner or admin.
     */
    @GetMapping("/suggestions")
    public ResponseEntity<?> getSuggestions(JwtAuthenticationToken auth,
                                            @PathVariable UUID listingId) {
        CallerInfo caller = resolveCallerOrForbid(auth);

        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        // Trigger Overpass fetch if listing has coordinates and no cached results yet.
        // OverpassService handles the 14-day cache guard internally.
        if (listing.getLatitude() != null && listing.getLongitude() != null) {
            overpassService.fetchAndCache(listingId, listing.getLatitude(), listing.getLongitude());
        }

        List<PoiResponse> pois = service.getAll(listingId).stream()
                .map(PoiResponse::from)
                .toList();
        log.debug("GET suggestions listingId={} caller={} count={}", listingId, caller.userId(), pois.size());
        return ResponseEntity.ok(pois);
    }

    /**
     * Approves a POI. Sets approved=true and records the approver.
     * Auth: listing owner or admin.
     */
    @PatchMapping("/{poiId}/approve")
    public ResponseEntity<?> approvePoi(JwtAuthenticationToken auth,
                                        @PathVariable UUID listingId,
                                        @PathVariable UUID poiId) {
        CallerInfo caller = resolveCallerOrForbid(auth);

        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        ListingPoi poi = service.findById(poiId).orElse(null);
        if (poi == null || !listingId.equals(poi.getListingId())) return poiNotFound();

        poi.setApproved(true);
        poi.setApprovedBy(caller.userId());
        ListingPoi saved = service.save(poi);

        log.info("PATCH approve poiId={} listingId={} approvedBy={}", poiId, listingId, caller.userId());
        return ResponseEntity.ok(PoiResponse.from(saved));
    }

    /**
     * Toggles the pinned flag for a POI.
     * Auth: listing owner or admin.
     */
    @PatchMapping("/{poiId}/pin")
    public ResponseEntity<?> pinPoi(JwtAuthenticationToken auth,
                                    @PathVariable UUID listingId,
                                    @PathVariable UUID poiId) {
        CallerInfo caller = resolveCallerOrForbid(auth);

        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        ListingPoi poi = service.findById(poiId).orElse(null);
        if (poi == null || !listingId.equals(poi.getListingId())) return poiNotFound();

        poi.setPinned(!Boolean.TRUE.equals(poi.getPinned()));
        ListingPoi saved = service.save(poi);

        log.info("PATCH pin poiId={} listingId={} pinned={} caller={}", poiId, listingId, saved.getPinned(), caller.userId());
        return ResponseEntity.ok(PoiResponse.from(saved));
    }

    /**
     * Manually adds a POI to a listing.
     * Validates category (must be a known PoiCategory) and lat/lon bounds.
     * Auth: listing owner or admin.
     */
    @PostMapping("/manual")
    public ResponseEntity<?> addManual(JwtAuthenticationToken auth,
                                       @PathVariable UUID listingId,
                                       @RequestBody ManualPoiRequest request) {
        CallerInfo caller = resolveCallerOrForbid(auth);

        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        // Validate category
        PoiCategory category;
        try {
            category = PoiCategory.valueOf(request.category());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid category");
        }

        // Validate lat/lon bounds if provided
        if (request.latitude() != null && (request.latitude() < -90 || request.latitude() > 90)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "latitude must be between -90 and 90");
        }
        if (request.longitude() != null && (request.longitude() < -180 || request.longitude() > 180)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "longitude must be between -180 and 180");
        }

        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(request.name());
        poi.setCategory(category.name());
        poi.setLatitude(request.latitude());
        poi.setLongitude(request.longitude());
        poi.setDistanceMeters(null);   // manual POIs have no auto-calculated distance
        poi.setSource("manual");
        poi.setApproved(true);
        poi.setPinned(false);

        ListingPoi saved = service.save(poi);
        log.info("POST manual POI listingId={} poiId={} category={} caller={}",
                listingId, saved.getId(), category, caller.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(PoiResponse.from(saved));
    }

    /**
     * Hard-deletes a POI, verifying it belongs to listingId.
     * Auth: listing owner or admin.
     */
    @DeleteMapping("/{poiId}")
    public ResponseEntity<?> deletePoi(JwtAuthenticationToken auth,
                                       @PathVariable UUID listingId,
                                       @PathVariable UUID poiId) {
        CallerInfo caller = resolveCallerOrForbid(auth);

        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        ListingPoi poi = service.findById(poiId).orElse(null);
        if (poi == null || !listingId.equals(poi.getListingId())) return poiNotFound();

        service.delete(poiId);
        log.info("DELETE poiId={} listingId={} caller={}", poiId, listingId, caller.userId());
        return ResponseEntity.noContent().build();
    }

    // ===== Auth helpers =====

    private CallerInfo resolveCallerOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = listingService.getUserRole(userId).orElse(null);
        if (role == null || !ALLOWED_ROLES.contains(role)) {
            log.warn("AUTH DENIED caller={} reason=insufficient_role role={}", userId, role);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires dealer or admin role");
        }
        return new CallerInfo(userId, role, "admin".equals(role));
    }

    private record CallerInfo(UUID userId, String role, boolean isAdmin) {}

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires dealer or admin role"));
    }

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    private static ResponseEntity<Map<String, String>> poiNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "POI not found"));
    }
}
