package com.example.realestate.poi;

import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * POI endpoints for a listing.
 *
 * <p>Public: GET /api/listings/{id}/pois (no auth — see JwtConfig permitAll)
 * <p>Authenticated: suggestions, approve, pin, manual-add, delete (dealer=owner or admin)
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

    // ===== Public read =====

    /**
     * Returns approved POIs for a listing, ordered pinned first then by distance.
     * Always returns 200 with [] — no auth required.
     */
    @GetMapping
    public ResponseEntity<List<PoiResponse>> getApprovedPois(@PathVariable UUID listingId) {
        return ResponseEntity.ok(service.getApproved(listingId));
    }

    // ===== Dealer / admin management =====

    /**
     * Triggers Overpass fetch (cache-miss only) and returns all POIs including unapproved.
     * Auth: listing owner or admin.
     */
    @GetMapping("/suggestions")
    public ResponseEntity<?> getSuggestions(@PathVariable UUID listingId,
                                            JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();
        if (!isOwnerOrAdmin(listingId, caller)) return forbidden();

        return listingRepository.findById(listingId).map(listing -> {
            overpassService.fetchAndCache(listingId, listing.getLatitude(), listing.getLongitude());
            return ResponseEntity.ok(service.getAll(listingId));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * Approves a POI suggestion, recording the approver.
     * Auth: listing owner or admin.
     */
    @PatchMapping("/{poiId}/approve")
    public ResponseEntity<?> approvePoi(@PathVariable UUID listingId,
                                        @PathVariable UUID poiId,
                                        JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();
        if (!isOwnerOrAdmin(listingId, caller)) return forbidden();

        return service.findById(poiId).map(poi -> {
            poi.setApproved(true);
            poi.setApprovedBy(caller.userId());
            return ResponseEntity.ok(PoiResponse.from(service.save(poi)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * Toggles pinned status on a POI.
     * When pinning, auto-assigns next available position.
     * Auth: listing owner or admin.
     */
    @PatchMapping("/{poiId}/pin")
    public ResponseEntity<?> pinPoi(@PathVariable UUID listingId,
                                    @PathVariable UUID poiId,
                                    JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();
        if (!isOwnerOrAdmin(listingId, caller)) return forbidden();

        return service.findById(poiId).map(poi -> {
            boolean nowPinned = !poi.isPinned();
            poi.setPinned(nowPinned);
            if (nowPinned) {
                int nextPosition = service.getAll(listingId).stream()
                        .filter(ListingPoi::isPinned)
                        .mapToInt(p -> p.getPosition() != null ? p.getPosition() : 0)
                        .max().orElse(0) + 1;
                poi.setPosition(nextPosition);
            } else {
                poi.setPosition(null);
            }
            return ResponseEntity.ok(PoiResponse.from(service.save(poi)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * Adds a manual POI (implicitly approved).
     * Auth: listing owner or admin.
     */
    @PostMapping("/manual")
    public ResponseEntity<?> addManualPoi(@PathVariable UUID listingId,
                                          @RequestBody ManualPoiRequest req,
                                          JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();
        if (!isOwnerOrAdmin(listingId, caller)) return forbidden();

        if (req.name() == null || req.name().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        if (!isValidCategory(req.category())) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid category"));
        }

        return listingRepository.findById(listingId).map(listing -> {
            ListingPoi poi = new ListingPoi();
            poi.setListingId(listingId);
            poi.setName(req.name());
            poi.setCategory(req.category().toUpperCase());
            poi.setLatitude(req.latitude());
            poi.setLongitude(req.longitude());
            poi.setDistanceMeters(OverpassService.haversineMeters(
                    listing.getLatitude(), listing.getLongitude(), req.latitude(), req.longitude()));
            poi.setSource("manual");
            poi.setApproved(true);
            poi.setApprovedBy(caller.userId());
            poi.setPinned(false);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(PoiResponse.from(service.save(poi)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * Hard-deletes a POI.
     * Auth: listing owner or admin.
     */
    @DeleteMapping("/{poiId}")
    public ResponseEntity<?> deletePoi(@PathVariable UUID listingId,
                                       @PathVariable UUID poiId,
                                       JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();
        if (!isOwnerOrAdmin(listingId, caller)) return forbidden();

        if (service.findById(poiId).isEmpty()) return ResponseEntity.notFound().build();
        service.delete(poiId);
        return ResponseEntity.noContent().build();
    }

    // ===== Auth helpers =====

    private CallerInfo resolveCallerOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = listingService.getUserRole(userId).orElse(null);
        if (role == null || !ALLOWED_ROLES.contains(role)) return null;
        return new CallerInfo(userId, role, "admin".equals(role));
    }

    private boolean isOwnerOrAdmin(UUID listingId, CallerInfo caller) {
        if (caller.isAdmin()) return true;
        return listingRepository.findById(listingId)
                .map(l -> caller.userId().equals(l.getCreatedBy()))
                .orElse(false);
    }

    private boolean isValidCategory(String category) {
        if (category == null) return false;
        try {
            PoiCategory.valueOf(category.toUpperCase());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private record CallerInfo(UUID userId, String role, boolean isAdmin) {}

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires dealer or admin role and listing ownership"));
    }
}
