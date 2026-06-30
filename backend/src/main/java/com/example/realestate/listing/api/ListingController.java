package com.example.realestate.listing.api;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.crud.BrokerDashboardService;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.exception.OwnerListingLimitException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Dealer listing CRUD endpoints.
 * All endpoints require DEALER or ADMIN role (looked up from user_roles table).
 * Dealers can only operate on their own listings; admins can operate on any.
 */
@RestController
@RequestMapping("/api/listings")
public class ListingController {

    private static final Logger log = LoggerFactory.getLogger(ListingController.class);
    /**
     * Karnataka RERA registration number format (e.g. PRM/KA/2023/0042).
     * Canonical definition lives in {@link ListingResponse#RERA_PATTERN}.
     */
    static final java.util.regex.Pattern RERA_PATTERN = ListingResponse.RERA_PATTERN;

    /**
     * Exact, closed set of listingPurpose values that permit rental/lease terms
     * (monthlyRent, securityDepositMonths, lockInMonths).
     *
     * <p>Stored as upper-case strings; callers must normalise with
     * {@code trim().toUpperCase(Locale.ROOT)} before lookup.
     *
     * <p>Design note: this is a local literal set, intentionally NOT wired to any
     * forward-only option class (CommercialFieldOptions, ResidentialFieldOptions, etc.).
     * The wiring guard ({@link ListingFieldWiringGuardTest}) enforces this by scanning
     * every {@code validate*} method body for those class names.
     */
    private static final Set<String> RENTAL_PURPOSES = Set.of("RENT", "LEASE");

    private final ListingCrudService listingCrudService;
    private final ListingWorkflowService listingWorkflowService;
    private final ListingResponseMapper listingResponseMapper;
    private final BrokerDashboardService brokerDashboardService;

    public ListingController(ListingCrudService listingCrudService,
                             ListingWorkflowService listingWorkflowService,
                             ListingResponseMapper listingResponseMapper,
                             BrokerDashboardService brokerDashboardService) {
        this.listingCrudService = listingCrudService;
        this.listingWorkflowService = listingWorkflowService;
        this.listingResponseMapper = listingResponseMapper;
        this.brokerDashboardService = brokerDashboardService;
    }

