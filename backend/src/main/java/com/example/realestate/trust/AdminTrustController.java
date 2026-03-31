package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Admin-only endpoints for the trust verification ops review queue.
 *
 * <ul>
 *   <li>GET  /api/admin/trust/pending-reviews — list all PENDING badge submissions</li>
 *   <li>POST /api/admin/trust/{dimensionId}/approve — approve (PENDING → EARNED)</li>
 *   <li>POST /api/admin/trust/{dimensionId}/reject  — reject  (PENDING → AVAILABLE)</li>
 *   <li>GET  /api/admin/trust/identity/pending — list pending identity evidence</li>
 *   <li>POST /api/admin/trust/identity/{evidenceId}/approve — approve identity evidence</li>
 *   <li>POST /api/admin/trust/identity/{evidenceId}/reject  — reject identity evidence</li>
 * </ul>
 *
 * All endpoints require admin role. Non-admin callers receive 403.
 */
@RestController
@RequestMapping("/api/admin/trust")
public class AdminTrustController {

    private static final Logger log = LoggerFactory.getLogger(AdminTrustController.class);

    /** TTL for signed URLs returned to the admin review UI (15 minutes). */
    private static final int SIGNED_URL_TTL_SECONDS = 900;

    private final ListingVerificationDimensionRepository dimensionRepository;
    private final ListingRepository listingRepository;
    private final BadgeService badgeService;
    private final IdentityEvidenceRepository identityEvidenceRepository;
    private final AdminAuditService adminAuditService;
    private final SupabaseStorageService supabaseStorageService;

    public AdminTrustController(
            ListingVerificationDimensionRepository dimensionRepository,
            ListingRepository listingRepository,
            BadgeService badgeService,
            IdentityEvidenceRepository identityEvidenceRepository,
            AdminAuditService adminAuditService,
            SupabaseStorageService supabaseStorageService) {
        this.dimensionRepository = dimensionRepository;
        this.listingRepository = listingRepository;
        this.badgeService = badgeService;
        this.identityEvidenceRepository = identityEvidenceRepository;
        this.adminAuditService = adminAuditService;
        this.supabaseStorageService = supabaseStorageService;
    }

