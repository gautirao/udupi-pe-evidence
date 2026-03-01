package com.example.realestate.ingestion;

import com.example.realestate.ai.ClassificationException;
import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.ClassificationService;
import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Scheduled job that polls for unprocessed raw posts and processes them.
 * <p>
 * Processing pipeline:
 * 1. Fetch batch of unprocessed posts
 * 2. Mark each as "processing" to prevent duplicate processing
 * 3. Classify using AI
 * 4. Create listing if classified as real estate with sufficient confidence
 * 5. Mark as processed (handled transactionally by ListingService)
 */
@Component
public class IngestionJobRunner {

    private static final Logger log = LoggerFactory.getLogger(IngestionJobRunner.class);

    private final RawPostService rawPostService;
    private final ClassificationService classificationService;
    private final ListingService listingService;
    private final int batchSize;

    public IngestionJobRunner(
            RawPostService rawPostService,
            ClassificationService classificationService,
            ListingService listingService,
            @Value("${app.ingestion.batch-size}") int batchSize) {
        this.rawPostService = rawPostService;
        this.classificationService = classificationService;
        this.listingService = listingService;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${app.ingestion.poll-interval-ms}")
    public void pollUnprocessedPosts() {
        List<RawPost> batch = rawPostService.findUnprocessed(batchSize);
        if (batch.isEmpty()) {
            log.debug("No unprocessed posts found");
            return;
        }

        log.info("Polled {} unprocessed posts", batch.size());

        int processed = 0;
        int listingsCreated = 0;
        int errors = 0;

        for (RawPost post : batch) {
            try {
                Listing listing = processPost(post);
                processed++;
                if (listing != null) listingsCreated++;
            } catch (Exception e) {
                errors++;
                log.error("Failed to process post postId={}: {}", post.getId(), e.getMessage(), e);
            }
        }

        log.info("Polling cycle complete processed={} listingsCreated={} errors={}",
                processed, listingsCreated, errors);
    }

    private Listing processPost(RawPost post) {
        log.info("Processing post postId={} contentLength={}",
                post.getId(), post.getContent() != null ? post.getContent().length() : 0);

        // Mark as processing to prevent duplicate processing by other workers
        rawPostService.markProcessing(post.getId());

        // Skip posts with empty content
        if (post.getContent() == null || post.getContent().isBlank()) {
            log.warn("Skipping post with empty content postId={}", post.getId());
            rawPostService.markProcessed(post.getId());
            return null;
        }

        // Classify using AI
        ClassificationResult result;
        try {
            result = classificationService.classify(post);
        } catch (ClassificationException e) {
            log.error("Classification failed for post postId={}: {}", post.getId(), e.getMessage());
            // Don't mark as processed - allow retry later.
            // Re-throw so the outer loop increments the errors counter.
            throw e;
        }

        // Create listing (handles marking as processed transactionally)
        String model = classificationService.getModel();
        Listing listing = listingService.createFrom(post, result, model);

        if (listing != null) {
            log.info("Created listing listingId={} for post postId={}", listing.getId(), post.getId());
        }
        return listing;
    }
}
