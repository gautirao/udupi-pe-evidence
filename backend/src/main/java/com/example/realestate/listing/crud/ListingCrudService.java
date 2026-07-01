package com.example.realestate.listing.crud;

import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.pricing.PriceParser;
import com.example.realestate.listing.api.BulkDeleteResult;
import com.example.realestate.listing.api.ListingStatsResponse;
import com.example.realestate.listing.residential.ListingAmenity;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeature;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenant;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.residential.ResidentialListingFields;
import com.example.realestate.listing.event.SettlementEnrichmentRequestedEvent;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.OwnerListingLimitException;
import com.example.realestate.poi.PoiQueryProfile;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxEventType;
import com.example.realestate.search.outbox.SearchOutboxOperation;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.example.realestate.trust.BadgeInvalidationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Broker CRUD operations for listings.
 * Extracted from {@link com.example.realestate.listing.ListingService}.
 */
@Service
public class ListingCrudService {

    private static final Logger log = LoggerFactory.getLogger(ListingCrudService.class);

    private static final Set<String> UPDATABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());

    private final ListingRepository listingRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ListingOwnershipGuard listingOwnershipGuard;
    private final ListingDeduplicationService listingDeduplicationService;
    private final PriceChangeLogRepository priceChangeLogRepository;
    private final BadgeInvalidationService badgeInvalidationService;
    private final SearchOutboxWriter searchOutboxWriter;
    private final PolygonBoundaryValidator polygonBoundaryValidator;
    private final QualityRecomputeService qualityRecomputeService;
    private final ListingAmenityRepository listingAmenityRepository;
    private final ListingLocationFeatureRepository listingLocationFeatureRepository;
    private final ListingPreferredTenantRepository listingPreferredTenantRepository;

    /** Residential-family property types (M38-13A / #1626) that get the DB listing_family stamp. */
    private static final Set<String> RESIDENTIAL_PROPERTY_TYPES =
            Set.of("house", "apartment", "villa", "residential_plot");

    public ListingCrudService(
            ListingRepository listingRepository,
            ApplicationEventPublisher applicationEventPublisher,
            ListingOwnershipGuard listingOwnershipGuard,
            ListingDeduplicationService listingDeduplicationService,
            PriceChangeLogRepository priceChangeLogRepository,
            BadgeInvalidationService badgeInvalidationService,
            SearchOutboxWriter searchOutboxWriter,
            PolygonBoundaryValidator polygonBoundaryValidator,
            QualityRecomputeService qualityRecomputeService,
            ListingAmenityRepository listingAmenityRepository,
            ListingLocationFeatureRepository listingLocationFeatureRepository,
            ListingPreferredTenantRepository listingPreferredTenantRepository) {
        this.listingRepository = listingRepository;
        this.applicationEventPublisher = applicationEventPublisher;
        this.listingOwnershipGuard = listingOwnershipGuard;
        this.listingDeduplicationService = listingDeduplicationService;
        this.priceChangeLogRepository = priceChangeLogRepository;
        this.badgeInvalidationService = badgeInvalidationService;
        this.searchOutboxWriter = searchOutboxWriter;
        this.polygonBoundaryValidator = polygonBoundaryValidator;
        this.qualityRecomputeService = qualityRecomputeService;
        this.listingAmenityRepository = listingAmenityRepository;
        this.listingLocationFeatureRepository = listingLocationFeatureRepository;
        this.listingPreferredTenantRepository = listingPreferredTenantRepository;
    }

    /**
     * Create a new broker-owned listing with status DRAFT.
     */
    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null);
    }

    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               String videoUrl) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                null, null, null, null, null, videoUrl,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null);
    }

    /**
     * Create a new broker-owned listing with status DRAFT (pre-commercial overload).
     */
    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                               String landAreaUnit, String builtAreaUnit, String videoUrl) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null);
    }

    /**
     * Create a new listing with status DRAFT, including optional area, unit,
     * commercial, rent fields, and seller type.
     * Derived area fields (areaSqm, areaSqft, areaCent, pricePerCentPaise) are computed only when
     * both landArea and landAreaUnit are provided.
     *
     * @param sellerType one of "owner", "dealer", "builder" — inferred by controller from caller's role
     * @throws OwnerListingLimitException if sellerType is "owner" and the user already has 3 LIVE listings
     */
    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                               String landAreaUnit, String builtAreaUnit, String videoUrl,
                               String listingPurpose,
                               BigDecimal carpetArea, String carpetAreaUnit,
                               Integer floorNumber, Integer totalFloors,
                               String furnishingStatus, Integer washrooms, Integer parkingCount,
                               BigDecimal roadFrontageFt, String commercialUsage, Integer numberOfUnits,
                               Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths,
                               String sellerType,
                               String waterSource, String soilType, String roadAccess,
                               String cultivationStatus, String ownershipType, String surveyNumber,
                               String landCategory, Boolean farmhouseAvailable, Boolean fencingDone) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths, sellerType,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, farmhouseAvailable, fencingDone, ResidentialListingFields.EMPTY);
    }

    /**
     * Create a new listing with status DRAFT, including residential typed-listing fields
     * (M38-13A / #1626). All parameters from the previous overload behave identically;
     * {@code residentialFields} carries the net-new residential design-spec fields as a single
     * bounded value object (see {@link ResidentialListingFields} for rationale).
     *
     * @param sellerType one of "owner", "dealer", "builder" — inferred by controller from caller's role
     * @throws OwnerListingLimitException if sellerType is "owner" and the user already has 3 LIVE listings
     */
    @Transactional
    @SuppressWarnings("java:S107") // mirrors existing flat-request telescoping pattern in this class
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                               String landAreaUnit, String builtAreaUnit, String videoUrl,
                               String listingPurpose,
                               BigDecimal carpetArea, String carpetAreaUnit,
                               Integer floorNumber, Integer totalFloors,
                               String furnishingStatus, Integer washrooms, Integer parkingCount,
                               BigDecimal roadFrontageFt, String commercialUsage, Integer numberOfUnits,
                               Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths,
                               String sellerType,
                               String waterSource, String soilType, String roadAccess,
                               String cultivationStatus, String ownershipType, String surveyNumber,
                               String landCategory, Boolean farmhouseAvailable, Boolean fencingDone,
                               ResidentialListingFields residentialFields) {
        // Enforce owner listing limit: max 3 LIVE listings for owner accounts.
        // Archived listings must not count against this limit.
        if ("owner".equals(sellerType)) {
            long liveCount = listingRepository.countByCreatedByAndSellerTypeAndStatusAndArchivedAtIsNull(
                    createdBy, "owner", ListingStatus.LIVE.toDbValue());
            if (liveCount >= 3) {
                throw new OwnerListingLimitException("Owner accounts are limited to 3 active listings");
            }
        }

        Listing listing = new Listing();
        listing.setCreatedBy(createdBy);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setPropertyType(propertyType != null ? propertyType : "other");
        listing.setSellerType(sellerType != null ? sellerType : "dealer");
        listing.setTitle(title);
        listing.setLocality(locality);
        listing.setPrice(price);
        listing.setPricePaise(PriceParser.rupeesToPaise(price));
        listing.setDescription(description);
        if (landArea != null) listing.setLandArea(landArea);
        if (bedrooms != null) listing.setBedrooms(bedrooms);
        if (builtArea != null) listing.setBuiltArea(builtArea);
        if (landAreaUnit != null) listing.setLandAreaUnit(landAreaUnit);
        if (builtAreaUnit != null) listing.setBuiltAreaUnit(builtAreaUnit);
        listing.setVideoUrl(videoUrl);

        // Commercial & rent fields
        if (listingPurpose != null && !listingPurpose.isBlank()) listing.setListingPurpose(listingPurpose);
        if (carpetArea != null) listing.setCarpetArea(carpetArea);
        if (carpetAreaUnit != null) listing.setCarpetAreaUnit(carpetAreaUnit);
        if (floorNumber != null) listing.setFloorNumber(floorNumber);
        if (totalFloors != null) listing.setTotalFloors(totalFloors);
        if (furnishingStatus != null) listing.setFurnishingStatus(furnishingStatus);
        if (washrooms != null) listing.setWashrooms(washrooms);
        if (parkingCount != null) listing.setParkingCount(parkingCount);
        if (roadFrontageFt != null) listing.setRoadFrontageFt(roadFrontageFt);
        if (commercialUsage != null) listing.setCommercialUsage(commercialUsage);
        if (numberOfUnits != null) listing.setNumberOfUnits(numberOfUnits);
        if (monthlyRent != null) listing.setMonthlyRent(monthlyRent);
        if (securityDepositMonths != null) listing.setSecurityDepositMonths(securityDepositMonths);
        if (lockInMonths != null) listing.setLockInMonths(lockInMonths);

        // Agricultural land fields
        if (waterSource != null) listing.setWaterSource(waterSource);
        if (soilType != null) listing.setSoilType(soilType);
        if (roadAccess != null) listing.setRoadAccess(roadAccess);
        if (cultivationStatus != null) listing.setCultivationStatus(cultivationStatus);
        if (ownershipType != null) listing.setOwnershipType(ownershipType);
        if (surveyNumber != null) listing.setSurveyNumber(surveyNumber);
        if (landCategory != null) listing.setLandCategory(landCategory);
        if (farmhouseAvailable != null) listing.setFarmhouseAvailable(farmhouseAvailable);
        if (fencingDone != null) listing.setFencingDone(fencingDone);

        // Residential typed listing fields (M38-13A / #1626)
        applyResidentialFields(listing, residentialFields);
        // DB axis: stamp listing_family='RESIDENTIAL' for all 4 residential subtypes.
        // Independent of the Java-side validation family used by the controller (residential_plot
        // validates as PLOT there); the DB CHECK (chk_listing_listing_family) has no 'PLOT' value.
        if (RESIDENTIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily("RESIDENTIAL");
        }

        // Compute derived area fields only when both area and unit are supplied
        if (landArea != null && landAreaUnit != null) {
            AreaNormalizer.normalize(listing);
        }

        // Compute dedupe hash and check for duplicates
        listingDeduplicationService.computeAndSetDedupeHash(listing, description, locality, price);
        listingDeduplicationService.checkAndMarkDuplicate(listing);

        OffsetDateTime now = OffsetDateTime.now();
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);

        Listing saved = listingRepository.save(listing);
        // Child-set writes (amenities / special-location views / preferred tenants) — insert-only
        // on create (no prior rows can exist for a brand-new listing id).
        writeResidentialChildSets(saved.getId(), residentialFields);
        log.info("Created draft listing listingId={} createdBy={} sellerType={} isDuplicate={}",
                saved.getId(), createdBy, sellerType, saved.isDuplicate());
        searchOutboxWriter.writeEvent(
                saved.getId(),
                SearchOutboxEventType.LISTING_CREATED,
                SearchOutboxOperation.INDEX,
                saved.getStatus(),
                saved.getUpdatedAt() != null ? saved.getUpdatedAt().toInstant() : null);
        // Trigger quality recompute after commit (isolation: recompute failure never rolls back
        // the listing save; runs in its own REQUIRES_NEW transaction after commit completes)
        qualityRecomputeService.recomputeAfterCommit(saved.getId());
        return saved;
    }

    /**
     * Applies the net-new residential scalar/boolean fields onto the entity. Null-safe:
     * a null field means "not supplied" and is left untouched (honest-null — never
     * defaulted to false/empty).
     */
    private void applyResidentialFields(Listing listing, ResidentialListingFields f) {
        if (f.bathrooms() != null) listing.setBathrooms(f.bathrooms());
        if (f.balconies() != null) listing.setBalconies(f.balconies());
        if (f.facing() != null) listing.setFacing(f.facing());
        if (f.availabilityTimeline() != null) listing.setAvailabilityTimeline(f.availabilityTimeline());
        if (f.superBuiltArea() != null) listing.setSuperBuiltArea(f.superBuiltArea());
        if (f.superBuiltAreaUnit() != null) listing.setSuperBuiltAreaUnit(f.superBuiltAreaUnit());
        if (f.propertyAge() != null) listing.setPropertyAge(f.propertyAge());
        if (f.residentialWaterSource() != null) listing.setResidentialWaterSource(f.residentialWaterSource());
        if (f.parking2wCount() != null) listing.setParking2wCount(f.parking2wCount());
        if (f.parking4wCount() != null) listing.setParking4wCount(f.parking4wCount());
        if (f.roadWidthFt() != null) listing.setRoadWidthFt(f.roadWidthFt());
        if (f.plotDimensions() != null) listing.setPlotDimensions(f.plotDimensions());
        if (f.conversionStatus() != null) listing.setConversionStatus(f.conversionStatus());
        if (f.khataNumber() != null) listing.setKhataNumber(f.khataNumber());
        if (f.propertyTaxPid() != null) listing.setPropertyTaxPid(f.propertyTaxPid());
        if (f.approvingAuthority() != null) listing.setApprovingAuthority(f.approvingAuthority());
        if (f.projectName() != null) listing.setProjectName(f.projectName());
        if (f.builderName() != null) listing.setBuilderName(f.builderName());
        if (f.maintenancePaise() != null) listing.setMaintenancePaise(f.maintenancePaise());
        if (f.hasLift() != null) listing.setHasLift(f.hasLift());
        if (f.hasPowerBackup() != null) listing.setHasPowerBackup(f.hasPowerBackup());
        if (f.isGated() != null) listing.setIsGated(f.isGated());
        if (f.hasGarden() != null) listing.setHasGarden(f.hasGarden());
        if (f.hasTerrace() != null) listing.setHasTerrace(f.hasTerrace());
        if (f.hasCompound() != null) listing.setHasCompound(f.hasCompound());
        if (f.hasServantRoom() != null) listing.setHasServantRoom(f.hasServantRoom());
        if (f.isCornerPlot() != null) listing.setIsCornerPlot(f.isCornerPlot());
        if (f.hasBoundaryWall() != null) listing.setHasBoundaryWall(f.hasBoundaryWall());
        if (f.isGatedLayout() != null) listing.setIsGatedLayout(f.isGatedLayout());
        if (f.hasWaterConnection() != null) listing.setHasWaterConnection(f.hasWaterConnection());
        if (f.hasElectricityConnection() != null) listing.setHasElectricityConnection(f.hasElectricityConnection());
        if (f.hasDrainage() != null) listing.setHasDrainage(f.hasDrainage());
        if (f.priceNegotiable() != null) listing.setPriceNegotiable(f.priceNegotiable());
        if (f.rentNegotiable() != null) listing.setRentNegotiable(f.rentNegotiable());
        if (f.petsAllowed() != null) listing.setPetsAllowed(f.petsAllowed());
        if (f.maintenanceIncluded() != null) listing.setMaintenanceIncluded(f.maintenanceIncluded());
    }

    /**
     * Writes the three multi-select child sets (amenities, special-location views, preferred
     * tenants) for a listing. EDIT/REPLACE semantics: a non-null list is the FINAL desired set —
     * existing rows for the listing are deleted first, then the new set (deduplicated,
     * order-preserving) is inserted. A null list means "not supplied in this request" and leaves
     * existing rows untouched. An empty (non-null) list clears all existing rows.
     *
     * <p>Explicit delete-then-insert (not JPA cascade/merge) so stale codes never linger —
     * required per architect decision on child-set edit semantics (#1626).
     */
    private void writeResidentialChildSets(UUID listingId, ResidentialListingFields f) {
        if (f.amenities() != null) {
            listingAmenityRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(f.amenities())) {
                ListingAmenity row = new ListingAmenity();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingAmenityRepository.save(row);
            }
        }
        if (f.specialLocationViews() != null) {
            listingLocationFeatureRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(f.specialLocationViews())) {
                ListingLocationFeature row = new ListingLocationFeature();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingLocationFeatureRepository.save(row);
            }
        }
        if (f.preferredTenants() != null) {
            listingPreferredTenantRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(f.preferredTenants())) {
                ListingPreferredTenant row = new ListingPreferredTenant();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingPreferredTenantRepository.save(row);
            }
        }
    }

    /**
     * Return listing count stats grouped by status for the given user.
     * Single query with GROUP BY; statuses with zero listings are not returned by
     * the query, so we default them to 0.
     */
    @Transactional(readOnly = true)
    public ListingStatsResponse getListingStats(UUID userId) {
        List<Object[]> rows = listingRepository.countByStatusForUser(userId);

        int draftCount = 0;
        int pendingReviewCount = 0;
        int liveCount = 0;
        int rejectedCount = 0;

        for (Object[] row : rows) {
            String status = (String) row[0];
            int count = ((Number) row[1]).intValue();
            switch (status) {
                case "DRAFT" -> draftCount = count;
                case "PENDING_REVIEW" -> pendingReviewCount = count;
                case "LIVE" -> liveCount = count;
                case "REJECTED" -> rejectedCount = count;
                default -> log.debug("Ignoring unknown status '{}' in stats for userId={}", status, userId);
            }
        }

        int totalCount = draftCount + pendingReviewCount + liveCount + rejectedCount;
        return new ListingStatsResponse(
                draftCount, pendingReviewCount, liveCount, rejectedCount, totalCount);
    }

    /**
     * Return paginated non-archived listings owned by the given user.
     * When {@code status} is non-null, only listings with that status are returned.
     * Archived listings are always excluded regardless of the status filter.
     * Sort order is determined by the supplied {@link Pageable} (default: createdAt DESC).
     */
    @Transactional(readOnly = true)
    public Page<Listing> getListingsByOwner(UUID createdBy, String status, Pageable pageable) {
        if (status != null && !status.isBlank()) {
            return listingRepository.findByCreatedByAndStatusAndArchivedAtIsNull(createdBy, status, pageable);
        }
        return listingRepository.findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(createdBy, pageable);
    }

    /**
     * Update a listing. Enforces ownership (unless admin) and status constraints.
     *
     * @return the updated listing
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingOwnershipException if listing is owned by a different user
     * @throws ListingStatusException    if status does not allow updates
     */
    @Transactional
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description) {
        return updateListing(listingId, userId, isAdmin,
                propertyType, title, locality, price, description, null, null, null, null, null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Update a listing with extended fields. Enforces ownership (unless admin) and status constraints.
     * All parameters are optional (null = leave unchanged).
     *
     * @return the updated listing
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingOwnershipException if listing is owned by a different user
     * @throws ListingStatusException    if status does not allow updates
     */
    @Transactional
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Update a listing with extended fields including videoUrl (pre-commercial overload).
     */
    @Transactional
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed, Double latitude, Double longitude,
                                 String landAreaUnit, String builtAreaUnit,
                                 String videoUrl, boolean applyVideoUrl,
                                 String reraNumber) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude,
                landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    /**
     * Update a listing with extended fields including videoUrl and commercial/rent fields.
     *
     * <p>videoUrl is only applied when {@code applyVideoUrl} is {@code true}. This distinguishes
     * "caller explicitly sent the videoUrl field" (true → apply: null clears, non-null sets)
     * from "caller omitted the field" (false → skip, preserving the existing stored value).
     * Blank→null normalisation is performed by the controller before this method is called.
     *
     * @return the updated listing
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingOwnershipException if listing is owned by a different user
     * @throws ListingStatusException    if status does not allow updates
     */
    @Transactional
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed, Double latitude, Double longitude,
                                 String landAreaUnit, String builtAreaUnit,
                                 String videoUrl, boolean applyVideoUrl,
                                 String reraNumber,
                                 String listingPurpose,
                                 BigDecimal carpetArea, String carpetAreaUnit,
                                 Integer floorNumber, Integer totalFloors,
                                 String furnishingStatus, Integer washrooms, Integer parkingCount,
                                 BigDecimal roadFrontageFt, String commercialUsage, Integer numberOfUnits,
                                 Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths,
                                 // RERA & possession fields (RE-99)
                                 String possessionStatus,
                                 LocalDate expectedPossessionDate,
                                 String approvalsDeclared,
                                 // Agricultural land fields
                                 String waterSource, String soilType, String roadAccess,
                                 String cultivationStatus, String ownershipType, String surveyNumber,
                                 String landCategory, Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude,
                landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths,
                possessionStatus, expectedPossessionDate, approvalsDeclared,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, farmhouseAvailable, fencingDone, boundaryGeoJson,
                ResidentialListingFields.EMPTY);
    }

    /**
     * Update a listing with extended fields including residential typed-listing fields
     * (M38-13A / #1626). All parameters from the previous overload behave identically;
     * {@code residentialFields} carries the net-new residential design-spec fields (nullable
     * fields left unchanged; a non-null {@code List<String>} in the multi-selects REPLACES the
     * existing child-set rows for this listing — see {@link ResidentialListingFields}).
     *
     * @return the updated listing
     * @throws ListingNotFoundException  if listing not found
     * @throws ListingOwnershipException if listing is owned by a different user
     * @throws ListingStatusException    if status does not allow updates
     */
    @Transactional
    @SuppressWarnings("java:S107") // mirrors existing flat-request telescoping pattern in this class
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed, Double latitude, Double longitude,
                                 String landAreaUnit, String builtAreaUnit,
                                 String videoUrl, boolean applyVideoUrl,
                                 String reraNumber,
                                 String listingPurpose,
                                 BigDecimal carpetArea, String carpetAreaUnit,
                                 Integer floorNumber, Integer totalFloors,
                                 String furnishingStatus, Integer washrooms, Integer parkingCount,
                                 BigDecimal roadFrontageFt, String commercialUsage, Integer numberOfUnits,
                                 Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths,
                                 // RERA & possession fields (RE-99)
                                 String possessionStatus,
                                 LocalDate expectedPossessionDate,
                                 String approvalsDeclared,
                                 // Agricultural land fields
                                 String waterSource, String soilType, String roadAccess,
                                 String cultivationStatus, String ownershipType, String surveyNumber,
                                 String landCategory, Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson,
                                 ResidentialListingFields residentialFields) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, userId, isAdmin);

        // Admins may edit listings in any non-archived status (including LIVE).
        // Brokers are restricted to DRAFT and REJECTED only.
        if (!isAdmin && !UPDATABLE_STATUSES.contains(listing.getStatus())) {
            throw new ListingStatusException("Cannot update listing with status " + listing.getStatus());
        }

        // Snapshot trust-relevant fields before the update so badge invalidation
        // can detect which fields changed.
        Map<String, Object> previousValues = snapshotTrustFields(listing);

        // Capture the old price in paise before applying changes, for price-change logging.
        // pricePaise and price (rupees BigDecimal) are independent fields; pricePaise may be null
        // on listings created before the paise column was added. Prefer the stored pricePaise when
        // present; fall back to converting the rupee price (price * 100) when pricePaise is absent.
        Long oldPricePaise = listing.getPricePaise() != null
                ? listing.getPricePaise()
                : PriceParser.rupeesToPaise(listing.getPrice());

        if (propertyType != null) listing.setPropertyType(propertyType);
        if (title != null) listing.setTitle(title);
        if (locality != null) listing.setLocality(locality);
        if (price != null) {
            listing.setPrice(price);
            listing.setPricePaise(PriceParser.rupeesToPaise(price));
        }
        if (description != null) listing.setDescription(description);
        if (landArea != null) listing.setLandArea(landArea);
        if (bedrooms != null) listing.setBedrooms(bedrooms);
        if (builtArea != null) listing.setBuiltArea(builtArea);
        if (addressConfirmed != null) listing.setAddressConfirmed(addressConfirmed);
        if (latitude != null) listing.setLatitude(latitude);
        if (longitude != null) listing.setLongitude(longitude);
        if (landAreaUnit != null) listing.setLandAreaUnit(landAreaUnit);
        if (builtAreaUnit != null) listing.setBuiltAreaUnit(builtAreaUnit);
        // Recompute derived area fields only when both area and unit are present in this request.
        if (landArea != null && landAreaUnit != null) {
            AreaNormalizer.normalize(listing);
        }
        // Only apply when caller explicitly sent the videoUrl field.
        if (applyVideoUrl) listing.setVideoUrl(videoUrl);
        if (reraNumber != null) listing.setReraNumber(reraNumber);

        // Commercial & rent fields
        if (listingPurpose != null && !listingPurpose.isBlank()) listing.setListingPurpose(listingPurpose);
        if (carpetArea != null) listing.setCarpetArea(carpetArea);
        if (carpetAreaUnit != null) listing.setCarpetAreaUnit(carpetAreaUnit);
        if (floorNumber != null) listing.setFloorNumber(floorNumber);
        if (totalFloors != null) listing.setTotalFloors(totalFloors);
        if (furnishingStatus != null) listing.setFurnishingStatus(furnishingStatus);
        if (washrooms != null) listing.setWashrooms(washrooms);
        if (parkingCount != null) listing.setParkingCount(parkingCount);
        if (roadFrontageFt != null) listing.setRoadFrontageFt(roadFrontageFt);
        if (commercialUsage != null) listing.setCommercialUsage(commercialUsage);
        if (numberOfUnits != null) listing.setNumberOfUnits(numberOfUnits);
        if (monthlyRent != null) listing.setMonthlyRent(monthlyRent);
        if (securityDepositMonths != null) listing.setSecurityDepositMonths(securityDepositMonths);
        if (lockInMonths != null) listing.setLockInMonths(lockInMonths);

        // RERA & possession fields (RE-99). These fields are intentionally one-way-set:
        // once written, they cannot be cleared to null via a PUT (no apply* flag).
        // Clearing support can be added in a follow-up if needed (RE-99 product decision).
        if (possessionStatus != null) listing.setPossessionStatus(possessionStatus);
        if (expectedPossessionDate != null) listing.setExpectedPossessionDate(expectedPossessionDate);
        if (approvalsDeclared != null) listing.setApprovalsDeclared(approvalsDeclared);

        // Polygon boundary: validate before save, persist after save
        // Resolve the effective property type for validation (use incoming type if provided, else existing)
        String effectivePropertyType = propertyType != null ? propertyType : listing.getPropertyType();
        if (boundaryGeoJson != null) {
            polygonBoundaryValidator.validate(boundaryGeoJson, effectivePropertyType);
        }

        // Agricultural land fields
        if (waterSource != null) listing.setWaterSource(waterSource);
        if (soilType != null) listing.setSoilType(soilType);
        if (roadAccess != null) listing.setRoadAccess(roadAccess);
        if (cultivationStatus != null) listing.setCultivationStatus(cultivationStatus);
        if (ownershipType != null) listing.setOwnershipType(ownershipType);
        if (surveyNumber != null) listing.setSurveyNumber(surveyNumber);
        if (landCategory != null) listing.setLandCategory(landCategory);
        if (farmhouseAvailable != null) listing.setFarmhouseAvailable(farmhouseAvailable);
        if (fencingDone != null) listing.setFencingDone(fencingDone);

        // Residential typed listing fields (M38-13A / #1626)
        applyResidentialFields(listing, residentialFields);
        // DB axis: stamp listing_family='RESIDENTIAL' for all 4 residential subtypes, using the
        // effective (post-update) property type. Independent of Java-side validation family.
        if (RESIDENTIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily("RESIDENTIAL");
        }

        // Recompute dedupe hash if any hash-relevant field changed
        if (description != null || locality != null || price != null) {
            listingDeduplicationService.computeAndSetDedupeHash(
                    listing, listing.getDescription(), listing.getLocality(), listing.getPrice());
            listingDeduplicationService.checkAndMarkDuplicateExcludingSelf(listing);
        }

        OffsetDateTime now = OffsetDateTime.now();
        listing.setUpdatedAt(now);
        listing.setLastUpdatedAt(now);

        // Insert a price-change record when the price actually changed for non-DRAFT listings.
        // DRAFT price edits are internal and do not belong in the market transparency log.
        // newPricePaise is computed from the caller-supplied price (same conversion already applied
        // by setPricePaise above) so the log entry is consistent with the stored pricePaise value.
        if (price != null
                && !ListingStatus.DRAFT.toDbValue().equals(listing.getStatus())) {
            Long newPricePaise = PriceParser.rupeesToPaise(price);
            if (!Objects.equals(oldPricePaise, newPricePaise)) {
                PriceChangeLog log2 = new PriceChangeLog();
                log2.setListingId(listing.getId());
                log2.setOldPricePaise(oldPricePaise);
                log2.setNewPricePaise(newPricePaise);
                log2.setChangedAt(now);
                priceChangeLogRepository.save(log2);
            }
        }

        Listing saved = listingRepository.save(listing);
        // Child-set REPLACE (delete-then-insert) — the request's list is the FINAL desired set.
        writeResidentialChildSets(saved.getId(), residentialFields);

        // Persist boundary via native SQL (after JPA save, within same @Transactional scope).
        // Mapper re-fetches boundary via findBoundaryGeoJson — no need to set @Transient field here.
        if (boundaryGeoJson != null) {
            listingRepository.updateBoundary(saved.getId(), boundaryGeoJson);
        }

        log.info("Updated listing listingId={} by userId={}", listingId, userId);
        searchOutboxWriter.writeEvent(
                saved.getId(),
                SearchOutboxEventType.LISTING_UPDATED,
                SearchOutboxOperation.INDEX,
                saved.getStatus(),
                saved.getUpdatedAt() != null ? saved.getUpdatedAt().toInstant() : null);

        // Revoke EARNED badges whose trust-relevant fields changed in this edit.
        // This runs inside the same transaction — if invalidation fails, the whole update
        // rolls back rather than leaving listing data and badge state inconsistent.
        Map<String, Object> newValues = snapshotTrustFields(saved);
        badgeInvalidationService.invalidateOnEdit(listingId, previousValues, newValues);

        // Trigger settlement enrichment when address is confirmed and coordinates are present.
        // Only for property types where settlement context adds value (land, house, commercial).
        if (saved.isAddressConfirmed()
                && saved.getLatitude() != null && saved.getLongitude() != null
                && PoiQueryProfile.forPropertyType(saved.getPropertyType()).hasSettlementQueries()) {
            applicationEventPublisher.publishEvent(
                    new SettlementEnrichmentRequestedEvent(
                            saved.getId(), saved.getLatitude(), saved.getLongitude(), saved.getPropertyType()));
            log.debug("SettlementEnrichmentRequestedEvent published listingId={} propertyType={}",
                    saved.getId(), saved.getPropertyType());
        }

        // Trigger quality recompute after commit (any field change may affect score;
        // runs in its own REQUIRES_NEW transaction, isolated from this write)
        qualityRecomputeService.recomputeAfterCommit(saved.getId());
        return saved;
    }

    /**
     * Captures a snapshot of the listing fields that are relevant for badge invalidation.
     * Called before and after applying field updates so {@link BadgeInvalidationService}
     * can determine which material fields changed.
     *
     * <p>Keys match the field names used by {@link BadgeInvalidationService}:
     * {@code latitude}, {@code longitude}, {@code locality}, {@code areaKey},
     * {@code propertyType}.
     */
    private Map<String, Object> snapshotTrustFields(Listing listing) {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("latitude", listing.getLatitude());
        snapshot.put("longitude", listing.getLongitude());
        snapshot.put("locality", listing.getLocality());
        snapshot.put("areaKey", listing.getAreaKey());
        snapshot.put("propertyType", listing.getPropertyType());
        return snapshot;
    }

    /**
     * Soft-delete a listing. Only DRAFT or REJECTED status allowed. Enforces ownership unless admin.
     * Sets {@code archived_at = now()} and {@code status = ARCHIVED}; no rows are hard-deleted so
     * all related data (listing_images, pois, viewing_requests) is preserved.
     *
     * @throws ListingNotFoundException if listing not found, not owned, or already archived
     * @throws ListingStatusException   if status is not DRAFT or REJECTED
     */
    @Transactional
    public void deleteListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, userId, isAdmin);

        String status = listing.getStatus();
        if (!ListingStatus.DRAFT.toDbValue().equals(status) && !ListingStatus.REJECTED.toDbValue().equals(status)) {
            throw new ListingStatusException("Cannot delete listing with status " + status);
        }

        listing.setArchivedAt(Instant.now());
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setUpdatedAt(OffsetDateTime.now());
        listingRepository.save(listing);
        log.info("Soft-deleted (archived) listing listingId={} by userId={}", listingId, userId);
        searchOutboxWriter.writeEvent(
                listing.getId(),
                SearchOutboxEventType.LISTING_DELETED,
                SearchOutboxOperation.DELETE,
                listing.getStatus(),
                listing.getUpdatedAt() != null ? listing.getUpdatedAt().toInstant() : null);
    }

    /**
     * Bulk-deletes listings by ID.  Each listing is validated independently:
     * must be owned by the caller and in DRAFT or REJECTED status.
     * Returns a result summarising successes and per-ID errors.
     */
    @Transactional
    public BulkDeleteResult bulkDeleteListings(List<UUID> ids, UUID userId, boolean isAdmin) {
        int deleted = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();

        for (UUID id : ids) {
            try {
                deleteListing(id, userId, isAdmin);
                deleted++;
            } catch (ListingNotFoundException | ListingOwnershipException | ListingStatusException e) {
                skipped++;
                errors.add(id + ": " + e.getMessage());
            } catch (org.springframework.dao.DataAccessException e) {
                skipped++;
                errors.add(id + ": " + e.getMessage());
            }
        }
        return new BulkDeleteResult(deleted, skipped, errors);
    }
}
