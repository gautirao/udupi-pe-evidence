package com.example.realestate.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Scheduled job that polls for unprocessed raw posts.
 * <p>
 * Current scope: polling skeleton only.
 * - Fetches a batch of unprocessed posts
 * - Logs each post ID
 * - Marks posts as "processing" (not "processed")
 * <p>
 * AI classification and listing creation will be wired in later.
 */
@Component
public class IngestionJobRunner {

    private static final Logger log = LoggerFactory.getLogger(IngestionJobRunner.class);

    private final RawPostService rawPostService;
    private final int batchSize;

    public IngestionJobRunner(
            RawPostService rawPostService,
            @Value("${app.ingestion.batch-size}") int batchSize) {
        this.rawPostService = rawPostService;
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

        for (RawPost post : batch) {
            log.info("Found unprocessed post postId={} feedRunId={} contentLength={} createdAt={}",
                    post.getId(), post.getFeedRunId(),
                    post.getContent() != null ? post.getContent().length() : 0,
                    post.getCreatedAt());

            rawPostService.markProcessing(post.getId());

            log.info("Marked post as processing postId={}", post.getId());
        }

        log.info("Polling cycle complete postsMarkedProcessing={}", batch.size());
    }
}
