package com.example.realestate.ingestion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Ingestion API endpoint.
 * Accepts raw posts from the Chrome extension, persists them,
 * and returns 202 Accepted. Processing happens asynchronously via IngestionJobRunner.
 */
@RestController
@RequestMapping("/api/ingestion")
public class IngestionController {

    private static final Logger log = LoggerFactory.getLogger(IngestionController.class);

    private final RawPostService rawPostService;
    private final ObjectMapper objectMapper;

    public IngestionController(RawPostService rawPostService, ObjectMapper objectMapper) {
        this.rawPostService = rawPostService;
        this.objectMapper = objectMapper;
    }

    private String toJsonArray(List<String> images) {
        if (images == null || images.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(images);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize images, using empty array", e);
            return "[]";
        }
    }

    @PostMapping("/raw-post")
    public ResponseEntity<Map<String, Object>> ingestRawPost(@RequestBody IngestRequest request) {
        log.info("Received ingestion request source={} sourcePostId={}",
                request.source(), request.sourcePostId());

        RawPost rawPost = new RawPost();
        rawPost.setContent(request.rawText());
        rawPost.setExternalPostId(request.sourcePostId());
        rawPost.setAuthorName(request.author());
        rawPost.setPostedAt(request.postedAt());
        rawPost.setCreatedAt(OffsetDateTime.now());

        rawPost.setImages(toJsonArray(request.images()));

        RawPost saved = rawPostService.save(rawPost);

        log.info("Persisted raw post rawPostId={} source={}", saved.getId(), request.source());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "success", true,
                "rawPostId", saved.getId().toString(),
                "message", "Raw post accepted for processing"
        ));
    }

    /**
     * Edge-function-compatible endpoint for Chrome extension.
     * Matches the payload contract of supabase/functions/ingest-posts.
     * Auth: permitAll (mirrors edge function verify_jwt=false).
     */
    @PostMapping("/ingest-posts")
    public ResponseEntity<Map<String, Object>> ingestPostsCompat(@RequestBody ExtensionIngestRequest request) {
        if (request.posts() == null || request.posts().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No posts provided"));
        }

        String sourceUrl = truncate(request.source_url(), 2000);
        log.info("Received extension ingest request postCount={} sourceUrl={}",
                request.posts().size(), sourceUrl);

        int imported = 0;
        for (ExtensionPost post : request.posts()) {
            try {
                String content = post.content() != null ? post.content().trim() : "";
                if (content.length() <= 10) {
                    log.debug("Skipping post with short content length={}", content.length());
                    continue;
                }

                RawPost rawPost = new RawPost();
                rawPost.setContent(truncate(content, 10000));
                rawPost.setExternalPostId(truncate(post.external_post_id(), 255));
                rawPost.setAuthorName(truncate(post.author_name(), 255));
                rawPost.setPostedAt(post.posted_at());
                rawPost.setSourceUrl(sourceUrl);
                rawPost.setCreatedAt(OffsetDateTime.now());

                // Preserve images as-is in JSONB (edge function format: [{url, alt, width, height}])
                if (post.images() != null && !post.images().isEmpty()) {
                    try {
                        rawPost.setImages(objectMapper.writeValueAsString(post.images()));
                    } catch (JsonProcessingException e) {
                        log.warn("Failed to serialize images for post, using empty array", e);
                        rawPost.setImages("[]");
                    }
                } else {
                    rawPost.setImages("[]");
                }

                rawPostService.save(rawPost);
                imported++;
            } catch (Exception e) {
                log.error("Failed to persist extension post externalPostId={}",
                        post.external_post_id(), e);
            }
        }

        log.info("Extension ingest complete imported={} total={}", imported, request.posts().size());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "success", true,
                "imported", imported,
                "feed_run_id", "null",
                "message", String.format("Successfully imported %d posts", imported)
        ));
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return null;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    @PostMapping("/bulk")
    public ResponseEntity<Map<String, Object>> ingestBulk(@RequestBody BulkIngestRequest request) {
        log.info("Received bulk ingestion request postCount={}", request.posts().size());

        int imported = 0;
        for (IngestRequest post : request.posts()) {
            try {
                RawPost rawPost = new RawPost();
                rawPost.setContent(post.rawText());
                rawPost.setExternalPostId(post.sourcePostId());
                rawPost.setAuthorName(post.author());
                rawPost.setPostedAt(post.postedAt());
                rawPost.setCreatedAt(OffsetDateTime.now());
                rawPost.setImages(toJsonArray(post.images()));
                rawPostService.save(rawPost);
                imported++;
            } catch (Exception e) {
                log.error("Failed to persist post sourcePostId={}", post.sourcePostId(), e);
            }
        }

        log.info("Bulk ingestion complete imported={} total={}", imported, request.posts().size());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                "success", true,
                "imported", imported,
                "message", String.format("Successfully imported %d posts", imported)
        ));
    }

    public record IngestRequest(
            String source,
            String sourcePostId,
            String rawText,
            List<String> images,
            String author,
            OffsetDateTime postedAt
    ) {
    }

    public record BulkIngestRequest(List<IngestRequest> posts) {
    }

    // Edge-function-compatible DTOs (snake_case to match Chrome extension payload)
    public record ExtensionIngestRequest(
            List<ExtensionPost> posts,
            String source_url,
            String group_name
    ) {
    }

    public record ExtensionPost(
            String content,
            String author_name,
            OffsetDateTime posted_at,
            String external_post_id,
            List<Object> images
    ) {
    }
}
