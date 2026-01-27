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
 * Delegates to ListingService.createFrom which handles:
 * - Confidence thresholds and discard logging
 * - Idempotency via raw_post_id
 * - Transactional listing insert + raw post processed update
 */
@Component
public class ListingAssemblyStep implements PipelineStep<ClassificationResult, Listing> {

    private static final Logger log = LoggerFactory.getLogger(ListingAssemblyStep.class);

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
        log.info("Evaluating classification postId={} step={} isRealEstate={} confidence={}",
                post.getId(), name(), result.isRealEstate(), result.confidenceScore());
        return listingService.createFrom(post, result, classificationService.getModel());
    }
}
