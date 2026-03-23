package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.profile.Profile;
import com.example.realestate.profile.ProfileRepository;
import com.example.realestate.security.CallerInfo;
import com.example.realestate.trust.otp.OtpDeliveryException;
import com.example.realestate.trust.otp.OtpService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Trust endpoints on the /api/listings/{id}/ sub-path.
 *
 * <ul>
 *   <li>GET /api/listings/{id}/trust — PUBLIC, unauthenticated</li>
 *   <li>GET /api/listings/{id}/trust-progress — AUTHENTICATED, listing owner only</li>
 *   <li>POST /api/listings/{id}/trust/photos/verify — AUTHENTICATED, owner only (multipart)</li>
 *   <li>POST /api/listings/{id}/trust/location/verify — AUTHENTICATED, owner only (JSON)</li>
 * </ul>
 *
 * <p>Neither read endpoint ever exposes trustTier or rankingScore. Those fields are
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

    /** Maximum Haversine distance in meters for a location verification to be accepted. */
    private static final double LOCATION_VERIFY_THRESHOLD_METERS = 200.0;

    private final BadgeService badgeService;
    private final ListingRepository listingRepository;
    private final PhotoHashService photoHashService;
    private final ProfileRepository profileRepository;
    private final OtpService otpService;

    public TrustController(
            BadgeService badgeService,
            ListingRepository listingRepository,
            PhotoHashService photoHashService,
            ProfileRepository profileRepository,
            OtpService otpService) {
        this.badgeService = badgeService;
        this.listingRepository = listingRepository;
        this.photoHashService = photoHashService;
        this.profileRepository = profileRepository;
        this.otpService = otpService;
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

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/photos/verify — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Accepts a photo upload, runs pHash duplicate detection against the blocklist,
     * and if the photo passes, transitions the PHOTOS badge to PENDING for admin review.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — photo accepted; PHOTOS dimension set to PENDING</li>
     *   <li>400 — missing/invalid file (type, size, corrupt)</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — PHOTOS badge already PENDING or EARNED</li>
     *   <li>413 — file exceeds 5 MB limit</li>
     *   <li>422 — photo matches blocklist (stock/duplicate image detected)</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/photos/verify", consumes = "multipart/form-data")
    public ResponseEntity<?> submitPhotoVerification(
            CallerInfo caller,
            @PathVariable UUID id,
            @RequestPart("file") MultipartFile file) {

        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to photos/verify listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate file, compute pHash, check blocklist — all delegated to PhotoHashService
        PhotoVerifyResult verifyResult = photoHashService.verifyAndCheck(file);
        return switch (verifyResult) {
            case FILE_EMPTY, INVALID_IMAGE -> ResponseEntity.status(400).body(
                    Map.of("error", "Invalid or missing image file"));
            case FILE_TOO_LARGE -> ResponseEntity.status(413).body(
                    Map.of("error", "File size must not exceed 5 MB"));
            case BLOCKED -> {
                log.info("Photo blocked by pHash blocklist listingId={}", id);
                yield ResponseEntity.status(422).body(
                        Map.of("error", "This photo was flagged as a stock image. Please upload an original photo."));
            }
            case OK -> {
                try {
                    badgeService.submitPhotos(id, caller.userId());
                } catch (PhotoAlreadySubmittedException e) {
                    yield ResponseEntity.status(409).body(
                            Map.of("error", "Photo verification is already " + e.getCurrentState().toLowerCase()));
                }
                log.info("POST /api/listings/{}/trust/photos/verify -> 200 callerId={}", id, caller.userId());
                yield ResponseEntity.ok(Map.of("message", "Photo submitted for review"));
            }
        };
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/location/verify — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Accepts GPS coordinates from the caller, computes the Haversine distance to the
     * listing's stored location, and if within {@link #LOCATION_VERIFY_THRESHOLD_METERS}
     * transitions the LOCATION badge from AVAILABLE to EARNED.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — location verified; LOCATION badge EARNED. Body: {@code {message, distanceMeters}}</li>
     *   <li>400 — listing has no stored lat/lng to compare against</li>
     *   <li>400 — submitted latitude or longitude is null</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — LOCATION badge already EARNED</li>
     *   <li>422 — submitted coordinates are more than 200m from the listing location</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/location/verify", consumes = "application/json")
    public ResponseEntity<?> verifyLocation(
            CallerInfo caller,
            @PathVariable UUID id,
            @RequestBody LocationVerifyRequest request) {

        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to location/verify listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate submitted coordinates
        if (request.getLatitude() == null || request.getLongitude() == null) {
            return ResponseEntity.status(400).body(
                    Map.of("error", "latitude and longitude are required"));
        }

        // 3. Check listing has stored lat/lng
        if (listing.getLatitude() == null || listing.getLongitude() == null) {
            return ResponseEntity.status(400).body(
                    Map.of("error", "Listing has no stored location to compare against"));
        }

        // 4. Compute Haversine distance
        double distanceMeters = haversineMeters(
                listing.getLatitude(), listing.getLongitude(),
                request.getLatitude(), request.getLongitude());

        long distanceRounded = Math.round(distanceMeters);

        // 5. Check LOCATION badge already EARNED (before threshold check to surface 409 clearly)
        try {
            if (distanceMeters <= LOCATION_VERIFY_THRESHOLD_METERS) {
                // Within threshold — grant the badge
                badgeService.grantLocationBadge(
                        id, caller.userId(), distanceMeters,
                        request.getLatitude(), request.getLongitude());

                log.info("POST /api/listings/{}/trust/location/verify -> 200 callerId={} distanceMeters={}",
                        id, caller.userId(), distanceRounded);
                return ResponseEntity.ok(Map.of(
                        "message", "Location verified",
                        "distanceMeters", distanceRounded));
            } else {
                // Outside threshold
                log.info("POST /api/listings/{}/trust/location/verify -> 422 callerId={} distanceMeters={}",
                        id, caller.userId(), distanceRounded);
                return ResponseEntity.status(422).body(Map.of(
                        "error", "Location does not match. Measured distance: " + distanceRounded + "m"));
            }
        } catch (LocationAlreadyVerifiedException e) {
            return ResponseEntity.status(409).body(Map.of("error", "Location already verified"));
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/identity/request-otp — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Triggers an OTP send to the phone number stored on the caller's profile.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — OTP sent successfully</li>
     *   <li>400 — caller profile has no phone number</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — IDENTITY badge already EARNED</li>
     *   <li>503 — OTP delivery failed</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/identity/request-otp")
    public ResponseEntity<?> requestIdentityOtp(CallerInfo caller, @PathVariable UUID id) {
        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to identity/request-otp listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Resolve caller's profile and phone
        Profile profile = profileRepository.findByUserId(caller.userId()).orElse(null);
        String phone = (profile != null) ? profile.getPhone() : null;
        if (phone == null || phone.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "No phone number on profile"));
        }

        // 3. Check IDENTITY badge not already EARNED
        List<ListingVerificationDimension> badges = badgeService.getBadges(id);
        boolean alreadyEarned = badges.stream()
                .anyMatch(b -> "IDENTITY".equals(b.getDimensionType()) && "EARNED".equals(b.getBadgeState()));
        if (alreadyEarned) {
            return ResponseEntity.status(409).body(Map.of("error", "Identity already verified"));
        }

        // 4. Send OTP — phone is not echoed in the response
        try {
            otpService.sendOtp(phone);
        } catch (OtpDeliveryException e) {
            log.error("OTP delivery failed listingId={} callerId={}", id, caller.userId(), e);
            return ResponseEntity.status(503).body(Map.of("error", "OTP delivery failed"));
        }

        log.info("POST /api/listings/{}/trust/identity/request-otp -> 200 callerId={}", id, caller.userId());
        return ResponseEntity.ok(Map.of("message", "OTP sent"));
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/identity/verify-otp — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Verifies the OTP code submitted by the caller and, if valid, grants the IDENTITY badge.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — OTP verified; IDENTITY badge EARNED</li>
     *   <li>400 — invalid or expired OTP, or no phone on profile</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/identity/verify-otp", consumes = "application/json")
    public ResponseEntity<?> verifyIdentityOtp(
            CallerInfo caller,
            @PathVariable UUID id,
            @RequestBody OtpVerifyRequest request) {

        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to identity/verify-otp listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Resolve caller's profile and phone
        Profile profile = profileRepository.findByUserId(caller.userId()).orElse(null);
        String phone = (profile != null) ? profile.getPhone() : null;
        if (phone == null || phone.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "No phone number on profile"));
        }

        // 3. Verify OTP
        boolean valid = otpService.verifyOtp(phone, request.getCode());
        if (!valid) {
            return ResponseEntity.status(400).body(Map.of("error", "Invalid or expired OTP"));
        }

        // 4. Mark phone as verified on profile and grant badge — both in one transaction
        verifyAndGrantIdentity(profile, id, caller.userId());

        log.info("POST /api/listings/{}/trust/identity/verify-otp -> 200 callerId={}", id, caller.userId());
        return ResponseEntity.ok(Map.of("message", "Identity verified"));
    }

    // -------------------------------------------------------------------------
    // Private: transactional helpers
    // -------------------------------------------------------------------------

    /**
     * Atomically sets profile.phone_verified=true and grants the IDENTITY badge.
     * Both writes must succeed or both roll back.
     */
    @Transactional
    protected void verifyAndGrantIdentity(Profile profile, UUID listingId, UUID callerId) {
        profile.setPhoneVerified(true);
        profileRepository.save(profile);
        badgeService.grantIdentityBadge(listingId, callerId);
    }

    // -------------------------------------------------------------------------
    // Private: Haversine distance calculation
    // -------------------------------------------------------------------------

    /**
     * Computes the great-circle distance in meters between two geographic coordinates
     * using the Haversine formula. Earth radius assumed to be 6 371 000 m.
     *
     * @param listingLat  stored listing latitude in decimal degrees
     * @param listingLon  stored listing longitude in decimal degrees
     * @param submittedLat submitted GPS latitude in decimal degrees
     * @param submittedLon submitted GPS longitude in decimal degrees
     * @return distance in meters (always &ge; 0)
     */
    static double haversineMeters(
            double listingLat, double listingLon,
            double submittedLat, double submittedLon) {

        double lat1 = Math.toRadians(listingLat);
        double lat2 = Math.toRadians(submittedLat);
        double deltaLat = Math.toRadians(submittedLat - listingLat);
        double deltaLon = Math.toRadians(submittedLon - listingLon);
        double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
                + Math.cos(lat1) * Math.cos(lat2)
                        * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return 6_371_000 * c;
    }
}
