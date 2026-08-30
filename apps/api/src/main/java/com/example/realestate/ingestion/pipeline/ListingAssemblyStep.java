package com.example.realestate.ingestion.pipeline;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.ClassificationService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.ingestion.ListingIngestionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Delegates to ListingIngestionService.createFrom which handles:
 * - Confidence thresholds and discard logging
 * - Idempotency via raw_post_id
 * - Transactional listing insert + raw post processed update
 */
@Component
public class ListingAssemblyStep implements PipelineStep<ClassificationResult, Listing> {

    private static final Logger log = LoggerFactory.getLogger(ListingAssemblyStep.class);

    private final ListingIngestionService listingIngestionService;
    private final ClassificationService classificationService;

    public ListingAssemblyStep(ListingIngestionService listingIngestionService, ClassificationService classificationService) {
        this.listingIngestionService = listingIngestionService;
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
        return listingIngestionService.createFrom(post, result, classificationService.getModel());
    }
}
