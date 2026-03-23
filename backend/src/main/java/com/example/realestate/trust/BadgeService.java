package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * CRUD operations for listing trust badges ({@link ListingVerificationDimension}).
 *
 * <p>Every state-mutating method follows this sequence:
 * <ol>
 *   <li>Mutate the {@code ListingVerificationDimension} row and save it.</li>
 *   <li>Re-calculate the trust tier via {@link TrustTierCalculator#calculate(UUID)}.</li>
 *   <li>Fetch the {@link Listing} row fresh (after the dimension save) and update its
 *       {@code trust_tier} column.</li>
 *   <li>Write a fire-and-forget audit record via {@link AdminAuditService#record} (@Async —
 *       runs outside the transaction by design; audit failure must never affect the primary
 *       badge operation).</li>
 * </ol>
 *
 * <p>Concurrency note: {@link TrustTierCalculator#calculate} is deterministic and reads the
 * same transaction snapshot, so concurrent grants on different dimensions are safe without
 * explicit row-level locking. Concurrent grants on the <em>same</em> (listingId, dimensionType)
 * pair are serialized by the unique index on that column pair in the database.
 *
 * <p>{@code evidenceNote} is stored only in the audit log and is never written to any entity
 * field. {@link ListingVerificationDimension} has no {@code evidence_note} column.
 */
@Service
public class BadgeService {

    private static final Logger log = LoggerFactory.getLogger(BadgeService.class);

    private static final String ENTITY_TYPE_BADGE = "listing_verification_dimension";

    /**
     * Allowlist of valid dimensionType values (AC3 — RE-151).
     * Any mutation method that receives a value not in this set throws
     * {@link IllegalArgumentException} before touching the database.
     */
    private static final Set<String> VALID_DIMENSION_TYPES =
            Set.of("IDENTITY", "LOCATION", "PHOTOS", "AUTHORITY", "DOCUMENTS", "FIELD");

    private final ListingVerificationDimensionRepository dimensionRepository;
    private final ListingRepository listingRepository;
    private final TrustTierCalculator trustTierCalculator;
    private final RankingScoreCalculator rankingScoreCalculator;
    private final AdminAuditService adminAuditService;
    private final ObjectMapper objectMapper;
    private final AuthorityEvidenceRepository authorityEvidenceRepository;

    public BadgeService(
            ListingVerificationDimensionRepository dimensionRepository,
            ListingRepository listingRepository,
            TrustTierCalculator trustTierCalculator,
            RankingScoreCalculator rankingScoreCalculator,
            AdminAuditService adminAuditService,
            ObjectMapper objectMapper,
            AuthorityEvidenceRepository authorityEvidenceRepository) {
        this.dimensionRepository = dimensionRepository;
        this.listingRepository = listingRepository;
        this.trustTierCalculator = trustTierCalculator;
        this.rankingScoreCalculator = rankingScoreCalculator;
        this.adminAuditService = adminAuditService;
        this.objectMapper = objectMapper;
        this.authorityEvidenceRepository = authorityEvidenceRepository;
    }

    // -------------------------------------------------------------------------
    // grantBadge
    // -------------------------------------------------------------------------

    /**
     * Grants (or re-grants) the badge for the given dimension on a listing.
     *
     * <p>If the (listingId, dimensionType) row does not yet exist, it is created.
     * If it already exists (in any badge state), it is updated to EARNED and
     * {@code granted_at} is set to now (idempotent re-grant).
     *
     * <p>{@code evidenceNote} is written only to the audit log; it is not persisted
     * to any entity field.
     *
     * @param listingId     listing to grant the badge on; must not be null
     * @param dimensionType verification dimension category; must not be null
     * @param actorId       UUID of the admin or system actor granting the badge; must not be null
     * @param evidenceNote  human-readable evidence rationale for the audit log; may be null
     */
    @Transactional
    public ListingVerificationDimension grantBadge(
            UUID listingId,
            String dimensionType,
            UUID actorId,
            String evidenceNote) {

        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");
        Objects.requireNonNull(actorId, "actorId must not be null");
        if (!VALID_DIMENSION_TYPES.contains(dimensionType)) {
            throw new IllegalArgumentException("Invalid dimensionType: " + dimensionType);
        }

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType(dimensionType);
                    return d;
                });

        String previousState = dimension.getBadgeState();

        dimension.setBadgeState("EARNED");
        dimension.setGrantedAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        if ("AUTHORITY".equals(dimensionType)) {
            authorityEvidenceRepository
                    .findAllByListingIdAndReviewState(listingId, "PENDING")
                    .stream()
                    .findFirst()
                    .ifPresent(e -> {
                        e.setReviewState("APPROVED");
                        e.setVerifiedBy(actorId);
                        e.setVerifiedAt(now);
                        e.setUpdatedAt(now);
                        authorityEvidenceRepository.save(e);
                    });
        }

        String newTier = recalculateAndPersistTier(listingId);

        String afterJson = buildAuditJson(dimensionType, "EARNED", now.toString(), evidenceNote);
        String beforeJson = previousState != null
                ? buildSimpleStateJson(dimensionType, previousState)
                : null;

        adminAuditService.record(
                actorId,
                "BADGE_GRANTED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Badge granted listingId={} dimension={} newTier={} actorId={}",
                listingId, dimensionType, newTier, actorId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // suspendBadge
    // -------------------------------------------------------------------------

    /**
     * Suspends the badge for the given dimension on a listing.
     *
     * <p>Throws {@link BadgeNotFoundException} if the (listingId, dimensionType) row
     * does not exist — a badge cannot be suspended before it has been granted.
     *
     * @param listingId     listing whose badge is to be suspended; must not be null
     * @param dimensionType verification dimension category; must not be null
     * @param adminId       UUID of the admin performing the suspension; must not be null
     * @param reason        human-readable suspension reason for the audit log; may be null
     */
    @Transactional
    public ListingVerificationDimension suspendBadge(
            UUID listingId,
            String dimensionType,
            UUID adminId,
            String reason) {

        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");
        Objects.requireNonNull(adminId, "adminId must not be null");
        if (!VALID_DIMENSION_TYPES.contains(dimensionType)) {
            throw new IllegalArgumentException("Invalid dimensionType: " + dimensionType);
        }

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .orElseThrow(() -> new BadgeNotFoundException(listingId, dimensionType));

        String previousState = dimension.getBadgeState();

        dimension.setBadgeState("SUSPENDED");
        dimension.setSuspendedAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        String newTier = recalculateAndPersistTier(listingId);

        String afterJson = buildSuspendAuditJson(dimensionType, "SUSPENDED", now.toString(), reason);
        String beforeJson = buildSimpleStateJson(dimensionType, previousState);

        adminAuditService.record(
                adminId,
                "BADGE_SUSPENDED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Badge suspended listingId={} dimension={} newTier={} adminId={}",
                listingId, dimensionType, newTier, adminId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // expireBadge
    // -------------------------------------------------------------------------

    /**
     * Expires the badge for the given dimension on a listing.
     *
     * <p>Throws {@link BadgeNotFoundException} if the (listingId, dimensionType) row
     * does not exist — a badge cannot be expired before it has been granted.
     *
     * <p>Sets {@code expires_at} to now (overwriting any previously scheduled expiry
     * date) and sets {@code badge_state} to EXPIRED.
     *
     * @param listingId     listing whose badge is to be expired; must not be null
     * @param dimensionType verification dimension category; must not be null
     * @param actorId       UUID of the admin or system actor performing the expiry; must not be null
     */
    @Transactional
    public ListingVerificationDimension expireBadge(
            UUID listingId, String dimensionType, UUID actorId) {

        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");
        Objects.requireNonNull(actorId, "actorId must not be null");
        if (!VALID_DIMENSION_TYPES.contains(dimensionType)) {
            throw new IllegalArgumentException("Invalid dimensionType: " + dimensionType);
        }

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .orElseThrow(() -> new BadgeNotFoundException(listingId, dimensionType));

        String previousState = dimension.getBadgeState();

        dimension.setBadgeState("EXPIRED");
        dimension.setExpiresAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        String newTier = recalculateAndPersistTier(listingId);

        String afterJson = buildSimpleStateJson(dimensionType, "EXPIRED");
        String beforeJson = buildSimpleStateJson(dimensionType, previousState);

        adminAuditService.record(
                actorId,
                "BADGE_EXPIRED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Badge expired listingId={} dimension={} newTier={} actorId={}",
                listingId, dimensionType, newTier, actorId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // submitPhotos
    // -------------------------------------------------------------------------

    /**
     * Transitions the PHOTOS dimension to PENDING state for a given listing,
     * indicating the photo is awaiting admin review.
     *
     * <p>If the PHOTOS dimension is already PENDING or EARNED, throws
     * {@link PhotoAlreadySubmittedException} — the caller must surface a 409 conflict.
     *
     * <p>If the PHOTOS dimension does not exist, a new row is created with state PENDING.
     * If it exists with any other state (AVAILABLE, EXPIRED, SUSPENDED), it is updated to PENDING.
     *
     * @param listingId listing for which the photo was submitted; must not be null
     * @param callerId  UUID of the broker or owner submitting the photo; must not be null
     */
    @Transactional
    public ListingVerificationDimension submitPhotos(
            UUID listingId, UUID callerId, String verificationAssetUrl) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(callerId, "callerId must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, "PHOTOS")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType("PHOTOS");
                    return d;
                });

        String previousState = dimension.getBadgeState();

        if ("PENDING".equals(previousState) || "EARNED".equals(previousState)) {
            throw new PhotoAlreadySubmittedException(previousState);
        }

        dimension.setBadgeState("PENDING");
        dimension.setUpdatedAt(now);
        if (verificationAssetUrl != null) {
            dimension.setVerificationAssetUrl(verificationAssetUrl);
        }

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        recalculateAndPersistTier(listingId);

        String afterJson = buildSimpleStateJson("PHOTOS", "PENDING");
        String beforeJson = previousState != null ? buildSimpleStateJson("PHOTOS", previousState) : null;

        adminAuditService.record(
                callerId,
                "PHOTOS_SUBMITTED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Photos submitted for review listingId={} callerId={}", listingId, callerId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // grantLocationBadge
    // -------------------------------------------------------------------------

    /**
     * Grants the LOCATION badge for a listing when the caller has verified their
     * physical presence at the listing location.
     *
     * <p>If the LOCATION badge is already EARNED, throws
     * {@link LocationAlreadyVerifiedException} — the caller must surface a 409 conflict.
     *
     * <p>If the LOCATION badge does not exist, a new row is created with state EARNED.
     * If it exists with any other state (AVAILABLE, EXPIRED, SUSPENDED), it is updated to EARNED.
     *
     * @param listingId    listing for which location was verified; must not be null
     * @param callerId     UUID of the broker or owner submitting the GPS coordinates; must not be null
     * @param distanceMeters computed Haversine distance in meters (written to audit log only)
     * @param submittedLat submitted latitude (written to audit log only)
     * @param submittedLon submitted longitude (written to audit log only)
     */
    @Transactional
    public ListingVerificationDimension grantLocationBadge(
            UUID listingId,
            UUID callerId,
            double distanceMeters,
            double submittedLat,
            double submittedLon) {

        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(callerId, "callerId must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, "LOCATION")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType("LOCATION");
                    return d;
                });

        String previousState = dimension.getBadgeState();

        if ("EARNED".equals(previousState)) {
            throw new LocationAlreadyVerifiedException();
        }

        dimension.setBadgeState("EARNED");
        dimension.setGrantedAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        recalculateAndPersistTier(listingId);

        String evidenceNote = String.format(
                "LOCATION_VERIFIED distance=%.1fm lat=%s lon=%s",
                distanceMeters, submittedLat, submittedLon);

        String afterJson = buildAuditJson("LOCATION", "EARNED", now.toString(), evidenceNote);
        String beforeJson = previousState != null ? buildSimpleStateJson("LOCATION", previousState) : null;

        adminAuditService.record(
                callerId,
                "LOCATION_VERIFIED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Location badge granted listingId={} callerId={} distanceMeters={}",
                listingId, callerId, String.format("%.1f", distanceMeters));

        return saved;
    }

    // -------------------------------------------------------------------------
    // grantIdentityBadge
    // -------------------------------------------------------------------------

    /**
     * Grants the IDENTITY badge for a listing when the caller has verified their phone number
     * via OTP.
     *
     * <p>If the IDENTITY badge is already EARNED, throws
     * {@link IdentityAlreadyVerifiedException} — the caller must surface a 409 conflict.
     *
     * <p>If the IDENTITY badge does not exist, a new row is created with state EARNED.
     * If it exists with any other state (AVAILABLE, EXPIRED, SUSPENDED), it is updated to EARNED.
     *
     * @param listingId listing for which identity was verified; must not be null
     * @param callerId  UUID of the broker or owner who verified their phone; must not be null
     */
    @Transactional
    public ListingVerificationDimension grantIdentityBadge(UUID listingId, UUID callerId) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(callerId, "callerId must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, "IDENTITY")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType("IDENTITY");
                    return d;
                });

        String previousState = dimension.getBadgeState();

        if ("EARNED".equals(previousState)) {
            throw new IdentityAlreadyVerifiedException();
        }

        dimension.setBadgeState("EARNED");
        dimension.setGrantedAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        recalculateAndPersistTier(listingId);

        String afterJson = buildAuditJson("IDENTITY", "EARNED", now.toString(), "IDENTITY_VERIFIED via OTP");
        String beforeJson = previousState != null ? buildSimpleStateJson("IDENTITY", previousState) : null;

        adminAuditService.record(
                callerId,
                "IDENTITY_VERIFIED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Identity badge granted listingId={} callerId={}", listingId, callerId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // grantAuthorityBadge
    // -------------------------------------------------------------------------

    /**
     * Grants the AUTHORITY badge for a listing when the owner has verified their identity
     * via OTP (owner fast path).
     *
     * <p>If the AUTHORITY badge is already EARNED, throws
     * {@link AuthorityAlreadyVerifiedException} — the caller must surface a 409 conflict.
     *
     * <p>If the AUTHORITY badge does not exist, a new row is created with state EARNED.
     * If it exists with any other state (AVAILABLE, EXPIRED, SUSPENDED, PENDING), it is
     * updated to EARNED.
     *
     * @param listingId listing for which authority was verified; must not be null
     * @param callerId  UUID of the owner who verified via OTP; must not be null
     */
    @Transactional
    public ListingVerificationDimension grantAuthorityBadge(UUID listingId, UUID callerId) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(callerId, "callerId must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, "AUTHORITY")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType("AUTHORITY");
                    return d;
                });

        String previousState = dimension.getBadgeState();

        if ("EARNED".equals(previousState)) {
            throw new AuthorityAlreadyVerifiedException();
        }

        dimension.setBadgeState("EARNED");
        dimension.setGrantedAt(now);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        recalculateAndPersistTier(listingId);

        String afterJson = buildAuditJson("AUTHORITY", "EARNED", now.toString(), "AUTHORITY_VERIFIED via owner OTP");
        String beforeJson = previousState != null ? buildSimpleStateJson("AUTHORITY", previousState) : null;

        adminAuditService.record(
                callerId,
                "AUTHORITY_VERIFIED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Authority badge granted listingId={} callerId={}", listingId, callerId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // submitAuthorityMandate
    // -------------------------------------------------------------------------

    /**
     * Transitions the AUTHORITY dimension to PENDING state for a given listing,
     * indicating a broker mandate document is awaiting admin review.
     *
     * <p>If the AUTHORITY dimension is already PENDING or EARNED, throws
     * {@link AuthorityMandateAlreadySubmittedException} — the caller must surface a 409 conflict.
     *
     * <p>If the AUTHORITY dimension does not exist, a new row is created with state PENDING.
     * If it exists with any other state (AVAILABLE, EXPIRED, SUSPENDED), it is updated to PENDING.
     *
     * @param listingId listing for which the mandate was submitted; must not be null
     * @param callerId  UUID of the broker submitting the mandate; must not be null
     */
    @Transactional
    public ListingVerificationDimension submitAuthorityMandate(
            UUID listingId, UUID callerId, String verificationAssetUrl) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(callerId, "callerId must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, "AUTHORITY")
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType("AUTHORITY");
                    return d;
                });

        String previousState = dimension.getBadgeState();

        if ("PENDING".equals(previousState) || "EARNED".equals(previousState)) {
            throw new AuthorityMandateAlreadySubmittedException(previousState);
        }

        dimension.setBadgeState("PENDING");
        dimension.setUpdatedAt(now);
        if (verificationAssetUrl != null) {
            dimension.setVerificationAssetUrl(verificationAssetUrl);
        }

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        AuthorityEvidence evidence = new AuthorityEvidence();
        evidence.setListingId(listingId);
        evidence.setEvidenceType("MANDATE_DOCUMENT");
        evidence.setEvidenceValue(verificationAssetUrl);
        evidence.setReviewState("PENDING");
        evidence.setUpdatedAt(now);
        authorityEvidenceRepository.save(evidence);

        recalculateAndPersistTier(listingId);

        String afterJson = buildSimpleStateJson("AUTHORITY", "PENDING");
        String beforeJson = previousState != null ? buildSimpleStateJson("AUTHORITY", previousState) : null;

        adminAuditService.record(
                callerId,
                "AUTHORITY_MANDATE_SUBMITTED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Authority mandate submitted for review listingId={} callerId={}", listingId, callerId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // rejectBadgeSubmission
    // -------------------------------------------------------------------------

    /**
     * Rejects a PENDING badge submission, reverting it to AVAILABLE, and writes
     * a {@code BADGE_SUBMISSION_REJECTED} audit record.
     *
     * <p>Throws {@link BadgeNotFoundException} if the dimension row does not exist.
     * Throws {@link IllegalStateException} if the dimension is not in PENDING state —
     * callers must guard with a 409 before calling this method.
     *
     * @param dimensionId UUID of the {@link ListingVerificationDimension} row to reject
     * @param adminId     UUID of the admin performing the rejection
     */
    @Transactional
    public void rejectBadgeSubmission(UUID dimensionId, UUID adminId) {
        Objects.requireNonNull(dimensionId, "dimensionId must not be null");
        Objects.requireNonNull(adminId, "adminId must not be null");

        ListingVerificationDimension dimension = dimensionRepository.findById(dimensionId)
                .orElseThrow(() -> new BadgeNotFoundException(dimensionId, ""));

        if (!"PENDING".equals(dimension.getBadgeState())) {
            throw new IllegalStateException("Badge is not PENDING: " + dimension.getBadgeState());
        }

        OffsetDateTime now = OffsetDateTime.now();
        String dimensionType = dimension.getDimensionType();
        UUID listingId = dimension.getListingId();

        String beforeJson = buildSimpleStateJson(dimensionType, "PENDING");

        dimension.setBadgeState("AVAILABLE");
        dimension.setUpdatedAt(now);
        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        if ("AUTHORITY".equals(dimensionType)) {
            authorityEvidenceRepository
                    .findAllByListingIdAndReviewState(listingId, "PENDING")
                    .stream()
                    .findFirst()
                    .ifPresent(e -> {
                        e.setReviewState("REJECTED");
                        e.setVerifiedBy(adminId);
                        e.setVerifiedAt(now);
                        e.setUpdatedAt(now);
                        authorityEvidenceRepository.save(e);
                    });
        }

        recalculateAndPersistTier(listingId);

        String afterJson = buildSimpleStateJson(dimensionType, "AVAILABLE");

        adminAuditService.record(
                adminId,
                "BADGE_SUBMISSION_REJECTED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.info("Badge submission rejected dimensionId={} dimension={} listingId={} adminId={}",
                dimensionId, dimensionType, listingId, adminId);
    }

    // -------------------------------------------------------------------------
    // failBadgeWithLockout
    // -------------------------------------------------------------------------

    /**
     * Transitions a badge to FAILED state and sets a 24-hour OTP lockout.
     *
     * <p>Called when the caller has exhausted all OTP verify attempts. Sets
     * {@code badge_state = "FAILED"}, {@code otp_locked_until = now + 24h},
     * and writes a {@code OTP_MAX_ATTEMPTS_EXCEEDED} audit record.
     *
     * <p>If the (listingId, dimensionType) row does not yet exist, a new one is
     * created — this handles the edge case where verify is called before any prior
     * DB row exists (which should not happen in practice, but is safe to handle here).
     *
     * @param listingId     listing whose badge is to be failed; must not be null
     * @param dimensionType verification dimension category; must not be null
     * @param actorId       UUID of the user who exhausted their attempts; must not be null
     */
    @Transactional
    public ListingVerificationDimension failBadgeWithLockout(
            UUID listingId, String dimensionType, UUID actorId) {

        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");
        Objects.requireNonNull(actorId, "actorId must not be null");
        if (!VALID_DIMENSION_TYPES.contains(dimensionType)) {
            throw new IllegalArgumentException("Invalid dimensionType: " + dimensionType);
        }

        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime lockedUntil = now.plusHours(24);

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType(dimensionType);
                    return d;
                });

        String previousState = dimension.getBadgeState();

        dimension.setBadgeState("FAILED");
        dimension.setOtpLockedUntil(lockedUntil);
        dimension.setUpdatedAt(now);

        ListingVerificationDimension saved = dimensionRepository.save(dimension);

        String newTier = recalculateAndPersistTier(listingId);

        String beforeJson = previousState != null ? buildSimpleStateJson(dimensionType, previousState) : null;
        String afterJson = buildFailedLockoutAuditJson(dimensionType, lockedUntil.toString());

        adminAuditService.record(
                actorId,
                "OTP_MAX_ATTEMPTS_EXCEEDED",
                ENTITY_TYPE_BADGE,
                saved.getId(),
                beforeJson,
                afterJson);

        log.warn("OTP max attempts exceeded listingId={} dimension={} lockedUntil={} actorId={}",
                listingId, dimensionType, lockedUntil, actorId);

        return saved;
    }

    // -------------------------------------------------------------------------
    // resetOtpLockout
    // -------------------------------------------------------------------------

    /**
     * Resets the OTP lockout state on a dimension, returning it to AVAILABLE.
     *
     * <p>Called when a lockout has expired (i.e. {@code otp_locked_until} is in the past)
     * before issuing a new OTP send. Clears {@code badge_state} to AVAILABLE,
     * {@code otp_attempt_count} to 0, and {@code otp_locked_until} to null.
     *
     * <p>If no row exists for the (listingId, dimensionType) pair, this method is a no-op —
     * the dimension is already in its initial AVAILABLE state.
     *
     * @param listingId     listing whose lockout is to be reset; must not be null
     * @param dimensionType verification dimension category; must not be null
     */
    @Transactional
    public void resetOtpLockout(UUID listingId, String dimensionType) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");

        dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .ifPresent(dimension -> {
                    OffsetDateTime now = OffsetDateTime.now();
                    dimension.setBadgeState("AVAILABLE");
                    dimension.setOtpAttemptCount(0);
                    dimension.setOtpLockedUntil(null);
                    dimension.setUpdatedAt(now);
                    dimensionRepository.save(dimension);
                    log.info("OTP lockout reset listingId={} dimension={}", listingId, dimensionType);
                });
    }

    // -------------------------------------------------------------------------
    // incrementOtpAttemptCount
    // -------------------------------------------------------------------------

    /**
     * Increments the OTP attempt counter for the given (listingId, dimensionType) pair
     * and returns the new count.
     *
     * <p>If no row exists yet, a new AVAILABLE row is created with {@code otp_attempt_count = 1}.
     * This preserves the invariant that attempt tracking starts from the first failed call.
     *
     * @param listingId     listing whose attempt count is to be incremented; must not be null
     * @param dimensionType verification dimension category; must not be null
     * @return the updated attempt count after incrementing
     */
    @Transactional
    public int incrementOtpAttemptCount(UUID listingId, String dimensionType) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        Objects.requireNonNull(dimensionType, "dimensionType must not be null");

        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dimension = dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .orElseGet(() -> {
                    ListingVerificationDimension d = new ListingVerificationDimension();
                    d.setListingId(listingId);
                    d.setDimensionType(dimensionType);
                    d.setBadgeState("AVAILABLE");
                    return d;
                });

        int newCount = dimension.getOtpAttemptCount() + 1;
        dimension.setOtpAttemptCount(newCount);
        dimension.setUpdatedAt(now);
        dimensionRepository.save(dimension);

        return newCount;
    }

    // -------------------------------------------------------------------------
    // getBadges
    // -------------------------------------------------------------------------

    /**
     * Returns all verification dimension rows for the given listing, regardless of badge state.
     *
     * @param listingId listing to query; must not be null
     * @return list of {@link ListingVerificationDimension}; may be empty if none exist
     */
    @Transactional(readOnly = true)
    public List<ListingVerificationDimension> getBadges(UUID listingId) {
        Objects.requireNonNull(listingId, "listingId must not be null");
        return dimensionRepository.findAllByListingId(listingId);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Calls {@link TrustTierCalculator#calculate}, then fetches the listing fresh
     * and persists the updated tier. Returns the new tier string.
     *
     * <p>The flush before calculate is mandatory: without it the Hibernate session may
     * not have written the newly-saved dimension to the JDBC connection yet, so
     * {@code TrustTierCalculator.findAllByListingId} would read stale pre-save data
     * and compute the wrong tier within the same transaction.
     *
     * <p>Package-visible so that {@link BadgeInvalidationService} can call it after
     * all badge revocations in a single edit request without a redundant tier recalc.
     */
    String recalculateAndPersistTier(UUID listingId) {
        dimensionRepository.flush();
        TrustTierResult result = trustTierCalculator.calculate(listingId);
        String newTier = result.getTier();

        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));
        listing.setTrustTier(newTier);

        int rankingScore = rankingScoreCalculator.calculate(listing);
        listing.setRankingScore(rankingScore);

        listingRepository.save(listing);

        return newTier;
    }

    /**
     * Serializes the grant audit payload to a JSON string via Jackson.
     * evidenceNote is intentionally included in the audit JSON only — never in any entity field.
     * Returns null on serialization failure (audit silently skipped; main transaction still commits).
     */
    private String buildAuditJson(
            String dimensionType, String badgeState, String grantedAt, String evidenceNote) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", badgeState);
        payload.put("grantedAt", grantedAt);
        if (evidenceNote != null) {
            payload.put("evidenceNote", evidenceNote);
        }
        return toJsonOrNull(payload);
    }

    /**
     * Serializes the OTP lockout audit payload to a JSON string via Jackson.
     * Returns null on serialization failure (audit silently skipped; main transaction still commits).
     */
    private String buildFailedLockoutAuditJson(String dimensionType, String lockedUntil) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", "FAILED");
        payload.put("lockedUntil", lockedUntil);
        return toJsonOrNull(payload);
    }

    /**
     * Serializes the suspend audit payload to a JSON string via Jackson.
     * Returns null on serialization failure (audit silently skipped; main transaction still commits).
     */
    private String buildSuspendAuditJson(
            String dimensionType, String badgeState, String suspendedAt, String reason) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", badgeState);
        payload.put("suspendedAt", suspendedAt);
        if (reason != null) {
            payload.put("reason", reason);
        }
        return toJsonOrNull(payload);
    }

    /**
     * Serializes a minimal state snapshot to a JSON string via Jackson.
     * Returns null when {@code badgeState} is null (new-row grants have no prior state).
     */
    private String buildSimpleStateJson(String dimensionType, String badgeState) {
        if (badgeState == null) {
            return null;
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", badgeState);
        return toJsonOrNull(payload);
    }

    /**
     * Converts a map to a JSON string. On {@link JsonProcessingException}, logs a warning
     * and returns null so that audit serialization failures never abort the main transaction.
     */
    private String toJsonOrNull(Map<String, String> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize audit JSON payload — audit record will have null json", e);
            return null;
        }
    }
}
