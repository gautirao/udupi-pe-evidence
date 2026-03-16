package com.example.realestate.listing;

import com.example.realestate.security.UserRoleService;
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

    private final ListingService listingService;
    private final ListingResponseMapper listingResponseMapper;
    private final AdminAuditService adminAuditService;
    private final UserRoleService userRoleService;

    public AdminListingController(ListingService listingService,
                                  ListingResponseMapper listingResponseMapper,
                                  AdminAuditService adminAuditService,
                                  UserRoleService userRoleService) {
        this.listingService = listingService;
        this.listingResponseMapper = listingResponseMapper;
        this.adminAuditService = adminAuditService;
        this.userRoleService = userRoleService;
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
            return ResponseEntity.ok(listingResponseMapper.toResponse(approved));
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
            return ResponseEntity.ok(listingResponseMapper.toResponse(restored));
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
            return ResponseEntity.ok(listingResponseMapper.toResponse(rejected));
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
        String role = userRoleService.getUserRole(userId).orElse(null);
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

    // ===== DTOs =====

    public record RejectRequest(String rejectionReason) {}
}
