package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only endpoints for reviewing proximity duplicate candidate pairs.
 * All endpoints require ADMIN role (verified via user_roles table lookup).
 *
 * <p>Base path: {@code /api/admin/duplicates}
 */
@RestController
@RequestMapping("/api/admin/duplicates")
public class AdminDuplicateController {

    private static final Logger log = LoggerFactory.getLogger(AdminDuplicateController.class);

    private final DuplicateCandidateService duplicateCandidateService;
    private final ListingService listingService;

    public AdminDuplicateController(DuplicateCandidateService duplicateCandidateService,
                                    ListingService listingService) {
        this.duplicateCandidateService = duplicateCandidateService;
        this.listingService = listingService;
    }

    // ===== Endpoints =====

    /**
     * GET /api/admin/duplicates?page=0&size=20
     * Returns a paginated list of PENDING duplicate candidates ordered by similarity score DESC.
     */
    @GetMapping
    public ResponseEntity<?> list(JwtAuthenticationToken auth,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        Page<DuplicateCandidate> result = duplicateCandidateService.getPage(page, size);
        Page<DuplicateCandidateResponse> response = result.map(DuplicateCandidateResponse::from);
        log.info("GET /api/admin/duplicates page={} size={} -> {} results", page, size,
                result.getTotalElements());
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/admin/duplicates/{id}/confirm
     * Confirms a duplicate pair: archives the newer listing, sets candidate to CONFIRMED.
     */
    @PostMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        duplicateCandidateService.confirm(id, adminId);
        log.info("POST /api/admin/duplicates/{}/confirm -> 200 adminId={}", id, adminId);
        return ResponseEntity.ok(Map.of("message", "Duplicate confirmed"));
    }

    /**
     * POST /api/admin/duplicates/{id}/dismiss
     * Dismisses a duplicate candidate: pair is not a duplicate.
     */
    @PostMapping("/{id}/dismiss")
    public ResponseEntity<?> dismiss(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        duplicateCandidateService.dismiss(id, adminId);
        log.info("POST /api/admin/duplicates/{}/dismiss -> 200 adminId={}", id, adminId);
        return ResponseEntity.ok(Map.of("message", "Duplicate dismissed"));
    }

    /**
     * POST /api/admin/duplicates/{id}/undo
     * Reverts a CONFIRMED or DISMISSED review back to PENDING.
     */
    @PostMapping("/{id}/undo")
    public ResponseEntity<?> undo(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();

        duplicateCandidateService.undo(id, adminId);
        log.info("POST /api/admin/duplicates/{}/undo -> 200 adminId={}", id, adminId);
        return ResponseEntity.ok(Map.of("message", "Duplicate review undone"));
    }

    // ===== Exception handlers =====

    @ExceptionHandler(DuplicateCandidateService.DuplicateCandidateNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(
            DuplicateCandidateService.DuplicateCandidateNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", ex.getMessage()));
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

    // ===== DTO =====

    public record DuplicateCandidateResponse(
            UUID id,
            UUID listingIdA,
            UUID listingIdB,
            BigDecimal similarityScore,
            BigDecimal distanceMeters,
            DuplicateCandidateStatus status,
            UUID reviewedBy,
            Instant reviewedAt,
            Instant createdAt
    ) {
        static DuplicateCandidateResponse from(DuplicateCandidate c) {
            return new DuplicateCandidateResponse(
                    c.getId(),
                    c.getListingIdA(),
                    c.getListingIdB(),
                    c.getSimilarityScore(),
                    c.getDistanceMeters(),
                    c.getStatus(),
                    c.getReviewedBy(),
                    c.getReviewedAt(),
                    c.getCreatedAt()
            );
        }
    }
}
