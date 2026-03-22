package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Exposes two read-only trust endpoints on the /api/listings/{id}/ sub-path.
 *
 * <ul>
 *   <li>GET /api/listings/{id}/trust — PUBLIC, unauthenticated</li>
 *   <li>GET /api/listings/{id}/trust-progress — AUTHENTICATED, listing owner only</li>
 * </ul>
 *
 * <p>Neither endpoint ever exposes trustTier or rankingScore. Those fields are
 * internal to the trust pipeline and must not leak to API consumers.
 */
@RestController
@RequestMapping("/api/listings")
public class TrustController {

    private static final Logger log = LoggerFactory.getLogger(TrustController.class);

    /** Canonical dimension order for owner-type listings (sellerType = "owner"). */
    private static final List<String> OWNER_DIMENSIONS = List.of("IDENTITY", "LOCATION", "PHOTOS");

    /** Canonical dimension order for broker-type listings (sellerType = "broker"). */
    private static final List<String> BROKER_DIMENSIONS = List.of("IDENTITY", "LOCATION", "PHOTOS", "AUTHORITY");

    private static final String AUTHORITY_TYPE = "AUTHORITY";

    private final BadgeService badgeService;
    private final ListingRepository listingRepository;

    public TrustController(BadgeService badgeService, ListingRepository listingRepository) {
        this.badgeService = badgeService;
        this.listingRepository = listingRepository;
    }

    // -------------------------------------------------------------------------
    // GET /api/listings/{id}/trust — PUBLIC, no CallerInfo
    // -------------------------------------------------------------------------

    /**
     * Returns only the EARNED badges for the given listing.
     * No authentication required — this path is permitted in JwtConfig.
     * Returns 404 if the listing does not exist.
     */
    @GetMapping("/{id}/trust")
    public ResponseEntity<?> getPublicTrust(@PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        List<ListingVerificationDimension> rows = badgeService.getBadges(id);
        List<EarnedBadgeDto> earned = rows.stream()
                .filter(r -> "EARNED".equals(r.getBadgeState()))
                .map(r -> new EarnedBadgeDto(r.getDimensionType(), r.getGrantedAt()))
                .collect(Collectors.toList());

        log.debug("GET /api/listings/{}/trust -> {} earned badges", id, earned.size());
        return ResponseEntity.ok(new TrustPublicResponse(earned));
    }

    // -------------------------------------------------------------------------
    // GET /api/listings/{id}/trust-progress — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Returns the full badge progress for the listing owner.
     * Merges the canonical dimension list with DB rows; dimensions with no DB row
     * are surfaced as AVAILABLE.
     * Returns 404 if listing not found, 403 if caller is not the owner or an admin.
     */
    @GetMapping("/{id}/trust-progress")
    public ResponseEntity<?> getTrustProgress(CallerInfo caller, @PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to trust-progress listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        List<ListingVerificationDimension> dbRows = badgeService.getBadges(id);
        Map<String, ListingVerificationDimension> byType = dbRows.stream()
                .collect(Collectors.toMap(
                        ListingVerificationDimension::getDimensionType,
                        Function.identity()));

        boolean isOwnerListing = "owner".equals(listing.getSellerType());
        List<String> canonicalTypes = isOwnerListing ? OWNER_DIMENSIONS : BROKER_DIMENSIONS;

        List<TrustProgressBadgeDto> badges = new ArrayList<>();
        String cta = null;

        for (String type : canonicalTypes) {
            ListingVerificationDimension row = byType.get(type);
            String badgeState = (row != null) ? row.getBadgeState() : "AVAILABLE";
            OffsetDateTime grantedAt = (row != null) ? row.getGrantedAt() : null;
            boolean needsCta = (cta == null)
                    && ("AVAILABLE".equals(badgeState) || "PENDING".equals(badgeState));
            if (needsCta) {
                cta = type;
            }
            badges.add(new TrustProgressBadgeDto(type, badgeState, grantedAt, null));
        }

        // For owner listings, AUTHORITY is appended as auto-granted (outside the canonical loop).
        if (isOwnerListing) {
            ListingVerificationDimension authorityRow = byType.get(AUTHORITY_TYPE);
            String authorityState = (authorityRow != null) ? authorityRow.getBadgeState() : "AVAILABLE";
            OffsetDateTime authorityGrantedAt = (authorityRow != null) ? authorityRow.getGrantedAt() : null;
            boolean needsCta = (cta == null)
                    && ("AVAILABLE".equals(authorityState) || "PENDING".equals(authorityState));
            if (needsCta) {
                cta = AUTHORITY_TYPE;
            }
            badges.add(new TrustProgressBadgeDto(AUTHORITY_TYPE, authorityState, authorityGrantedAt, true));
        }

        log.debug("GET /api/listings/{}/trust-progress callerId={} badges={} cta={}",
                id, caller.userId(), badges.size(), cta);
        return ResponseEntity.ok(new TrustProgressResponse(badges, cta));
    }
}
