package com.example.realestate.listing.api;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

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

    private final ListingWorkflowService listingWorkflowService;
    private final ListingResponseMapper listingResponseMapper;
    private final AdminAuditService adminAuditService;

    public AdminListingController(ListingWorkflowService listingWorkflowService,
                                  ListingResponseMapper listingResponseMapper,
                                  AdminAuditService adminAuditService) {
        this.listingWorkflowService = listingWorkflowService;
        this.listingResponseMapper = listingResponseMapper;
        this.adminAuditService = adminAuditService;
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(CallerInfo caller, @PathVariable UUID id) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        try {
            Listing approved = listingWorkflowService.approveListing(id, caller.userId());
            log.info("POST /api/admin/listings/{}/approve -> 200 status=LIVE", id);
            adminAuditService.record(caller.userId(), "listing_approved", "listing", id, null,
                    "{\"status\":\"LIVE\"}");
            return ResponseEntity.ok(listingResponseMapper.toResponse(approved));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<?> restore(CallerInfo caller, @PathVariable UUID id) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        try {
            Listing restored = listingWorkflowService.restoreListing(id, caller.userId());
            log.info("POST /api/admin/listings/{}/restore -> 200 status=DRAFT adminId={}", id, caller.userId());
            adminAuditService.record(caller.userId(), "listing_restored", "listing", id, null,
                    "{\"status\":\"DRAFT\"}");
            return ResponseEntity.ok(listingResponseMapper.toResponse(restored));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingNotArchivedException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<?> reject(CallerInfo caller,
                                    @PathVariable UUID id,
                                    @RequestBody RejectRequest req) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        if (req.rejectionReason() == null || req.rejectionReason().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Rejection reason is required"));
        }

        try {
            Listing rejected = listingWorkflowService.rejectListing(id, caller.userId(), req.rejectionReason());
            log.info("POST /api/admin/listings/{}/reject -> 200 status=REJECTED", id);
            adminAuditService.record(caller.userId(), "listing_rejected", "listing", id, null,
                    "{\"status\":\"REJECTED\",\"reason\":\"" + req.rejectionReason().replace("\"", "\\\"") + "\"}");
            return ResponseEntity.ok(listingResponseMapper.toResponse(rejected));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> forceDelete(CallerInfo caller, @PathVariable UUID id) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        try {
            boolean archived = listingWorkflowService.adminForceDelete(id, caller.userId());
            log.info("DELETE /api/admin/listings/{} -> 204 adminId={} archived={}", id, caller.userId(), archived);
            if (archived) {
                adminAuditService.record(caller.userId(), "listing_force_deleted", "listing", id, null,
                        "{\"status\":\"ARCHIVED\"}");
            }
            return ResponseEntity.noContent().build();
        } catch (ListingNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    // ===== DTOs =====

    public record RejectRequest(String rejectionReason) {}
}
