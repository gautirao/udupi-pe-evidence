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
import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.residential.ResidentialListingFields;
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
                req.cultivationStatus(), req.landCategory(), req.agriConversionStatus());
        PropertyFamily createFamily = resolveFamily(req.propertyType());
        validateFamilyOwnershipType(createFamily, req.propertyType(), req.ownershipType());
        validateFamilyFields(createFamily,
                req.bedrooms(), req.washrooms(), req.parkingCount(),
                req.furnishingStatus(), req.commercialUsage(), req.roadFrontageFt(),
                req.numberOfUnits(), req.builtArea(), req.carpetArea(),
                req.floorNumber(), req.totalFloors(),
                req.waterSource(), req.soilType(), req.roadAccess(),
                req.cultivationStatus(), req.landCategory(), req.agriConversionStatus(),
                req.farmhouseAvailable(), req.fencingDone());
        validateRentalFields(req.listingPurpose(),
                req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths());
        validateResidentialFieldSet(createFamily, req.propertyType(), req.listingPurpose(),
                req.bathrooms(), req.balconies(), req.parking2wCount(), req.parking4wCount(),
                req.hasLift(), req.hasPowerBackup(), req.isGated(),
                req.hasGarden(), req.hasTerrace(), req.hasCompound(), req.hasServantRoom(),
                req.propertyAge(), req.residentialWaterSource(), req.amenities(),
                req.isCornerPlot(), req.hasBoundaryWall(), req.isGatedLayout(),
                req.hasWaterConnection(), req.hasElectricityConnection(), req.hasDrainage(),
                req.conversionStatus(), req.khataNumber(), req.propertyTaxPid(),
                req.approvingAuthority(), req.roadWidthFt(), req.plotDimensions(),
                req.maintenancePaise(), req.maintenanceIncluded(), req.priceNegotiable(), req.rentNegotiable(),
                req.preferredTenants(), req.petsAllowed(), req.availabilityTimeline());
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                req.bathrooms(), req.balconies(), req.facing(), req.availabilityTimeline(),
                req.superBuiltArea(), req.superBuiltAreaUnit(), req.propertyAge(), req.residentialWaterSource(),
                req.parking2wCount(), req.parking4wCount(), req.roadWidthFt(), req.plotDimensions(),
                req.conversionStatus(), req.khataNumber(), req.propertyTaxPid(), req.approvingAuthority(),
                req.projectName(), req.builderName(), req.maintenancePaise(),
                req.hasLift(), req.hasPowerBackup(), req.isGated(), req.hasGarden(), req.hasTerrace(),
                req.hasCompound(), req.hasServantRoom(), req.isCornerPlot(), req.hasBoundaryWall(),
                req.isGatedLayout(), req.hasWaterConnection(), req.hasElectricityConnection(), req.hasDrainage(),
                req.priceNegotiable(), req.rentNegotiable(), req.petsAllowed(), req.maintenanceIncluded(),
                req.amenities(), req.specialLocationViews(), req.preferredTenants());
        // Commercial typed listing fields (M38-FU2 / #1730)
        String createCommercialSubtype = createFamily == PropertyFamily.COMMERCIAL
                ? resolveCommercialSubtype(req.propertyType(), req.commercialSubtype(), true)
                : null;
        validateCommercialFields(createFamily, createCommercialSubtype,
                req.floorChoice(), req.floorMode(), req.hubType(),
                req.commercialFurnishingStatus(), req.commercialOwnership(), req.occupancyStatus(),
                req.warehouseFlooring(), req.commercialAvailability(), req.commercialAreaUnit(),
                req.suitableUses(), req.utilities());
        validateCommercialFieldSet(createFamily, createCommercialSubtype, req.listingPurpose(),
                req.floorChoice(), req.floorMode(), req.hubType(),
                req.washroomsPublic(), req.washroomsPrivate(),
                req.parkingPublicCount(), req.parkingPrivateCount(),
                req.officeSeats(), req.officeCabins(), req.officeMeetingRooms(),
                req.occupancyStatus(), req.powerLoadKva(),
                req.warehouseClearHeightFt(), req.warehouseLoadingBays(),
                req.warehouseTruckAccess(), req.warehouseFlooring(),
                req.commercialZoning(), req.commercialOwnership(), req.commercialApprovals(),
                req.expectedRentalYieldPct(), req.currentMonthlyIncomePaise(),
                req.leaseTermMonths(), req.leaseEscalationPct(),
                req.commercialFurnishingStatus(), req.commercialAvailability(), req.commercialAreaUnit(),
                req.suitableUses(), req.utilities());
        CommercialListingFields commercialFields = new CommercialListingFields(
                createCommercialSubtype, req.floorChoice(), req.floorMode(), req.hubType(),
                req.washroomsPublic(), req.washroomsPrivate(), req.parkingPublicCount(), req.parkingPrivateCount(),
                req.officeSeats(), req.officeCabins(), req.officeMeetingRooms(),
                req.occupancyStatus(), req.powerLoadKva(),
                req.warehouseClearHeightFt(), req.warehouseLoadingBays(),
                req.warehouseTruckAccess(), req.warehouseFlooring(),
                req.commercialZoning(), req.commercialOwnership(), req.commercialApprovals(),
                req.expectedRentalYieldPct(), req.currentMonthlyIncomePaise(),
                req.leaseTermMonths(), req.leaseEscalationPct(),
                req.commercialFurnishingStatus(), req.commercialAvailability(), req.commercialAreaUnit(),
                req.suitableUses(), req.utilities());
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
                    req.landCategory(), req.agriConversionStatus(), req.farmhouseAvailable(), req.fencingDone(),
                    residentialFields, commercialFields);

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
                req.cultivationStatus(), req.landCategory(), req.agriConversionStatus());
        try {
            // Resolve the EFFECTIVE property type for validation purposes: use the incoming
            // propertyType when the request supplies one; otherwise fall back to the existing
            // listing's stored propertyType (mirrors ListingCrudService#updateListing's
            // effectivePropertyType resolution). Every other field on this PUT is optional, so a
            // request that omits propertyType must still run the full residential/PLOT validation
            // matrix against the listing's real (existing) type — never skip it (#1626).
            // Cached lazily: also reused below to resolve the STORED commercialSubtype when the
            // request omits it for the ambiguous 'commercial' propertyType (#1730 Finding 1) —
            // avoids a second fetch when both fallbacks are needed on the same request.
            Listing existingForValidation = null;
            String effectivePropertyType = req.propertyType();
            if (effectivePropertyType == null) {
                existingForValidation = listingWorkflowService.findListingForCaller(
                        id, caller.userId(), caller.isAdmin());
                effectivePropertyType = existingForValidation.getPropertyType();
            }
            PropertyFamily updateFamily = resolveFamily(effectivePropertyType);
            validateFamilyOwnershipType(updateFamily, effectivePropertyType, req.ownershipType());
            validateFamilyFields(updateFamily,
                    req.bedrooms(), req.washrooms(), req.parkingCount(),
                    req.furnishingStatus(), req.commercialUsage(), req.roadFrontageFt(),
                    req.numberOfUnits(), req.builtArea(), req.carpetArea(),
                    req.floorNumber(), req.totalFloors(),
                    req.waterSource(), req.soilType(), req.roadAccess(),
                    req.cultivationStatus(), req.landCategory(), req.agriConversionStatus(),
                    req.farmhouseAvailable(), req.fencingDone());
            validateResidentialFieldSet(updateFamily, effectivePropertyType, req.listingPurpose(),
                    req.bathrooms(), req.balconies(), req.parking2wCount(), req.parking4wCount(),
                    req.hasLift(), req.hasPowerBackup(), req.isGated(),
                    req.hasGarden(), req.hasTerrace(), req.hasCompound(), req.hasServantRoom(),
                    req.propertyAge(), req.residentialWaterSource(), req.amenities(),
                    req.isCornerPlot(), req.hasBoundaryWall(), req.isGatedLayout(),
                    req.hasWaterConnection(), req.hasElectricityConnection(), req.hasDrainage(),
                    req.conversionStatus(), req.khataNumber(), req.propertyTaxPid(),
                    req.approvingAuthority(), req.roadWidthFt(), req.plotDimensions(),
                    req.maintenancePaise(), req.maintenanceIncluded(), req.priceNegotiable(), req.rentNegotiable(),
                    req.preferredTenants(), req.petsAllowed(), req.availabilityTimeline());
            validateRentalFields(req.listingPurpose(),
                    req.monthlyRent(), req.securityDepositMonths(), req.lockInMonths());
            ResidentialListingFields residentialFields = new ResidentialListingFields(
                    req.bathrooms(), req.balconies(), req.facing(), req.availabilityTimeline(),
                    req.superBuiltArea(), req.superBuiltAreaUnit(), req.propertyAge(), req.residentialWaterSource(),
                    req.parking2wCount(), req.parking4wCount(), req.roadWidthFt(), req.plotDimensions(),
                    req.conversionStatus(), req.khataNumber(), req.propertyTaxPid(), req.approvingAuthority(),
                    req.projectName(), req.builderName(), req.maintenancePaise(),
                    req.hasLift(), req.hasPowerBackup(), req.isGated(), req.hasGarden(), req.hasTerrace(),
                    req.hasCompound(), req.hasServantRoom(), req.isCornerPlot(), req.hasBoundaryWall(),
                    req.isGatedLayout(), req.hasWaterConnection(), req.hasElectricityConnection(), req.hasDrainage(),
                    req.priceNegotiable(), req.rentNegotiable(), req.petsAllowed(), req.maintenanceIncluded(),
                    req.amenities(), req.specialLocationViews(), req.preferredTenants());
            // Commercial typed listing fields (M38-FU2 / #1730)
            String updateCommercialSubtype = updateFamily == PropertyFamily.COMMERCIAL
                    ? resolveCommercialSubtype(effectivePropertyType, req.commercialSubtype(), false)
                    : null;
            // Finding 1 (data-correctness AC3): when the ambiguous 'commercial' propertyType omits
            // commercialSubtype on PUT, resolveCommercialSubtype returns null (nothing to derive/stamp)
            // — but subtype-specific STRUCTURAL VALIDATION must still run against the EXISTING stored
            // subtype, otherwise a subtype-mismatched field (e.g. warehouseClearHeightFt on a stored
            // SHOP) would silently persist instead of being rejected. Fetch (lazily, reusing
            // existingForValidation when already fetched above) and validate against the stored value;
            // the DB write path itself still leaves the stored commercial_subtype column untouched
            // (ListingCrudService only stamps when a non-null value is supplied).
            String storedCommercialSubtypeForValidation = null;
            if (updateFamily == PropertyFamily.COMMERCIAL && updateCommercialSubtype == null) {
                if (existingForValidation == null) {
                    existingForValidation = listingWorkflowService.findListingForCaller(
                            id, caller.userId(), caller.isAdmin());
                }
                storedCommercialSubtypeForValidation = existingForValidation.getCommercialSubtype();
            }
            String resolvedSubtypeForValidation = updateCommercialSubtype != null
                    ? updateCommercialSubtype
                    : storedCommercialSubtypeForValidation;
            validateCommercialFields(updateFamily, resolvedSubtypeForValidation,
                    req.floorChoice(), req.floorMode(), req.hubType(),
                    req.commercialFurnishingStatus(), req.commercialOwnership(), req.occupancyStatus(),
                    req.warehouseFlooring(), req.commercialAvailability(), req.commercialAreaUnit(),
                    req.suitableUses(), req.utilities());
            validateCommercialFieldSet(updateFamily, resolvedSubtypeForValidation, req.listingPurpose(),
                    req.floorChoice(), req.floorMode(), req.hubType(),
                    req.washroomsPublic(), req.washroomsPrivate(),
                    req.parkingPublicCount(), req.parkingPrivateCount(),
                    req.officeSeats(), req.officeCabins(), req.officeMeetingRooms(),
                    req.occupancyStatus(), req.powerLoadKva(),
                    req.warehouseClearHeightFt(), req.warehouseLoadingBays(),
                    req.warehouseTruckAccess(), req.warehouseFlooring(),
                    req.commercialZoning(), req.commercialOwnership(), req.commercialApprovals(),
                    req.expectedRentalYieldPct(), req.currentMonthlyIncomePaise(),
                    req.leaseTermMonths(), req.leaseEscalationPct(),
                    req.commercialFurnishingStatus(), req.commercialAvailability(), req.commercialAreaUnit(),
                    req.suitableUses(), req.utilities());
            CommercialListingFields commercialFields = new CommercialListingFields(
                    updateCommercialSubtype, req.floorChoice(), req.floorMode(), req.hubType(),
                    req.washroomsPublic(), req.washroomsPrivate(), req.parkingPublicCount(), req.parkingPrivateCount(),
                    req.officeSeats(), req.officeCabins(), req.officeMeetingRooms(),
                    req.occupancyStatus(), req.powerLoadKva(),
                    req.warehouseClearHeightFt(), req.warehouseLoadingBays(),
                    req.warehouseTruckAccess(), req.warehouseFlooring(),
                    req.commercialZoning(), req.commercialOwnership(), req.commercialApprovals(),
                    req.expectedRentalYieldPct(), req.currentMonthlyIncomePaise(),
                    req.leaseTermMonths(), req.leaseEscalationPct(),
                    req.commercialFurnishingStatus(), req.commercialAvailability(), req.commercialAreaUnit(),
                    req.suitableUses(), req.utilities());
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
                    req.landCategory(), req.agriConversionStatus(), req.farmhouseAvailable(), req.fencingDone(),
                    req.boundary(), residentialFields, commercialFields);
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
     * Validates the 5 agri fields against the canonical option sets in {@link AgriFieldOptions}:
     * {@code waterSource}, {@code soilType}, {@code roadAccess}, {@code cultivationStatus},
     * and {@code landCategory} (wired M38-10b / #1693).
     *
     * <p><b>{@code ownershipType} is deliberately NOT validated here</b> — see
     * {@link #validateFamilyOwnershipType(PropertyFamily, String)}, which runs AFTER family
     * resolution and applies the family-appropriate canonical set (residential vs.
     * agricultural/commercial/plot). Prior to #2048 this method validated {@code ownershipType}
     * unconditionally against the agri set for EVERY property family, before family resolution
     * even ran — incorrectly rejecting valid residential-only values (COOPERATIVE_SOCIETY,
     * LEASEHOLD, POWER_OF_ATTORNEY) with HTTP 400.
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
                                           String landCategory, String agriConversionStatus) {
        rejectIfUnknown("waterSource",       waterSource,       AgriFieldOptions.VALID_WATER_SOURCES);
        rejectIfUnknown("soilType",          soilType,          AgriFieldOptions.VALID_SOIL_TYPES);
        rejectIfUnknown("roadAccess",        roadAccess,        AgriFieldOptions.VALID_ROAD_ACCESS_VALUES);
        rejectIfUnknown("cultivationStatus", cultivationStatus, AgriFieldOptions.VALID_CULTIVATION_STATUSES);
        rejectIfUnknown("landCategory",      landCategory,      AgriFieldOptions.VALID_LAND_CATEGORIES);
        rejectIfUnknown("agriConversionStatus", agriConversionStatus, AgriFieldOptions.VALID_CONVERSION_STATUSES);
    }

    /**
     * Validates {@code ownershipType} against the family-appropriate canonical set — the fix for
     * the pre-#2048 bug where {@link #validateAgriFields} validated {@code ownershipType}
     * unconditionally against {@link AgriFieldOptions#VALID_OWNERSHIP_TYPES} for every property
     * family, before family resolution ran, incorrectly rejecting residential-only values.
     *
     * <p>RESIDENTIAL uses the narrow {@link ResidentialFieldOptions#VALID_RESIDENTIAL_OWNERSHIP}
     * set (FREEHOLD / COOPERATIVE_SOCIETY / LEASEHOLD / POWER_OF_ATTORNEY) — a deliberate
     * narrowing decision (issue #2048 / PR #2057, decision D1): agri-only ownership values
     * (INHERITED, PATTA, SURVEY_SETTLEMENT, KATHA, REVENUE, OTHER) are NOT valid for residential
     * listings, even though they share the same underlying {@code ownershipType} column.
     *
     * <p>COMMERCIAL uses the narrow {@link CommercialFieldOptions#VALID_COMMERCIAL_OWNERSHIP} set
     * (FREEHOLD / LEASEHOLD / POWER_OF_ATTORNEY / OTHER) — a further deliberate narrowing (issue
     * #2063, mirroring #2048/PR #2057 decision D1 for RESIDENTIAL): agri-only ownership values
     * (INHERITED, PATTA, SURVEY_SETTLEMENT, KATHA, REVENUE) are NOT valid for commercial listings,
     * even though they share the same underlying {@code ownershipType} column. Note this is a
     * separate wiring from {@code commercialOwnership} (the typed per-subtype field validated in
     * {@link #validateCommercialFields}) — both fields happen to validate against the same
     * {@link CommercialFieldOptions#VALID_COMMERCIAL_OWNERSHIP} constant.
     *
     * <p>AGRICULTURAL, and PLOT's {@code land}/{@code other} property types, are UNCHANGED from
     * pre-#2048 behavior — they continue to validate against
     * {@link AgriFieldOptions#VALID_OWNERSHIP_TYPES} (decision D2: only the narrow residential and
     * commercial sets are wired for those families/types).
     *
     * <p>PLOT's {@code residential_plot} property type is an exception WITHIN the PLOT family
     * (issue #2067): {@link #resolveFamily} buckets {@code land}, {@code other}, and
     * {@code residential_plot} together as {@code PropertyFamily.PLOT} for structural field
     * validation, but only {@code residential_plot}'s broker UI renders an ownershipType control,
     * offering the same four values as ordinary RESIDENTIAL. So within the PLOT arm, the raw
     * property type is consulted as the smallest local discriminator: {@code residential_plot}
     * validates against {@link ResidentialFieldOptions#VALID_RESIDENTIAL_OWNERSHIP}; {@code land}
     * and {@code other} keep validating against {@link AgriFieldOptions#VALID_OWNERSHIP_TYPES}
     * unchanged. This mirrors the existing {@code rawPropertyType} discriminator pattern already
     * used for {@code residential_plot} in {@link #validateResidentialFieldSet}.
     *
     * <p>Must be called AFTER family resolution ({@link #resolveFamily}) on both the create and
     * update paths, so the correct canonical set is selected before the value is checked. On the
     * update path, {@code rawPropertyType} must be the EFFECTIVE property type (the existing
     * listing's stored type when the request omits {@code propertyType}) — the same value already
     * used to resolve {@code family} — never the raw, possibly-null request field.
     *
     * @throws org.springframework.web.server.ResponseStatusException HTTP 400 when ownershipType
     *         is non-blank and not a member of the resolved family's canonical set
     */
    private static void validateFamilyOwnershipType(PropertyFamily family, String rawPropertyType,
            String ownershipType) {
        switch (family) {
            case RESIDENTIAL -> rejectIfUnknown("ownershipType", ownershipType,
                    ResidentialFieldOptions.VALID_RESIDENTIAL_OWNERSHIP);
            case COMMERCIAL -> rejectIfUnknown("ownershipType", ownershipType,
                    CommercialFieldOptions.VALID_COMMERCIAL_OWNERSHIP);
            case PLOT -> {
                if ("residential_plot".equalsIgnoreCase(rawPropertyType)) {
                    rejectIfUnknown("ownershipType", ownershipType,
                            ResidentialFieldOptions.VALID_RESIDENTIAL_OWNERSHIP);
                } else {
                    // land, other: unchanged pre-#2048 agricultural ownership vocabulary.
                    rejectIfUnknown("ownershipType", ownershipType,
                            AgriFieldOptions.VALID_OWNERSHIP_TYPES);
                }
            }
            case AGRICULTURAL -> rejectIfUnknown("ownershipType", ownershipType,
                    AgriFieldOptions.VALID_OWNERSHIP_TYPES);
        }
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
            case HOUSE, APARTMENT, VILLA -> PropertyFamily.RESIDENTIAL;
            case COMMERCIAL, COMMERCIAL_BUILDING, WAREHOUSE, COMMERCIAL_LAND -> PropertyFamily.COMMERCIAL;
            case AGRICULTURAL_LAND -> PropertyFamily.AGRICULTURAL;
            // residential_plot validates as PLOT (architect d6): allows plot fields, rejects
            // residence-unit fields — same validation-family as legacy land/other. The DB
            // listing_family STAMP is a separate axis (always 'RESIDENTIAL' for residential_plot);
            // see ListingCrudService.RESIDENTIAL_PROPERTY_TYPES.
            case LAND, OTHER, RESIDENTIAL_PLOT -> PropertyFamily.PLOT;
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
            String cultivationStatus, String landCategory, String agriConversionStatus,
            Boolean farmhouseAvailable, Boolean fencingDone) {
        switch (family) {
            case RESIDENTIAL -> {
                // agri-only fields
                rejectIfPresent("waterSource",       waterSource);
                rejectIfPresent("soilType",          soilType);
                rejectIfPresent("roadAccess",        roadAccess);
                rejectIfPresent("cultivationStatus", cultivationStatus);
                rejectIfPresent("landCategory",      landCategory);
                rejectIfPresent("agriConversionStatus", agriConversionStatus);
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
                rejectIfPresent("agriConversionStatus", agriConversionStatus);
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
                // agriConversionStatus is agricultural_land-only (issue #2043), unlike landCategory
                // which PLOT (land/other/residential_plot) also accepts.
                rejectIfPresent("agriConversionStatus", agriConversionStatus);
            }
        }
    }

    /**
     * Residential typed-listing field validation (M38-13A / #1626) — the net-new field set only.
     * Runs in addition to {@link #validateFamilyFields}, which continues to govern the pre-existing
     * flat fields (bedrooms, builtArea, furnishingStatus, etc.) unchanged.
     *
     * <p>Two independent axes, both purely structural (field presence, never value membership —
     * consistent with the {@link ListingFieldWiringGuardTest} guard):
     * <ul>
     *   <li>Subtype split within RESIDENTIAL (apartment vs house/villa) for the apartment-only
     *       ({@code balconies}) vs house/villa-only ({@code hasGarden}, {@code hasTerrace},
     *       {@code hasCompound}, {@code hasServantRoom}, {@code propertyAge},
     *       {@code residentialWaterSource}) fields.</li>
     *   <li>PLOT (residential_plot AND legacy land/other) rejects every residence-unit field.</li>
     * </ul>
     *
     * <p>The sale/rent purpose gate below is intentionally unconditional (not scoped by family):
     * every field it governs is net-new in V103, so no existing commercial/agricultural caller can
     * be affected by gating it on purpose alone — this avoids touching the existing, already-shipped,
     * ungated {@code possessionStatus}/{@code expectedPossessionDate} fields, which are out of scope
     * for this issue.
     */
    @SuppressWarnings("java:S107") // structural per-field checks; mirrors validateFamilyFields shape
    private static void validateResidentialFieldSet(PropertyFamily family, String rawPropertyType,
            String listingPurpose,
            Integer bathrooms, Integer balconies, Integer parking2wCount, Integer parking4wCount,
            Boolean hasLift, Boolean hasPowerBackup, Boolean isGated,
            Boolean hasGarden, Boolean hasTerrace, Boolean hasCompound, Boolean hasServantRoom,
            String propertyAge, String residentialWaterSource, List<String> amenities,
            Boolean isCornerPlot, Boolean hasBoundaryWall, Boolean isGatedLayout,
            Boolean hasWaterConnection, Boolean hasElectricityConnection, Boolean hasDrainage,
            String conversionStatus, String khataNumber, String propertyTaxPid,
            String approvingAuthority, BigDecimal roadWidthFt, String plotDimensions,
            Long maintenancePaise, Boolean maintenanceIncluded, Boolean priceNegotiable, Boolean rentNegotiable,
            List<String> preferredTenants, Boolean petsAllowed, String availabilityTimeline) {

        switch (family) {
            case RESIDENTIAL -> {
                // Plot-only fields never valid on a residential-unit subtype.
                rejectIfPresent("isCornerPlot", isCornerPlot);
                rejectIfPresent("hasBoundaryWall", hasBoundaryWall);
                rejectIfPresent("isGatedLayout", isGatedLayout);
                rejectIfPresent("hasWaterConnection", hasWaterConnection);
                rejectIfPresent("hasElectricityConnection", hasElectricityConnection);
                rejectIfPresent("hasDrainage", hasDrainage);
                rejectIfPresent("conversionStatus", conversionStatus);
                rejectIfPresent("khataNumber", khataNumber);
                rejectIfPresent("propertyTaxPid", propertyTaxPid);
                rejectIfPresent("approvingAuthority", approvingAuthority);
                rejectIfPresent("roadWidthFt", roadWidthFt);
                rejectIfPresent("plotDimensions", plotDimensions);

                if ("apartment".equalsIgnoreCase(rawPropertyType)) {
                    rejectIfPresent("hasGarden", hasGarden);
                    rejectIfPresent("hasTerrace", hasTerrace);
                    rejectIfPresent("hasCompound", hasCompound);
                    rejectIfPresent("hasServantRoom", hasServantRoom);
                    rejectIfPresent("propertyAge", propertyAge);
                    rejectIfPresent("residentialWaterSource", residentialWaterSource);
                } else {
                    // house or villa
                    rejectIfPresent("balconies", balconies);
                }
            }
            case PLOT -> {
                // residential_plot AND legacy land/other: reject every residence-unit field.
                rejectIfPresent("bathrooms", bathrooms);
                rejectIfPresent("balconies", balconies);
                rejectIfPresent("parking2wCount", parking2wCount);
                rejectIfPresent("parking4wCount", parking4wCount);
                rejectIfPresent("hasLift", hasLift);
                rejectIfPresent("hasPowerBackup", hasPowerBackup);
                rejectIfPresent("isGated", isGated);
                rejectIfPresent("hasGarden", hasGarden);
                rejectIfPresent("hasTerrace", hasTerrace);
                rejectIfPresent("hasCompound", hasCompound);
                rejectIfPresent("hasServantRoom", hasServantRoom);
                rejectIfPresent("propertyAge", propertyAge);
                rejectIfPresent("residentialWaterSource", residentialWaterSource);
                rejectIfNonEmpty("amenities", amenities);

                // The residential-purpose sale/rent gate below (post-switch) intentionally allows
                // maintenancePaise/priceNegotiable/rentNegotiable/maintenanceIncluded/petsAllowed/
                // availabilityTimeline/preferredTenants for residential_plot. Legacy land/other
                // share this PLOT validation family but are out of scope for M38-13A — preserve
                // their pre-existing rejection of these fields rather than let the new gate loosen it.
                if (!"residential_plot".equalsIgnoreCase(rawPropertyType)) {
                    rejectIfPresent("maintenancePaise", maintenancePaise);
                    rejectIfPresent("maintenanceIncluded", maintenanceIncluded);
                    rejectIfPresent("priceNegotiable", priceNegotiable);
                    rejectIfPresent("rentNegotiable", rentNegotiable);
                    rejectIfNonEmpty("preferredTenants", preferredTenants);
                    rejectIfPresent("petsAllowed", petsAllowed);
                    rejectIfPresent("availabilityTimeline", availabilityTimeline);
                }
            }
            case COMMERCIAL, AGRICULTURAL -> {
                // None of the M38-13A residential fields belong to these families.
                rejectIfPresent("bathrooms", bathrooms);
                rejectIfPresent("balconies", balconies);
                rejectIfPresent("parking2wCount", parking2wCount);
                rejectIfPresent("parking4wCount", parking4wCount);
                rejectIfPresent("hasLift", hasLift);
                rejectIfPresent("hasPowerBackup", hasPowerBackup);
                rejectIfPresent("isGated", isGated);
                rejectIfPresent("hasGarden", hasGarden);
                rejectIfPresent("hasTerrace", hasTerrace);
                rejectIfPresent("hasCompound", hasCompound);
                rejectIfPresent("hasServantRoom", hasServantRoom);
                rejectIfPresent("propertyAge", propertyAge);
                rejectIfPresent("residentialWaterSource", residentialWaterSource);
                rejectIfNonEmpty("amenities", amenities);
                rejectIfPresent("isCornerPlot", isCornerPlot);
                rejectIfPresent("hasBoundaryWall", hasBoundaryWall);
                rejectIfPresent("isGatedLayout", isGatedLayout);
                rejectIfPresent("hasWaterConnection", hasWaterConnection);
                rejectIfPresent("hasElectricityConnection", hasElectricityConnection);
                rejectIfPresent("hasDrainage", hasDrainage);
                rejectIfPresent("conversionStatus", conversionStatus);
                rejectIfPresent("khataNumber", khataNumber);
                rejectIfPresent("propertyTaxPid", propertyTaxPid);
                rejectIfPresent("approvingAuthority", approvingAuthority);
                rejectIfPresent("roadWidthFt", roadWidthFt);
                rejectIfPresent("plotDimensions", plotDimensions);
                rejectIfPresent("maintenancePaise", maintenancePaise);
                rejectIfPresent("maintenanceIncluded", maintenanceIncluded);
                rejectIfPresent("priceNegotiable", priceNegotiable);
                rejectIfPresent("rentNegotiable", rentNegotiable);
                rejectIfNonEmpty("preferredTenants", preferredTenants);
                rejectIfPresent("petsAllowed", petsAllowed);
                rejectIfPresent("availabilityTimeline", availabilityTimeline);
            }
        }

        // Sale vs rent purpose gate — unconditional (net-new fields only; see method javadoc).
        boolean isRentOrLease = listingPurpose != null && !listingPurpose.isBlank()
                && RENTAL_PURPOSES.contains(listingPurpose.trim().toUpperCase(java.util.Locale.ROOT));
        if (isRentOrLease) {
            rejectIfPresent("maintenancePaise", maintenancePaise);
            rejectIfPresent("priceNegotiable", priceNegotiable);
        } else {
            rejectIfPresent("maintenanceIncluded", maintenanceIncluded);
            rejectIfPresent("rentNegotiable", rentNegotiable);
            rejectIfPresent("petsAllowed", petsAllowed);
            rejectIfPresent("availabilityTimeline", availabilityTimeline);
            rejectIfNonEmpty("preferredTenants", preferredTenants);
        }
    }

    /**
     * List variant of {@link #rejectIfPresent(String, Object)} — "present" means non-null AND
     * non-empty, so an omitted field and an explicit empty list are both accepted (an empty list
     * is a valid "clear the set" signal on update; only an actual non-empty value is forbidden).
     */
    private static void rejectIfNonEmpty(String fieldName, List<String> value) {
        if (value != null && !value.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Field '" + fieldName + "' is not accepted for this property type");
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

    // ===== Commercial typed-listing validation (M38-FU2 / #1730) =====

    /**
     * Resolves the effective {@code commercial_subtype} DB stamp for a commercial-family request.
     *
     * <ul>
     *   <li>{@code commercial_building}/{@code warehouse}/{@code commercial_land} unambiguously
     *       derive BUILDING/WAREHOUSE/LAND — any client-supplied {@code commercialSubtype} for
     *       these types is ignored (the propertyType is authoritative).</li>
     *   <li>{@code commercial} is ambiguous between SHOP and OFFICE: the client MUST supply
     *       {@code commercialSubtype} on POST (400 if absent); on PUT, an absent value means the
     *       WRITE leaves the stored {@code commercial_subtype} column unchanged (returns
     *       {@code null} — legacy rows stay NULL, matching the V102 commercial backfill).
     *       <b>Validation is NOT skipped in this case</b> — the caller ({@link #update}) falls back
     *       to the listing's EXISTING stored subtype for {@link #validateCommercialFields}/
     *       {@link #validateCommercialFieldSet}, so subtype-mismatched fields are still rejected
     *       with 400 rather than silently persisted (#1730 Finding 1).</li>
     * </ul>
     *
     * @return the resolved subtype (BUILDING/WAREHOUSE/LAND/SHOP/OFFICE) to STAMP on write, or
     *         {@code null} when PUT omits commercialSubtype for the ambiguous {@code commercial}
     *         propertyType — {@code null} here means "don't touch the stored column on write",
     *         not "skip validation" (see caller)
     * @throws org.springframework.web.server.ResponseStatusException HTTP 400 when POST omits a
     *         required subtype, or the supplied value is not SHOP/OFFICE for propertyType='commercial'
     */
    private static String resolveCommercialSubtype(String propertyType, String suppliedSubtype, boolean isCreate) {
        String pt = propertyType == null ? "" : propertyType.trim().toLowerCase(java.util.Locale.ROOT);
        return switch (pt) {
            case "commercial_building" -> "BUILDING";
            case "warehouse" -> "WAREHOUSE";
            case "commercial_land" -> "LAND";
            case "commercial" -> {
                String normalized = (suppliedSubtype == null || suppliedSubtype.isBlank())
                        ? null : suppliedSubtype.trim().toUpperCase(java.util.Locale.ROOT);
                if (normalized == null) {
                    if (isCreate) {
                        throw new org.springframework.web.server.ResponseStatusException(
                                HttpStatus.BAD_REQUEST,
                                "commercialSubtype is required for propertyType 'commercial' "
                                        + "(must be SHOP or OFFICE)");
                    }
                    yield null; // PUT omitted -> leave existing stored subtype unchanged
                }
                if (!"SHOP".equals(normalized) && !"OFFICE".equals(normalized)) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Invalid commercialSubtype '" + normalized + "' for propertyType 'commercial'. "
                                    + "Allowed values: OFFICE, SHOP");
                }
                yield normalized;
            }
            default -> null; // not a commercial-family propertyType — caller must not invoke this branch
        };
    }

    private static Set<String> hubTypeOptionsFor(String resolvedSubtype) {
        if ("SHOP".equals(resolvedSubtype)) return CommercialFieldOptions.VALID_SHOP_HUB_TYPES;
        if ("OFFICE".equals(resolvedSubtype)) return CommercialFieldOptions.VALID_OFFICE_HUB_TYPES;
        return Set.of();
    }

    private static Set<String> suitableUsesOptionsFor(String resolvedSubtype) {
        if (resolvedSubtype == null) return Set.of();
        return switch (resolvedSubtype) {
            case "SHOP" -> CommercialFieldOptions.VALID_SHOP_SUITABLE_USES;
            case "OFFICE" -> CommercialFieldOptions.VALID_OFFICE_SUITABLE_USES;
            case "BUILDING" -> CommercialFieldOptions.VALID_BUILDING_SUITABLE_USES;
            case "WAREHOUSE" -> CommercialFieldOptions.VALID_WAREHOUSE_SUITABLE_USES;
            case "LAND" -> CommercialFieldOptions.VALID_COMMERCIAL_LAND_SUITABLE_USES;
            default -> Set.of();
        };
    }

    /**
     * Commercial typed-listing ENUM AUTHORITY validation (M38-FU2 / #1730) — scoped to the
     * COMMERCIAL family only (no-op for RESIDENTIAL/AGRICULTURAL/PLOT, mirroring how
     * {@link #validateFamilyFields} already gates commercial-only fields structurally).
     * Every {@code rejectIfUnknown} call here is a real wiring against {@link CommercialFieldOptions}
     * (see {@link ListingFieldWiringGuardTest} — this class name is intentionally NOT in the
     * guard's forward-only list, unlike {@code ResidentialFieldOptions}).
     *
     * <p>{@code listingPurpose} is deliberately NOT enum-validated here: {@link CommercialFieldOptions}
     * documents (see class javadoc, {@code VALID_LISTING_PURPOSES}) that wiring this set requires a
     * production distinct-value audit before enforcement — deferred to M38-FU7. It remains free-text,
     * unchanged from pre-#1730 behavior; only the sale/rent PURPOSE GATE (which fields it's paired with)
     * is enforced today, in {@link #validateCommercialFieldSet}.
     *
     * @throws org.springframework.web.server.ResponseStatusException HTTP 400 on first invalid field
     */
    @SuppressWarnings("java:S107") // mirrors validateAgriFields/validateResidentialFieldSet enum-check shape
    private static void validateCommercialFields(PropertyFamily family, String resolvedSubtype,
            String floorChoice, String floorMode, String hubType,
            String commercialFurnishingStatus, String commercialOwnership, String occupancyStatus,
            String warehouseFlooring, String commercialAvailability, String commercialAreaUnit,
            List<String> suitableUses, List<String> utilities) {
        if (family != PropertyFamily.COMMERCIAL) {
            return;
        }
        rejectIfUnknown("commercialSubtype", resolvedSubtype, CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES);
        rejectIfUnknown("floorChoice", floorChoice, CommercialFieldOptions.VALID_FLOOR_CHOICES);
        rejectIfUnknown("floorMode", floorMode, CommercialFieldOptions.VALID_FLOOR_MODES);
        rejectIfUnknown("hubType", hubType, hubTypeOptionsFor(resolvedSubtype));
        rejectIfUnknown("commercialFurnishingStatus", commercialFurnishingStatus,
                CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES);
        rejectIfUnknown("commercialOwnership", commercialOwnership, CommercialFieldOptions.VALID_COMMERCIAL_OWNERSHIP);
        rejectIfUnknown("occupancyStatus", occupancyStatus, CommercialFieldOptions.VALID_OCCUPANCY_STATUSES);
        rejectIfUnknown("warehouseFlooring", warehouseFlooring, CommercialFieldOptions.VALID_WAREHOUSE_FLOORING);
        rejectIfUnknown("commercialAvailability", commercialAvailability,
                CommercialFieldOptions.VALID_COMMERCIAL_AVAILABILITY);
        rejectIfUnknown("commercialAreaUnit", commercialAreaUnit, CommercialFieldOptions.VALID_COMMERCIAL_AREA_UNITS);
        if (suitableUses != null) {
            Set<String> validSuitableUses = suitableUsesOptionsFor(resolvedSubtype);
            for (String code : suitableUses) {
                rejectIfUnknown("suitableUses", code, validSuitableUses);
            }
        }
        if (utilities != null) {
            for (String code : utilities) {
                rejectIfUnknown("utilities", code, CommercialFieldOptions.VALID_AMENITIES_UTILITIES);
            }
        }
    }

    /**
     * Commercial typed-listing STRUCTURAL validation (M38-FU2 / #1730) — the net-new field set
     * only, purely structural (field presence, never value membership — consistent with the
     * {@link ListingFieldWiringGuardTest} guard).
     *
     * <p>Two independent axes:
     * <ul>
     *   <li>Cross-family: every M38-FU2 commercial field is rejected for RESIDENTIAL/AGRICULTURAL/
     *       PLOT (mirrors {@link #validateResidentialFieldSet}'s COMMERCIAL/AGRICULTURAL branch).</li>
     *   <li>Per-subtype (within COMMERCIAL, only when {@code resolvedSubtype} is non-null — see
     *       {@link #resolveCommercialSubtype}): warehouse-only fields rejected on non-WAREHOUSE,
     *       office-only on non-OFFICE, land-only (zoning/ownership/approvals) on non-LAND, and the
     *       built-space fields (washrooms/parking split, furnishing, utilities) rejected on LAND.</li>
     * </ul>
     *
     * <p>The sale/rent purpose gate below is unconditional across subtypes (mirrors
     * {@link #validateResidentialFieldSet}'s sale/rent gate): investment/yield fields are SALE-only,
     * lease-term fields are RENT/LEASE-only.
     */
    @SuppressWarnings("java:S107") // structural per-field checks; mirrors validateResidentialFieldSet shape
    private static void validateCommercialFieldSet(PropertyFamily family, String resolvedSubtype,
            String listingPurpose,
            String floorChoice, String floorMode, String hubType,
            Integer washroomsPublic, Integer washroomsPrivate,
            Integer parkingPublicCount, Integer parkingPrivateCount,
            Integer officeSeats, Integer officeCabins, Integer officeMeetingRooms,
            String occupancyStatus, BigDecimal powerLoadKva,
            BigDecimal warehouseClearHeightFt, Integer warehouseLoadingBays,
            Boolean warehouseTruckAccess, String warehouseFlooring,
            String commercialZoning, String commercialOwnership, String commercialApprovals,
            BigDecimal expectedRentalYieldPct, Long currentMonthlyIncomePaise,
            Integer leaseTermMonths, BigDecimal leaseEscalationPct,
            String commercialFurnishingStatus, String commercialAvailability, String commercialAreaUnit,
            List<String> suitableUses, List<String> utilities) {

        if (family != PropertyFamily.COMMERCIAL) {
            // None of the M38-FU2 commercial fields belong to any other family.
            rejectIfPresent("floorChoice", floorChoice);
            rejectIfPresent("floorMode", floorMode);
            rejectIfPresent("hubType", hubType);
            rejectIfPresent("washroomsPublic", washroomsPublic);
            rejectIfPresent("washroomsPrivate", washroomsPrivate);
            rejectIfPresent("parkingPublicCount", parkingPublicCount);
            rejectIfPresent("parkingPrivateCount", parkingPrivateCount);
            rejectIfPresent("officeSeats", officeSeats);
            rejectIfPresent("officeCabins", officeCabins);
            rejectIfPresent("officeMeetingRooms", officeMeetingRooms);
            rejectIfPresent("occupancyStatus", occupancyStatus);
            rejectIfPresent("powerLoadKva", powerLoadKva);
            rejectIfPresent("warehouseClearHeightFt", warehouseClearHeightFt);
            rejectIfPresent("warehouseLoadingBays", warehouseLoadingBays);
            rejectIfPresent("warehouseTruckAccess", warehouseTruckAccess);
            rejectIfPresent("warehouseFlooring", warehouseFlooring);
            rejectIfPresent("commercialZoning", commercialZoning);
            rejectIfPresent("commercialOwnership", commercialOwnership);
            rejectIfPresent("commercialApprovals", commercialApprovals);
            rejectIfPresent("expectedRentalYieldPct", expectedRentalYieldPct);
            rejectIfPresent("currentMonthlyIncomePaise", currentMonthlyIncomePaise);
            rejectIfPresent("leaseTermMonths", leaseTermMonths);
            rejectIfPresent("leaseEscalationPct", leaseEscalationPct);
            rejectIfPresent("commercialFurnishingStatus", commercialFurnishingStatus);
            rejectIfPresent("commercialAvailability", commercialAvailability);
            rejectIfPresent("commercialAreaUnit", commercialAreaUnit);
            rejectIfNonEmpty("suitableUses", suitableUses);
            rejectIfNonEmpty("utilities", utilities);
            return;
        }

        // COMMERCIAL family: per-subtype structural gates. `resolvedSubtype` here is the EFFECTIVE
        // subtype used for validation — on PUT this is either the newly-resolved/derived value, or
        // (when the ambiguous 'commercial' propertyType omits commercialSubtype) the listing's
        // EXISTING stored subtype, fetched by the caller (#update) specifically so this gate still
        // runs (#1730 Finding 1 — a subtype-mismatched field like warehouseClearHeightFt on a stored
        // SHOP must be rejected with 400, not silently persisted). The gate is skipped only when
        // resolvedSubtype is truly unknown (e.g. a legacy row whose stored commercial_subtype is
        // itself still NULL, pre-#1730) — nothing structural can be validated against an unknown
        // subtype, but the write path still leaves that NULL column untouched.
        if (resolvedSubtype != null) {
            boolean isShopOrOffice = "SHOP".equals(resolvedSubtype) || "OFFICE".equals(resolvedSubtype);
            if (!isShopOrOffice) {
                rejectIfPresent("floorChoice", floorChoice);
                rejectIfPresent("hubType", hubType);
            }
            if (!"BUILDING".equals(resolvedSubtype)) {
                rejectIfPresent("floorMode", floorMode);
                rejectIfPresent("powerLoadKva", powerLoadKva);
            }
            if (!"OFFICE".equals(resolvedSubtype)) {
                rejectIfPresent("officeSeats", officeSeats);
                rejectIfPresent("officeCabins", officeCabins);
                rejectIfPresent("officeMeetingRooms", officeMeetingRooms);
            }
            if (!"WAREHOUSE".equals(resolvedSubtype)) {
                rejectIfPresent("warehouseClearHeightFt", warehouseClearHeightFt);
                rejectIfPresent("warehouseLoadingBays", warehouseLoadingBays);
                rejectIfPresent("warehouseTruckAccess", warehouseTruckAccess);
                rejectIfPresent("warehouseFlooring", warehouseFlooring);
            }
            if (!"LAND".equals(resolvedSubtype)) {
                rejectIfPresent("commercialZoning", commercialZoning);
                rejectIfPresent("commercialOwnership", commercialOwnership);
                rejectIfPresent("commercialApprovals", commercialApprovals);
            } else {
                // LAND: none of the built-space-only fields below apply.
                rejectIfPresent("washroomsPublic", washroomsPublic);
                rejectIfPresent("washroomsPrivate", washroomsPrivate);
                rejectIfPresent("parkingPublicCount", parkingPublicCount);
                rejectIfPresent("parkingPrivateCount", parkingPrivateCount);
                rejectIfPresent("commercialFurnishingStatus", commercialFurnishingStatus);
                rejectIfNonEmpty("utilities", utilities);
            }
            boolean isShopOrBuilding = "SHOP".equals(resolvedSubtype) || "BUILDING".equals(resolvedSubtype);
            if (!isShopOrBuilding) {
                rejectIfPresent("occupancyStatus", occupancyStatus);
            }
        }

        // Sale vs rent/lease purpose gate — unconditional across subtypes (net-new fields only;
        // mirrors validateResidentialFieldSet's sale/rent gate).
        boolean isRentOrLease = listingPurpose != null && !listingPurpose.isBlank()
                && RENTAL_PURPOSES.contains(listingPurpose.trim().toUpperCase(java.util.Locale.ROOT));
        if (isRentOrLease) {
            rejectIfPresent("expectedRentalYieldPct", expectedRentalYieldPct);
            rejectIfPresent("currentMonthlyIncomePaise", currentMonthlyIncomePaise);
        } else {
            rejectIfPresent("leaseTermMonths", leaseTermMonths);
            rejectIfPresent("leaseEscalationPct", leaseEscalationPct);
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
            String agriConversionStatus,
            Boolean farmhouseAvailable,
            Boolean fencingDone,
            // Residential typed listing fields (M38-13A / #1626)
            Integer bathrooms,
            Integer balconies,
            String facing,
            String availabilityTimeline,
            BigDecimal superBuiltArea,
            String superBuiltAreaUnit,
            String propertyAge,
            String residentialWaterSource,
            Integer parking2wCount,
            Integer parking4wCount,
            BigDecimal roadWidthFt,
            String plotDimensions,
            String conversionStatus,
            String khataNumber,
            String propertyTaxPid,
            String approvingAuthority,
            String projectName,
            String builderName,
            Long maintenancePaise,
            Boolean hasLift,
            Boolean hasPowerBackup,
            Boolean isGated,
            Boolean hasGarden,
            Boolean hasTerrace,
            Boolean hasCompound,
            Boolean hasServantRoom,
            Boolean isCornerPlot,
            Boolean hasBoundaryWall,
            Boolean isGatedLayout,
            Boolean hasWaterConnection,
            Boolean hasElectricityConnection,
            Boolean hasDrainage,
            Boolean priceNegotiable,
            Boolean rentNegotiable,
            Boolean petsAllowed,
            Boolean maintenanceIncluded,
            List<String> amenities,
            List<String> specialLocationViews,
            List<String> preferredTenants,
            // Commercial typed listing fields (M38-FU2 / #1730)
            String commercialSubtype,
            String floorChoice,
            String floorMode,
            String hubType,
            Integer washroomsPublic,
            Integer washroomsPrivate,
            Integer parkingPublicCount,
            Integer parkingPrivateCount,
            Integer officeSeats,
            Integer officeCabins,
            Integer officeMeetingRooms,
            String occupancyStatus,
            BigDecimal powerLoadKva,
            BigDecimal warehouseClearHeightFt,
            Integer warehouseLoadingBays,
            Boolean warehouseTruckAccess,
            String warehouseFlooring,
            String commercialZoning,
            String commercialOwnership,
            String commercialApprovals,
            BigDecimal expectedRentalYieldPct,
            Long currentMonthlyIncomePaise,
            Integer leaseTermMonths,
            BigDecimal leaseEscalationPct,
            String commercialFurnishingStatus,
            String commercialAvailability,
            String commercialAreaUnit,
            List<String> suitableUses,
            List<String> utilities
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
            String agriConversionStatus,
            Boolean farmhouseAvailable,
            Boolean fencingDone,
            String boundary,
            // Residential typed listing fields (M38-13A / #1626)
            Integer bathrooms,
            Integer balconies,
            String facing,
            String availabilityTimeline,
            BigDecimal superBuiltArea,
            String superBuiltAreaUnit,
            String propertyAge,
            String residentialWaterSource,
            Integer parking2wCount,
            Integer parking4wCount,
            BigDecimal roadWidthFt,
            String plotDimensions,
            String conversionStatus,
            String khataNumber,
            String propertyTaxPid,
            String approvingAuthority,
            String projectName,
            String builderName,
            Long maintenancePaise,
            Boolean hasLift,
            Boolean hasPowerBackup,
            Boolean isGated,
            Boolean hasGarden,
            Boolean hasTerrace,
            Boolean hasCompound,
            Boolean hasServantRoom,
            Boolean isCornerPlot,
            Boolean hasBoundaryWall,
            Boolean isGatedLayout,
            Boolean hasWaterConnection,
            Boolean hasElectricityConnection,
            Boolean hasDrainage,
            Boolean priceNegotiable,
            Boolean rentNegotiable,
            Boolean petsAllowed,
            Boolean maintenanceIncluded,
            List<String> amenities,
            List<String> specialLocationViews,
            List<String> preferredTenants,
            // Commercial typed listing fields (M38-FU2 / #1730)
            String commercialSubtype,
            String floorChoice,
            String floorMode,
            String hubType,
            Integer washroomsPublic,
            Integer washroomsPrivate,
            Integer parkingPublicCount,
            Integer parkingPrivateCount,
            Integer officeSeats,
            Integer officeCabins,
            Integer officeMeetingRooms,
            String occupancyStatus,
            BigDecimal powerLoadKva,
            BigDecimal warehouseClearHeightFt,
            Integer warehouseLoadingBays,
            Boolean warehouseTruckAccess,
            String warehouseFlooring,
            String commercialZoning,
            String commercialOwnership,
            String commercialApprovals,
            BigDecimal expectedRentalYieldPct,
            Long currentMonthlyIncomePaise,
            Integer leaseTermMonths,
            BigDecimal leaseEscalationPct,
            String commercialFurnishingStatus,
            String commercialAvailability,
            String commercialAreaUnit,
            List<String> suitableUses,
            List<String> utilities
    ) {}

    public record BulkDeleteRequest(List<UUID> ids) {}
}
