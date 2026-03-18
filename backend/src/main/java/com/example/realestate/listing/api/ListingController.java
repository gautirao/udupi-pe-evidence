package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.exception.OwnerListingLimitException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Dealer listing CRUD endpoints.
 * All endpoints require DEALER or ADMIN role (looked up from user_roles table).
 * Dealers can only operate on their own listings; admins can operate on any.
 */
@RestController
@RequestMapping("/api/listings")
public class ListingController {

    private static final Logger log = LoggerFactory.getLogger(ListingController.class);
    /**
     * Karnataka RERA registration number format (e.g. PRM/KA/2023/0042).
     * Canonical definition lives in {@link ListingResponse#RERA_PATTERN}.
     */
    static final java.util.regex.Pattern RERA_PATTERN = ListingResponse.RERA_PATTERN;

    private final ListingCrudService listingCrudService;
    private final ListingWorkflowService listingWorkflowService;
    private final ListingRepository listingRepository;
    private final ListingResponseMapper listingResponseMapper;

    public ListingController(ListingCrudService listingCrudService,
                             ListingWorkflowService listingWorkflowService,
                             ListingRepository listingRepository,
                             ListingResponseMapper listingResponseMapper) {
        this.listingCrudService = listingCrudService;
        this.listingWorkflowService = listingWorkflowService;
        this.listingRepository = listingRepository;
        this.listingResponseMapper = listingResponseMapper;
    }

    @PostMapping
    public ResponseEntity<?> create(CallerInfo caller, @RequestBody CreateRequest req) {

        String sellerType = "user".equals(caller.role()) ? "owner" : "broker";
        String createVideoUrl = (req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl();
        try {
            Listing saved = listingCrudService.createDraft(
                    caller.userId(), req.propertyType(), req.title(),
                    req.locality(), req.price(), req.description(),
                    req.landArea(), req.bedrooms(), req.builtArea(),
                    req.landAreaUnit(), req.builtAreaUnit(), createVideoUrl,
                    req.listingPurpose(),
                    req.carpetArea(), req.carpetAreaUnit(),
                    req.floorNumber(), req.totalFloors(),
                    req.furnishingStatus(), req.washrooms(), req.parkingCount(),
                    req.roadFrontageFt(), req.commercialUsage(), req.numberOfUnits(),
                    req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths(),
                    sellerType);

            log.info("POST /api/listings -> 201 listingId={} createdBy={} sellerType={}",
                    saved.getId(), caller.userId(), sellerType);
            return ResponseEntity.status(HttpStatus.CREATED).body(listingResponseMapper.toResponse(saved));
        } catch (OwnerListingLimitException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(CallerInfo caller, @PathVariable UUID id) {

        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        }
        return ResponseEntity.ok(listingResponseMapper.toResponse(listing));
    }

    @GetMapping("/mine/stats")
    public ResponseEntity<?> stats(CallerInfo caller) {

        ListingStatsResponse stats = listingCrudService.getListingStats(caller.userId());
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(
            CallerInfo caller,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {

        Page<Listing> listings = listingCrudService.getListingsByOwner(caller.userId(), status, pageable);

        Page<ListingResponse> response = listings.map(listingResponseMapper::toResponse);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(CallerInfo caller,
                                    @PathVariable UUID id,
                                    @RequestBody UpdateRequest req) {

        try {
            boolean applyVideo = Boolean.TRUE.equals(req.applyVideoUrl());
            String updateVideoUrl = applyVideo
                    ? ((req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl())
                    : null;
            Listing updated = listingCrudService.updateListing(
                    id, caller.userId(), caller.isAdmin(),
                    req.propertyType(), req.title(), req.locality(),
                    req.price(), req.description(),
                    req.landArea(), req.bedrooms(), req.builtArea(),
                    req.addressConfirmed(), req.latitude(), req.longitude(),
                    req.landAreaUnit(), req.builtAreaUnit(),
                    updateVideoUrl, applyVideo, req.reraNumber(),
                    req.listingPurpose(),
                    req.carpetArea(), req.carpetAreaUnit(),
                    req.floorNumber(), req.totalFloors(),
                    req.furnishingStatus(), req.washrooms(), req.parkingCount(),
                    req.roadFrontageFt(), req.commercialUsage(), req.numberOfUnits(),
                    req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths(),
                    req.possessionStatus(), req.expectedPossessionDate(), req.approvalsDeclared());
            return ResponseEntity.ok(listingResponseMapper.toResponse(updated));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(CallerInfo caller, @PathVariable UUID id) {

        try {
            listingCrudService.deleteListing(id, caller.userId(), caller.isAdmin());
            return ResponseEntity.noContent().build();
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<?> bulkDelete(CallerInfo caller, @RequestBody BulkDeleteRequest req) {

        if (req.ids() == null || req.ids().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids must not be empty"));
        }
        if (req.ids().size() > 50) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot delete more than 50 listings at once"));
        }

        BulkDeleteResult result = listingCrudService.bulkDeleteListings(req.ids(), caller.userId(), caller.isAdmin());
        log.info("POST /api/listings/bulk-delete -> deleted={} skipped={} userId={}",
                result.deleted(), result.skipped(), caller.userId());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submit(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing submitted = listingWorkflowService.submitListing(id, caller.userId(), caller.isAdmin());
            log.info("POST /api/listings/{}/submit -> 200 status=PENDING_REVIEW", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(submitted));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (ListingValidationException e) {
            return ResponseEntity.unprocessableEntity().body(Map.of("errors", e.getErrors()));
        }
    }

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    // ===== Request DTOs (only used within this controller) =====

    public record CreateRequest(
            String propertyType,
            String title,
            String locality,
            BigDecimal price,
            String description,
            BigDecimal landArea,
            Integer bedrooms,
            BigDecimal builtArea,
            String landAreaUnit,
            String builtAreaUnit,
            String videoUrl,
            // Commercial & rent fields
            String listingPurpose,
            BigDecimal carpetArea,
            String carpetAreaUnit,
            Integer floorNumber,
            Integer totalFloors,
            String furnishingStatus,
            Integer washrooms,
            Integer parkingCount,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            Integer numberOfUnits,
            Long monthlyRent,
            Integer securityDepositMonths,
            Integer lockInMonths
    ) {}

    public record UpdateRequest(
            String propertyType,
            String title,
            String locality,
            BigDecimal price,
            String description,
            BigDecimal landArea,
            Integer bedrooms,
            BigDecimal builtArea,
            Boolean addressConfirmed,
            Double latitude,
            Double longitude,
            String landAreaUnit,
            String builtAreaUnit,
            String videoUrl,
            Boolean applyVideoUrl,  // true = apply the videoUrl field (null clears, non-null sets)
            String reraNumber,
            // Commercial & rent fields
            String listingPurpose,
            BigDecimal carpetArea,
            String carpetAreaUnit,
            Integer floorNumber,
            Integer totalFloors,
            String furnishingStatus,
            Integer washrooms,
            Integer parkingCount,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            Integer numberOfUnits,
            Long monthlyRent,
            Integer securityDepositMonths,
            Integer lockInMonths,
            // RERA & possession fields (RE-99)
            // TODO(RE-99): add @Pattern validation for reraNumber once test coverage exists.
            //   Regex: ^[A-Z]{3}/[A-Z]{2}/\d{4}/\d{4}$ — Karnataka RERA format.
            String possessionStatus,
            java.time.LocalDate expectedPossessionDate,
            String approvalsDeclared
    ) {}

    public record BulkDeleteRequest(List<UUID> ids) {}
}
