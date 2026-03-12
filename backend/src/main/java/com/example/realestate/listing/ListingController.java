package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
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
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private static final Set<String> ALLOWED_ROLES = Set.of("dealer", "admin");

    private final ListingService listingService;
    private final ListingRepository listingRepository;
    private final ListingImageRepository listingImageRepository;

    public ListingController(ListingService listingService,
                             ListingRepository listingRepository,
                             ListingImageRepository listingImageRepository) {
        this.listingService = listingService;
        this.listingRepository = listingRepository;
        this.listingImageRepository = listingImageRepository;
    }

    @PostMapping
    public ResponseEntity<?> create(JwtAuthenticationToken auth, @RequestBody CreateRequest req) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        String createVideoUrl = (req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl();
        Listing saved = listingService.createDraft(
                caller.userId(), req.propertyType(), req.title(),
                req.locality(), req.price(), req.description(),
                req.landArea(), req.bedrooms(), req.builtArea(),
                req.landAreaUnit(), req.builtAreaUnit(), createVideoUrl);

        log.info("POST /api/listings -> 201 listingId={} createdBy={}", saved.getId(), caller.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(JwtAuthenticationToken auth, @PathVariable UUID id) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) return notFound();
        if (!caller.isAdmin() && !listing.getCreatedBy().equals(caller.userId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different dealer"));
        }
        return ResponseEntity.ok(toResponse(listing));
    }

    @GetMapping("/mine/stats")
    public ResponseEntity<?> stats(JwtAuthenticationToken auth) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        ListingStatsResponse stats = listingService.getListingStats(caller.userId());
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(
            JwtAuthenticationToken auth,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        Page<Listing> listings = listingService.getListingsByOwner(caller.userId(), status, pageable);

        Page<ListingResponse> response = listings.map(this::toResponse);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(JwtAuthenticationToken auth,
                                    @PathVariable UUID id,
                                    @RequestBody UpdateRequest req) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        try {
            boolean applyVideo = Boolean.TRUE.equals(req.applyVideoUrl());
            String updateVideoUrl = applyVideo
                    ? ((req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl())
                    : null;
            Listing updated = listingService.updateListing(
                    id, caller.userId(), caller.isAdmin(),
                    req.propertyType(), req.title(), req.locality(),
                    req.price(), req.description(),
                    req.landArea(), req.bedrooms(), req.builtArea(),
                    req.addressConfirmed(), req.latitude(), req.longitude(),
                    req.landAreaUnit(), req.builtAreaUnit(),
                    updateVideoUrl, applyVideo, req.reraNumber());
            return ResponseEntity.ok(toResponse(updated));
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different dealer"));
        } catch (ListingService.ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(JwtAuthenticationToken auth, @PathVariable UUID id) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        try {
            listingService.deleteListing(id, caller.userId(), caller.isAdmin());
            return ResponseEntity.noContent().build();
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submit(JwtAuthenticationToken auth, @PathVariable UUID id) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        try {
            Listing submitted = listingService.submitListing(id, caller.userId(), caller.isAdmin());
            log.info("POST /api/listings/{}/submit -> 200 status=PENDING_REVIEW", id);
            return ResponseEntity.ok(toResponse(submitted));
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (ListingService.ListingValidationException e) {
            return ResponseEntity.unprocessableEntity().body(Map.of("errors", e.getErrors()));
        }
    }

    // ===== Auth helpers =====

    private CallerInfo resolveCallerOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = listingService.getUserRole(userId).orElse(null);
        if (role == null || !ALLOWED_ROLES.contains(role)) {
            return null;
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

    private ListingResponse toResponse(Listing l) {
        int imageCount = (int) listingImageRepository.countByListingId(l.getId());
        String firstImageUrl = listingImageRepository
                .findByListingIdOrderByPositionAsc(l.getId())
                .stream().findFirst()
                .map(ListingImage::getUrl)
                .orElse(null);
        return new ListingResponse(
                l.getId(), l.getListingNumber(), l.getDisplayId(),
                l.getStatus(), l.getPropertyType(), l.getTitle(),
                l.getLocality(), l.getPrice(), l.getDescription(),
                l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                l.getLatitude(), l.getLongitude(),
                l.isAddressConfirmed(), l.getRejectionReason(),
                l.getCreatedAt(), l.getUpdatedAt(),
                imageCount, firstImageUrl, l.getVideoUrl(),
                l.getReraNumber());
    }

    // ===== DTOs =====

    public record ListingStatsResponse(
            int draftCount,
            int pendingReviewCount,
            int liveCount,
            int rejectedCount,
            int totalCount
    ) {}

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
            String videoUrl
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
            String reraNumber
    ) {}

    public record ListingResponse(
            UUID id,
            Integer listingNumber,
            String displayId,
            String status,
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
            Double latitude,
            Double longitude,
            boolean addressConfirmed,
            String rejectionReason,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            int imageCount,
            String firstImageUrl,
            String videoUrl,
            String reraNumber
    ) {}
}
