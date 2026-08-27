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
import com.example.realestate.listing.agricultural.ListingAgriCrop;
import com.example.realestate.listing.agricultural.ListingAgriCropRepository;
import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.commercial.ListingSuitableUse;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
import com.example.realestate.listing.residential.ListingAmenity;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeature;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenant;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.residential.ResidentialListingFields;
import com.example.realestate.listing.typed.CommercialSpaceDetailRepository;
import com.example.realestate.listing.typed.ResidentialUnitDetailRepository;
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
    private final ListingSuitableUseRepository listingSuitableUseRepository;
    private final CommercialSpaceDetailRepository commercialSpaceDetailRepository;
    private final ResidentialUnitDetailRepository residentialUnitDetailRepository;
    private final ListingAgriCropRepository listingAgriCropRepository;

    /** Agricultural property type (single value; no family-set precedent needed). */
    private static final String AGRICULTURAL_PROPERTY_TYPE = "agricultural_land";

    /** Residential-family property types (M38-13A / #1626) that get the DB listing_family stamp. */
    private static final Set<String> RESIDENTIAL_PROPERTY_TYPES =
            Set.of("house", "apartment", "villa", "residential_plot");

    /** Commercial-family property types (M38-FU2 / #1730) that get the DB listing_family stamp. */
    private static final Set<String> COMMERCIAL_PROPERTY_TYPES =
            Set.of("commercial", "commercial_building", "warehouse", "commercial_land");

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
            ListingPreferredTenantRepository listingPreferredTenantRepository,
            ListingSuitableUseRepository listingSuitableUseRepository,
            CommercialSpaceDetailRepository commercialSpaceDetailRepository,
            ResidentialUnitDetailRepository residentialUnitDetailRepository,
            ListingAgriCropRepository listingAgriCropRepository) {
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
        this.listingSuitableUseRepository = listingSuitableUseRepository;
        this.commercialSpaceDetailRepository = commercialSpaceDetailRepository;
        this.residentialUnitDetailRepository = residentialUnitDetailRepository;
        this.listingAgriCropRepository = listingAgriCropRepository;
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
                "dealer", null, null, null, null, null, null, null, null, null, null);
    }

    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               String videoUrl) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                null, null, null, null, null, videoUrl,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null);
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
                "dealer", null, null, null, null, null, null, null, null, null, null);
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
                               String landCategory, String agriConversionStatus,
                               Boolean farmhouseAvailable, Boolean fencingDone) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths, sellerType,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone,
                ResidentialListingFields.EMPTY);
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
                               String landCategory, String agriConversionStatus,
                               Boolean farmhouseAvailable, Boolean fencingDone,
                               ResidentialListingFields residentialFields) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths, sellerType,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, residentialFields,
                CommercialListingFields.EMPTY);
    }

    /**
     * Create a new listing with status DRAFT, including commercial typed-listing fields
     * (M38-FU2 / #1730). All parameters from the previous overload behave identically;
     * {@code commercialFields} carries the net-new commercial design-spec fields as a single
     * bounded value object (see {@link CommercialListingFields} for rationale).
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
                               String landCategory, String agriConversionStatus,
                               Boolean farmhouseAvailable, Boolean fencingDone,
                               ResidentialListingFields residentialFields,
                               CommercialListingFields commercialFields) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths, sellerType,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone,
                residentialFields, commercialFields, null);
    }

    /**
     * Create a new listing with status DRAFT, including agricultural crop selections (#2044).
     * All parameters from the previous overload behave identically; {@code crops} is the FINAL
     * desired set of crop codes for the new {@code listing_agri_crops} child table — REPLACE
     * semantics, deduplicated, order-preserving (see {@link #writeAgriChildSets}). {@code null}
     * means "no crops supplied"; an empty list is a valid "no crops" declaration.
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
                               String landCategory, String agriConversionStatus,
                               Boolean farmhouseAvailable, Boolean fencingDone,
                               ResidentialListingFields residentialFields,
                               CommercialListingFields commercialFields,
                               List<String> crops) {
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
        // Snapshot the family stamp as it existed BEFORE this create (#1734 cycle-3 fix) — see
        // the family-reset gate below. Always null for a brand-new entity; captured here purely
        // for symmetry with updateListing's identical gate (so both call sites read the same way
        // and neither silently drifts if this method is ever changed to pre-populate the field).
        String previousListingFamily = listing.getListingFamily();
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
        if (agriConversionStatus != null) listing.setAgriConversionStatus(agriConversionStatus);
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

        // Commercial typed listing fields (M38-FU2 / #1730)
        applyCommercialFields(listing, commercialFields);
        // DB axis: stamp listing_family='COMMERCIAL' for all 4 commercial subtypes.
        if (COMMERCIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily("COMMERCIAL");
        }
        // Family reset (#1734 cycle-2 fix, gate corrected in cycle-3): only clears a PRIOR
        // RESIDENTIAL/COMMERCIAL stamp (owned by this class) — see updateListing's identical
        // gate for the full rationale (AGRICULTURAL, stamped only by the V102 backfill DML, must
        // never be clobbered). Always a no-op here since previousListingFamily is always null for
        // a brand-new entity; retained for symmetry with updateListing so both call sites read
        // identically and neither silently drifts.
        boolean previousFamilyOwnedByThisClass =
                "RESIDENTIAL".equals(previousListingFamily) || "COMMERCIAL".equals(previousListingFamily);
        if (previousFamilyOwnedByThisClass
                && !RESIDENTIAL_PROPERTY_TYPES.contains(listing.getPropertyType())
                && !COMMERCIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily(null);
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
        // Family-gated child-set writes (#2038 rework) — effectiveType is read AFTER the property
        // type has been finalized and saved, so this reflects the actual listing family rather
        // than the request payload shape. A cross-family sentinel (e.g. commercialFields.utilities
        // = [] submitted alongside a residential listing) must never reach the OTHER family's
        // writer — both writers share the listing_amenities table, and running the inapplicable
        // writer would bulk-delete rows the applicable writer just inserted in the same request.
        // No family-switch cleanup is needed here (unlike updateListing): a brand-new listing id
        // has no prior child-set rows in any table, so there is nothing to clean up.
        String effectiveType = saved.getPropertyType();
        boolean isResidentialFamily = RESIDENTIAL_PROPERTY_TYPES.contains(effectiveType);
        boolean isCommercialFamily = COMMERCIAL_PROPERTY_TYPES.contains(effectiveType);
        boolean isAgriFamily = AGRICULTURAL_PROPERTY_TYPE.equals(effectiveType);
        if (isResidentialFamily) {
            writeResidentialChildSets(saved.getId(), residentialFields);
        }
        if (isCommercialFamily) {
            writeCommercialChildSets(saved.getId(), commercialFields);
        }
        if (isAgriFamily) {
            writeAgriChildSets(saved.getId(), crops);
        }
        // Typed detail projection refresh (#1734) — keeps listing_commercial_space_details /
        // listing_residential_unit_details current for the search indexer read path. No
        // AGRICULTURAL branch: listing_agricultural_land_details (V102) is a read-only,
        // backfill-only projection with no upsert repository method (unlike
        // CommercialSpaceDetailRepository/ResidentialUnitDetailRepository) and has no crops
        // column — crops live only in listing_agri_crops, which SearchOutboxPoller's indexer
        // read path does not consume via this table (#2044 R6 — see writeAgriChildSets javadoc).
        refreshTypedProjections(saved);
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
     *
     * <p><b>Caller precondition (#2038 rework):</b> callers MUST only invoke this method when the
     * listing's effective property type belongs to {@link #RESIDENTIAL_PROPERTY_TYPES}. This
     * method does not itself check family — it is a plain writer — so an inapplicable-family
     * caller would bulk-delete {@code listing_amenities} rows regardless of whether {@code
     * f.amenities()} is null. Gating on family (not merely on which fields are non-null) is what
     * prevents a same-request commercial sentinel (e.g. {@code utilities: []}) from wiping
     * residential amenities just inserted in the same PUT.
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
     * Writes the agricultural crop multi-select child set ({@code listing_agri_crops}, #2044)
     * for a listing. EDIT/REPLACE semantics — mirrors {@link #writeResidentialChildSets(UUID,
     * ResidentialListingFields)} exactly: a non-null list is the FINAL desired set (existing rows
     * deleted first, then the new set — deduplicated, order-preserving — is inserted); a null
     * list leaves existing rows untouched; an empty (non-null) list clears all existing rows.
     *
     * <p><b>Caller precondition:</b> callers MUST only invoke this method when the listing's
     * effective property type is {@link #AGRICULTURAL_PROPERTY_TYPE}. This method does not itself
     * check family — it is a plain writer — mirroring the residential/commercial writers' caller
     * contract.
     *
     * <p><b>R6 (#2044):</b> unlike {@code refreshTypedProjections}, this writer has no interaction
     * with {@code listing_agricultural_land_details} — that table is a read-only, backfill-only
     * projection (V102) with no upsert repository method, and its {@code AgriculturalLandDetail}
     * entity carries no crops column. The search indexer ({@code SearchOutboxPoller}) reads
     * {@code AgriculturalLandDetail} for the AGRICULTURAL family but never {@code
     * listing_agri_crops}, so writing crops here has no projection-refresh implication.
     */
    private void writeAgriChildSets(UUID listingId, List<String> crops) {
        if (crops != null) {
            listingAgriCropRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(crops)) {
                ListingAgriCrop row = new ListingAgriCrop();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingAgriCropRepository.save(row);
            }
        }
    }

    /**
     * Applies the net-new commercial scalar/boolean fields onto the entity. Null-safe:
     * a null field means "not supplied" and is left untouched (honest-null — never
     * defaulted to false/empty).
     */
    private void applyCommercialFields(Listing listing, CommercialListingFields f) {
        if (f.commercialSubtype() != null) listing.setCommercialSubtype(f.commercialSubtype());
        if (f.floorChoice() != null) listing.setFloorChoice(f.floorChoice());
        if (f.floorMode() != null) listing.setFloorMode(f.floorMode());
        if (f.hubType() != null) listing.setHubType(f.hubType());
        if (f.washroomsPublic() != null) listing.setWashroomsPublic(f.washroomsPublic());
        if (f.washroomsPrivate() != null) listing.setWashroomsPrivate(f.washroomsPrivate());
        if (f.parkingPublicCount() != null) listing.setParkingPublicCount(f.parkingPublicCount());
        if (f.parkingPrivateCount() != null) listing.setParkingPrivateCount(f.parkingPrivateCount());
        if (f.officeSeats() != null) listing.setOfficeSeats(f.officeSeats());
        if (f.officeCabins() != null) listing.setOfficeCabins(f.officeCabins());
        if (f.officeMeetingRooms() != null) listing.setOfficeMeetingRooms(f.officeMeetingRooms());
        if (f.occupancyStatus() != null) listing.setOccupancyStatus(f.occupancyStatus());
        if (f.powerLoadKva() != null) listing.setPowerLoadKva(f.powerLoadKva());
        if (f.warehouseClearHeightFt() != null) listing.setWarehouseClearHeightFt(f.warehouseClearHeightFt());
        if (f.warehouseLoadingBays() != null) listing.setWarehouseLoadingBays(f.warehouseLoadingBays());
        if (f.warehouseTruckAccess() != null) listing.setWarehouseTruckAccess(f.warehouseTruckAccess());
        if (f.warehouseFlooring() != null) listing.setWarehouseFlooring(f.warehouseFlooring());
        if (f.commercialZoning() != null) listing.setCommercialZoning(f.commercialZoning());
        if (f.commercialOwnership() != null) listing.setCommercialOwnership(f.commercialOwnership());
        if (f.commercialApprovals() != null) listing.setCommercialApprovals(f.commercialApprovals());
        if (f.expectedRentalYieldPct() != null) listing.setExpectedRentalYieldPct(f.expectedRentalYieldPct());
        if (f.currentMonthlyIncomePaise() != null) listing.setCurrentMonthlyIncomePaise(f.currentMonthlyIncomePaise());
        if (f.leaseTermMonths() != null) listing.setLeaseTermMonths(f.leaseTermMonths());
        if (f.leaseEscalationPct() != null) listing.setLeaseEscalationPct(f.leaseEscalationPct());
        if (f.commercialFurnishingStatus() != null) listing.setCommercialFurnishingStatus(f.commercialFurnishingStatus());
        if (f.commercialAvailability() != null) listing.setCommercialAvailability(f.commercialAvailability());
        if (f.commercialAreaUnit() != null) listing.setCommercialAreaUnit(f.commercialAreaUnit());
    }

    /**
     * Nulls out commercial scalar fields that do not belong to {@code resolvedSubtype} (#2289).
     *
     * <p>Mirrors the exact per-subtype field ownership enforced on input by {@link
     * com.example.realestate.listing.api.ListingController#validateCommercialFieldSet} — a field
     * this method clears here is the same field that gate would reject a client for supplying
     * against this subtype. Kept in sync with that gate deliberately: both express the same
     * "which fields belong to which commercial subtype" policy, one on the way in, one on the
     * way out.
     *
     * <p>Without this, {@link #applyCommercialFields} — a pure "set-if-supplied" merge — leaves
     * a prior subtype's values in place forever once written, because a PUT that switches
     * subtype (e.g. OFFICE -> WAREHOUSE) legitimately omits the old subtype's fields from its
     * payload (there is nothing to "supply" for a subtype the caller is moving away from).
     *
     * <p>No-op when {@code resolvedSubtype} is null (the ambiguous legacy {@code 'commercial'}
     * property type, whose stored {@code commercial_subtype} is intentionally left NULL) —
     * nothing structural can be resolved against an unknown subtype, mirroring the validation
     * gate's own skip in that case.
     *
     * <p>Deliberately scoped to the per-subtype scalar/boolean columns only — the sale-vs-rent
     * gate (leaseTermMonths/leaseEscalationPct vs expectedRentalYieldPct/currentMonthlyIncomePaise)
     * is governed by listingPurpose, and {@code suitableUses} is governed by its own
     * REPLACE-semantics writer, not by subtype, so both are out of scope for this method. The
     * one exception is {@code utilities} for a LAND subtype: see the LAND branch below (#2289
     * follow-up).
     */
    private void clearStaleCommercialSubtypeFields(
            Listing listing, String resolvedSubtype, CommercialListingFields f) {
        if (resolvedSubtype == null) {
            return;
        }
        boolean isShopOrOffice = "SHOP".equals(resolvedSubtype) || "OFFICE".equals(resolvedSubtype);
        if (!isShopOrOffice) {
            listing.setFloorChoice(null);
            listing.setHubType(null);
        }
        if (!"BUILDING".equals(resolvedSubtype)) {
            listing.setFloorMode(null);
            listing.setPowerLoadKva(null);
        }
        if (!"OFFICE".equals(resolvedSubtype)) {
            listing.setOfficeSeats(null);
            listing.setOfficeCabins(null);
            listing.setOfficeMeetingRooms(null);
        }
        if (!"WAREHOUSE".equals(resolvedSubtype)) {
            listing.setWarehouseClearHeightFt(null);
            listing.setWarehouseLoadingBays(null);
            listing.setWarehouseTruckAccess(null);
            listing.setWarehouseFlooring(null);
        }
        if (!"LAND".equals(resolvedSubtype)) {
            listing.setCommercialZoning(null);
            listing.setCommercialOwnership(null);
            listing.setCommercialApprovals(null);
        } else {
            // LAND: none of the built-space-only fields below apply.
            listing.setWashroomsPublic(null);
            listing.setWashroomsPrivate(null);
            listing.setParkingPublicCount(null);
            listing.setParkingPrivateCount(null);
            listing.setCommercialFurnishingStatus(null);
            // #2289 follow-up: `utilities` is LAND-excluded on input — validateCommercialFieldSet
            // rejects a LAND payload that supplies it (rejectIfNonEmpty("utilities", ...)) — but
            // it lives in the listing_amenities child table, not a scalar column, so it is written
            // by writeCommercialChildSets, not this method. That writer only deletes+reinserts
            // listing_amenities rows when the incoming utilities list is non-null; a natural
            // subtype-switch-into-LAND PUT omits utilities entirely (there is nothing valid to
            // supply for an excluded field), so without this explicit clear, amenity rows from
            // whatever subtype the listing had before survive as stale, LAND-invalid data — the
            // same root-cause bug as the scalar fields above, just in a child table instead of a
            // column. Only fires when the caller left utilities unsupplied (null); an explicit
            // non-null list (including []) is still respected by writeCommercialChildSets as-is.
            if (f.utilities() == null && listing.getId() != null) {
                listingAmenityRepository.deleteByListingId(listing.getId());
            }
        }
        boolean isShopOrBuilding = "SHOP".equals(resolvedSubtype) || "BUILDING".equals(resolvedSubtype);
        if (!isShopOrBuilding) {
            listing.setOccupancyStatus(null);
        }
    }

    /**
     * Writes the two multi-select commercial child sets (utilities, suitable uses) for a listing.
     * EDIT/REPLACE semantics — mirrors {@link #writeResidentialChildSets(UUID, ResidentialListingFields)}
     * exactly: a non-null list is the FINAL desired set (existing rows deleted first, then the new
     * set — deduplicated, order-preserving — is inserted); a null list leaves existing rows
     * untouched; an empty (non-null) list clears all existing rows.
     *
     * <p>{@code utilities} reuses the {@code listing_amenities} table (same shape as the
     * residential amenities multi-select) — see V104 migration note.
     *
     * <p><b>Caller precondition (#2038 rework):</b> callers MUST only invoke this method when the
     * listing's effective property type belongs to {@link #COMMERCIAL_PROPERTY_TYPES}. Because
     * {@code utilities} shares {@code listing_amenities} with the residential amenities writer,
     * calling this method for a residential listing (e.g. because {@code commercialFields.utilities()}
     * happens to be a non-null empty list, which is an accepted "not applicable" sentinel per
     * {@code rejectIfNonEmpty} in {@code ListingController}) would bulk-delete the residential
     * amenities the OTHER writer just inserted in the same request. This method does not check
     * family itself; the family gate lives at the call sites in {@code createDraft}/{@code
     * updateListing}.
     */
    private void writeCommercialChildSets(UUID listingId, CommercialListingFields f) {
        if (f.utilities() != null) {
            listingAmenityRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(f.utilities())) {
                ListingAmenity row = new ListingAmenity();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingAmenityRepository.save(row);
            }
        }
        if (f.suitableUses() != null) {
            listingSuitableUseRepository.deleteByListingId(listingId);
            OffsetDateTime now = OffsetDateTime.now();
            for (String code : new LinkedHashSet<>(f.suitableUses())) {
                ListingSuitableUse row = new ListingSuitableUse();
                row.setListingId(listingId);
                row.setCode(code);
                row.setCreatedAt(now);
                listingSuitableUseRepository.save(row);
            }
        }
    }

    /**
     * Refreshes the typed detail-table projection for the listing's family, in the same
     * transaction as the {@code listingRepository.save()} call that must precede this method
     * (#1734). Idempotent: safe to call on every create and every update.
     *
     * <p>Routing by {@code listing.getListingFamily()}:
     * <ul>
     *   <li>COMMERCIAL — upsert {@code listing_commercial_space_details}, delete any stale
     *       {@code listing_residential_unit_details} row (family-switch cleanup).</li>
     *   <li>RESIDENTIAL — upsert {@code listing_residential_unit_details}, delete any stale
     *       {@code listing_commercial_space_details} row.</li>
     *   <li>Any other family (AGRICULTURAL, or null for legacy 'land'/'other' listings) —
     *       delete both rows. Population of the AGRICULTURAL/other projection tables is
     *       out of scope for #1734 (M38-FU4); this branch only prevents an orphaned row from
     *       a prior family surviving a family-switch.</li>
     * </ul>
     *
     * <p>Source columns are read from the listing's LEGACY flat fields (floorNumber,
     * totalFloors, furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage,
     * bedrooms, bathrooms) — mirroring the V102 backfill SELECTs, not the V104 split fields
     * (washroomsPublic/Private, officeSeats, warehouseClearHeightFt, etc.), so backfilled and
     * newly-written projection rows stay consistent for those columns.
     *
     * <p><b>Deliberate exception — {@code commercialSubtype}:</b> unlike the other commercial
     * source columns, this one is NOT a V102-backfill mirror — V102 hardcodes it to {@code NULL}
     * for every legacy row. It is intentionally sourced from {@code listing.getCommercialSubtype()}
     * (the V104/#1730 field) because populating it for newly created/updated commercial
     * listings is the core purpose of #1734. See
     * {@link CommercialSpaceDetailRepository#upsertFromListing} for the full rationale.
     */
    private void refreshTypedProjections(Listing listing) {
        String family = listing.getListingFamily();
        if ("COMMERCIAL".equals(family)) {
            commercialSpaceDetailRepository.upsertFromListing(
                    listing.getId(),
                    listing.getCommercialSubtype(),
                    listing.getFloorNumber(),
                    listing.getTotalFloors(),
                    listing.getFurnishingStatus(),
                    listing.getWashrooms(),
                    listing.getParkingCount(),
                    listing.getRoadFrontageFt(),
                    listing.getCommercialUsage());
            residentialUnitDetailRepository.deleteByListingId(listing.getId());
        } else if ("RESIDENTIAL".equals(family)) {
            residentialUnitDetailRepository.upsertFromListing(
                    listing.getId(),
                    listing.getBedrooms(),
                    listing.getBathrooms(),
                    listing.getFloorNumber(),
                    listing.getTotalFloors(),
                    listing.getFurnishingStatus());
            commercialSpaceDetailRepository.deleteByListingId(listing.getId());
        } else {
            commercialSpaceDetailRepository.deleteByListingId(listing.getId());
            residentialUnitDetailRepository.deleteByListingId(listing.getId());
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
     * Return paginated listings owned by the given user.
     * When {@code status} is non-null, only listings with that status are returned.
     * For any status other than ARCHIVED, archived listings are always excluded.
     * Requesting status=ARCHIVED explicitly surfaces the owner's archived listings
     * (archiving always sets archived_at, so the exclusion would otherwise be self-defeating).
     * Sort order is determined by the supplied {@link Pageable} (default: createdAt DESC).
     */
    @Transactional(readOnly = true)
    public Page<Listing> getListingsByOwner(UUID createdBy, String status, Pageable pageable) {
        if (status != null && !status.isBlank()) {
            if (ListingStatus.ARCHIVED.toDbValue().equals(status)) {
                return listingRepository.findByCreatedByAndStatus(createdBy, status, pageable);
            }
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
                null, null, null, null, null, null, null, null, null, null, null, null, null, null);
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
                null, null, null, null, null, null, null, null, null, null, null, null, null, null);
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
                null, null, null, null, null, null, null, null, null, null, null, null, null, null);
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
                                 String landCategory, String agriConversionStatus,
                                 Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude,
                landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths,
                possessionStatus, expectedPossessionDate, approvalsDeclared,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, boundaryGeoJson,
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
                                 String landCategory, String agriConversionStatus,
                                 Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson,
                                 ResidentialListingFields residentialFields) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude,
                landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths,
                possessionStatus, expectedPossessionDate, approvalsDeclared,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, boundaryGeoJson,
                residentialFields, CommercialListingFields.EMPTY);
    }

    /**
     * Update a listing with extended fields including commercial typed-listing fields
     * (M38-FU2 / #1730). All parameters from the previous overload behave identically;
     * {@code commercialFields} carries the net-new commercial design-spec fields (nullable
     * fields left unchanged; a non-null {@code List<String>} in the multi-selects REPLACES the
     * existing child-set rows for this listing — see {@link CommercialListingFields}).
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
                                 String landCategory, String agriConversionStatus,
                                 Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson,
                                 ResidentialListingFields residentialFields,
                                 CommercialListingFields commercialFields) {
        return updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude,
                landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths,
                possessionStatus, expectedPossessionDate, approvalsDeclared,
                waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber,
                landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, boundaryGeoJson,
                residentialFields, commercialFields, null);
    }

    /**
     * Update a listing with extended fields including agricultural crop selections (#2044).
     * All parameters from the previous overload behave identically; {@code crops} is the FINAL
     * desired set of crop codes for {@code listing_agri_crops} — REPLACE semantics, deduplicated,
     * order-preserving (see {@link #writeAgriChildSets}). {@code null} means "not supplied in
     * this request" (leave unchanged); an empty (non-null) list clears all existing crop rows.
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
                                 String landCategory, String agriConversionStatus,
                                 Boolean farmhouseAvailable, Boolean fencingDone,
                                 String boundaryGeoJson,
                                 ResidentialListingFields residentialFields,
                                 CommercialListingFields commercialFields,
                                 List<String> crops) {
        Listing listing = listingOwnershipGuard.findOwned(listingId, userId, isAdmin);

        // Admins may edit listings in any non-archived status (including LIVE).
        // Brokers are restricted to DRAFT and REJECTED only.
        if (!isAdmin && !UPDATABLE_STATUSES.contains(listing.getStatus())) {
            throw new ListingStatusException("Cannot update listing with status " + listing.getStatus());
        }

        // Snapshot the family stamp as it existed BEFORE this update (#1734 cycle-3 fix).
        // Required to distinguish stamps THIS CLASS owns (RESIDENTIAL/COMMERCIAL) from ones it
        // never writes (AGRICULTURAL, stamped only by the one-time V102 backfill DML) — see the
        // family-reset gate below.
        String previousListingFamily = listing.getListingFamily();

        // Snapshot the property type as it existed BEFORE this update (PR_REVIEW rework-cycle-1
        // fix). R5 below is keyed on this — not on previousListingFamily — because the family
        // gate a few lines below (isResidentialFamily/isCommercialFamily) is deliberately keyed
        // on property_type membership "to stay independent of the V102-backfilled stamp". Keying
        // R5 on the stamp instead would let any residential/commercial listing whose stamp is
        // stale or NULL (e.g. rows inserted by a bulk import rather than through this service)
        // skip cleanup entirely while the gate still switches writers underneath it. Must be
        // captured before propertyType is mutated below.
        String previousPropertyType = listing.getPropertyType();
        boolean wasResidentialFamily = RESIDENTIAL_PROPERTY_TYPES.contains(previousPropertyType);
        boolean wasCommercialFamily = COMMERCIAL_PROPERTY_TYPES.contains(previousPropertyType);
        // AC16 (#2044): mirrors wasResidentialFamily/wasCommercialFamily above — snapshotted
        // before propertyType is mutated below, so a family-switch AWAY from agricultural_land
        // can be detected and its listing_agri_crops rows cleaned up (see R5-style cleanup below).
        boolean wasAgriFamily = AGRICULTURAL_PROPERTY_TYPE.equals(previousPropertyType);

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
        if (agriConversionStatus != null) listing.setAgriConversionStatus(agriConversionStatus);
        if (farmhouseAvailable != null) listing.setFarmhouseAvailable(farmhouseAvailable);
        if (fencingDone != null) listing.setFencingDone(fencingDone);

        // Residential typed listing fields (M38-13A / #1626)
        applyResidentialFields(listing, residentialFields);
        // DB axis: stamp listing_family='RESIDENTIAL' for all 4 residential subtypes, using the
        // effective (post-update) property type. Independent of Java-side validation family.
        if (RESIDENTIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily("RESIDENTIAL");
        }

        // Commercial typed listing fields (M38-FU2 / #1730)
        applyCommercialFields(listing, commercialFields);
        // DB axis: stamp listing_family='COMMERCIAL' for all 4 commercial subtypes, using the
        // effective (post-update) property type. Independent of Java-side validation family.
        if (COMMERCIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily("COMMERCIAL");
            // #2289: null out any commercial scalar fields that do not belong to the resolved
            // (post-update) commercial_subtype. Without this, a subtype change (e.g. an OFFICE
            // listing whose propertyType/subtype is switched to WAREHOUSE with no OFFICE fields
            // in the payload) leaves the previous subtype's fields (officeSeats, etc.) stored as
            // stale, semantically-invalid data for the new subtype. applyCommercialFields above
            // is a pure "set-if-supplied" merge and never clears anything on its own.
            clearStaleCommercialSubtypeFields(listing, listing.getCommercialSubtype(), commercialFields);
        }
        // Family reset (#1734 cycle-2 fix, gate corrected in cycle-3): if the PRIOR family stamp
        // was one THIS CLASS owns (RESIDENTIAL/COMMERCIAL) and the effective (post-update)
        // propertyType now matches neither typed set (e.g. switched to 'land', 'other',
        // 'agricultural_land'), the stamp must not silently survive as a stale RESIDENTIAL/
        // COMMERCIAL value — refreshTypedProjections and SearchOutboxPoller both route purely
        // off this field, so a stale stamp would keep upserting/serving the wrong typed
        // projection forever.
        //
        // Gated on previousListingFamily (snapshotted before any stamping above) rather than on
        // "propertyType matches neither typed set" alone: an AGRICULTURAL stamp is written ONLY
        // by the one-time V102 backfill DML, never by this class. An ordinary title/price-only
        // edit of an existing agricultural_land listing (propertyType param null, effective type
        // stays agricultural_land — which is itself outside both typed sets) must NOT be treated
        // as a "switch away from a typed family" and must NOT have its AGRICULTURAL stamp
        // clobbered to null — that was a real regression against production V102-backfilled data
        // in the first version of this fix. Any other pre-existing value (AGRICULTURAL, or an
        // already-null stamp) is left completely untouched by this branch.
        boolean previousFamilyOwnedByThisClass =
                "RESIDENTIAL".equals(previousListingFamily) || "COMMERCIAL".equals(previousListingFamily);
        if (previousFamilyOwnedByThisClass
                && !RESIDENTIAL_PROPERTY_TYPES.contains(listing.getPropertyType())
                && !COMMERCIAL_PROPERTY_TYPES.contains(listing.getPropertyType())) {
            listing.setListingFamily(null);
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
        // Family-gated child-set REPLACE (delete-then-insert; #2038 rework). effectiveType is read
        // AFTER the property type has been finalized and saved, so this reflects the actual
        // post-update listing family rather than the request payload shape. A cross-family
        // sentinel (e.g. commercialFields.utilities = [] submitted alongside a residential update)
        // must never reach the OTHER family's writer — both writers share the listing_amenities
        // table, and running the inapplicable writer would bulk-delete rows the applicable writer
        // just inserted in the same request. Neither writer runs for AGRICULTURAL / null / legacy
        // 'land'/'other' listings.
        String effectiveType = saved.getPropertyType();
        boolean isResidentialFamily = RESIDENTIAL_PROPERTY_TYPES.contains(effectiveType);
        boolean isCommercialFamily = COMMERCIAL_PROPERTY_TYPES.contains(effectiveType);
        boolean isAgriFamily = AGRICULTURAL_PROPERTY_TYPE.equals(effectiveType);

        // Family-switch cleanup (R5, #2038 rework, broadened in PR_REVIEW rework-cycle-1): if this
        // update moved the listing OUT of the family whose child rows previously applied, those
        // now-inapplicable rows must be deleted BEFORE the newly-applicable writer runs below.
        // Without this, surviving listing_amenities rows from the old family would be re-read as
        // the NEW family's data by ListingResponseMapper (residential amenities shown as
        // commercial utilities, or vice versa) — a fresh cross-family data-integrity bug the
        // family gate above would otherwise introduce on a genuine family switch.
        //
        // Predicate is "left the family" (wasX && !isXFamily), not "switched into the OTHER typed
        // family" (the original #2038 version). The original predicate under-deleted: property_type
        // has 11 CHECK-constraint values (V103), and three of them — 'land', 'other',
        // 'agricultural_land' — are in NEITHER RESIDENTIAL_PROPERTY_TYPES nor
        // COMMERCIAL_PROPERTY_TYPES. A RESIDENTIAL listing switched to 'land' satisfied neither
        // original branch, so its listing_amenities/location_features/preferred_tenants rows were
        // never deleted — an orphan today, and a resurrection risk later if the listing is
        // switched back to a residential type with amenities omitted (null = "leave untouched"),
        // making the stale rows reappear as if freshly selected.
        //
        // Keyed on previousPropertyType (snapshotted before ANY field mutation, above) rather than
        // previousListingFamily, so it stays on the SAME AXIS as isResidentialFamily/
        // isCommercialFamily below — both of which are deliberately keyed on property_type, not the
        // listing_family stamp, to stay independent of the V102-backfilled stamp. Keying R5 on the
        // stamp instead would skip cleanup for any residential/commercial listing whose stamp is
        // stale or NULL (e.g. rows inserted by a bulk import) while the gate still switches
        // writers underneath it. Still mutually exclusive; still a no-op for same-family edits,
        // for listings that were never in a typed family (AGRICULTURAL/land/other/null), and for
        // edits that don't touch propertyType at all.
        if (wasResidentialFamily && !isResidentialFamily) {
            listingAmenityRepository.deleteByListingId(saved.getId());
            listingLocationFeatureRepository.deleteByListingId(saved.getId());
            listingPreferredTenantRepository.deleteByListingId(saved.getId());
        } else if (wasCommercialFamily && !isCommercialFamily) {
            listingAmenityRepository.deleteByListingId(saved.getId());
            listingSuitableUseRepository.deleteByListingId(saved.getId());
        } else if (wasAgriFamily && !isAgriFamily) {
            // AC16 (#2044, qa-fast gap): without this branch, a listing edited OUT of
            // agricultural_land stranded its listing_agri_crops rows — orphaned immediately, and
            // a resurrection risk later since a null crops list on a future edit means "leave
            // unchanged", so the stale rows would silently reappear if the listing were ever
            // switched back to agricultural_land. Mirrors the residential/commercial branches
            // above exactly.
            listingAgriCropRepository.deleteByListingId(saved.getId());
        }

        if (isResidentialFamily) {
            writeResidentialChildSets(saved.getId(), residentialFields);
        }
        if (isCommercialFamily) {
            writeCommercialChildSets(saved.getId(), commercialFields);
        }
        if (isAgriFamily) {
            writeAgriChildSets(saved.getId(), crops);
        }

        // Typed detail projection refresh (#1734) — keeps listing_commercial_space_details /
        // listing_residential_unit_details current for the search indexer read path. No
        // AGRICULTURAL branch: listing_agricultural_land_details (V102) is a read-only,
        // backfill-only projection with no upsert repository method and no crops column — crops
        // live only in listing_agri_crops, which the search indexer's AGRICULTURAL read path
        // does not consume (#2044 R6 — see writeAgriChildSets javadoc).
        refreshTypedProjections(saved);

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
