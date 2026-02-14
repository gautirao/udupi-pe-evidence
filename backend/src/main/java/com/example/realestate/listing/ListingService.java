package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PromptRegistry;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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

    public ListingService(
            ListingRepository listingRepository,
            RawPostRepository rawPostRepository,
            GeocodingPort geocodingPort,
            ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.rawPostRepository = rawPostRepository;
        this.geocodingPort = geocodingPort;
        this.objectMapper = objectMapper;
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
        listing.setPriceUnit(Objects.requireNonNullElse(result.priceUnit(), "INR"));
        listing.setLocality(result.locality());
        listing.setBedrooms(result.bedrooms());
        listing.setBathrooms(result.bathrooms());
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
        Listing listing = new Listing();
        listing.setCreatedBy(createdBy);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setPropertyType(propertyType != null ? propertyType : "other");
        listing.setTitle(title);
        listing.setLocality(locality);
        listing.setPrice(price);
        listing.setDescription(description);

        OffsetDateTime now = OffsetDateTime.now();
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);

        Listing saved = listingRepository.save(listing);
        log.info("Created draft listing listingId={} createdBy={}", saved.getId(), createdBy);
        return saved;
    }

    /**
     * Return listings owned by the given user, newest first.
     */
    public List<Listing> getListingsByOwner(UUID createdBy) {
        return listingRepository.findByCreatedByOrderByCreatedAtDesc(createdBy);
    }

    /**
     * Update a listing. Enforces ownership (unless admin) and status constraints.
     *
     * @return the updated listing
     * @throws ListingNotFoundException if listing not found or not owned
     * @throws ListingStatusException   if status does not allow updates
     */
    @Transactional
    public Listing updateListing(UUID listingId, UUID userId, boolean isAdmin,
                                 String propertyType, String title, String locality,
                                 BigDecimal price, String description) {
        Listing listing = findOwnedListing(listingId, userId, isAdmin);

        if (!UPDATABLE_STATUSES.contains(listing.getStatus())) {
            throw new ListingStatusException("Cannot update listing with status " + listing.getStatus());
        }

        if (propertyType != null) listing.setPropertyType(propertyType);
        if (title != null) listing.setTitle(title);
        if (locality != null) listing.setLocality(locality);
        if (price != null) listing.setPrice(price);
        if (description != null) listing.setDescription(description);
        listing.setUpdatedAt(OffsetDateTime.now());

        Listing saved = listingRepository.save(listing);
        log.info("Updated listing listingId={} by userId={}", listingId, userId);
        return saved;
    }

    /**
     * Delete a listing. Only DRAFT status allowed. Enforces ownership unless admin.
     *
     * @throws ListingNotFoundException if listing not found or not owned
     * @throws ListingStatusException   if status is not DRAFT
     */
    @Transactional
    public void deleteListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = findOwnedListing(listingId, userId, isAdmin);

        if (!ListingStatus.DRAFT.toDbValue().equals(listing.getStatus())) {
            throw new ListingStatusException("Cannot delete listing with status " + listing.getStatus());
        }

        listingRepository.delete(listing);
        log.info("Deleted listing listingId={} by userId={}", listingId, userId);
    }

    /**
     * Find a listing that the user owns (or any listing if admin).
     * Returns 404-equivalent if not found or not owned.
     */
    private Listing findOwnedListing(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        if (!isAdmin && !userId.equals(listing.getCreatedBy())) {
            // Return same exception as not-found to avoid leaking existence
            throw new ListingNotFoundException(listingId);
        }
        return listing;
    }

    // ===== Submission + validation =====

    private static final Set<String> SUBMITTABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());

    private static final Set<String> SUBMITTABLE_PROPERTY_TYPES = Set.of(
            "land", "house", "apartment");

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

        // Always-required: price > 0
        if (listing.getPrice() == null || listing.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
            errors.add(Map.of("field", "price", "message", "Price must be greater than 0"));
        }

        // Always-required: property_type in allowed set
        String propertyType = listing.getPropertyType();
        if (propertyType == null || !SUBMITTABLE_PROPERTY_TYPES.contains(propertyType)) {
            if ("commercial".equals(propertyType)) {
                errors.add(Map.of("field", "property_type",
                        "message", "Commercial submission not supported yet"));
            } else {
                errors.add(Map.of("field", "property_type",
                        "message", "Property type must be one of: land, house, apartment"));
            }
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

        if (listing.getCreatedBy() != null) {
            String title = Objects.requireNonNullElse(listing.getTitle(), "Untitled");
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", listingId.toString());
            String metadataJson;
            try {
                metadataJson = objectMapper.writeValueAsString(metadata);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize notification metadata for listingId={}", listingId, e);
                throw new IllegalStateException("Notification metadata serialization failed", e);
            }
            listingRepository.insertNotification(
                    listing.getCreatedBy(),
                    "listing_approved",
                    "Listing approved",
                    "Your listing '" + title + "' has been approved and is now live.",
                    metadataJson);
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
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", listingId.toString());
            metadata.put("reason", rejectionReason);
            String metadataJson;
            try {
                metadataJson = objectMapper.writeValueAsString(metadata);
            } catch (JsonProcessingException e) {
                log.error("Failed to serialize notification metadata for listingId={}", listingId, e);
                throw new IllegalStateException("Notification metadata serialization failed", e);
            }
            listingRepository.insertNotification(
                    listing.getCreatedBy(),
                    "listing_rejected",
                    "Listing rejected",
                    "Your listing '" + title + "' was rejected. Reason: " + rejectionReason,
                    metadataJson);
        }

        log.info("Rejected listing listingId={} by adminId={} reason='{}'",
                listingId, adminUserId, rejectionReason);
        return saved;
    }

    // ===== Dealer CRUD exceptions =====

    public static class ListingNotFoundException extends RuntimeException {
        public ListingNotFoundException(UUID id) {
            super("Listing not found: " + id);
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
}
