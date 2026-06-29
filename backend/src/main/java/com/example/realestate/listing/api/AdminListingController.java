package com.example.realestate.listing.api;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
    private final ObjectMapper objectMapper;

    public AdminListingController(ListingWorkflowService listingWorkflowService,
                                  ListingResponseMapper listingResponseMapper,
                                  AdminAuditService adminAuditService,
                                  ObjectMapper objectMapper) {
        this.listingWorkflowService = listingWorkflowService;
        this.listingResponseMapper = listingResponseMapper;
        this.adminAuditService = adminAuditService;
        this.objectMapper = objectMapper;
    }

    @PreAuthorize("#caller.isAdmin()")
    @PostMapping("/{id}/approve")
    public ResponseEntity<?> approve(CallerInfo caller, @PathVariable UUID id) {
        try {
            Listing approved = listingWorkflowService.approveListing(id, caller.userId());
            log.info("POST /api/admin/listings/{}/approve -> 200 status=LIVE", id);
            adminAuditService.record(caller.userId(), "listing_approved", "listing", id, null,
                    toJson(Map.of("status", "LIVE")));
            return ResponseEntity.ok(listingResponseMapper.toResponse(approved));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/restore")
    public ResponseEntity<?> restore(CallerInfo caller, @PathVariable UUID id) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        try {
            Listing restored = listingWorkflowService.restoreListing(id, caller.userId());
            log.info("POST /api/admin/listings/{}/restore -> 200 status=DRAFT adminId={}", id, caller.userId());
            adminAuditService.record(caller.userId(), "listing_restored", "listing", id, null,
                    toJson(Map.of("status", "DRAFT")));
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
                    toJson(Map.of("status", "REJECTED", "reason", req.rejectionReason())));
            return ResponseEntity.ok(listingResponseMapper.toResponse(rejected));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/return-for-edits")
    public ResponseEntity<?> returnForEdits(CallerInfo caller,
                                            @PathVariable UUID id,
                                            @RequestBody ReturnForEditsRequest req) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        if (req.note() == null || req.note().isBlank()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("error", "Return-for-edits note is required",
                                 "code", "RETURN_NOTE_REQUIRED"));
        }

        try {
            Listing returned = listingWorkflowService.returnForEdits(id, caller.userId(), req.note());
            log.info("POST /api/admin/listings/{}/return-for-edits -> 200 status=DRAFT", id);
            adminAuditService.record(caller.userId(), "listing_returned_for_edits", "listing", id, null,
                    toJson(Map.of("status", "DRAFT", "note", req.note())));
            return ResponseEntity.ok(listingResponseMapper.toResponse(returned));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/claim-scraped")
    public ResponseEntity<?> claimScraped(CallerInfo caller,
                                          @PathVariable UUID id,
                                          @RequestBody ClaimScrapedRequest req) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        if (req.ownerId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ownerId is required"));
        }

        try {
            Listing claimed = listingWorkflowService.claimScrapedListing(id, req.ownerId(), caller.userId());
            log.info("POST /api/admin/listings/{}/claim-scraped -> 200 status=DRAFT ownerId={}", id, req.ownerId());
            adminAuditService.record(caller.userId(), "listing_claimed_scraped", "listing", id, null,
                    toJson(Map.of("status", "DRAFT", "ownerId", req.ownerId().toString())));
            return ResponseEntity.ok(listingResponseMapper.toResponse(claimed));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/approve-scraped")
    public ResponseEntity<?> approveScraped(CallerInfo caller, @PathVariable UUID id) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        try {
            Listing approved = listingWorkflowService.approveScrapedListing(id, caller.userId());
            log.info("POST /api/admin/listings/{}/approve-scraped -> 200 status=LIVE", id);
            adminAuditService.record(caller.userId(), "listing_approved_scraped", "listing", id, null,
                    toJson(Map.of("status", "LIVE")));
            return ResponseEntity.ok(listingResponseMapper.toResponse(approved));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/restore-rejected")
    public ResponseEntity<?> restoreRejected(CallerInfo caller,
                                             @PathVariable UUID id,
                                             @RequestBody RestoreRejectedRequest req) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        if (req.moderationNote() == null || req.moderationNote().isBlank()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("error", "Moderation note is required",
                                 "code", "MODERATION_NOTE_REQUIRED"));
        }

        try {
            Listing restored = listingWorkflowService.restoreRejectedListing(id, caller.userId(), req.moderationNote());
            log.info("POST /api/admin/listings/{}/restore-rejected -> 200 status=LIVE", id);
            adminAuditService.record(caller.userId(), "listing_restored_rejected", "listing", id, null,
                    toJson(Map.of("status", "LIVE", "note", req.moderationNote())));
            return ResponseEntity.ok(listingResponseMapper.toResponse(restored));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/archive")
    public ResponseEntity<?> archive(CallerInfo caller,
                                     @PathVariable UUID id,
                                     @RequestBody(required = false) ArchiveRequest req) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        String reasonNote = req != null ? req.reasonNote() : null;
        try {
            Listing archived = listingWorkflowService.adminArchiveListing(id, caller.userId(), reasonNote);
            log.info("POST /api/admin/listings/{}/archive -> 200 status=ARCHIVED", id);
            adminAuditService.record(caller.userId(), "listing_archived", "listing", id, null,
                    toJson(Map.of("status", "ARCHIVED")));
            return ResponseEntity.ok(listingResponseMapper.toResponse(archived));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
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
                        toJson(Map.of("status", "ARCHIVED")));
            }
            return ResponseEntity.noContent().build();
        } catch (ListingNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ===== Response helpers =====

    private String toJson(Map<String, String> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            // Map<String, String> serialization cannot fail in practice; rethrow to surface bugs early.
            throw new RuntimeException("Failed to serialize audit JSON", e);
        }
    }

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    // ===== DTOs =====

    public record RejectRequest(String rejectionReason) {}

    public record ReturnForEditsRequest(String note) {}

    public record ClaimScrapedRequest(UUID ownerId) {}

    public record RestoreRejectedRequest(String moderationNote) {}

    public record ArchiveRequest(String reasonNote) {}
}
