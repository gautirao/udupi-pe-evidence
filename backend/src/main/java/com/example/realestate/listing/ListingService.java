package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.listing.api.BulkDeleteResult;
import com.example.realestate.listing.api.ListingStatsResponse;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.ingestion.ListingIngestionService;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Backward-compatibility delegate.
 *
 * <p>The real implementations live in:
 * <ul>
 *   <li>{@link ListingIngestionService} — createFrom</li>
 *   <li>{@link ListingCrudService} — createDraft, updateListing, deleteListing, bulkDeleteListings, stats, owner queries</li>
 *   <li>{@link ListingWorkflowService} — submitListing, approveListing, rejectListing, adminForceDelete, restoreListing</li>
 * </ul>
 *
 * <p>This class delegates all calls to the appropriate service.
 * The inner exception and event types extend (or alias) the canonical types in
 * {@code listing.exception} and {@code listing.event} so that existing test code
 * instantiating {@code new ListingService.XxxException(...)} continues to work
 * and is caught by catch clauses expecting the new canonical types.
 *
 * @deprecated Inject {@link ListingCrudService}, {@link ListingWorkflowService}, or
 *             {@link ListingIngestionService} directly instead.
 */
@Service
@Deprecated
public class ListingService {

    private final ListingIngestionService ingestionService;
    private final ListingCrudService crudService;
    private final ListingWorkflowService workflowService;

    public ListingService(
            ListingIngestionService ingestionService,
            ListingCrudService crudService,
            ListingWorkflowService workflowService) {
        this.ingestionService = ingestionService;
        this.crudService = crudService;
        this.workflowService = workflowService;
    }

    // ===== Ingestion =====

    public Listing createFrom(RawPost post, ClassificationResult result, String model) {
        return ingestionService.createFrom(post, result, model);
    }

    // ===== CRUD =====

    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description) {
        return crudService.createDraft(createdBy, propertyType, title, locality, price, description);
    }

    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               String videoUrl) {
        return crudService.createDraft(createdBy, propertyType, title, locality, price, description, videoUrl);
    }

    public Listing createDraft(UUID createdBy, String propertyType, String title,
                               String locality, BigDecimal price, String description,
                               BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                               String landAreaUnit, String builtAreaUnit, String videoUrl) {
        return crudService.createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl);
    }

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
        return crudService.createDraft(createdBy, propertyType, title, locality, price, description,
                landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths, sellerType);
    }

    public ListingStatsResponse getListingStats(UUID userId) {
        return crudService.getListingStats(userId);
    }

    public Page<Listing> getListingsByOwner(UUID createdBy, String status, Pageable pageable) {
        return crudService.getListingsByOwner(createdBy, status, pageable);
    }

    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description) {
        return crudService.updateListing(listingId, userId, isAdmin, propertyType, title, locality, price, description);
    }

    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed) {
        return crudService.updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed);
    }

    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description,
                                 BigDecimal landArea, Integer bedrooms, BigDecimal builtArea,
                                 Boolean addressConfirmed, Double latitude, Double longitude,
                                 String landAreaUnit, String builtAreaUnit,
                                 String videoUrl, boolean applyVideoUrl,
                                 String reraNumber) {
        return crudService.updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed,
                latitude, longitude, landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber);
    }

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
                                 String possessionStatus,
                                 LocalDate expectedPossessionDate,
                                 String approvalsDeclared) {
        return crudService.updateListing(listingId, userId, isAdmin, propertyType, title, locality,
                price, description, landArea, bedrooms, builtArea, addressConfirmed,
                latitude, longitude, landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber,
                listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                furnishingStatus, washrooms, parkingCount, roadFrontageFt, commercialUsage, numberOfUnits,
                monthlyRent, securityDepositMonths, lockInMonths,
                possessionStatus, expectedPossessionDate, approvalsDeclared);
    }

    public void deleteListing(UUID listingId, UUID userId, boolean isAdmin) {
        crudService.deleteListing(listingId, userId, isAdmin);
    }

    public BulkDeleteResult bulkDeleteListings(List<UUID> ids, UUID userId, boolean isAdmin) {
        return crudService.bulkDeleteListings(ids, userId, isAdmin);
    }

    // ===== Workflow =====

    public Listing submitListing(UUID listingId, UUID userId, boolean isAdmin) {
        return workflowService.submitListing(listingId, userId, isAdmin);
    }

    public Listing approveListing(UUID listingId, UUID adminUserId) {
        return workflowService.approveListing(listingId, adminUserId);
    }

    public Listing rejectListing(UUID listingId, UUID adminUserId, String rejectionReason) {
        return workflowService.rejectListing(listingId, adminUserId, rejectionReason);
    }

    public boolean adminForceDelete(UUID listingId, UUID adminId) {
        return workflowService.adminForceDelete(listingId, adminId);
    }

    public Listing restoreListing(UUID listingId, UUID adminId) {
        return workflowService.restoreListing(listingId, adminId);
    }

    // ===== Dedupe (package-accessible for existing tests) =====

    String computeDedupeHash(String description, String locality, BigDecimal price) {
        // Delegate to the standalone service; injected as a Spring bean via ListingCrudService's dep.
        // We replicate the hash computation here so existing tests calling listingService.computeDedupeHash
        // can keep working without modification.
        String normalizedDesc = normalizeString(description);
        String normalizedLocality = normalizeString(locality);
        String normalizedPrice = price != null ? price.toPlainString() : "";
        if (normalizedDesc.isEmpty() && normalizedLocality.isEmpty() && normalizedPrice.isEmpty()) {
            return null;
        }
        String input = normalizedDesc + "|" + normalizedLocality + "|" + normalizedPrice;
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(hashBytes);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private String normalizeString(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase();
    }

    // ===== Exception aliases (extend canonical types so catch clauses work with both) =====

    public static class ListingNotFoundException
            extends com.example.realestate.listing.exception.ListingNotFoundException {
        public ListingNotFoundException(UUID id) { super(id); }
    }

    public static class ListingOwnershipException
            extends com.example.realestate.listing.exception.ListingOwnershipException {
        public ListingOwnershipException(UUID id) { super(id); }
    }

    public static class ListingStatusException
            extends com.example.realestate.listing.exception.ListingStatusException {
        public ListingStatusException(String message) { super(message); }
    }

    public static class ListingValidationException
            extends com.example.realestate.listing.exception.ListingValidationException {
        public ListingValidationException(List<Map<String, String>> errors) { super(errors); }
    }

    public static class OwnerListingLimitException
            extends com.example.realestate.listing.exception.OwnerListingLimitException {
        public OwnerListingLimitException(String message) { super(message); }
    }

    public static class ListingNotArchivedException
            extends com.example.realestate.listing.exception.ListingNotArchivedException {
        public ListingNotArchivedException(UUID id) { super(id); }
    }

    // ===== Event aliases (extend canonical types) =====
    // These are records in the canonical package; since records are final, we can't extend them.
    // Instead, provide static factory methods as aliases.

    public record ListingApprovedEvent(Listing listing, UUID ownerId, String title) {
        public static com.example.realestate.listing.event.ListingApprovedEvent of(
                Listing listing, UUID ownerId, String title) {
            return new com.example.realestate.listing.event.ListingApprovedEvent(listing, ownerId, title);
        }
    }

    public record ListingRejectedEvent(Listing listing, UUID ownerId, String title, String reason) {}

    public record NewListingInAreaEvent(UUID listingId, String areaKey, String areaLabel,
                                        String title, String propertyType, Long pricePaise) {}

    public record SettlementEnrichmentRequestedEvent(UUID listingId, double lat, double lon,
                                                     String propertyType) {}
}
