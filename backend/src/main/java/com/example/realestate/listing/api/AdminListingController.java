package com.example.realestate.listing.api;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
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
    private final ListingRepository listingRepository;

    public AdminListingController(ListingWorkflowService listingWorkflowService,
                                  ListingResponseMapper listingResponseMapper,
                                  AdminAuditService adminAuditService,
                                  ObjectMapper objectMapper,
                                  ListingRepository listingRepository) {
        this.listingWorkflowService = listingWorkflowService;
        this.listingResponseMapper = listingResponseMapper;
        this.adminAuditService = adminAuditService;
        this.objectMapper = objectMapper;
        this.listingRepository = listingRepository;
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

    /**
     * Admin-only visibility into LIVE listings that have not been confirmed recently
     * (#1794 Phase 1 — read-only signal; no automation acts on this list).
     *
     * <p>A listing is "stale" when {@code last_confirmed_at} is NULL (never confirmed since
     * the column was introduced) or older than {@code days} days ago. The boundary is strictly
     * {@code <} the threshold — a listing confirmed exactly {@code days} days ago is NOT stale.
     */
    @PreAuthorize("#caller.isAdmin()")
    @GetMapping("/stale")
    public ResponseEntity<Page<ListingResponse>> stale(
            CallerInfo caller,
            @RequestParam(name = "days", required = false, defaultValue = "14") int days,
            @PageableDefault(size = 20) Pageable pageable) {
        int effectiveDays = Math.max(1, days);
        OffsetDateTime threshold = OffsetDateTime.now().minusDays(effectiveDays);

        // The staleness worklist has a fixed oldest-confirmed-first ordering baked into the
        // native @Query's own ORDER BY; strip any caller-supplied Sort (@PageableDefault only
        // sets the default, it does not cap what a ?sort= param can override) so it can never
        // reach the native query and retrigger the Spring-Data native-query + Sort conflict.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Page<Listing> staleListings = listingRepository.findLiveListingsNotConfirmedSince(threshold, unsorted);

        log.debug("GET /api/admin/listings/stale?days={} -> {} results adminId={}",
                effectiveDays, staleListings.getTotalElements(), caller.userId());

        List<ListingResponse> content = listingResponseMapper.toResponseList(staleListings.getContent());
        Page<ListingResponse> response = new PageImpl<>(content, staleListings.getPageable(), staleListings.getTotalElements());
        return ResponseEntity.ok(response);
    }

    /**
     * Admin-only pending-review queue (#2242).
     *
     * <p>Closes an architectural inconsistency: the admin PendingListings UI previously read
     * this queue directly from Supabase in the browser while every mutation on it (approve,
     * reject, return-for-edits) already went through this controller. This endpoint gives the
     * read path the same backend-owned, authz-gated route as the writes.
     *
     * <p>The {@code PENDING_REVIEW} status filter is hardcoded server-side (not a request
     * parameter) so this endpoint cannot be turned into a general lifecycle-state browser by a
     * caller-supplied {@code status}. Follows the {@link #stale} precedent: {@code Page}, not an
     * unbounded {@code List}, and any caller-supplied {@code Sort} is stripped before reaching
     * the native query to avoid the Spring-Data native-query + Sort conflict.
     */
    @PreAuthorize("#caller.isAdmin()")
    @GetMapping("/pending")
    public ResponseEntity<Page<ListingResponse>> pending(
            CallerInfo caller,
            @PageableDefault(size = 20) Pageable pageable) {
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        Page<Listing> pendingListings = listingRepository.findPendingReviewListings(unsorted);

        log.debug("GET /api/admin/listings/pending -> {} results adminId={}",
                pendingListings.getTotalElements(), caller.userId());

        List<ListingResponse> content = listingResponseMapper.toResponseList(pendingListings.getContent());
        Page<ListingResponse> response = new PageImpl<>(content, pendingListings.getPageable(), pendingListings.getTotalElements());
        return ResponseEntity.ok(response);
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
