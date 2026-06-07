package com.example.realestate.listing.workflow;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Centralized listing lifecycle transition policy.
 * <p>
 * Encodes the complete allowed-transition matrix from
 * {@code docs/LISTING_STATE_TRANSITIONS.md} section 9.
 * Every service method that changes listing status must delegate to
 * {@link #validate(ListingStatus, ListingStatus, ActorType)} before
 * persisting the change.
 * <p>
 * <b>Creation transitions excluded:</b> T-01 (new -> DRAFT) and T-30
 * (new -> SCRAPED) have a null {@code from} status and are validated at
 * creation time, not by this policy. They are intentionally absent from the
 * allowed set.
 * <p>
 * <b>DEALER = BROKER mapping:</b> The spec uses "DEALER" for the
 * broker/owner actor. In code this maps to {@link ActorType#BROKER}.
 */
@Component
public class ListingTransitionPolicy {

    // -----------------------------------------------------------------------
    // Constants shared with the guard implementations
    // -----------------------------------------------------------------------

    static final Set<String> SUBMITTABLE_PROPERTY_TYPES = Set.of(
            "land", "house", "apartment",
            "commercial", "commercial_building", "warehouse", "commercial_land",
            "agricultural_land");

    static final int MIN_IMAGES = 3;

    private static final List<String> SNAPSHOT_SCALAR_FIELDS = List.of(
            "title", "description", "pricePaise", "sellerType", "locality",
            "latitude", "longitude", "areaKey", "areaLabel", "areaSqft",
            "bedrooms", "bathrooms", "landArea", "propertyType", "videoUrl");

    // -----------------------------------------------------------------------
    // Dependencies (injected for guard implementations)
    // -----------------------------------------------------------------------

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    /**
     * Snapshot serializer: ALWAYS inclusion so null-valued keys are written as JSON null.
     * Matches the serializer configuration in ListingWorkflowService.
     */
    private final ObjectMapper snapshotMapper;
    private final int maxSubmissionAttempts;

    public ListingTransitionPolicy(
            ListingRepository listingRepository,
            ListingImageRepository imageRepository,
            ObjectMapper objectMapper,
            @Value("${listing.submission.max-attempts:10}") int maxSubmissionAttempts) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.snapshotMapper = objectMapper.copy()
                .setSerializationInclusion(JsonInclude.Include.ALWAYS);
        this.maxSubmissionAttempts = maxSubmissionAttempts;
    }

    /**
     * Immutable triple representing an allowed (from, to, actor) transition.
     */
    private record Transition(ListingStatus from, ListingStatus to, ActorType actor) {}

    /**
     * The complete set of non-creation transitions from the spec (T-02 through T-32,
     * excluding T-01 and T-30 which are creation transitions with null {@code from}).
     * <p>
     * 31 triples total. Each comment references the spec transition ID.
     */
    private static final Set<Transition> ALLOWED = Set.of(
            // --- BROKER (DEALER) transitions (T-02 through T-10) ---
            new Transition(ListingStatus.DRAFT,           ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-02
            new Transition(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-03
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.BROKER),  // T-04
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-05
            new Transition(ListingStatus.REJECTED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-XX (resubmit)
            new Transition(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.BROKER),  // T-06
            new Transition(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.BROKER),  // T-07
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.BROKER),  // T-08
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.BROKER),  // T-09
            // T-10: ARCHIVED -> LIVE for BROKER (fast-restore). Allowed at matrix level per spec.
            // Actual access is gated by the fast-restore guard (TODO: §10.4 guard implementation).
            // Design decision: the guard stub (not this matrix) controls whether the transition
            // actually executes. Blocking it here would prevent the guard from ever being reached.
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.BROKER),  // T-10

            // --- ADMIN transitions (T-11 through T-29) ---
            new Transition(ListingStatus.SCRAPED,         ListingStatus.DRAFT,          ActorType.ADMIN),   // T-11
            new Transition(ListingStatus.SCRAPED,         ListingStatus.LIVE,           ActorType.ADMIN),   // T-12
            new Transition(ListingStatus.SCRAPED,         ListingStatus.REJECTED,       ActorType.ADMIN),   // T-13
            new Transition(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-14
            new Transition(ListingStatus.DRAFT,           ListingStatus.LIVE,           ActorType.ADMIN),   // T-15
            new Transition(ListingStatus.DRAFT,           ListingStatus.REJECTED,       ActorType.ADMIN),   // T-16
            new Transition(ListingStatus.DRAFT,           ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-17
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.LIVE,           ActorType.ADMIN),   // T-18
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.REJECTED,       ActorType.ADMIN),   // T-19
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.DRAFT,          ActorType.ADMIN),   // T-20
            new Transition(ListingStatus.PENDING_REVIEW,  ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-21
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-22
            new Transition(ListingStatus.LIVE,            ListingStatus.REJECTED,       ActorType.ADMIN),   // T-23
            new Transition(ListingStatus.REJECTED,        ListingStatus.DRAFT,          ActorType.ADMIN),   // T-24
            new Transition(ListingStatus.REJECTED,        ListingStatus.LIVE,           ActorType.ADMIN),   // T-25
            new Transition(ListingStatus.REJECTED,        ListingStatus.ARCHIVED,       ActorType.ADMIN),   // T-26
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.DRAFT,          ActorType.ADMIN),   // T-27
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.PENDING_REVIEW, ActorType.ADMIN),   // T-28
            new Transition(ListingStatus.ARCHIVED,        ListingStatus.LIVE,           ActorType.ADMIN),   // T-29

            // --- SYSTEM transitions (T-31 and T-32) ---
            new Transition(ListingStatus.SCRAPED,         ListingStatus.ARCHIVED,       ActorType.SYSTEM),  // T-31
            new Transition(ListingStatus.LIVE,            ListingStatus.ARCHIVED,       ActorType.SYSTEM)   // T-32
    );

    /**
     * Validates that the transition {@code (from, to, actor)} is allowed by the
     * lifecycle matrix.
     * <p>
     * This method enforces structural validity only (is this triple in the allowed set?).
     * Business-level guards (completeness, fast-restore eligibility, reason codes) are
     * evaluated by the calling service <b>after</b> this check passes.
     *
     * @param from  the current listing status (must not be null; creation transitions are
     *              not validated here)
     * @param to    the target listing status (must not be null)
     * @param actor the actor performing the transition (must not be null)
     * @throws IllegalArgumentException if any argument is null
     * @throws ListingStatusException   if the transition is not allowed
     */
    public void validate(ListingStatus from, ListingStatus to, ActorType actor) {
        Objects.requireNonNull(from, "from status must not be null (creation transitions are not validated here)");
        Objects.requireNonNull(to, "to status must not be null");
        Objects.requireNonNull(actor, "actor must not be null");

        if (from == to) {
            throw new ListingStatusException(
                    "Self-transition not allowed: from=" + from + " to=" + to + " actor=" + actor);
        }

        if (!ALLOWED.contains(new Transition(from, to, actor))) {
            throw new ListingStatusException(
                    "Transition not allowed: from=" + from + " to=" + to + " actor=" + actor);
        }
    }

    // -----------------------------------------------------------------------
    // Guards — wired to existing validation logic
    // -----------------------------------------------------------------------

    /**
     * Completeness guard: validates that a listing has all required fields before
     * entering PENDING_REVIEW or LIVE (broker submission path, enforceImageMinimum=true).
     * <p>
     * Applies to transitions: T-02, T-09 (broker submits or resubmits via PENDING_REVIEW).
     * Admin-initiated transitions to LIVE (T-12, T-15, T-18, T-25) use their own
     * inline completeness checks in the service.
     *
     * @param listing the listing to validate; must be a {@link Listing} instance
     * @throws ListingValidationException if any required field is missing or invalid
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.2</a>
     */
    void guardCompleteness(Object listing) {
        Listing l = (Listing) listing;
        List<Map<String, String>> errors = validateFields(l, true);
        if (!errors.isEmpty()) {
            throw new ListingValidationException(errors);
        }
    }

    /**
     * Fast-restore eligibility guard: validates that an ARCHIVED listing may be
     * restored directly to LIVE without re-moderation.
     * <p>
     * Applies to transitions: T-10 (BROKER fast-restore ARCHIVED -> LIVE).
     * Checks: a prior approved snapshot exists and the listing's material fields
     * match that snapshot exactly (image additions/deletions block restore;
     * image reordering is allowed).
     *
     * @param listing the listing to check; must be a {@link Listing} instance
     * @throws ListingLifecycleException FAST_RESTORE_NOT_ELIGIBLE if no snapshot is on record
     *         or if any material field has changed since the last approval
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.4</a>
     */
    void guardFastRestore(Object listing) {
        Listing l = (Listing) listing;
        String storedSnapshotJson = l.getLastApprovedSnapshot();
        if (storedSnapshotJson == null) {
            throw new ListingLifecycleException(
                    ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                    "No approved snapshot on record — fast restore requires a prior approved snapshot");
        }

        List<UUID> currentImageIds = imageRepository.findByListingIdOrderByPositionAsc(l.getId())
                .stream().map(ListingImage::getId).collect(Collectors.toList());
        Map<String, Object> currentMap = buildSnapshotMap(l, currentImageIds);

        JsonNode storedNode;
        JsonNode currentNode;
        try {
            storedNode = snapshotMapper.readTree(storedSnapshotJson);
            currentNode = snapshotMapper.readTree(snapshotMapper.writeValueAsString(currentMap));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to compare snapshot for listing " + l.getId(), e);
        }

        List<String> changedFields = new ArrayList<>();

        for (String field : SNAPSHOT_SCALAR_FIELDS) {
            if (!storedNode.path(field).equals(currentNode.path(field))) {
                changedFields.add(field);
            }
        }

        // imageIds: order-insensitive set comparison
        Set<String> storedImageSet = new HashSet<>();
        storedNode.path("imageIds").forEach(n -> storedImageSet.add(n.asText()));
        Set<String> currentImageSet = new HashSet<>();
        currentNode.path("imageIds").forEach(n -> currentImageSet.add(n.asText()));
        if (!storedImageSet.equals(currentImageSet)) {
            changedFields.add("imageIds");
        }

        if (!changedFields.isEmpty()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                    "Listing has material changes since last approval — use submit-for-review instead",
                    changedFields);
        }
    }

    /**
     * Submission count gate: prevents a listing from being submitted for review
     * more than the configured maximum number of times.
     *
     * @param listing the listing to check; must be a {@link Listing} instance
     * @throws ListingLifecycleException SUBMISSION_LIMIT_EXCEEDED if the listing
     *         has already reached the maximum allowed submission attempts
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Spec section 10.5</a>
     */
    void guardSubmissionCount(Object listing) {
        Listing l = (Listing) listing;
        // submissionCount is incremented AFTER this guard runs (in submitListing),
        // so the check is: current count >= max means one more would exceed the limit.
        if (l.getSubmissionCount() >= maxSubmissionAttempts) {
            throw new ListingLifecycleException(
                    ListingErrorCode.SUBMISSION_LIMIT_EXCEEDED,
                    "Listing has reached the maximum number of submission attempts ("
                            + maxSubmissionAttempts + ")");
        }
    }

    /**
     * Reason code required guard: enforces that transitions into REJECTED always
     * carry a non-null, non-blank reason code.
     *
     * @param reasonCode the rejection reason supplied by the caller
     * @throws ListingLifecycleException REASON_CODE_REQUIRED if reasonCode is null or blank
     * @see <a href="docs/LISTING_STATE_TRANSITIONS.md">Invariant I-03</a>
     */
    void guardReasonCodeRequired(String reasonCode) {
        if (reasonCode == null || reasonCode.isBlank()) {
            throw new ListingLifecycleException(
                    ListingErrorCode.REASON_CODE_REQUIRED, "Rejection reason is required");
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Field-level completeness validation. Mirrors the logic in
     * {@code ListingWorkflowService#validateForSubmission} but lives here so
     * guard methods can enforce it without calling back into the service.
     *
     * @param l                    the listing to validate
     * @param enforceImageMinimum  when {@code true} at least {@value #MIN_IMAGES} images required
     * @return list of field-level error maps; empty means the listing is valid
     */
    private List<Map<String, String>> validateFields(Listing l, boolean enforceImageMinimum) {
        List<Map<String, String>> errors = new ArrayList<>();

        String purpose = l.getListingPurpose();
        boolean isRental = "rent".equals(purpose);

        if (isRental) {
            if (l.getMonthlyRent() == null || l.getMonthlyRent() <= 0) {
                errors.add(Map.of("field", "monthly_rent",
                        "message", "Monthly rent must be greater than 0 for rental listings"));
            }
            if (l.getSecurityDepositMonths() == null) {
                errors.add(Map.of("field", "security_deposit_months",
                        "message", "Security deposit months is required for rental listings"));
            }
        } else {
            if (l.getPrice() == null || l.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                errors.add(Map.of("field", "price", "message", "Price must be greater than 0"));
            }
        }

        String propertyType = l.getPropertyType();
        if (propertyType == null || !SUBMITTABLE_PROPERTY_TYPES.contains(propertyType)) {
            errors.add(Map.of("field", "property_type",
                    "message", "Property type must be one of: " + String.join(", ", SUBMITTABLE_PROPERTY_TYPES)));
        }

        if (l.getLocality() == null || l.getLocality().isBlank()) {
            errors.add(Map.of("field", "locality", "message", "Locality is required"));
        }

        if (!l.isAddressConfirmed()) {
            errors.add(Map.of("field", "address_confirmed",
                    "message", "Address must be confirmed before submission"));
        }

        if (enforceImageMinimum) {
            long imageCount = listingRepository.countImagesByListingId(l.getId());
            if (imageCount < MIN_IMAGES) {
                errors.add(Map.of("field", "images",
                        "message", "At least " + MIN_IMAGES + " images required (found " + imageCount + ")"));
            }
        }

        if (propertyType != null && SUBMITTABLE_PROPERTY_TYPES.contains(propertyType)) {
            switch (propertyType) {
                case "land" -> {
                    if (l.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for land listings"));
                    }
                    if (l.getLandAreaUnit() == null || l.getLandAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "land_area_unit",
                                "message", "Land area unit is required for land listings"));
                    }
                }
                case "apartment" -> {
                    if (l.getBedrooms() == null) {
                        errors.add(Map.of("field", "bedrooms",
                                "message", "Bedrooms is required for apartment listings"));
                    }
                    if (l.getBuiltArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area is required for apartment listings"));
                    }
                    if (l.getBuiltAreaUnit() == null || l.getBuiltAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "built_area_unit",
                                "message", "Built area unit is required for apartment listings"));
                    }
                }
                case "commercial" -> {
                    if (l.getCarpetArea() == null) {
                        errors.add(Map.of("field", "carpet_area",
                                "message", "Carpet area is required for commercial listings"));
                    }
                    if (l.getFloorNumber() == null) {
                        errors.add(Map.of("field", "floor_number",
                                "message", "Floor number is required for commercial listings"));
                    }
                }
                case "commercial_building" -> {
                    if (l.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for commercial building listings"));
                    }
                    if (l.getBuiltArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area is required for commercial building listings"));
                    }
                    if (l.getTotalFloors() == null) {
                        errors.add(Map.of("field", "total_floors",
                                "message", "Total floors is required for commercial building listings"));
                    }
                }
                case "warehouse" -> {
                    if (l.getBuiltArea() == null && l.getLandArea() == null) {
                        errors.add(Map.of("field", "built_area",
                                "message", "Built area or land area is required for warehouse listings"));
                    }
                }
                case "commercial_land" -> {
                    if (l.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for commercial land listings"));
                    }
                    if (l.getLandAreaUnit() == null || l.getLandAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "land_area_unit",
                                "message", "Land area unit is required for commercial land listings"));
                    }
                }
                case "agricultural_land" -> {
                    if (l.getLandArea() == null) {
                        errors.add(Map.of("field", "land_area",
                                "message", "Land area is required for agricultural land listings"));
                    }
                    if (l.getLandAreaUnit() == null || l.getLandAreaUnit().isBlank()) {
                        errors.add(Map.of("field", "land_area_unit",
                                "message", "Land area unit is required for agricultural land listings"));
                    }
                }
                // house: no additional required fields
            }
        }

        return errors;
    }

    /**
     * Builds the snapshot map for fast-restore comparison.
     * All 16 material fields are included; nulls written as JSON null so structure is stable.
     */
    private Map<String, Object> buildSnapshotMap(Listing l, List<UUID> imageIds) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", l.getTitle());
        snapshot.put("description", l.getDescription());
        snapshot.put("pricePaise", l.getPricePaise());
        snapshot.put("sellerType", l.getSellerType());
        snapshot.put("locality", l.getLocality());
        snapshot.put("latitude", l.getLatitude());
        snapshot.put("longitude", l.getLongitude());
        snapshot.put("areaKey", l.getAreaKey());
        snapshot.put("areaLabel", l.getAreaLabel());
        snapshot.put("areaSqft", l.getAreaSqft());
        snapshot.put("bedrooms", l.getBedrooms());
        snapshot.put("bathrooms", l.getBathrooms());
        snapshot.put("landArea", l.getLandArea());
        snapshot.put("propertyType", l.getPropertyType());
        snapshot.put("videoUrl", l.getVideoUrl());
        snapshot.put("imageIds", imageIds);
        return snapshot;
    }
}
