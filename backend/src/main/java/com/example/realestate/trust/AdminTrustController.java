package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
 * </ul>
 *
 * All endpoints require admin role. Non-admin callers receive 403.
 */
@RestController
@RequestMapping("/api/admin/trust")
public class AdminTrustController {

    private static final Logger log = LoggerFactory.getLogger(AdminTrustController.class);

    private final ListingVerificationDimensionRepository dimensionRepository;
    private final ListingRepository listingRepository;
    private final BadgeService badgeService;

    public AdminTrustController(
            ListingVerificationDimensionRepository dimensionRepository,
            ListingRepository listingRepository,
            BadgeService badgeService) {
        this.dimensionRepository = dimensionRepository;
        this.listingRepository = listingRepository;
        this.badgeService = badgeService;
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
}