    /**
     * Lists all badge dimensions in PENDING state across all listings,
     * ordered by updated_at ascending (oldest first).
     *
     * @return 200 with JSON array of pending review items; 403 if caller is not admin
     */
    @GetMapping("/pending-reviews")
    public ResponseEntity<?> getPendingReviews(CallerInfo caller) {
        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        List<ListingVerificationDimension> pending =
                dimensionRepository.findAllByBadgeStateOrderByUpdatedAtAsc("PENDING");

        // Bulk-fetch listings to avoid N+1
        Set<UUID> listingIds = pending.stream()
                .map(ListingVerificationDimension::getListingId)
                .collect(Collectors.toSet());
        Map<UUID, Listing> listingMap = listingRepository.findAllById(listingIds)
                .stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));

        List<Map<String, Object>> items = pending.stream().map(d -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("dimensionId", d.getId());
            item.put("listingId", d.getListingId());
            item.put("dimensionType", d.getDimensionType());
            item.put("badgeState", d.getBadgeState());
            item.put("submittedAt", d.getUpdatedAt());
            item.put("verificationAssetUrl", d.getVerificationAssetUrl());
            Listing listing = listingMap.get(d.getListingId());
            if (listing != null) {
                item.put("listingTitle", listing.getTitle());
                item.put("listingLocality", listing.getLocality());
                item.put("listingSellerType", listing.getSellerType());
            }
            return item;
        }).toList();

        log.debug("GET /api/admin/trust/pending-reviews adminId={} count={}", caller.userId(), items.size());
        return ResponseEntity.ok(items);
    }

    /**
     * Approves a pending badge submission: PENDING → EARNED.
     *
     * @return 200 on success; 403 if not admin; 404 if dimension not found; 409 if not PENDING
     */
    @PostMapping("/{dimensionId}/approve")
    public ResponseEntity<?> approveBadge(
            CallerInfo caller,
            @PathVariable UUID dimensionId) {

        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        ListingVerificationDimension dimension = dimensionRepository.findById(dimensionId).orElse(null);
        if (dimension == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Dimension not found"));
        }
        if (!"PENDING".equals(dimension.getBadgeState())) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "Badge is not in PENDING state — current state: " + dimension.getBadgeState()));
        }

        badgeService.grantBadge(dimension.getListingId(), dimension.getDimensionType(),
                caller.userId(), "Admin approved verification submission");

        log.info("POST /api/admin/trust/{}/approve -> 200 adminId={} dimension={} listingId={}",
                dimensionId, caller.userId(), dimension.getDimensionType(), dimension.getListingId());
        return ResponseEntity.ok(Map.of("message", "Badge approved"));
    }

    /**
     * Rejects a pending badge submission: PENDING → AVAILABLE.
     *
     * <p>Accepts an optional JSON body {@code {"reason": "..."}} to record a human-readable
     * rejection reason. The body may be absent entirely, or the {@code reason} key may be omitted
     * or null — in all cases the rejection proceeds without a reason.
     *
     * @return 200 on success; 403 if not admin; 404 if dimension not found; 409 if not PENDING
     */
    @PostMapping("/{dimensionId}/reject")
    public ResponseEntity<?> rejectBadge(
            CallerInfo caller,
            @PathVariable UUID dimensionId,
            @RequestBody(required = false) Map<String, String> body) {

        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        ListingVerificationDimension dimension = dimensionRepository.findById(dimensionId).orElse(null);
        if (dimension == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Dimension not found"));
        }
        if (!"PENDING".equals(dimension.getBadgeState())) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "Badge is not in PENDING state — current state: " + dimension.getBadgeState()));
        }

        String reason = (body != null) ? body.get("reason") : null;

        // Delegate to BadgeService — handles state transition + audit record
        badgeService.rejectBadgeSubmission(dimensionId, caller.userId(), reason);

        log.info("POST /api/admin/trust/{}/reject -> 200 adminId={} dimension={} listingId={}",
                dimensionId, caller.userId(), dimension.getDimensionType(), dimension.getListingId());
        return ResponseEntity.ok(Map.of("message", "Badge submission rejected"));
    }

    // -------------------------------------------------------------------------
    // Identity evidence review endpoints
    // -------------------------------------------------------------------------

    /**
     * Returns a paginated list of pending identity evidence for admin review.
     *
     * @return 200 with paginated list; 403 if caller is not admin
     */
    @GetMapping("/identity/pending")
    public ResponseEntity<?> getPendingIdentityEvidence(
            CallerInfo caller,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        Page<IdentityEvidence> pendingPage = identityEvidenceRepository.findByReviewState(
                "PENDING",
                PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").ascending()));

        // Bulk-fetch listings to avoid N+1
        Set<UUID> listingIds = pendingPage.getContent().stream()
                .map(IdentityEvidence::getListingId)
                .collect(Collectors.toSet());
        Map<UUID, Listing> listingMap = listingRepository.findAllById(listingIds)
                .stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));

        List<Map<String, Object>> items = pendingPage.getContent().stream().map(e -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("evidenceId", e.getId());
            item.put("profileId", e.getProfileId());
            item.put("listingId", e.getListingId());
            item.put("legalName", e.getLegalName());
            item.put("phoneNumber", e.getPhoneNumber());
            item.put("documentType", e.getDocumentType());
            // Return a time-limited signed URL instead of the raw storage path.
            // Identity documents are sensitive PII and must not have public URLs.
            String docPath = e.getDocumentUrl();
            String signedUrl = null;
            if (docPath != null && !docPath.startsWith("storage-disabled://")) {
                signedUrl = supabaseStorageService.createSignedUrl(
                        "identity-evidence", docPath, SIGNED_URL_TTL_SECONDS)
                        .orElse(null);
            }
            item.put("documentUrl", signedUrl);
            item.put("submittedAt", e.getCreatedAt());
            Listing listing = listingMap.get(e.getListingId());
            if (listing != null) {
                item.put("listingTitle", listing.getTitle());
                item.put("listingLocality", listing.getLocality());
            }
            return item;
        }).toList();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("items", items);
        response.put("page", pendingPage.getNumber());
        response.put("totalPages", pendingPage.getTotalPages());
        response.put("totalElements", pendingPage.getTotalElements());

        log.debug("GET /api/admin/trust/identity/pending adminId={} count={}",
                caller.userId(), items.size());
        return ResponseEntity.ok(response);
    }

    /**
     * Approves a pending identity evidence submission.
     * Sets evidence to APPROVED, then calls badgeService.grantIdentityBadge
     * (which triggers auto-grant Authority for owners via #693).
     *
     * @return 200 on success; 403 if not admin; 404 if evidence not found; 409 if not PENDING
     */
    @Transactional
    @PostMapping("/identity/{evidenceId}/approve")
    public ResponseEntity<?> approveIdentityEvidence(
            CallerInfo caller,
            @PathVariable UUID evidenceId) {

        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        IdentityEvidence evidence = identityEvidenceRepository.findById(evidenceId).orElse(null);
        if (evidence == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Identity evidence not found"));
        }
        if (!"PENDING".equals(evidence.getReviewState())) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "Evidence is not in PENDING state — current state: " + evidence.getReviewState()));
        }

        OffsetDateTime now = OffsetDateTime.now();

        // 1. Update evidence row
        evidence.setReviewState("APPROVED");
        evidence.setReviewedBy(caller.userId());
        evidence.setReviewedAt(now);
        evidence.setUpdatedAt(now);
        identityEvidenceRepository.save(evidence);

        // 2. Grant identity badge (this triggers auto-grant Authority for owners via #693)
        try {
            badgeService.grantIdentityBadge(evidence.getListingId(), caller.userId());
        } catch (IdentityAlreadyVerifiedException e) {
            // Identity already earned — evidence is still marked approved, no conflict
            log.debug("Identity badge already earned for listingId={}, evidence approved anyway",
                    evidence.getListingId());
        }

        // 3. Audit log
        adminAuditService.record(
                caller.userId(),
                "IDENTITY_EVIDENCE_APPROVED",
                "identity_evidence",
                evidenceId,
                null,
                null);

        log.info("POST /api/admin/trust/identity/{}/approve -> 200 adminId={} listingId={}",
                evidenceId, caller.userId(), evidence.getListingId());
        return ResponseEntity.ok(Map.of("message", "Identity evidence approved"));
    }

    /**
     * Rejects a pending identity evidence submission.
     * Sets evidence to REJECTED, resets IDENTITY badge to AVAILABLE.
     *
     * @return 200 on success; 403 if not admin; 404 if evidence not found; 409 if not PENDING
     */
    @Transactional
    @PostMapping("/identity/{evidenceId}/reject")
    public ResponseEntity<?> rejectIdentityEvidence(
            CallerInfo caller,
            @PathVariable UUID evidenceId,
            @RequestBody Map<String, String> body) {

        if (!caller.isAdmin()) {
            return ResponseEntity.status(403).body(Map.of("error", "Admin access required"));
        }

        IdentityEvidence evidence = identityEvidenceRepository.findById(evidenceId).orElse(null);
        if (evidence == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Identity evidence not found"));
        }
        if (!"PENDING".equals(evidence.getReviewState())) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "Evidence is not in PENDING state — current state: " + evidence.getReviewState()));
        }

        String reason = (body != null) ? body.get("reason") : null;
        if (reason == null || reason.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "Rejection reason is required"));
        }

        OffsetDateTime now = OffsetDateTime.now();

        // 1. Update evidence row
        evidence.setReviewState("REJECTED");
        evidence.setRejectionReason(reason.trim());
        evidence.setReviewedBy(caller.userId());
        evidence.setReviewedAt(now);
        evidence.setUpdatedAt(now);
        identityEvidenceRepository.save(evidence);

        // 2. Reset IDENTITY badge to AVAILABLE
        dimensionRepository.findByListingIdAndDimensionType(evidence.getListingId(), "IDENTITY")
                .ifPresent(dim -> {
                    if ("PENDING".equals(dim.getBadgeState())) {
                        dim.setBadgeState("AVAILABLE");
                        dim.setRejectionReason(reason.trim());
                        dim.setUpdatedAt(now);
                        dimensionRepository.save(dim);
                    }
                });

        // 3. Audit log
        adminAuditService.record(
                caller.userId(),
                "IDENTITY_EVIDENCE_REJECTED",
                "identity_evidence",
                evidenceId,
                null,
                null);

        log.info("POST /api/admin/trust/identity/{}/reject -> 200 adminId={} listingId={}",
                evidenceId, caller.userId(), evidence.getListingId());
        return ResponseEntity.ok(Map.of("message", "Identity evidence rejected"));
    }
}
