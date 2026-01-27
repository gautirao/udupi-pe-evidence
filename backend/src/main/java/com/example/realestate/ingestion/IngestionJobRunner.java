package com.example.realestate.ingestion;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ingestion.pipeline.ClassificationStep;
import com.example.realestate.ingestion.pipeline.ListingAssemblyStep;
import com.example.realestate.ingestion.pipeline.TextNormalizationStep;
import com.example.realestate.listing.Listing;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Scheduled job that polls for unprocessed raw posts and runs them through
 * the ingestion pipeline (text normalization → AI classification → listing assembly).
 * <p>
 * Replaces the parse-posts Supabase Edge Function.
 * <p>
 * Key behavior fix: a post is only marked as processed AFTER the listing insert
 * succeeds (or the post is correctly classified as not-real-estate). This fixes
 * the data loss bug in the Edge Function where a failed listing insert would
 * still mark the post as processed.
 */
@Component
public class IngestionJobRunner {

    private static final Logger log = LoggerFactory.getLogger(IngestionJobRunner.class);

    private final RawPostService rawPostService;
    private final TextNormalizationStep textNormalizationStep;
    private final ClassificationStep classificationStep;
    private final ListingAssemblyStep listingAssemblyStep;
    private final JdbcTemplate jdbcTemplate;
    private final int batchSize;

    public IngestionJobRunner(
            RawPostService rawPostService,
            TextNormalizationStep textNormalizationStep,
            ClassificationStep classificationStep,
            ListingAssemblyStep listingAssemblyStep,
            JdbcTemplate jdbcTemplate,
            @Value("${app.ingestion.batch-size}") int batchSize) {
        this.rawPostService = rawPostService;
        this.textNormalizationStep = textNormalizationStep;
        this.classificationStep = classificationStep;
        this.listingAssemblyStep = listingAssemblyStep;
        this.jdbcTemplate = jdbcTemplate;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${app.ingestion.poll-interval-ms}")
    public void processUnprocessedPosts() {
        List<RawPost> batch = rawPostService.findUnprocessed(batchSize);
        if (batch.isEmpty()) {
            return;
        }

        log.info("Processing batch of {} unprocessed posts", batch.size());
        processBatch(batch, null);
    }

    /**
     * Process a specific batch of posts, optionally tied to a feed run.
     * Called by the scheduled job (feedRunId=null) or by the controller for a specific feed run.
     */
    public ProcessingResult processBatch(List<RawPost> batch, UUID feedRunId) {
        int postsProcessed = 0;
        int listingsCreated = 0;
        int postsFailed = 0;

        for (RawPost post : batch) {
            try {
                // Step 1: Text normalization
                String normalizedText = textNormalizationStep.process(post, post.getContent());
                if (normalizedText.isEmpty()) {
                    log.warn("Skipping post with empty content postId={}", post.getId());
                    rawPostService.markProcessed(post.getId());
                    postsProcessed++;
                    continue;
                }

                // Step 2: AI classification
                ClassificationResult classification = classificationStep.process(post, normalizedText);

                // Step 3: Listing assembly (creates listing only if qualified)
                Listing listing = listingAssemblyStep.process(post, classification);
                if (listing != null) {
                    listingsCreated++;
                }

                // Mark processed AFTER successful pipeline completion.
                // This fixes the Edge Function bug where a listing insert failure
                // would still mark the post as processed (data loss).
                rawPostService.markProcessed(post.getId());
                postsProcessed++;

            } catch (Exception e) {
                log.error("Failed to process post postId={}", post.getId(), e);
                postsFailed++;
                // Post remains is_processed=false and will be retried next cycle
            }
        }

        log.info("Batch complete processed={} listingsCreated={} failed={} feedRunId={}",
                postsProcessed, listingsCreated, postsFailed, feedRunId);

        // Update feed_runs stats if applicable
        if (feedRunId != null) {
            updateFeedRunStats(feedRunId, postsProcessed, postsFailed);
        }

        return new ProcessingResult(postsProcessed, listingsCreated, postsFailed);
    }

    private void updateFeedRunStats(UUID feedRunId, int postsParsed, int postsFailed) {
        try {
            jdbcTemplate.update(
                    "UPDATE public.feed_runs SET posts_parsed = ?, posts_failed = ? WHERE id = ?",
                    postsParsed, postsFailed, feedRunId);
        } catch (Exception e) {
            log.error("Failed to update feed_runs stats feedRunId={}", feedRunId, e);
        }
    }

    public record ProcessingResult(int processed, int listingsCreated, int failed) {
    }
}
