package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    /**
     * Maximum OTP verify attempts before the badge is set to FAILED and a 24-hour lockout
     * is applied. Must match {@code StubOtpProvider.MAX_ATTEMPTS} (and the equivalent in
     * the production provider when it is introduced).
     */
    private static final int OTP_MAX_ATTEMPTS = 5;

    /** Maximum location-verify attempts allowed within a single 24-hour sliding window. */
    private static final int LOCATION_VERIFY_MAX_ATTEMPTS = 5;

    private static final Set<String> VALID_DOCUMENT_TYPES =
            Set.of("AADHAAR", "PAN", "VOTER_ID", "PASSPORT", "DRIVING_LICENSE");

    private final BadgeService badgeService;
    private final ListingRepository listingRepository;
    private final ListingVerificationDimensionRepository dimensionRepository;
    private final PhotoHashService photoHashService;
    private final ProfileRepository profileRepository;
    private final OtpService otpService;
    private final SupabaseStorageService supabaseStorageService;
    private final IdentityEvidenceRepository identityEvidenceRepository;

    public TrustController(
            BadgeService badgeService,
            ListingRepository listingRepository,
            ListingVerificationDimensionRepository dimensionRepository,
            PhotoHashService photoHashService,
            ProfileRepository profileRepository,
            OtpService otpService,
            SupabaseStorageService supabaseStorageService,
            IdentityEvidenceRepository identityEvidenceRepository) {
        this.badgeService = badgeService;
        this.listingRepository = listingRepository;
        this.dimensionRepository = dimensionRepository;
        this.photoHashService = photoHashService;
        this.profileRepository = profileRepository;
        this.otpService = otpService;
        this.supabaseStorageService = supabaseStorageService;
        this.identityEvidenceRepository = identityEvidenceRepository;
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
            String rejectionReason = (row != null) ? row.getRejectionReason() : null;
            boolean needsCta = (cta == null)
                    && ("AVAILABLE".equals(badgeState) || "PENDING".equals(badgeState));
            if (needsCta) {
                cta = type;
            }
            badges.add(new TrustProgressBadgeDto(type, badgeState, grantedAt, null, rejectionReason));
        }

        // For owner listings, AUTHORITY is appended as auto-granted (outside the canonical loop).
        if (isOwnerListing) {
            ListingVerificationDimension authorityRow = byType.get(AUTHORITY_TYPE);
            String authorityState = (authorityRow != null) ? authorityRow.getBadgeState() : "AVAILABLE";
            OffsetDateTime authorityGrantedAt = (authorityRow != null) ? authorityRow.getGrantedAt() : null;
            String authorityRejectionReason = (authorityRow != null) ? authorityRow.getRejectionReason() : null;
            boolean needsCta = (cta == null)
                    && ("AVAILABLE".equals(authorityState) || "PENDING".equals(authorityState));
            if (needsCta) {
                cta = AUTHORITY_TYPE;
            }
            badges.add(new TrustProgressBadgeDto(AUTHORITY_TYPE, authorityState, authorityGrantedAt, true,
                    authorityRejectionReason));
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
                // Upload photo to Supabase Storage (best-effort; failure does not block PENDING transition)
                String assetUrl = null;
                try {
                    String ct = file.getContentType() != null ? file.getContentType() : "image/jpeg";
                    String ext = getExtensionFromContentType(ct);
                    String path = id + "/photos/" + UUID.randomUUID() + "." + ext;
                    assetUrl = supabaseStorageService.uploadObject(
                            "trust-assets", path, file.getBytes(), ct
                    ).orElse(null);
                } catch (Exception e) {
                    log.warn("Photo upload to storage failed — proceeding without URL listingId={}", id, e);
                }
                try {
                    badgeService.submitPhotos(id, caller.userId(), assetUrl);
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
     *   <li>429 — caller has exceeded 5 location-verify attempts within the current 24-hour window</li>
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

        // 3a. Rate limit: max 5 attempts per 24-hour sliding window per listing.
        // Load (or create an in-memory stub for) the LOCATION dimension to track attempts.
        ListingVerificationDimension locationDimension = dimensionRepository
                .findByListingIdAndDimensionType(id, "LOCATION")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(id);
                    d.setDimensionType("LOCATION");
                    d.setBadgeState("AVAILABLE");
                    d.setUpdatedAt(OffsetDateTime.now());
                    return d;
                });

        OffsetDateTime now = OffsetDateTime.now();
        if (locationDimension.getLocationVerifyWindowStart() == null
                || locationDimension.getLocationVerifyWindowStart().isBefore(now.minusHours(24))) {
            // No active window, or the previous window has expired — open a fresh one.
            locationDimension.setLocationVerifyAttempts(0);
            locationDimension.setLocationVerifyWindowStart(now);
        }
        if (locationDimension.getLocationVerifyAttempts() >= LOCATION_VERIFY_MAX_ATTEMPTS) {
            log.warn("Location verify rate limit exceeded listingId={} callerId={} attempts={}",
                    id, caller.userId(), locationDimension.getLocationVerifyAttempts());
            return ResponseEntity.status(429).body(
                    Map.of("error", "Too many location verification attempts. Try again tomorrow."));
        }
        locationDimension.setLocationVerifyAttempts(locationDimension.getLocationVerifyAttempts() + 1);
        locationDimension.setUpdatedAt(now);
        dimensionRepository.save(locationDimension);

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
    // POST /api/listings/{id}/trust/identity/submit-evidence — AUTHENTICATED, owner-only
    // -------------------------------------------------------------------------

    /**
     * Accepts identity evidence (document upload) for admin review.
     * Replaces the previous OTP-based identity verification flow.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — evidence submitted; IDENTITY badge set to PENDING</li>
     *   <li>400 — missing/invalid fields, wrong file type, or invalid document type</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — IDENTITY badge already EARNED or PENDING</li>
     *   <li>413 — file exceeds 10 MB limit</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/identity/submit-evidence", consumes = "multipart/form-data")
    public ResponseEntity<?> submitIdentityEvidence(
            CallerInfo caller,
            @PathVariable UUID id,
            @RequestParam("legal_name") String legalName,
            @RequestParam("phone_number") String phoneNumber,
            @RequestParam("document_type") String documentType,
            @RequestPart("file") MultipartFile file) {

        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to identity/submit-evidence listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate form fields
        if (legalName == null || legalName.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "Legal name is required"));
        }
        if (legalName.trim().length() > 200) {
            return ResponseEntity.status(400).body(Map.of("error", "Legal name must not exceed 200 characters"));
        }
        if (phoneNumber == null || phoneNumber.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "Phone number is required"));
        }
        if (phoneNumber.trim().length() > 100) {
            return ResponseEntity.status(400).body(Map.of("error", "Phone number must not exceed 100 characters"));
        }
        if (!VALID_DOCUMENT_TYPES.contains(documentType)) {
            return ResponseEntity.status(400).body(Map.of("error",
                    "Invalid document type. Must be one of: AADHAAR, PAN, VOTER_ID, PASSPORT, DRIVING_LICENSE"));
        }

        // 3. Validate file
        if (file == null || file.isEmpty()) {
            return ResponseEntity.status(400).body(Map.of("error", "No file uploaded"));
        }
        if (file.getSize() > 10L * 1024 * 1024) {
            return ResponseEntity.status(413).body(Map.of("error", "File size must not exceed 10 MB"));
        }
        if (!isMandateFileTypeAllowed(file)) {
            return ResponseEntity.status(400).body(Map.of("error", "File must be a PDF or image (JPEG/PNG)"));
        }

        // 4. Check IDENTITY badge not already EARNED or PENDING
        List<ListingVerificationDimension> badges = badgeService.getBadges(id);
        ListingVerificationDimension identityDimension = badges.stream()
                .filter(b -> "IDENTITY".equals(b.getDimensionType()))
                .findFirst()
                .orElse(null);

        if (identityDimension != null) {
            String state = identityDimension.getBadgeState();
            if ("EARNED".equals(state)) {
                return ResponseEntity.status(409).body(Map.of("error", "Identity already verified"));
            }
            if ("PENDING".equals(state)) {
                return ResponseEntity.status(409).body(Map.of("error", "Identity evidence already submitted and under review"));
            }
        }

        // 5. Upload document to Supabase Storage — store only the path, never the public URL.
        //    Identity documents are sensitive PII; access is proxied through the backend
        //    via GET /api/admin/trust/identity/{evidenceId}/document (admin-only).
        String ext = getExtensionFromContentType(file.getContentType());
        String storagePath = caller.userId() + "/" + documentType + "/" + UUID.randomUUID() + "." + ext;
        try {
            supabaseStorageService.uploadObject(
                    "identity-evidence", storagePath, file.getBytes(),
                    file.getContentType() != null ? file.getContentType() : "application/octet-stream"
            );
        } catch (Exception e) {
            log.warn("Identity evidence upload to storage failed listingId={}", id, e);
            // Fall through — storagePath is still recorded so the upload can be retried
        }

        // 6. Resolve profile
        Profile profile = profileRepository.findByUserId(caller.userId()).orElse(null);
        UUID profileId = (profile != null) ? profile.getUserId() : caller.userId();

        // 7. Create identity_evidence row
        OffsetDateTime now = OffsetDateTime.now();
        IdentityEvidence evidence = new IdentityEvidence();
        evidence.setProfileId(profileId);
        evidence.setListingId(id);
        evidence.setLegalName(legalName.trim());
        evidence.setPhoneNumber(phoneNumber.trim());
        evidence.setDocumentType(documentType);
        evidence.setDocumentUrl(storagePath);
        evidence.setReviewState("PENDING");
        evidence.setUpdatedAt(now);

        IdentityEvidence saved = identityEvidenceRepository.save(evidence);

        // 8. Transition IDENTITY badge to PENDING (pass path, not public URL)
        badgeService.submitIdentityEvidence(id, caller.userId(), storagePath);

        log.info("POST /api/listings/{}/trust/identity/submit-evidence -> 200 callerId={} evidenceId={}",
                id, caller.userId(), saved.getId());
        return ResponseEntity.ok(Map.of("message", "Identity evidence submitted for review", "evidenceId", saved.getId()));
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/authority/request-otp — OWNER listings only
    // -------------------------------------------------------------------------

    /**
     * Triggers an OTP send to the phone number stored on the caller's profile.
     * Only valid for owner-type listings; broker listings must use submit-mandate instead.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — OTP sent successfully</li>
     *   <li>400 — seller_type is not "owner", or no phone on profile</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — AUTHORITY badge already EARNED</li>
     *   <li>503 — OTP delivery failed</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/authority/request-otp")
    public ResponseEntity<?> requestAuthorityOtp(CallerInfo caller, @PathVariable UUID id) {
        // 1. Resolve listing + ownership check
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
        }

        boolean isOwner = listing.getCreatedBy() != null
                && listing.getCreatedBy().equals(caller.userId());
        if (!isOwner && !caller.isAdmin()) {
            log.warn("Access denied to authority/request-otp listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate seller type
        if (!"owner".equals(listing.getSellerType())) {
            return ResponseEntity.status(400).body(Map.of("error", "Authority OTP is for owner listings only"));
        }

        // 3. Resolve caller's profile and phone
        Profile profile = profileRepository.findByUserId(caller.userId()).orElse(null);
        String phone = (profile != null) ? profile.getPhone() : null;
        if (phone == null || phone.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "No phone number on profile"));
        }

        // 4. Check AUTHORITY badge not already EARNED
        List<ListingVerificationDimension> badges = badgeService.getBadges(id);
        boolean alreadyEarned = badges.stream()
                .anyMatch(b -> "AUTHORITY".equals(b.getDimensionType()) && "EARNED".equals(b.getBadgeState()));
        if (alreadyEarned) {
            return ResponseEntity.status(409).body(Map.of("error", "Authority already verified"));
        }

        // 5. Send OTP — phone is not echoed in the response
        try {
            otpService.sendOtp(phone);
        } catch (OtpDeliveryException e) {
            log.error("OTP delivery failed for authority listingId={} callerId={}", id, caller.userId(), e);
            return ResponseEntity.status(503).body(Map.of("error", "OTP delivery failed"));
        }

        log.info("POST /api/listings/{}/trust/authority/request-otp -> 200 callerId={}", id, caller.userId());
        return ResponseEntity.ok(Map.of("message", "OTP sent"));
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/authority/verify-otp — OWNER listings only
    // -------------------------------------------------------------------------

    /**
     * Verifies the OTP code submitted by the caller and, if valid, grants the AUTHORITY badge.
     * Only valid for owner-type listings.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — OTP verified; AUTHORITY badge EARNED</li>
     *   <li>400 — invalid or expired OTP, seller_type not "owner", or no phone on profile</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/authority/verify-otp", consumes = "application/json")
    public ResponseEntity<?> verifyAuthorityOtp(
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
            log.warn("Access denied to authority/verify-otp listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate seller type
        if (!"owner".equals(listing.getSellerType())) {
            return ResponseEntity.status(400).body(Map.of("error", "Authority OTP is for owner listings only"));
        }

        // 3. Resolve caller's profile and phone
        Profile profile = profileRepository.findByUserId(caller.userId()).orElse(null);
        String phone = (profile != null) ? profile.getPhone() : null;
        if (phone == null || phone.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "No phone number on profile"));
        }

        // 4. Validate OTP code format (6 digits max, digits only)
        String code = request.getCode();
        if (code == null || code.isBlank() || code.length() > 8 || !code.matches("\\d+")) {
            return ResponseEntity.status(400).body(Map.of("error", "Invalid OTP format"));
        }

        // 5. Verify OTP
        boolean valid = otpService.verifyOtp(phone, code);
        if (!valid) {
            return ResponseEntity.status(400).body(Map.of("error", "Invalid or expired OTP"));
        }

        // 6. Grant AUTHORITY badge
        badgeService.grantAuthorityBadge(id, caller.userId());

        log.info("POST /api/listings/{}/trust/authority/verify-otp -> 200 callerId={}", id, caller.userId());
        return ResponseEntity.ok(Map.of("message", "Authority verified"));
    }

    // -------------------------------------------------------------------------
    // POST /api/listings/{id}/trust/authority/submit-mandate — BROKER listings only
    // -------------------------------------------------------------------------

    /**
     * Accepts a mandate document upload from a broker and transitions the AUTHORITY badge
     * to PENDING for admin review.
     * Only valid for broker-type listings; owner listings use the OTP fast path.
     *
     * <p>Returns:
     * <ul>
     *   <li>200 — mandate accepted; AUTHORITY dimension set to PENDING</li>
     *   <li>400 — missing/empty file, wrong content type, or seller_type not "broker"</li>
     *   <li>403 — caller is not the listing owner</li>
     *   <li>404 — listing not found</li>
     *   <li>409 — AUTHORITY mandate already PENDING or EARNED</li>
     *   <li>413 — file exceeds 5 MB limit</li>
     * </ul>
     */
    @PostMapping(value = "/{id}/trust/authority/submit-mandate", consumes = "multipart/form-data")
    public ResponseEntity<?> submitAuthorityMandate(
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
            log.warn("Access denied to authority/submit-mandate listingId={} callerId={}", id, caller.userId());
            return ResponseEntity.status(403).body(Map.of("error", "Access denied — not the listing owner"));
        }

        // 2. Validate seller type
        if (!"broker".equals(listing.getSellerType())) {
            return ResponseEntity.status(400).body(Map.of("error", "Mandate upload is for broker listings only"));
        }

        // 3. Validate file presence
        if (file == null || file.isEmpty()) {
            return ResponseEntity.status(400).body(Map.of("error", "No file uploaded"));
        }

        // 4. Validate file size (10 MB limit)
        if (file.getSize() > 10L * 1024 * 1024) {
            return ResponseEntity.status(413).body(Map.of("error", "File size must not exceed 10 MB"));
        }

        // 5. Validate file magic bytes (defence against Content-Type spoofing)
        if (!isMandateFileTypeAllowed(file)) {
            return ResponseEntity.status(400).body(Map.of("error", "File must be a PDF or image (JPEG/PNG)"));
        }

        // 6. Upload mandate to Supabase Storage (best-effort; failure does not block PENDING transition)
        String assetUrl = null;
        try {
            String ext = getExtensionFromContentType(file.getContentType());
            String path = id + "/mandates/" + UUID.randomUUID() + "." + ext;
            assetUrl = supabaseStorageService.uploadObject(
                    "trust-assets", path, file.getBytes(),
                    file.getContentType() != null ? file.getContentType() : "application/octet-stream"
            ).orElse(null);
        } catch (Exception e) {
            log.warn("Mandate upload to storage failed — proceeding without URL listingId={}", id, e);
        }

        // 7. Transition AUTHORITY badge to PENDING
        try {
            badgeService.submitAuthorityMandate(id, caller.userId(), assetUrl);
        } catch (AuthorityMandateAlreadySubmittedException e) {
            return ResponseEntity.status(409).body(
                    Map.of("error", "Authority mandate is already " + e.getCurrentState().toLowerCase()));
        }

        log.info("POST /api/listings/{}/trust/authority/submit-mandate -> 200 callerId={}", id, caller.userId());
        return ResponseEntity.ok(Map.of("message", "Mandate submitted for review"));
    }

    // -------------------------------------------------------------------------
    // Private: content-type to file extension mapping
    // -------------------------------------------------------------------------

    /**
     * Returns a file extension for a given MIME type.
     * Defaults to "jpg" for unrecognised types — callers must validate the
     * content type before passing it here.
     */
    private static String getExtensionFromContentType(String contentType) {
        if ("application/pdf".equals(contentType)) return "pdf";
        if ("image/png".equals(contentType)) return "png";
        return "jpg"; // default for image/jpeg and image/jpg
    }

    // -------------------------------------------------------------------------
    // Private: mandate file magic-byte validation
    // -------------------------------------------------------------------------

    /**
     * Validates the first bytes of an uploaded file against known magic byte signatures,
     * defending against Content-Type spoofing where the client declares a safe MIME type
     * but uploads different content.
     *
     * <p>Accepted: PDF ({@code %PDF}), JPEG ({@code \xFF\xD8\xFF}), PNG ({@code \x89PNG}).
     *
     * @param file the uploaded multipart file
     * @return {@code true} if the file starts with a recognised mandate-document signature;
     *         {@code false} otherwise (including on read errors)
     */
    private boolean isMandateFileTypeAllowed(MultipartFile file) {
        try {
            byte[] header = new byte[8];
            int read = file.getInputStream().read(header, 0, header.length);
            if (read < 4) {
                return false;
            }
            // PDF: starts with %PDF (25 50 44 46)
            if (header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46) {
                return true;
            }
            // JPEG: starts with FF D8 FF
            if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF) {
                return true;
            }
            // PNG: starts with 89 50 4E 47
            if ((header[0] & 0xFF) == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47) {
                return true;
            }
            return false;
        } catch (Exception e) {
            log.warn("Failed to read mandate file header for magic byte check", e);
            return false;
        }
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
