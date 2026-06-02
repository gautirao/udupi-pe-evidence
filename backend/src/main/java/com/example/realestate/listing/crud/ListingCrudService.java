package com.example.realestate.listing.crud;

import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.pricing.PriceParser;
import com.example.realestate.listing.api.BulkDeleteResult;
import com.example.realestate.listing.api.ListingStatsResponse;
import com.example.realestate.listing.event.SettlementEnrichmentRequestedEvent;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.OwnerListingLimitException;
import com.example.realestate.poi.PoiQueryProfile;
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

    public ListingCrudService(
            ListingRepository listingRepository,
            ApplicationEventPublisher applicationEventPublisher,
            ListingOwnershipGuard listingOwnershipGuard,
            ListingDeduplicationService listingDeduplicationService,
            PriceChangeLogRepository priceChangeLogRepository,
            BadgeInvalidationService badgeInvalidationService,
            SearchOutboxWriter searchOutboxWriter) {
        this.listingRepository = listingRepository;
        this.applicationEventPublisher = applicationEventPublisher;
        this.listingOwnershipGuard = listingOwnershipGuard;
        this.listingDeduplicationService = listingDeduplicationService;
        this.priceChangeLogRepository = priceChangeLogRepository;
        this.badgeInvalidationService = badgeInvalidationService;
        this.searchOutboxWriter = searchOutboxWriter;
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
                "dealer");
    }

    @Transactional
    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               String videoUrl) {
        return createDraft(createdBy, propertyType, title, locality, price, description,
                null, null, null, null, null, videoUrl,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer");
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
                "dealer");
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
                               String sellerType) {
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
        log.info("Created draft listing listingId={} createdBy={} sellerType={} isDuplicate={}",
                saved.getId(), createdBy, sellerType, saved.isDuplicate());
        searchOutboxWriter.writeEvent(
                saved.getId(),
                SearchOutboxEventType.LISTING_CREATED,
                SearchOutboxOperation.INDEX,
                saved.getStatus(),
                saved.getUpdatedAt() != null ? saved.getUpdatedAt().toInstant() : null);
        return saved;
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
                null, null, null);
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
                null, null, null);
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
                null, null, null);
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
                                 String approvalsDeclared) {
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
