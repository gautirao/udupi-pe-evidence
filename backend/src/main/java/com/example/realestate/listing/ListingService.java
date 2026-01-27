package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PromptRegistry;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class ListingService {

    private static final Logger log = LoggerFactory.getLogger(ListingService.class);
    private static final int MIN_CONFIDENCE_FOR_LISTING = 50;
    private static final int MIN_CONFIDENCE_FOR_VALID = 70;

    private final ListingRepository listingRepository;
    private final RawPostRepository rawPostRepository;
    private final ObjectMapper objectMapper;

    public ListingService(
            ListingRepository listingRepository,
            RawPostRepository rawPostRepository,
            ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.rawPostRepository = rawPostRepository;
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

        Listing saved = listingRepository.save(listing);

        // Mark raw post as processed — same transaction as the listing insert
        rawPostRepository.markProcessed(post.getId());

        log.info("Created listing listingId={} rawPostId={} propertyType={} confidence={} isValid={}",
                saved.getId(), post.getId(), saved.getPropertyType(),
                saved.getConfidenceScore(), saved.isValid());

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
}
