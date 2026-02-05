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
import java.util.HexFormat;
import java.util.Objects;

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

        // Lifecycle signals: age and freshness (correct at creation time)
        listing.setListingAgeDays(0);
        listing.setFresh(true);

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
}
