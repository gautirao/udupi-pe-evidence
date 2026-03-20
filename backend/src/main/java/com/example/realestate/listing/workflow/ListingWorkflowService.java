package com.example.realestate.listing.workflow;

import com.example.realestate.listing.audit.ListingStatusHistory;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.event.ListingApprovedEvent;
import com.example.realestate.listing.event.ListingRejectedEvent;
import com.example.realestate.listing.event.NewListingInAreaEvent;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingNotArchivedException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Listing lifecycle workflow operations (submit, approve, reject, restore, admin force-delete).
 * Extracted from {@link com.example.realestate.listing.ListingService}.
 */
@Service
public class ListingWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(ListingWorkflowService.class);

    private static final Set<String> SUBMITTABLE_PROPERTY_TYPES = Set.of(
            "land", "house", "apartment",
            "commercial", "commercial_building", "warehouse", "commercial_land");

    private static final int MIN_IMAGES = 3;

    private final ListingRepository listingRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ListingOwnershipGuard listingOwnershipGuard;
    private final ProximityDuplicateService proximityDuplicateService;
    private final ListingTransitionPolicy policy;
    private final ListingStatusHistoryRepository statusHistoryRepository;

    public ListingWorkflowService(
            ListingRepository listingRepository,
            ApplicationEventPublisher applicationEventPublisher,
            ListingOwnershipGuard listingOwnershipGuard,
            ProximityDuplicateService proximityDuplicateService,
            ListingTransitionPolicy policy,
            ListingStatusHistoryRepository statusHistoryRepository) {
        this.listingRepository = listingRepository;
        this.applicationEventPublisher = applicationEventPublisher;
        this.listingOwnershipGuard = listingOwnershipGuard;
        this.proximityDuplicateService = proximityDuplicateService;
        this.policy = policy;
        this.statusHistoryRepository = statusHistoryRepository;
    }

    /**
     * Submit a listing for review. Validates all required fields and transitions
     * status from DRAFT/REJECTED to PENDING_REVIEW.
     *
     * @throws ListingNotFoundException  if listing not found or not owned
     * @throws ListingStatusException    if current status does not allow submission
     * @throws ListingValidationException if validation rules fail (422)
     */
    @Transactional
    public Listing submitListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, userId, isAdmin);

        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(previousStatus, ListingStatus.PENDING_REVIEW, ActorType.BROKER);

        List<Map<String, String>> errors = validateForSubmission(listing);
        if (!errors.isEmpty()) {
            throw new ListingValidationException(errors);
        }

        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setSubmittedAt(OffsetDateTime.now());
        listing.setReviewSubmittedAt(Instant.now());
        listing.setSubmissionCount(listing.getSubmissionCount() + 1);
        listing.setStatusChangedAt(Instant.now());
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(userId);
        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(userId);
        history.setActionedSubmissionCount(listing.getSubmissionCount());
        statusHistoryRepository.save(history);

        log.info("Submitted listing listingId={} by userId={} status=PENDING_REVIEW fromStatus={}",
                listingId, userId, previousStatus);
        return saved;
    }

    /**
     * Admin approves a listing: PENDING_REVIEW -> LIVE.
     * Creates a notification for the listing owner.
     *
     * @throws ListingNotFoundException if listing not found
     * @throws ListingStatusException   if transition is not allowed by the policy
     */
    @Transactional
    public Listing approveListing(UUID listingId, UUID adminUserId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(currentStatus, ListingStatus.LIVE, ActorType.ADMIN);

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setReviewedAt(nowOdt);
        listing.setReviewedBy(adminUserId);
        listing.setUpdatedAt(nowOdt);
        listing.setApprovedAt(now);
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminUserId);

        // Transparency timestamps: firstPublishedAt set only on the first LIVE transition;
        // lastLiveAt is always refreshed.
        if (listing.getFirstPublishedAt() == null) {
            listing.setFirstPublishedAt(nowOdt);
        }
        listing.setLastLiveAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.LIVE.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminUserId);
        statusHistoryRepository.save(history);

        try {
            proximityDuplicateService.detectAndRecord(saved);
        } catch (Exception e) {
            log.warn("Proximity duplicate detection failed for listingId={}: {}",
                    listingId, e.getMessage(), e);
        }

        if (listing.getCreatedBy() != null) {
            String title = Objects.requireNonNullElse(listing.getTitle(), "Untitled");
            applicationEventPublisher.publishEvent(
                    new ListingApprovedEvent(saved, listing.getCreatedBy(), title));
        }

        if (saved.getAreaKey() != null) {
            String listingTitle = Objects.requireNonNullElse(saved.getTitle(), "New property");
            applicationEventPublisher.publishEvent(
                    new NewListingInAreaEvent(saved.getId(), saved.getAreaKey(), saved.getAreaLabel(),
                            listingTitle, saved.getPropertyType(), saved.getPricePaise()));
        }

        log.info("Approved listing listingId={} by adminId={} status=LIVE fromStatus={}",
                listingId, adminUserId, currentStatus);
        return saved;
    }

    /**
     * Admin rejects a listing: PENDING_REVIEW -> REJECTED or LIVE -> REJECTED.
     * Creates a notification for the listing owner.
     *
     * @throws ListingNotFoundException    if listing not found
     * @throws ListingStatusException      if transition is not allowed by the policy
     * @throws ListingLifecycleException   if rejectionReason is null or blank (REASON_CODE_REQUIRED, 422)
     */
    @Transactional
    public Listing rejectListing(UUID listingId, UUID adminUserId, String rejectionReason) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(currentStatus, ListingStatus.REJECTED, ActorType.ADMIN);

        // Defense-in-depth: controller also checks, but service enforces independently
        if (rejectionReason == null || rejectionReason.isBlank()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.REASON_CODE_REQUIRED, "Rejection reason is required");
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setRejectionReason(rejectionReason);
        listing.setReviewedAt(nowOdt);
        listing.setReviewedBy(adminUserId);
        listing.setUpdatedAt(nowOdt);
        listing.setRejectedAt(now);
        listing.setStatusReasonCode(rejectionReason);
        listing.setStatusReasonNote(rejectionReason);
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminUserId);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.REJECTED.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminUserId);
        history.setReasonCode(rejectionReason);
        history.setNote(rejectionReason);
        statusHistoryRepository.save(history);

        if (listing.getCreatedBy() != null) {
            String title = Objects.requireNonNullElse(listing.getTitle(), "Untitled");
            applicationEventPublisher.publishEvent(
                    new ListingRejectedEvent(saved, listing.getCreatedBy(), title, rejectionReason));
        }

        log.info("Rejected listing listingId={} by adminId={} fromStatus={} reason='{}'",
                listingId, adminUserId, currentStatus, rejectionReason);
        return saved;
    }

    /**
     * Admin returns a PENDING_REVIEW listing to DRAFT with a required note.
     * This is NOT a rejection — {@code rejectedAt} is not set. The broker can
     * address the note and resubmit.
     *
     * @param listingId  the listing to return for edits
     * @param adminId    the admin performing the action
     * @param reasonNote mandatory note explaining what needs to change (422 if blank/null)
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingStatusException    if transition is not allowed by the policy
     * @throws ListingLifecycleException if reasonNote is null or blank (RETURN_NOTE_REQUIRED, 422)
     */
    @Transactional
    public Listing returnForEdits(UUID listingId, UUID adminId, String reasonNote) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(currentStatus, ListingStatus.DRAFT, ActorType.ADMIN);

        // Defense-in-depth: controller also checks, but service enforces independently
        if (reasonNote == null || reasonNote.isBlank()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.RETURN_NOTE_REQUIRED, "Return-for-edits note is required");
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setStatusReasonNote(reasonNote);
        listing.setReviewSubmittedAt(null);
        // Do NOT set rejectedAt — this is not a rejection
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminId);
        listing.setUpdatedAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.DRAFT.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminId);
        history.setNote(reasonNote);
        statusHistoryRepository.save(history);

        // TODO: publish ReturnForEditsEvent for broker notification (RE-??? deferred)

        log.info("Returned listing for edits listingId={} by adminId={} fromStatus={} toStatus=DRAFT note='{}'",
                listingId, adminId, currentStatus, reasonNote);
        return saved;
    }

    /**
     * Dealer archives own listing: LIVE/DRAFT/REJECTED -> ARCHIVED.
     * Uses the transition policy to validate the state change.
     *
     * @param listingId  the listing to archive
     * @param actorId    the broker/dealer performing the action (must own the listing)
     * @param reasonNote optional note explaining why the listing is being archived
     * @throws ListingNotFoundException if listing not found or not owned
     * @throws ListingStatusException   if transition is not allowed by the policy
     */
    @Transactional
    public void archiveListing(UUID listingId, UUID actorId, String reasonNote) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, actorId, false);
        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());

        policy.validate(previousStatus, ListingStatus.ARCHIVED, ActorType.BROKER);

        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(Instant.now());
        listing.setStatusChangedAt(Instant.now());
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(actorId);
        if (reasonNote != null && !reasonNote.isBlank()) {
            listing.setStatusReasonNote(reasonNote);
        }
        listing.setUpdatedAt(OffsetDateTime.now());

        listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.ARCHIVED.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(actorId);
        if (reasonNote != null && !reasonNote.isBlank()) {
            history.setNote(reasonNote);
        }
        statusHistoryRepository.save(history);

        log.info("Archived listing listingId={} by actorId={} fromStatus={}", listingId, actorId, previousStatus);
    }

    /**
     * Dealer withdraws a listing from review: PENDING_REVIEW -> DRAFT.
     * Clears {@code reviewSubmittedAt} so the listing can be resubmitted later.
     *
     * <p><b>Race-condition guard (SUBMISSION_ALREADY_ACTIONED):</b> If an admin has
     * already approved or rejected this submission (a history row exists with
     * from_status=PENDING_REVIEW and to_status in {LIVE, REJECTED} after
     * {@code reviewSubmittedAt}), the withdrawal is rejected with HTTP 409.
     *
     * @param listingId the listing to withdraw from review
     * @param actorId   the broker/dealer performing the action (must own the listing)
     * @throws ListingNotFoundException  if listing not found or not owned
     * @throws ListingOwnershipException if the listing is not owned by the actor (via findOwned)
     * @throws ListingStatusException    if transition is not allowed by the policy (e.g. listing is not PENDING_REVIEW)
     * @throws ListingLifecycleException if admin has already acted on this submission (SUBMISSION_ALREADY_ACTIONED, 409)
     */
    @Transactional
    public void withdrawListingFromReview(UUID listingId, UUID actorId) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, actorId, false);
        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());

        policy.validate(previousStatus, ListingStatus.DRAFT, ActorType.BROKER);

        // Guard: admin must not have already approved or rejected this submission
        Instant reviewSubmittedAt = listing.getReviewSubmittedAt();
        if (reviewSubmittedAt != null
                && statusHistoryRepository.existsAdminActionAfter(listingId, reviewSubmittedAt)) {
            throw new ListingLifecycleException(
                    ListingErrorCode.SUBMISSION_ALREADY_ACTIONED,
                    "Admin has already acted on this submission — withdrawal not allowed");
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setReviewSubmittedAt(null);
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(actorId);
        listing.setUpdatedAt(nowOdt);

        listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.DRAFT.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(actorId);
        statusHistoryRepository.save(history);

        log.info("Withdrew listing from review listingId={} by actorId={} fromStatus={} toStatus=DRAFT",
                listingId, actorId, previousStatus);
    }

    /**
     * Dealer reopens a rejected listing back to DRAFT for editing.
     * Preserves {@code rejectedAt} — the rejection timestamp remains for audit.
     *
     * @param listingId the listing to reopen
     * @param actorId   the broker/dealer performing the action (must own the listing)
     * @throws ListingNotFoundException if listing not found or not owned
     * @throws ListingStatusException   if transition is not allowed by the policy (e.g. listing is not REJECTED)
     */
    @Transactional
    public void reopenRejectedListing(UUID listingId, UUID actorId) {
        // REJECTED listings are NOT filtered by findOwned(), so this works
        Listing listing = listingOwnershipGuard.findOwned(listingId, actorId, false);
        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());

        policy.validate(previousStatus, ListingStatus.DRAFT, ActorType.BROKER);

        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        // Do NOT clear rejectedAt — preserve per AC
        listing.setStatusChangedAt(Instant.now());
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(actorId);
        listing.setUpdatedAt(OffsetDateTime.now());

        listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.DRAFT.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(actorId);
        statusHistoryRepository.save(history);

        log.info("Reopened rejected listing listingId={} by actorId={} fromStatus={} toStatus=DRAFT",
                listingId, actorId, previousStatus);
    }

    /**
     * Dealer reopens an archived listing back to DRAFT for editing.
     * Clears {@code archivedAt} so the listing becomes visible to owner-scoped operations again.
     *
     * <p><b>CRITICAL:</b> Cannot use {@link ListingOwnershipGuard#findOwned(UUID, UUID, boolean)}
     * because it rejects archived listings ({@code archivedAt != null} throws
     * {@link ListingNotFoundException}). Uses {@code listingRepository.findById()} with a
     * manual ownership check instead.
     *
     * @param listingId the listing to reopen
     * @param actorId   the broker/dealer performing the action (must own the listing)
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingOwnershipException if the listing is not owned by the actor
     * @throws ListingStatusException    if transition is not allowed by the policy (e.g. listing is not ARCHIVED)
     */
    @Transactional
    public void reopenArchivedListingAsDraft(UUID listingId, UUID actorId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        // Manual ownership check — findOwned() cannot be used for archived listings
        if (!actorId.equals(listing.getCreatedBy())) {
            throw new ListingOwnershipException(listingId);
        }

        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());

        policy.validate(previousStatus, ListingStatus.DRAFT, ActorType.BROKER);

        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setArchivedAt(null);  // Clear archivedAt per AC
        listing.setStatusChangedAt(Instant.now());
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(actorId);
        listing.setUpdatedAt(OffsetDateTime.now());

        listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.DRAFT.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(actorId);
        statusHistoryRepository.save(history);

        log.info("Reopened archived listing listingId={} by actorId={} fromStatus={} toStatus=DRAFT",
                listingId, actorId, previousStatus);
    }

    /**
     * Dealer fast-restores an archived listing directly to LIVE.
     * Only eligible if the listing was previously published ({@code firstPublishedAt != null}).
     *
     * <p><b>CRITICAL:</b> Cannot use {@link ListingOwnershipGuard#findOwned(UUID, UUID, boolean)}
     * because it rejects archived listings ({@code archivedAt != null} throws
     * {@link ListingNotFoundException}). Uses {@code listingRepository.findById()} with a
     * manual ownership check instead.
     *
     * @param listingId the listing to restore
     * @param actorId   the broker/dealer performing the action (must own the listing)
     * @throws ListingNotFoundException   if listing not found
     * @throws ListingOwnershipException  if the listing is not owned by the actor
     * @throws ListingLifecycleException  if listing was never published (FAST_RESTORE_NOT_ELIGIBLE, 422)
     * @throws ListingStatusException     if transition is not allowed by the policy (e.g. listing is not ARCHIVED)
     */
    @Transactional
    public Listing restoreArchivedListing(UUID listingId, UUID actorId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        // Manual ownership check — findOwned() cannot be used for archived listings
        if (!actorId.equals(listing.getCreatedBy())) {
            throw new ListingOwnershipException(listingId);
        }

        // Fast-restore eligibility: listing must have been published at least once
        if (listing.getFirstPublishedAt() == null) {
            throw new ListingLifecycleException(
                    ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                    "Listing was never published — use reopen-to-draft instead");
        }

        ListingStatus previousStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(previousStatus, ListingStatus.LIVE, ActorType.BROKER);

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setArchivedAt(null);
        listing.setLastLiveAt(nowOdt);
        // firstPublishedAt is write-once — preserved (never overwritten)
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.BROKER);
        listing.setStatusChangedByActorId(actorId);
        listing.setUpdatedAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(previousStatus.toDbValue());
        history.setToStatus(ListingStatus.LIVE.toDbValue());
        history.setActorType(ActorType.BROKER);
        history.setActorId(actorId);
        statusHistoryRepository.save(history);

        log.info("Fast-restored archived listing listingId={} by actorId={} fromStatus={} toStatus=LIVE",
                listingId, actorId, previousStatus);
        return saved;
    }

    /**
     * Admin-only: restores a REJECTED listing directly to LIVE with a required moderation note.
     * This is an exceptional admin override — no event publishing, no duplicate detection.
     *
     * <p><b>CRITICAL:</b> An explicit REJECTED-only guard runs BEFORE {@code policy.validate()}
     * because the policy allows ADMIN→LIVE from multiple statuses. This method must only
     * operate on REJECTED listings.
     *
     * @param listingId      the listing to restore
     * @param adminId        the admin performing the action
     * @param moderationNote mandatory note explaining the restoration (422 if blank/null)
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingStatusException    if listing is not currently REJECTED (explicit guard)
     * @throws ListingLifecycleException if moderationNote is null or blank (MODERATION_NOTE_REQUIRED, 422)
     */
    @Transactional
    public Listing restoreRejectedListing(UUID listingId, UUID adminId, String moderationNote) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());

        // Explicit REJECTED-only guard — policy allows ADMIN→LIVE from 5 statuses,
        // but this method must only operate on REJECTED listings
        if (currentStatus != ListingStatus.REJECTED) {
            throw new ListingStatusException(
                    "restoreRejectedListing requires REJECTED status, found " + currentStatus);
        }

        policy.validate(currentStatus, ListingStatus.LIVE, ActorType.ADMIN);

        // Defense-in-depth: controller also checks, but service enforces independently
        if (moderationNote == null || moderationNote.isBlank()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.MODERATION_NOTE_REQUIRED, "Moderation note is required");
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setApprovedAt(now);
        listing.setLastLiveAt(nowOdt);
        if (listing.getFirstPublishedAt() == null) {
            listing.setFirstPublishedAt(nowOdt);
        }
        listing.setStatusReasonNote(moderationNote);
        listing.setReviewedAt(nowOdt);
        listing.setReviewedBy(adminId);
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminId);
        listing.setUpdatedAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.LIVE.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminId);
        history.setNote(moderationNote);
        statusHistoryRepository.save(history);

        // No event publishing — exceptional admin override path

        log.info("Restored rejected listing listingId={} by adminId={} fromStatus={} toStatus=LIVE note='{}'",
                listingId, adminId, currentStatus, moderationNote);
        return saved;
    }

    /**
     * Admin-only force-archive: sets {@code status = ARCHIVED} and {@code archived_at = now()}
     * regardless of the listing's current status.  Idempotent — if the listing is already
     * ARCHIVED the method returns {@code false} without saving or re-auditing.
     *
     * @return {@code true} if the listing was actually archived; {@code false} if it was
     *         already ARCHIVED (no-op path — caller must not write a second audit row)
     * @throws ListingNotFoundException if the listing does not exist
     */
    @Transactional
    public boolean adminForceDelete(UUID listingId, UUID adminId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        if (ListingStatus.ARCHIVED.toDbValue().equals(listing.getStatus())) {
            log.info("adminForceDelete: listingId={} already ARCHIVED — no-op", listingId);
            return false;
        }

        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(Instant.now());
        listing.setUpdatedAt(OffsetDateTime.now());
        listingRepository.save(listing);
        log.info("adminForceDelete: archived listingId={} by adminId={}", listingId, adminId);
        return true;
    }

    /**
     * Admin-only: restores an archived listing to DRAFT status.
     * Clears {@code archived_at} and sets {@code status = DRAFT}.
     * Returns 409 (via {@link ListingNotArchivedException}) if the listing is not currently archived.
     *
     * @throws ListingNotFoundException    if listing does not exist
     * @throws ListingNotArchivedException if the listing is not currently archived (409)
     */
    @Transactional
    public Listing restoreListing(UUID listingId, UUID adminId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        if (listing.getArchivedAt() == null) {
            throw new ListingNotArchivedException(listingId);
        }

        listing.setArchivedAt(null);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);
        log.info("Restored listing listingId={} to status=DRAFT by adminId={}", listingId, adminId);
        return saved;
    }

    /**
     * Admin claims a scraped listing by assigning an owner and transitioning to DRAFT.
     * SCRAPED listings have no owner ({@code createdBy} is null); this method assigns one.
     *
     * <p><b>CRITICAL:</b> Uses {@code listingRepository.findById()} (not findOwned) because
     * SCRAPED listings have no owner and would fail the ownership guard.
     *
     * @param listingId the scraped listing to claim
     * @param ownerId   the broker/dealer to assign as owner
     * @param adminId   the admin performing the action
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingStatusException    if transition is not allowed by the policy (e.g. not SCRAPED)
     * @throws ListingLifecycleException if listing already has an owner (ALREADY_CLAIMED, 422)
     */
    @Transactional
    public Listing claimScrapedListing(UUID listingId, UUID ownerId, UUID adminId) {
        Objects.requireNonNull(ownerId, "ownerId must not be null");

        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(currentStatus, ListingStatus.DRAFT, ActorType.ADMIN);

        // Guard: prevent silent owner reassignment
        if (listing.getCreatedBy() != null) {
            throw new ListingLifecycleException(
                    ListingErrorCode.ALREADY_CLAIMED,
                    "Listing already has an owner — cannot reassign");
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminId);
        listing.setUpdatedAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.DRAFT.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminId);
        statusHistoryRepository.save(history);

        log.info("Claimed scraped listing listingId={} ownerId={} by adminId={} fromStatus={} toStatus=DRAFT",
                listingId, ownerId, adminId, currentStatus);
        return saved;
    }

    /**
     * Admin approves a scraped listing directly to LIVE (exceptional path).
     * Requires the listing to be claimed (have an owner) and to pass completeness validation.
     *
     * <p>No event publishing for now — SCRAPED to LIVE is an admin-only exceptional path.
     *
     * @param listingId the scraped listing to approve
     * @param adminId   the admin performing the action
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingStatusException    if transition is not allowed by the policy (e.g. not SCRAPED)
     * @throws ListingLifecycleException if listing has no owner (LISTING_NOT_CLAIMED, 422)
     * @throws ListingLifecycleException if listing fails completeness validation (LISTING_INCOMPLETE, 422)
     */
    @Transactional
    public Listing approveScrapedListing(UUID listingId, UUID adminId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        ListingStatus currentStatus = ListingStatus.fromDbValue(listing.getStatus());
        policy.validate(currentStatus, ListingStatus.LIVE, ActorType.ADMIN);

        // Guard: listing must be claimed before direct approval
        if (listing.getCreatedBy() == null) {
            throw new ListingLifecycleException(
                    ListingErrorCode.LISTING_NOT_CLAIMED,
                    "Listing must be claimed before direct approval");
        }

        // Completeness guard: reuse the same validation as submitListing
        List<Map<String, String>> errors = validateForSubmission(listing);
        if (!errors.isEmpty()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.LISTING_INCOMPLETE,
                    "Listing is incomplete: " + errors.get(0).get("message"));
        }

        Instant now = Instant.now();
        OffsetDateTime nowOdt = OffsetDateTime.now();

        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setReviewedAt(nowOdt);
        listing.setReviewedBy(adminId);
        listing.setApprovedAt(now);
        listing.setStatusChangedAt(now);
        listing.setStatusChangedByActorType(ActorType.ADMIN);
        listing.setStatusChangedByActorId(adminId);
        listing.setUpdatedAt(nowOdt);

        // Transparency timestamps
        if (listing.getFirstPublishedAt() == null) {
            listing.setFirstPublishedAt(nowOdt);
        }
        listing.setLastLiveAt(nowOdt);

        Listing saved = listingRepository.save(listing);

        ListingStatusHistory history = new ListingStatusHistory();
        history.setListingId(listing.getId());
        history.setFromStatus(currentStatus.toDbValue());
        history.setToStatus(ListingStatus.LIVE.toDbValue());
        history.setActorType(ActorType.ADMIN);
        history.setActorId(adminId);
        statusHistoryRepository.save(history);

        log.info("Approved scraped listing listingId={} by adminId={} fromStatus={} toStatus=LIVE",
                listingId, adminId, currentStatus);
        return saved;
    }

    private List<Map<String, String>> validateForSubmission(Listing listing) {
        List<Map<String, String>> errors = new ArrayList<>();

        String purpose = listing.getListingPurpose();
        boolean isRental = "rent".equals(purpose);

        // Sale listings require price > 0; rental listings require monthlyRent > 0
        if (isRental) {
            if (listing.getMonthlyRent() == null || listing.getMonthlyRent() <= 0) {
                errors.add(Map.of("field", "monthly_rent", "message", "Monthly rent must be greater than 0 for rental listings"));
            }
            if (listing.getSecurityDepositMonths() == null) {
                errors.add(Map.of("field", "security_deposit_months", "message", "Security deposit months is required for rental listings"));
            }
        } else {
            if (listing.getPrice() == null || listing.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                errors.add(Map.of("field", "price", "message", "Price must be greater than 0"));
            }
        }

        // Always-required: property_type in allowed set
        String propertyType = listing.getPropertyType();
        if (propertyType == null || !SUBMITTABLE_PROPERTY_TYPES.contains(propertyType)) {
            errors.add(Map.of("field", "property_type",
                    "message", "Property type must be one of: " + String.join(", ", SUBMITTABLE_PROPERTY_TYPES)));
        }

        // Always-required: locality non-empty
        if (listing.getLocality() == null || listing.getLocality().isBlank()) {
            errors.add(Map.of("field", "locality", "message", "Locality is required"));
        }

        // Always-required: address_confirmed = true
        if (!listing.isAddressConfirmed()) {
            errors.add(Map.of("field", "address_confirmed",
                    "message", "Address must be confirmed before submission"));
        }

        // Always-required: >= 3 images
        long imageCount = listingRepository.countImagesByListingId(listing.getId());
        if (imageCount < MIN_IMAGES) {
            errors.add(Map.of("field", "images",
                    "message", "At least " + MIN_IMAGES + " images required (found " + imageCount + ")"));
        }

        // Property-type-specific validation (only if type is valid)
        if (propertyType != null && SUBMITTABLE_PROPERTY_TYPES.contains(propertyType)) {
            switch (propertyType) {
                case "land" -> {
                    if (listing.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for land listings"));
                    }
                    if (listing.getLandAreaUnit() == null || listing.getLandAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "land_area_unit",
                                "message", "Land area unit is required for land listings"));
                    }
                }
                case "apartment" -> {
                    if (listing.getBedrooms() == null) {
                        errors.add(Map.of("field", "bedrooms",
                                "message", "Bedrooms is required for apartment listings"));
                    }
                    if (listing.getBuiltArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area is required for apartment listings"));
                    }
                    if (listing.getBuiltAreaUnit() == null || listing.getBuiltAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "built_area_unit",
                                "message", "Built area unit is required for apartment listings"));
                    }
                }
                case "commercial" -> {
                    if (listing.getCarpetArea() == null) {
                        errors.add(Map.of("field", "carpet_area",
                                "message", "Carpet area is required for commercial listings"));
                    }
                    if (listing.getFloorNumber() == null) {
                        errors.add(Map.of("field", "floor_number",
                                "message", "Floor number is required for commercial listings"));
                    }
                }
                case "commercial_building" -> {
                    if (listing.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for commercial building listings"));
                    }
                    if (listing.getBuiltArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area is required for commercial building listings"));
                    }
                    if (listing.getTotalFloors() == null) {
                        errors.add(Map.of("field", "total_floors",
                                "message", "Total floors is required for commercial building listings"));
                    }
                }
                case "warehouse" -> {
                    if (listing.getBuiltArea() == null && listing.getLandArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area or land area is required for warehouse listings"));
                    }
                }
                case "commercial_land" -> {
                    if (listing.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for commercial land listings"));
                    }
                    if (listing.getLandAreaUnit() == null || listing.getLandAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "land_area_unit",
                                "message", "Land area unit is required for commercial land listings"));
                    }
                }
                // house: no additional required fields
            }
        }

        return errors;
    }
}
