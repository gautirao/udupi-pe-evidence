package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PromptRegistry;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.example.realestate.poi.PoiQueryProfile;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class ListingService {

    private static final Logger log = LoggerFactory.getLogger(ListingService.class);
    private static final int MIN_CONFIDENCE_FOR_LISTING = 50;
    private static final int MIN_CONFIDENCE_FOR_VALID = 70;

    private final ListingRepository listingRepository;
    private final RawPostRepository rawPostRepository;
    private final GeocodingPort geocodingPort;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ProximityDuplicateService proximityDuplicateService;

    public ListingService(
            ListingRepository listingRepository,
            RawPostRepository rawPostRepository,
            GeocodingPort geocodingPort,
            ObjectMapper objectMapper,
            ApplicationEventPublisher applicationEventPublisher,
            ProximityDuplicateService proximityDuplicateService) {
        this.listingRepository = listingRepository;
        this.rawPostRepository = rawPostRepository;
        this.geocodingPort = geocodingPort;
        this.objectMapper = objectMapper;
        this.applicationEventPublisher = applicationEventPublisher;
        this.proximityDuplicateService = proximityDuplicateService;
    }

    /**
     * Evaluate a classification result and, if it qualifies, create a listing.
     * Both the listing insert and the raw_post processed update happen in a
     * single transaction — if the listing insert fails, the post is NOT marked
     * as processed (fixing the Edge Function data loss bug).
     *
     * @return the created Listing, or null if the post was discarded
     */
    @Transactional
    public Listing createFrom(RawPost post, ClassificationResult result, String model) {
        // Gate 1: not real estate
        if (!result.isRealEstate()) {
            log.info("Discarded: not real estate postId={} confidence={}",
                    post.getId(), result.confidenceScore());
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Gate 2: confidence below listing threshold
        if (result.confidenceScore() < MIN_CONFIDENCE_FOR_LISTING) {
            log.info("Discarded: confidence below threshold postId={} confidence={} threshold={}",
                    post.getId(), result.confidenceScore(), MIN_CONFIDENCE_FOR_LISTING);
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Gate 3: idempotency — listing already exists for this raw post
        if (listingRepository.existsByRawPostId(post.getId())) {
            log.warn("Discarded: listing already exists for rawPostId={}", post.getId());
            rawPostRepository.markProcessed(post.getId());
            return null;
        }

        // Build and persist listing
        Listing listing = new Listing();
        listing.setRawPostId(post.getId());
        listing.setPropertyType(mapPropertyType(result.propertyType()));
        listing.setPrice(result.price());
        listing.setLocality(result.locality());
        listing.setBedrooms(result.bedrooms());
        listing.setLandArea(result.landArea());
        listing.setLandAreaUnit(result.landAreaUnit());

        // Normalize land area and compute price per cent
        AreaNormalizer.NormalizedArea normalizedArea = AreaNormalizer.normalize(
                result.landArea(), result.landAreaUnit());
        listing.setAreaSqm(normalizedArea.areaSqm());
        listing.setAreaSqft(normalizedArea.areaSqft());
        listing.setAreaCent(normalizedArea.areaCent());

        // Compute price per cent if we have both price and area
        Long pricePerCentPaise = AreaNormalizer.computePricePerCentPaise(
                listing.getPricePaise(), normalizedArea.areaCent());
        listing.setPricePerCentPaise(pricePerCentPaise);

        listing.setBuiltArea(result.builtArea());
        listing.setBuiltAreaUnit(result.builtAreaUnit());
        listing.setContactPhone(result.contactPhone());
        listing.setContactInfo(result.contactInfo());
        listing.setDescription(result.description());
        listing.setConfidenceScore(result.confidenceScore());
        listing.setValid(result.confidenceScore() >= MIN_CONFIDENCE_FOR_VALID);
        listing.setParsedData(buildParsedData(result, model));

        // Geocode if locality is present
        if (result.locality() != null && !result.locality().isBlank()) {
            try {
                GeocodingService.GeoResult geoResult = geocodingPort.geocode(result.locality());
                if (geoResult != null) {
                    listing.setLatitude(geoResult.latitude());
                    listing.setLongitude(geoResult.longitude());
                    listing.setAreaKey(computeAreaKey(geoResult));
                    listing.setAreaLabel(computeAreaLabel(geoResult));
                    log.debug("Geocoded locality={} to lat={} lng={} areaKey={} areaLabel={}",
                            result.locality(), geoResult.latitude(), geoResult.longitude(),
                            listing.getAreaKey(), listing.getAreaLabel());
                } else {
                    log.debug("Geocoding returned null for locality={}", result.locality());
                }
            } catch (Exception e) {
                log.warn("Geocoding failed for locality={}: {}", result.locality(), e.getMessage());
                // Leave lat/lng/areaKey/areaLabel null - listing still created
            }
        }

        // Compute dedupe hash and check for duplicates / repost count
        String dedupeHash = computeDedupeHash(result.description(), result.locality(), result.price());
        listing.setDedupeHash(dedupeHash);

        if (dedupeHash != null && listingRepository.existsByDedupeHash(dedupeHash)) {
            listing.setDuplicate(true);
            long priorCount = listingRepository.countByDedupeHash(dedupeHash);
            listing.setRepostCount((int) priorCount);
            log.info("Duplicate detected: hash={} repostCount={} description={} locality={} price={}",
                    dedupeHash, priorCount, result.description(), result.locality(), result.price());
        }

        Listing saved = listingRepository.save(listing);

        // Mark raw post as processed — same transaction as the listing insert
        rawPostRepository.markProcessed(post.getId());

        log.info("Created listing listingId={} rawPostId={} propertyType={} confidence={} isValid={} isDuplicate={}",
                saved.getId(), post.getId(), saved.getPropertyType(),
                saved.getConfidenceScore(), saved.isValid(), saved.isDuplicate());

        return saved;
    }

    /**
     * Maps AI PropertyType enum to the DB enum string values.
     * The DB enum is: 'land', 'house', 'commercial', 'other'.
     * The AI can return APARTMENT which is not in the DB enum, so we map it to 'house'.
     */
    private String mapPropertyType(PropertyType propertyType) {
        if (propertyType == null) {
            return "other";
        }
        return switch (propertyType) {
            case HOUSE -> "house";
            case APARTMENT -> "house"; // DB enum lacks 'apartment'; map to 'house'
            case LAND -> "land";
            case COMMERCIAL -> "commercial";
            case OTHER -> "other";
        };
    }

    private String buildParsedData(ClassificationResult result, String model) {
        try {
            ObjectNode node = objectMapper.valueToTree(result);
            node.put("model", model);
            node.put("prompt_version", PromptRegistry.PROMPT_VERSION);
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize parsed_data, storing empty object", e);
            return "{}";
        }
    }

    /**
     * Compute dedupe hash from normalized (description + locality + price).
     * Returns SHA-256 hex string, or null if all components are empty.
     */
    String computeDedupeHash(String description, String locality, BigDecimal price) {
        String normalizedDesc = normalizeString(description);
        String normalizedLocality = normalizeString(locality);
        String normalizedPrice = price != null ? price.toPlainString() : "";

        // If all components are empty, no meaningful hash
        if (normalizedDesc.isEmpty() && normalizedLocality.isEmpty() && normalizedPrice.isEmpty()) {
            return null;
        }

        String input = normalizedDesc + "|" + normalizedLocality + "|" + normalizedPrice;

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed to be available
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private String normalizeString(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toLowerCase();
    }

    /**
     * Compute dedupe hash from the listing's description, locality, and price,
     * and set it on the listing entity.
     */
    private void computeAndSetDedupeHash(Listing listing, String description, String locality, BigDecimal price) {
        String hash = computeDedupeHash(description, locality, price);
        listing.setDedupeHash(hash);
    }

    /**
     * Check if a listing with the same dedupe hash already exists.
     * If so, mark this listing as a duplicate.
     * For new listings (no ID yet), any existing match counts.
     */
    private void checkAndMarkDuplicate(Listing listing) {
        String hash = listing.getDedupeHash();
        if (hash != null && listingRepository.existsByDedupeHash(hash)) {
            listing.setDuplicate(true);
            long priorCount = listingRepository.countByDedupeHash(hash);
            listing.setRepostCount((int) priorCount);
            log.info("Duplicate detected in draft: hash={} repostCount={}", hash, priorCount);
        }
    }

    /**
     * Check if a listing with the same dedupe hash already exists, excluding self.
     * Used during updates to avoid self-matching.
     */
    private void checkAndMarkDuplicateExcludingSelf(Listing listing) {
        String hash = listing.getDedupeHash();
        if (hash != null) {
            long matchCount = listingRepository.countByDedupeHashAndIdNot(hash, listing.getId());
            if (matchCount > 0) {
                listing.setDuplicate(true);
                listing.setRepostCount((int) matchCount);
                log.info("Duplicate detected in update: hash={} repostCount={} listingId={}",
                        hash, matchCount, listing.getId());
            } else {
                listing.setDuplicate(false);
                listing.setRepostCount(0);
            }
        } else {
            listing.setDuplicate(false);
            listing.setRepostCount(0);
        }
    }

    /**
     * Compute a deterministic area_key from geocode result components.
     * Format: country|region|city|locality (lowercase, trimmed, spaces->-, punctuation removed)
     * Fallback: if locality is null, use neighborhood; if neighborhood is null, use city.
     *
     * @return normalized area_key, or null if insufficient components
     */
    String computeAreaKey(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String country = normalizeAreaComponent(geoResult.country());
        String region = normalizeAreaComponent(geoResult.region());
        String city = normalizeAreaComponent(geoResult.city());

        // Locality fallback chain: locality -> neighborhood -> city
        String locality = normalizeAreaComponent(geoResult.locality());
        if (locality.isEmpty()) {
            locality = normalizeAreaComponent(geoResult.neighborhood());
        }
        if (locality.isEmpty()) {
            locality = city; // final fallback to city
        }

        // Require at least country and city for a meaningful area_key
        if (country.isEmpty() || city.isEmpty()) {
            return null;
        }

        return String.join("|", country, region, city, locality);
    }

    /**
     * Compute a human-readable area label for display.
     * Format: "Locality, City" or just "City" if locality not available.
     *
     * @return display label, or null if no city available
     */
    String computeAreaLabel(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String city = geoResult.city();
        if (city == null || city.isBlank()) {
            return null;
        }

        // Locality fallback chain: locality -> neighborhood -> null
        String locality = geoResult.locality();
        if (locality == null || locality.isBlank()) {
            locality = geoResult.neighborhood();
        }

        if (locality != null && !locality.isBlank()) {
            return locality.trim() + ", " + city.trim();
        }
        return city.trim();
    }

    /**
     * Normalize a single area component for use in area_key:
     * - lowercase
     * - trim whitespace
     * - replace spaces with hyphens
     * - remove punctuation (keep only alphanumeric and hyphens)
     */
    private String normalizeAreaComponent(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .toLowerCase()
                .replaceAll("\\s+", "-")
                .replaceAll("[^a-z0-9\\-]", "");
    }

    // ===== Dealer CRUD operations =====

    private static final Set<String> UPDATABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());

    /**
     * Look up the app_role for a user. Returns empty if user has no role row.
     */
    public Optional<String> getUserRole(UUID userId) {
        return listingRepository.findUserRole(userId);
    }

    /**
     * Create a new dealer-owned listing with status DRAFT.
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
     * Create a new dealer-owned listing with status DRAFT (pre-commercial overload).
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
        computeAndSetDedupeHash(listing, description, locality, price);
        checkAndMarkDuplicate(listing);

        OffsetDateTime now = OffsetDateTime.now();
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);

        Listing saved = listingRepository.save(listing);
        log.info("Created draft listing listingId={} createdBy={} sellerType={} isDuplicate={}",
                saved.getId(), createdBy, sellerType, saved.isDuplicate());
        return saved;
    }

    /**
     * Return listing count stats grouped by status for the given user.
     * Single query with GROUP BY; statuses with zero listings are not returned by
     * the query, so we default them to 0.
     */
    @Transactional(readOnly = true)
    public ListingController.ListingStatsResponse getListingStats(UUID userId) {
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
        return new ListingController.ListingStatsResponse(
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
                                 Long monthlyRent, Integer securityDepositMonths, Integer lockInMonths) {
        Listing listing = findOwnedListing(listingId, userId, isAdmin);

        if (!UPDATABLE_STATUSES.contains(listing.getStatus())) {
            throw new ListingStatusException("Cannot update listing with status " + listing.getStatus());
        }

        if (propertyType != null) listing.setPropertyType(propertyType);
        if (title != null) listing.setTitle(title);
        if (locality != null) listing.setLocality(locality);
        if (price != null) listing.setPrice(price);
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

        // Recompute dedupe hash if any hash-relevant field changed
        if (description != null || locality != null || price != null) {
            computeAndSetDedupeHash(listing, listing.getDescription(), listing.getLocality(), listing.getPrice());
            checkAndMarkDuplicateExcludingSelf(listing);
        }

        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);
        log.info("Updated listing listingId={} by userId={}", listingId, userId);

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
     * Soft-delete a listing. Only DRAFT or REJECTED status allowed. Enforces ownership unless admin.
     * Sets {@code archived_at = now()} and {@code status = ARCHIVED}; no rows are hard-deleted so
     * all related data (listing_images, pois, viewing_requests) is preserved.
     *
     * @throws ListingNotFoundException if listing not found, not owned, or already archived
     * @throws ListingStatusException   if status is not DRAFT or REJECTED
     */
    @Transactional
    public void deleteListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = findOwnedListing(listingId, userId, isAdmin);

        String status = listing.getStatus();
        if (!ListingStatus.DRAFT.toDbValue().equals(status) && !ListingStatus.REJECTED.toDbValue().equals(status)) {
            throw new ListingStatusException("Cannot delete listing with status " + status);
        }

        listing.setArchivedAt(Instant.now());
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setUpdatedAt(OffsetDateTime.now());
        listingRepository.save(listing);
        log.info("Soft-deleted (archived) listing listingId={} by userId={}", listingId, userId);
    }

    /**
     * Bulk-deletes listings by ID.  Each listing is validated independently:
     * must be owned by the caller and in DRAFT or REJECTED status.
     * Returns a result summarising successes and per-ID errors.
     */
    @Transactional
    public ListingController.BulkDeleteResult bulkDeleteListings(
            java.util.List<UUID> ids, UUID userId, boolean isAdmin) {
        int deleted = 0;
        int skipped = 0;
        java.util.List<String> errors = new java.util.ArrayList<>();

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
        return new ListingController.BulkDeleteResult(deleted, skipped, errors);
    }

    /**
     * Find a listing that the user owns (or any listing if admin).
     * Throws ListingNotFoundException if the listing does not exist or has been archived.
     * Archived listings are treated as not found to prevent dealers from accessing or
     * modifying them via update, image upload, or any other owner-scoped endpoint.
     * Throws ListingOwnershipException if the listing exists but is owned by someone else.
     */
    private Listing findOwnedListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        // Archived listings are invisible to all owner-scoped operations.
        if (listing.getArchivedAt() != null) {
            throw new ListingNotFoundException(listingId);
        }

        if (!isAdmin && !userId.equals(listing.getCreatedBy())) {
            throw new ListingOwnershipException(listingId);
        }
        return listing;
    }

    // ===== Submission + validation =====

    private static final Set<String> SUBMITTABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());

    private static final Set<String> SUBMITTABLE_PROPERTY_TYPES = Set.of(
            "land", "house", "apartment",
            "commercial", "commercial_building", "warehouse", "commercial_land");

    private static final int MIN_IMAGES = 3;

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
        Listing listing = findOwnedListing(listingId, userId, isAdmin);

        if (!SUBMITTABLE_STATUSES.contains(listing.getStatus())) {
            throw new ListingStatusException(
                    "Cannot submit listing with status " + listing.getStatus());
        }

        List<Map<String, String>> errors = validateForSubmission(listing);
        if (!errors.isEmpty()) {
            throw new ListingValidationException(errors);
        }

        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setSubmittedAt(OffsetDateTime.now());
        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);
        log.info("Submitted listing listingId={} by userId={} status=PENDING_REVIEW",
                listingId, userId);
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

    // ===== Admin approval / rejection =====

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

        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setReviewedAt(OffsetDateTime.now());
        listing.setReviewedBy(adminUserId);
        listing.setUpdatedAt(OffsetDateTime.now());

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

    // ===== Admin force-delete =====

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

    // ===== Admin restore =====

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

    // ===== Dealer CRUD exceptions =====

    public static class ListingNotFoundException extends RuntimeException {
        public ListingNotFoundException(UUID id) {
            super("Listing not found: " + id);
        }
    }

    public static class ListingOwnershipException extends RuntimeException {
        public ListingOwnershipException(UUID id) {
            super("Listing not owned by caller: " + id);
        }
    }

    public static class ListingStatusException extends RuntimeException {
        public ListingStatusException(String message) {
            super(message);
        }
    }

    public static class ListingValidationException extends RuntimeException {
        private final List<Map<String, String>> errors;

        public ListingValidationException(List<Map<String, String>> errors) {
            super("Listing validation failed");
            this.errors = errors;
        }

        public List<Map<String, String>> getErrors() {
            return errors;
        }
    }

    public static class OwnerListingLimitException extends RuntimeException {
        public OwnerListingLimitException(String message) {
            super(message);
        }
    }

    /**
     * Thrown when an admin attempts to restore a listing that is not currently archived.
     * Maps to HTTP 409 Conflict.
     */
    public static class ListingNotArchivedException extends RuntimeException {
        public ListingNotArchivedException(UUID id) {
            super("Listing is not archived: " + id);
        }
    }

    // ===== Domain events (published after commit; consumed by NotificationEventListener) =====

    public record ListingApprovedEvent(Listing listing, UUID ownerId, String title) {}

    public record ListingRejectedEvent(Listing listing, UUID ownerId, String title, String reason) {}

    /** Fired when a listing with a known areaKey goes LIVE. Triggers area-subscriber notifications. */
    public record NewListingInAreaEvent(UUID listingId, String areaKey, String areaLabel,
                                        String title, String propertyType, Long pricePaise) {}

    /**
     * Fired after a dealer confirms the address on a listing that has coordinates and a
     * settlement-enrichment-eligible property type (land, house, commercial).
     * Consumed by {@code SettlementEnrichmentListener} to trigger Overpass settlement fetch.
     */
    public record SettlementEnrichmentRequestedEvent(UUID listingId, double lat, double lon,
                                                     String propertyType) {}
}
