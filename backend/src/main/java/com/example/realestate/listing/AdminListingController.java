package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only listing review endpoints.
 * All endpoints require ADMIN role (looked up from user_roles table).
 */
@RestController
@RequestMapping("/api/admin/listings")
public class AdminListingController {

    private static final Logger log = LoggerFactory.getLogger(AdminListingController.class);

    /** Number of days within which a back-to-market listing is still badged. */
    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private final ListingService listingService;
    private final ListingImageRepository listingImageRepository;
    private final AdminAuditService adminAuditService;

    public AdminListingController(ListingService listingService,
                                  ListingImageRepository listingImageRepository,
                                  AdminAuditService adminAuditService) {
        this.listingService = listingService;
        this.listingImageRepository = listingImageRepository;
        this.adminAuditService = adminAuditService;
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        try {
            Listing approved = listingService.approveListing(id, adminId);
            log.info("POST /api/admin/listings/{}/approve -> 200 status=LIVE", id);
            adminAuditService.record(adminId, "listing_approved", "listing", id, null,
                    "{\"status\":\"LIVE\"}");
            return ResponseEntity.ok(toResponse(approved));
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<?> restore(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        try {
            Listing restored = listingService.restoreListing(id, adminId);
            log.info("POST /api/admin/listings/{}/restore -> 200 status=DRAFT adminId={}", id, adminId);
            adminAuditService.record(adminId, "listing_restored", "listing", id, null,
                    "{\"status\":\"DRAFT\"}");
            return ResponseEntity.ok(toResponse(restored));
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingNotArchivedException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(JwtAuthenticationToken auth,
                                    @PathVariable UUID id,
                                    @RequestBody RejectRequest req) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        if (req.rejectionReason() == null || req.rejectionReason().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Rejection reason is required"));
        }

        try {
            Listing rejected = listingService.rejectListing(id, adminId, req.rejectionReason());
            log.info("POST /api/admin/listings/{}/reject -> 200 status=REJECTED", id);
            adminAuditService.record(adminId, "listing_rejected", "listing", id, null,
                    "{\"status\":\"REJECTED\",\"reason\":\"" + req.rejectionReason().replace("\"", "\\\"") + "\"}");
            return ResponseEntity.ok(toResponse(rejected));
        } catch (ListingService.ListingNotFoundException e) {
            return notFound();
        } catch (ListingService.ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> forceDelete(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        try {
            boolean archived = listingService.adminForceDelete(id, adminId);
            log.info("DELETE /api/admin/listings/{} -> 204 adminId={} archived={}", id, adminId, archived);
            if (archived) {
                adminAuditService.record(adminId, "listing_force_deleted", "listing", id, null,
                        "{\"status\":\"ARCHIVED\"}");
            }
            return ResponseEntity.noContent().build();
        } catch (ListingService.ListingNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ===== Auth =====

    private UUID resolveAdminOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = listingService.getUserRole(userId).orElse(null);
        if (!"admin".equals(role)) {
            return null;
        }
        return userId;
    }

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires admin role"));
    }

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    private ListingController.ListingResponse toResponse(Listing l) {
        int imageCount = (int) listingImageRepository.countByListingId(l.getId());
        String firstImageUrl = listingImageRepository
                .findByListingIdOrderByPositionAsc(l.getId())
                .stream().findFirst()
                .map(ListingImage::getUrl)
                .orElse(null);

        java.time.LocalDate referenceDate = l.getFirstPublishedAt() != null
                ? l.getFirstPublishedAt().toLocalDate()
                : (l.getCreatedAt() != null ? l.getCreatedAt().toLocalDate() : java.time.LocalDate.now());
        int daysOnMarket = (int) java.time.temporal.ChronoUnit.DAYS.between(referenceDate, java.time.LocalDate.now());

        boolean backOnMarket = l.getBackToMarketAt() != null
                && l.getBackToMarketAt().isAfter(java.time.OffsetDateTime.now().minusDays(BACK_ON_MARKET_WINDOW_DAYS));

        java.time.OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                ? l.getLastUpdatedAt()
                : l.getUpdatedAt();

        boolean reraValid = l.getReraNumber() != null
                && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();

        return new ListingController.ListingResponse(
                l.getId(), l.getListingNumber(), l.getDisplayId(),
                l.getStatus(), l.getPropertyType(), l.getTitle(),
                l.getLocality(), l.getPrice(), l.getDescription(),
                l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                l.getLatitude(), l.getLongitude(),
                l.isAddressConfirmed(), l.getRejectionReason(),
                l.getCreatedAt(), l.getUpdatedAt(),
                imageCount, firstImageUrl, l.getVideoUrl(),
                l.getReraNumber(),
                l.getListingPurpose(),
                l.getCarpetArea(), l.getCarpetAreaUnit(),
                l.getFloorNumber(), l.getTotalFloors(),
                l.getFurnishingStatus(), l.getWashrooms(), l.getParkingCount(),
                l.getRoadFrontageFt(), l.getCommercialUsage(), l.getNumberOfUnits(),
                l.getMonthlyRent(), l.getSecurityDepositMonths(), l.getLockInMonths(),
                l.getSellerType(),
                daysOnMarket, backOnMarket, lastUpdatedAt, l.getFirstPublishedAt(),
                l.getPossessionStatus(), l.getExpectedPossessionDate(),
                l.getApprovalsDeclared(), reraValid);
    }

    // ===== DTOs =====

    public record RejectRequest(String rejectionReason) {}
}