    @PostMapping
    public ResponseEntity<?> create(CallerInfo caller, @Valid @RequestBody CreateRequest req) {

        String sellerType = "user".equals(caller.role()) ? "owner" : "broker";
        String createVideoUrl = (req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl();
        validateAgriFields(req.waterSource(), req.soilType(), req.roadAccess(),
                req.cultivationStatus(), req.ownershipType(), req.landCategory());
        PropertyFamily createFamily = resolveFamily(req.propertyType());
        validateFamilyFields(createFamily,
                req.bedrooms(), req.washrooms(), req.parkingCount(),
                req.furnishingStatus(), req.commercialUsage(), req.roadFrontageFt(),
                req.numberOfUnits(), req.builtArea(), req.carpetArea(),
                req.floorNumber(), req.totalFloors(),
                req.waterSource(), req.soilType(), req.roadAccess(),
                req.cultivationStatus(), req.landCategory(),
                req.farmhouseAvailable(), req.fencingDone());
        validateRentalFields(req.listingPurpose(),
                req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths());
        try {
            Listing saved = listingCrudService.createDraft(
                    caller.userId(), req.propertyType(), req.title(),
                    req.locality(), req.price(), req.description(),
                    req.landArea(), req.bedrooms(), req.builtArea(),
                    req.landAreaUnit(), req.builtAreaUnit(), createVideoUrl,
                    req.listingPurpose(),
                    req.carpetArea(), req.carpetAreaUnit(),
                    req.floorNumber(), req.totalFloors(),
                    req.furnishingStatus(), req.washrooms(), req.parkingCount(),
                    req.roadFrontageFt(), req.commercialUsage(), req.numberOfUnits(),
                    req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths(),
                    sellerType,
                    req.waterSource(), req.soilType(), req.roadAccess(),
                    req.cultivationStatus(), req.ownershipType(), req.surveyNumber(),
                    req.landCategory(), req.farmhouseAvailable(), req.fencingDone());

            log.info("POST /api/listings -> 201 listingId={} createdBy={} sellerType={}",
                    saved.getId(), caller.userId(), sellerType);
            return ResponseEntity.status(HttpStatus.CREATED).body(listingResponseMapper.toResponse(saved));
        } catch (OwnerListingLimitException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(CallerInfo caller, @PathVariable UUID id) {
        try {
            Listing listing = listingWorkflowService.findListingForCaller(id, caller.userId(), caller.isAdmin());
            return ResponseEntity.ok(listingResponseMapper.toResponse(listing));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        }
    }

    @GetMapping("/mine/stats")
    public ResponseEntity<?> stats(CallerInfo caller) {

        ListingStatsResponse stats = listingCrudService.getListingStats(caller.userId());
        return ResponseEntity.ok(stats);
    }

    /**
     * Returns null-safe quality and completeness aggregates for the caller's listings.
     *
     * <p>Authentication: 401 when no JWT is present (enforced by CallerInfoResolver).
     * Authorization: 403 when the JWT subject's role is not in {dealer, broker, admin, user}
     * (enforced by CallerInfoResolver — mirrors /mine/stats behaviour).
     *
     * <p>Ownership: all SQL predicates scope to {@code created_by = caller.userId()}.
     * The caller's userId is always JWT-derived — never accepted as a request parameter.
     *
     * <p>No per-listing quality_breakdown text is exposed in the response (PII safety).
     */
    @GetMapping("/mine/quality-summary")
    public ResponseEntity<?> qualitySummary(CallerInfo caller) {

        BrokerQualitySummaryResponse summary = brokerDashboardService.getQualitySummary(caller.userId());
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/mine")
    public ResponseEntity<?> mine(
            CallerInfo caller,
            @RequestParam(required = false) String status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {

        Page<Listing> listings = listingCrudService.getListingsByOwner(caller.userId(), status, pageable);

        List<ListingResponse> content = listingResponseMapper.toResponseList(listings.getContent());
        Page<ListingResponse> response = new PageImpl<>(content, listings.getPageable(), listings.getTotalElements());
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(CallerInfo caller,
                                    @PathVariable UUID id,
                                    @Valid @RequestBody UpdateRequest req) {

        validateAgriFields(req.waterSource(), req.soilType(), req.roadAccess(),
                req.cultivationStatus(), req.ownershipType(), req.landCategory());
        if (req.propertyType() != null) {
            PropertyFamily updateFamily = resolveFamily(req.propertyType());
            validateFamilyFields(updateFamily,
                    req.bedrooms(), req.washrooms(), req.parkingCount(),
                    req.furnishingStatus(), req.commercialUsage(), req.roadFrontageFt(),
                    req.numberOfUnits(), req.builtArea(), req.carpetArea(),
                    req.floorNumber(), req.totalFloors(),
                    req.waterSource(), req.soilType(), req.roadAccess(),
                    req.cultivationStatus(), req.landCategory(),
                    req.farmhouseAvailable(), req.fencingDone());
        }
        validateRentalFields(req.listingPurpose(),
                req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths());
        try {
            boolean applyVideo = Boolean.TRUE.equals(req.applyVideoUrl());
            String updateVideoUrl = applyVideo
                    ? ((req.videoUrl() == null || req.videoUrl().isBlank()) ? null : req.videoUrl())
                    : null;
            Listing updated = listingCrudService.updateListing(
                    id, caller.userId(), caller.isAdmin(),
                    req.propertyType(), req.title(), req.locality(),
                    req.price(), req.description(),
                    req.landArea(), req.bedrooms(), req.builtArea(),
                    req.addressConfirmed(), req.latitude(), req.longitude(),
                    req.landAreaUnit(), req.builtAreaUnit(),
                    updateVideoUrl, applyVideo, req.reraNumber(),
                    req.listingPurpose(),
                    req.carpetArea(), req.carpetAreaUnit(),
                    req.floorNumber(), req.totalFloors(),
                    req.furnishingStatus(), req.washrooms(), req.parkingCount(),
                    req.roadFrontageFt(), req.commercialUsage(), req.numberOfUnits(),
                    req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths(),
                    req.possessionStatus(), req.expectedPossessionDate(), req.approvalsDeclared(),
                    req.waterSource(), req.soilType(), req.roadAccess(),
                    req.cultivationStatus(), req.ownershipType(), req.surveyNumber(),
                    req.landCategory(), req.farmhouseAvailable(), req.fencingDone(),
                    req.boundary());
            return ResponseEntity.ok(listingResponseMapper.toResponse(updated));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        } catch (ListingValidationException e) {
            return ResponseEntity.unprocessableEntity().body(Map.of("errors", e.getErrors()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(CallerInfo caller, @PathVariable UUID id) {

        try {
            listingCrudService.deleteListing(id, caller.userId(), caller.isAdmin());
            return ResponseEntity.noContent().build();
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/bulk-delete")
    public ResponseEntity<?> bulkDelete(CallerInfo caller, @RequestBody BulkDeleteRequest req) {

        if (req.ids() == null || req.ids().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "ids must not be empty"));
        }
        if (req.ids().size() > 50) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot delete more than 50 listings at once"));
        }

        BulkDeleteResult result = listingCrudService.bulkDeleteListings(req.ids(), caller.userId(), caller.isAdmin());
        log.info("POST /api/listings/bulk-delete -> deleted={} skipped={} userId={}",
                result.deleted(), result.skipped(), caller.userId());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<?> submit(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing submitted = listingWorkflowService.submitListing(id, caller.userId(), caller.isAdmin());
            log.info("POST /api/listings/{}/submit -> 200 status=PENDING_REVIEW", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(submitted));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        } catch (ListingValidationException e) {
            return ResponseEntity.unprocessableEntity().body(Map.of("errors", e.getErrors()));
        }
    }

    @PostMapping("/{id}/archive")
    public ResponseEntity<?> archive(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing archived = listingWorkflowService.archiveListing(id, caller.userId(), null);
            log.info("POST /api/listings/{}/archive -> 200 status=ARCHIVED", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(archived));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<?> reopen(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing reopened = listingWorkflowService.reopenRejectedListing(id, caller.userId());
            log.info("POST /api/listings/{}/reopen -> 200 status=DRAFT", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(reopened));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/reopen-as-draft")
    public ResponseEntity<?> reopenAsDraft(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing reopened = listingWorkflowService.reopenArchivedListingAsDraft(id, caller.userId());
            log.info("POST /api/listings/{}/reopen-as-draft -> 200 status=DRAFT", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(reopened));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}/withdraw")
    public ResponseEntity<?> withdraw(CallerInfo caller, @PathVariable UUID id) {

        try {
            listingWorkflowService.withdrawListingFromReview(id, caller.userId());
            log.info("PUT /api/listings/{}/withdraw -> 204 status=DRAFT", id);
            return ResponseEntity.noContent().build();
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
        // ListingLifecycleException (SUBMISSION_ALREADY_ACTIONED) handled by GlobalExceptionHandler → 409
    }

    @PutMapping("/{id}/restore")
    public ResponseEntity<?> restore(CallerInfo caller, @PathVariable UUID id) {

        try {
            Listing restored = listingWorkflowService.restoreArchivedListing(id, caller.userId());
            log.info("PUT /api/listings/{}/restore -> 200 status=LIVE", id);
            return ResponseEntity.ok(listingResponseMapper.toResponse(restored));
        } catch (ListingNotFoundException e) {
            return notFound();
        } catch (ListingOwnershipException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Listing belongs to a different broker"));
        } catch (ListingStatusException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
        // ListingLifecycleException (FAST_RESTORE_NOT_ELIGIBLE) handled by GlobalExceptionHandler → 422
    }

    // ===== Validation helpers =====

    /**
     * Validates the 6 agri fields against the canonical option sets in {@link AgriFieldOptions}:
     * {@code waterSource}, {@code soilType}, {@code roadAccess}, {@code cultivationStatus},
     * {@code ownershipType}, and {@code landCategory} (wired M38-10b / #1693).
     *
     * <p>Null or blank values are always accepted (field not supplied).
     * A non-blank value that is not a member of the canonical set is rejected with 400.
     *
     * <p>Design note: Set&lt;String&gt; membership check is used instead of {@code @Pattern}
     * because the canonical sets will evolve as new categories are added, and a set constant
     * is easier to maintain and review than a regex alternation string.
     *
     * @throws org.springframework.web.server.ResponseStatusException HTTP 400 on first invalid field
     */
    private static void validateAgriFields(String waterSource, String soilType,
                                           String roadAccess, String cultivationStatus,
                                           String ownershipType, String landCategory) {
        rejectIfUnknown("waterSource",       waterSource,       AgriFieldOptions.VALID_WATER_SOURCES);
        rejectIfUnknown("soilType",          soilType,          AgriFieldOptions.VALID_SOIL_TYPES);
        rejectIfUnknown("roadAccess",        roadAccess,        AgriFieldOptions.VALID_ROAD_ACCESS_VALUES);
        rejectIfUnknown("cultivationStatus", cultivationStatus, AgriFieldOptions.VALID_CULTIVATION_STATUSES);
        rejectIfUnknown("ownershipType",     ownershipType,     AgriFieldOptions.VALID_OWNERSHIP_TYPES);
        rejectIfUnknown("landCategory",      landCategory,      AgriFieldOptions.VALID_LAND_CATEGORIES);
    }

    private static void rejectIfUnknown(String fieldName, String value, Set<String> validValues) {
        if (value != null && !value.isBlank() && !validValues.contains(value)) {
            String allowed = new java.util.TreeSet<>(validValues).stream()
                    .collect(java.util.stream.Collectors.joining(", "));
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid value for " + fieldName + ": '" + value + "'. "
                            + "Allowed values: " + allowed);
        }
    }

    // ===== Family-level structural validation =====

    /**
     * Property-type families used for structural field presence checks.
     * These are derived from the closed {@link PropertyType} enum — no new values.
     */
    private enum PropertyFamily { RESIDENTIAL, COMMERCIAL, AGRICULTURAL, PLOT }

    /**
     * Resolves the family from the raw propertyType string.
     * Throws HTTP 400 if the value is null, blank, or not a known {@link PropertyType}.
     */
    private static PropertyFamily resolveFamily(String rawType) {
        PropertyType pt;
        try {
            pt = PropertyType.fromValue(rawType);
        } catch (IllegalArgumentException e) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid or missing propertyType: '" + rawType + "'");
        }
        return switch (pt) {
            case HOUSE, APARTMENT -> PropertyFamily.RESIDENTIAL;
            case COMMERCIAL, COMMERCIAL_BUILDING, WAREHOUSE, COMMERCIAL_LAND -> PropertyFamily.COMMERCIAL;
            case AGRICULTURAL_LAND -> PropertyFamily.AGRICULTURAL;
            case LAND, OTHER -> PropertyFamily.PLOT;
        };
    }

    /**
     * Rejects a field that is non-null (and, for Strings, non-blank) when it does not belong
     * to the resolved property-type family.
     *
     * <p>Design note: presence is checked by field existence (non-null / non-blank), NOT by
     * membership in any value set. This keeps the check structural and avoids referencing any
     * forward-only option set (the wiring guard enforces this).
     */
    private static void rejectIfPresent(String fieldName, Object value) {
        boolean present = value != null && !(value instanceof String s && s.isBlank());
        if (present) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Field '" + fieldName + "' is not accepted for this property type");
        }
    }

    /**
     * Per-family forbidden-field guard.
     *
     * <p>Cross-family rejection is STRUCTURAL (field presence, not value membership).
     * Shared fields (floorNumber, totalFloors, washrooms, parkingCount) are valid for
     * both RESIDENTIAL and COMMERCIAL and are NOT listed as forbidden for either family.
     *
     * <p>Family-forbidden mapping:
     * <ul>
     *   <li>RESIDENTIAL: agri-only + commercial-only fields</li>
     *   <li>COMMERCIAL: agri-only + residential BHK (bedrooms)</li>
     *   <li>AGRICULTURAL: parking, BHK, furnishing, commercial fields</li>
     *   <li>PLOT: BHK (bedrooms/washrooms), unit count, floor-plan, unit-area fields</li>
     * </ul>
     */
    @SuppressWarnings("java:S107") // large param count mirrors flat request shape; no abstraction needed here
    private static void validateFamilyFields(PropertyFamily family,
            Integer bedrooms, Integer washrooms, Integer parkingCount,
            String furnishingStatus, String commercialUsage, java.math.BigDecimal roadFrontageFt,
            Integer numberOfUnits, java.math.BigDecimal builtArea, java.math.BigDecimal carpetArea,
            Integer floorNumber, Integer totalFloors,
            String waterSource, String soilType, String roadAccess,
            String cultivationStatus, String landCategory,
            Boolean farmhouseAvailable, Boolean fencingDone) {
        switch (family) {
            case RESIDENTIAL -> {
                // agri-only fields
                rejectIfPresent("waterSource",       waterSource);
                rejectIfPresent("soilType",          soilType);
                rejectIfPresent("roadAccess",        roadAccess);
                rejectIfPresent("cultivationStatus", cultivationStatus);
                rejectIfPresent("landCategory",      landCategory);
                rejectIfPresent("farmhouseAvailable", farmhouseAvailable);
                rejectIfPresent("fencingDone",       fencingDone);
                // commercial-only fields
                rejectIfPresent("commercialUsage",   commercialUsage);
                rejectIfPresent("roadFrontageFt",    roadFrontageFt);
                rejectIfPresent("numberOfUnits",     numberOfUnits);
            }
            case COMMERCIAL -> {
                // agri-only fields
                rejectIfPresent("waterSource",       waterSource);
                rejectIfPresent("soilType",          soilType);
                rejectIfPresent("roadAccess",        roadAccess);
                rejectIfPresent("cultivationStatus", cultivationStatus);
                rejectIfPresent("landCategory",      landCategory);
                rejectIfPresent("farmhouseAvailable", farmhouseAvailable);
                rejectIfPresent("fencingDone",       fencingDone);
                // residential-BHK field
                rejectIfPresent("bedrooms",          bedrooms);
            }
            case AGRICULTURAL -> {
                // parking, BHK, furnishing
                rejectIfPresent("parkingCount",      parkingCount);
                rejectIfPresent("bedrooms",          bedrooms);
                rejectIfPresent("furnishingStatus",  furnishingStatus);
                // commercial-only fields
                rejectIfPresent("commercialUsage",   commercialUsage);
                rejectIfPresent("roadFrontageFt",    roadFrontageFt);
                rejectIfPresent("numberOfUnits",     numberOfUnits);
            }
            case PLOT -> {
                // BHK fields
                rejectIfPresent("bedrooms",          bedrooms);
                rejectIfPresent("washrooms",         washrooms);
                // per-unit field
                rejectIfPresent("numberOfUnits",     numberOfUnits);
                // unit-only floor-plan fields
                rejectIfPresent("builtArea",         builtArea);
                rejectIfPresent("carpetArea",        carpetArea);
                rejectIfPresent("furnishingStatus",  furnishingStatus);
                rejectIfPresent("floorNumber",       floorNumber);
                rejectIfPresent("totalFloors",       totalFloors);
            }
        }
    }

    /**
     * Gates rental/lease terms on listingPurpose.
     *
     * <p>monthlyRent, securityDepositMonths, lockInMonths are accepted only when
     * listingPurpose (trimmed, case-insensitive) exactly equals "RENT" or "LEASE".
     * They are rejected when purpose is null, blank, or any other value (including
     * substrings like "for-sale-not-rent" which would pass a contains check).
     *
     * <p>listingPurpose is NOT validated against any external enum value-set here;
     * only membership in the local {@link #RENTAL_PURPOSES} closed set is tested.
     */
    private static void validateRentalFields(String listingPurpose,
            Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths) {
        boolean hasRentalField = monthlyRent != null
                || securityDepositMonths != null
                || lockInMonths != null;
        if (!hasRentalField) {
            return;
        }
        boolean isRentOrLease = listingPurpose != null && !listingPurpose.isBlank()
                && RENTAL_PURPOSES.contains(listingPurpose.trim().toUpperCase(java.util.Locale.ROOT));
        if (!isRentOrLease) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Rental/lease terms (monthlyRent, securityDepositMonths, lockInMonths) "
                            + "are only accepted when listingPurpose is RENT or LEASE");
        }
    }

    // ===== Response helpers =====

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Listing not found"));
    }

    // ===== Request DTOs (only used within this controller) =====

    public record CreateRequest(
            String propertyType,
            String title,
            String locality,
            BigDecimal price,
            String description,
            BigDecimal landArea,
            Integer bedrooms,
            BigDecimal builtArea,
            String landAreaUnit,
            String builtAreaUnit,
            String videoUrl,
            // Commercial & rent fields
            String listingPurpose,
            BigDecimal carpetArea,
            String carpetAreaUnit,
            Integer floorNumber,
            Integer totalFloors,
            String furnishingStatus,
            Integer washrooms,
            Integer parkingCount,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            Integer numberOfUnits,
            Long monthlyRent,
            Integer securityDepositMonths,
            Integer lockInMonths,
            // Agricultural land fields
            String waterSource,
            String soilType,
            String roadAccess,
            String cultivationStatus,
            String ownershipType,
            String surveyNumber,
            String landCategory,
            Boolean farmhouseAvailable,
            Boolean fencingDone
    ) {}

    public record UpdateRequest(
            String propertyType,
            String title,
            String locality,
            BigDecimal price,
            String description,
            BigDecimal landArea,
            Integer bedrooms,
            BigDecimal builtArea,
            Boolean addressConfirmed,
            Double latitude,
            Double longitude,
            String landAreaUnit,
            String builtAreaUnit,
            String videoUrl,
            Boolean applyVideoUrl,  // true = apply the videoUrl field (null clears, non-null sets)
            @Pattern(regexp = ListingResponse.RERA_REGEXP,
                     message = "must match RERA format: ABC/DE/YYYY/NNNN")
            String reraNumber,
            // Commercial & rent fields
            String listingPurpose,
            BigDecimal carpetArea,
            String carpetAreaUnit,
            Integer floorNumber,
            Integer totalFloors,
            String furnishingStatus,
            Integer washrooms,
            Integer parkingCount,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            Integer numberOfUnits,
            Long monthlyRent,
            Integer securityDepositMonths,
            Integer lockInMonths,
            // RERA & possession fields (RE-99)
            String possessionStatus,
            java.time.LocalDate expectedPossessionDate,
            String approvalsDeclared,
            // Agricultural land fields
            String waterSource,
            String soilType,
            String roadAccess,
            String cultivationStatus,
            String ownershipType,
            String surveyNumber,
            String landCategory,
            Boolean farmhouseAvailable,
            Boolean fencingDone,
            String boundary
    ) {}

    public record BulkDeleteRequest(List<UUID> ids) {}
}
