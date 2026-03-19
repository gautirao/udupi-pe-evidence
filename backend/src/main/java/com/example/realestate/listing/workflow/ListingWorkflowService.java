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
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingNotArchivedException;
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
     * @throws ListingStatusException   if status is not PENDING_REVIEW
     */
    @Transactional
    public Listing approveListing(UUID listingId, UUID adminUserId) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        if (!ListingStatus.PENDING_REVIEW.toDbValue().equals(listing.getStatus())) {
            throw new ListingStatusException(
                    "Cannot approve listing with status " + listing.getStatus());
        }

        OffsetDateTime approvedAt = OffsetDateTime.now();
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setReviewedAt(approvedAt);
        listing.setReviewedBy(adminUserId);
        listing.setUpdatedAt(approvedAt);

        // Transparency timestamps: firstPublishedAt set only on the first LIVE transition;
        // lastLiveAt is always refreshed.
        if (listing.getFirstPublishedAt() == null) {
            listing.setFirstPublishedAt(approvedAt);
        }
        listing.setLastLiveAt(approvedAt);

        Listing saved = listingRepository.save(listing);

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

        log.info("Approved listing listingId={} by adminId={} status=LIVE", listingId, adminUserId);
        return saved;
    }

    /**
     * Admin rejects a listing: PENDING_REVIEW -> REJECTED.
     * Creates a notification for the listing owner.
     *
     * @throws ListingNotFoundException if listing not found
     * @throws ListingStatusException   if status is not PENDING_REVIEW
     */
    @Transactional
    public Listing rejectListing(UUID listingId, UUID adminUserId, String rejectionReason) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        if (!ListingStatus.PENDING_REVIEW.toDbValue().equals(listing.getStatus())) {
            throw new ListingStatusException(
                    "Cannot reject listing with status " + listing.getStatus());
        }

        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setRejectionReason(rejectionReason);
        listing.setReviewedAt(OffsetDateTime.now());
        listing.setReviewedBy(adminUserId);
        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);

        if (listing.getCreatedBy() != null) {
            String title = Objects.requireNonNullElse(listing.getTitle(), "Untitled");
            applicationEventPublisher.publishEvent(
                    new ListingRejectedEvent(saved, listing.getCreatedBy(), title, rejectionReason));
        }

        log.info("Rejected listing listingId={} by adminId={} reason='{}'",
                listingId, adminUserId, rejectionReason);
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
