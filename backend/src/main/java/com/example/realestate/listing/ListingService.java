package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PromptRegistry;
import com.example.realestate.ingestion.RawPost;
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

    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;

    public ListingService(ListingRepository listingRepository, ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public Listing createFromClassification(RawPost post, ClassificationResult result, String model) {
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
        listing.setValid(result.confidenceScore() >= 70);
        listing.setParsedData(buildParsedData(result, model));

        Listing saved = listingRepository.save(listing);
        log.info("Created listing listingId={} rawPostId={} propertyType={} confidence={} isValid={}",
                saved.getId(), post.getId(), saved.getPropertyType(),
                saved.getConfidenceScore(), saved.isValid());
        return saved;
    }

    /**
     * Maps AI property type to the DB enum values.
     * The DB enum is: 'land', 'house', 'commercial', 'other'.
     * The AI can return 'apartment' which is not in the enum, so we map it to 'house'.
     */
    private String mapPropertyType(String aiPropertyType) {
        if (aiPropertyType == null) {
            return "other";
        }
        return switch (aiPropertyType.toLowerCase()) {
            case "house" -> "house";
            case "apartment" -> "house"; // DB enum lacks 'apartment'; map to 'house'
            case "land" -> "land";
            case "commercial" -> "commercial";
            default -> "other";
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
