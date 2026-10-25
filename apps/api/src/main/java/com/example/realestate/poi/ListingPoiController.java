package com.example.realestate.poi;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    /**
     * Settlement-derived categories (TOWN_CENTER, VILLAGE_CENTER, HIGHWAY) are auto-approved
     * computed data. Dealers may not approve or delete them via the management API.
     */
    private static final Set<String> SETTLEMENT_CATEGORIES = Set.of(
            PoiCategory.TOWN_CENTER.name(),
            PoiCategory.VILLAGE_CENTER.name(),
            PoiCategory.HIGHWAY.name()
    );

    private final ListingPoiService service;
    private final OverpassService overpassService;
    private final ListingWorkflowService listingWorkflowService;

    public ListingPoiController(ListingPoiService service,
                                OverpassService overpassService,
                                ListingWorkflowService listingWorkflowService) {
        this.service = service;
        this.overpassService = overpassService;
        this.listingWorkflowService = listingWorkflowService;
    }

    // ===== Public endpoint =====

    /**
     * Public endpoint — no auth required.
     * Returns approved POIs for a LIVE listing, ordered pinned DESC then distance ASC, capped at 15.
     * Returns 404 for unknown IDs, soft-deleted listings, or any non-LIVE status
     * (DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED, SCRAPED).
     */
    @GetMapping
    public ResponseEntity<?> getApproved(@PathVariable UUID listingId) {
        try {
            return ResponseEntity.ok(service.getApproved(listingId));
        } catch (ListingNotFoundException e) {
            return notFound();
        }
    }

    // ===== Dealer/admin endpoints =====

    /**
     * Returns all POIs (approved or not) for a listing, wrapped with a {@code providerIssue}
     * flag distinguishing a failed Overpass fetch from a genuine empty result.
     * If no Overpass POIs exist yet, triggers a fetch-and-cache before returning.
     * Auth: listing owner or admin.
     */
    @GetMapping("/suggestions")
    public ResponseEntity<?> getSuggestions(CallerInfo caller,
                                            @PathVariable UUID listingId) {

        Listing listing;
        try {
            listing = listingWorkflowService.findListingForCaller(listingId, caller.userId(), caller.isAdmin());
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        // Trigger Overpass fetches if listing has coordinates. Both methods guard against re-fetch
        // internally (14-day cache per source type), so calling on every request is safe.
        boolean providerIssue = false;
        if (listing.getLatitude() != null && listing.getLongitude() != null) {
            OverpassFetchOutcome amenityOutcome = overpassService.fetchAndCacheAmenities(
                    listingId, listing.getLatitude(), listing.getLongitude(), listing.getPropertyType());
            OverpassFetchOutcome settlementOutcome = overpassService.enrichSettlement(
                    listingId, listing.getLatitude(), listing.getLongitude(), listing.getPropertyType());
            providerIssue = amenityOutcome.providerFailed() || settlementOutcome.providerFailed();
        }

        List<PoiResponse> pois = service.getAll(listingId).stream()
                .map(PoiResponse::from)
                .toList();
        log.debug("GET suggestions listingId={} caller={} count={} providerIssue={}",
                listingId, caller.userId(), pois.size(), providerIssue);
        return ResponseEntity.ok(new SuggestionsResponse(pois, providerIssue));
    }

    /**
     * Approves a POI. Sets approved=true and records the approver.
     * Auth: listing owner or admin.
     */
    @PatchMapping("/{poiId}/approve")
    public ResponseEntity<?> approvePoi(CallerInfo caller,
                                        @PathVariable UUID listingId,
                                        @PathVariable UUID poiId) {

        try {
            listingWorkflowService.findListingForCaller(listingId, caller.userId(), caller.isAdmin());
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        ListingPoi poi = service.findById(poiId).orElse(null);
        if (poi == null || !listingId.equals(poi.getListingId())) return poiNotFound();

        if (SETTLEMENT_CATEGORIES.contains(poi.getCategory())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Settlement POIs (TOWN_CENTER, VILLAGE_CENTER, HIGHWAY) are auto-approved and cannot be manually approved");
        }

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
    public ResponseEntity<?> pinPoi(CallerInfo caller,
                                    @PathVariable UUID listingId,
                                    @PathVariable UUID poiId) {

        try {
            listingWorkflowService.findListingForCaller(listingId, caller.userId(), caller.isAdmin());
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
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
    public ResponseEntity<?> addManual(CallerInfo caller,
                                       @PathVariable UUID listingId,
                                       @RequestBody ManualPoiRequest request) {

        try {
            listingWorkflowService.findListingForCaller(listingId, caller.userId(), caller.isAdmin());
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
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

        // Validate distance if provided: must be a positive integer (metres).
        if (request.distanceMeters() != null && request.distanceMeters() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "distanceMeters must be a positive integer");
        }

        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(request.name());
        poi.setCategory(category.name());
        poi.setLatitude(request.latitude());
        poi.setLongitude(request.longitude());
        poi.setDistanceMeters(request.distanceMeters());
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
    public ResponseEntity<?> deletePoi(CallerInfo caller,
                                       @PathVariable UUID listingId,
                                       @PathVariable UUID poiId) {

        try {
            listingWorkflowService.findListingForCaller(listingId, caller.userId(), caller.isAdmin());
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            log.warn("AUTH DENIED listingId={} caller={} reason=not_owner", listingId, caller.userId());
            return forbidden();
        }

        ListingPoi poi = service.findById(poiId).orElse(null);
        if (poi == null || !listingId.equals(poi.getListingId())) return poiNotFound();

        if (SETTLEMENT_CATEGORIES.contains(poi.getCategory())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Settlement POIs (TOWN_CENTER, VILLAGE_CENTER, HIGHWAY) are auto-computed and cannot be deleted");
        }

        service.delete(poiId);
        log.info("DELETE poiId={} listingId={} caller={}", poiId, listingId, caller.userId());
        return ResponseEntity.noContent().build();
    }

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Access denied: not listing owner or admin"));
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
