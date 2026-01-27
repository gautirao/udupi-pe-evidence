package com.example.realestate.ingestion.pipeline;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.ClassificationService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Assembles and persists a Listing from a ClassificationResult.
 * Only creates a listing if is_real_estate=true and confidence >= 50.
 * Input: ClassificationResult. Output: Listing (or null if not qualified).
 */
@Component
public class ListingAssemblyStep implements PipelineStep<ClassificationResult, Listing> {

    private static final Logger log = LoggerFactory.getLogger(ListingAssemblyStep.class);
    private static final int MIN_CONFIDENCE_FOR_LISTING = 50;

    private final ListingService listingService;
    private final ClassificationService classificationService;

    public ListingAssemblyStep(ListingService listingService, ClassificationService classificationService) {
        this.listingService = listingService;
        this.classificationService = classificationService;
    }

    @Override
    public String name() {
        return "listing-assembly";
    }

    @Override
    public Listing process(RawPost post, ClassificationResult result) {
        if (!result.isRealEstate()) {
            log.info("Post is not real estate postId={} step={}", post.getId(), name());
            return null;
        }
        if (result.confidenceScore() < MIN_CONFIDENCE_FOR_LISTING) {
            log.info("Post confidence below threshold postId={} step={} confidence={} threshold={}",
                    post.getId(), name(), result.confidenceScore(), MIN_CONFIDENCE_FOR_LISTING);
            return null;
        }

        log.info("Creating listing postId={} step={} propertyType={} confidence={}",
                post.getId(), name(), result.propertyType(), result.confidenceScore());
        return listingService.createFromClassification(post, result, classificationService.getModel());
    }
}
