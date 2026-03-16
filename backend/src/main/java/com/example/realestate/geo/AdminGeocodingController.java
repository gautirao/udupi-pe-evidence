package com.example.realestate.geo;

import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;


/**
 * Admin-only endpoint to geocode listings that have a locality but no coordinates.
 * Calls Nominatim via GeocodingService; results are cached in geocode_cache.
 * Streams progress as SSE events (mirrors the retired Supabase Edge Function behaviour).
 */
@RestController
@RequestMapping("/api/admin/geocode")
public class AdminGeocodingController {

    private static final Logger log = LoggerFactory.getLogger(AdminGeocodingController.class);
    private static final int MAX_BATCH = 50;
    /** Nominatim usage policy: max 1 req/sec */
    private static final long RATE_LIMIT_MS = 1_100;

    private final GeocodingService geocodingService;
    private final JdbcTemplate jdbc;

    public AdminGeocodingController(GeocodingService geocodingService,
                                    JdbcTemplate jdbc) {
        this.geocodingService = geocodingService;
        this.jdbc = jdbc;
    }

    /**
     * POST /api/admin/geocode/missing?batchSize=20
     * <p>
     * Streams Server-Sent Events with log events:
     * {@code data: {"type":"info|success|warning|error","message":"...","timestamp":"..."}}
     * Final event:
     * {@code data: {"type":"done","processed":N,"geocoded":N,"failed":N}}
     */
    @PostMapping(value = "/missing", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter geocodeMissing(
            CallerInfo caller,
            @RequestParam(defaultValue = "20") int batchSize) {

        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        int effectiveBatch = Math.min(Math.max(batchSize, 1), MAX_BATCH);
        log.info("POST /api/admin/geocode/missing batchSize={} adminId={}", effectiveBatch, caller.userId());

        SseEmitter emitter = new SseEmitter(0L); // no timeout
        ExecutorService executor = Executors.newSingleThreadExecutor();

        executor.submit(() -> {
            try {
                runBatch(emitter, effectiveBatch);
            } catch (Exception e) {
                log.error("Geocode batch failed", e);
                sendEvent(emitter, "error", "Batch failed: " + e.getMessage());
                emitter.completeWithError(e);
            } finally {
                executor.shutdown();
            }
        });

        return emitter;
    }

    // ===== Batch logic =====

    private void runBatch(SseEmitter emitter, int batchSize) throws IOException, InterruptedException {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id::text AS id, locality FROM public.property_listings " +
                "WHERE locality IS NOT NULL " +
                "  AND (latitude IS NULL OR longitude IS NULL) " +
                "  AND is_duplicate = false " +
                "ORDER BY created_at DESC " +
                "LIMIT ?",
                batchSize);

        if (rows.isEmpty()) {
            sendEvent(emitter, "info", "No listings need geocoding");
            sendDone(emitter, 0, 0, 0);
            emitter.complete();
            return;
        }

        sendEvent(emitter, "info", "Starting batch geocoding — " + rows.size() + " listings to process");

        int geocoded = 0;
        int failed = 0;

        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            String listingId = (String) row.get("id");
            String locality = (String) row.get("locality");

            sendEvent(emitter, "info", "Processing " + (i + 1) + "/" + rows.size() + " — " + locality);

            GeocodingService.GeoResult result = geocodingService.geocode(locality);

            if (result != null) {
                int updated = jdbc.update(
                        "UPDATE public.property_listings " +
                        "SET latitude = ?, longitude = ? " +
                        "WHERE id = ?::uuid",
                        result.latitude(), result.longitude(), listingId);

                if (updated > 0) {
                    sendEvent(emitter, "success",
                            "Geocoded " + locality + " → " +
                            String.format("%.4f, %.4f", result.latitude(), result.longitude()));
                    geocoded++;
                } else {
                    sendEvent(emitter, "warning", "Listing not found for update: " + listingId);
                    failed++;
                }
            } else {
                sendEvent(emitter, "warning", "Could not geocode: " + locality);
                failed++;
            }

            // Nominatim rate limit
            if (i < rows.size() - 1) {
                Thread.sleep(RATE_LIMIT_MS);
            }
        }

        sendEvent(emitter, "info", "Batch complete — " + geocoded + " geocoded, " + failed + " failed");
        sendDone(emitter, rows.size(), geocoded, failed);
        emitter.complete();
    }

    // ===== SSE helpers =====

    private static void sendEvent(SseEmitter emitter, String type, String message) {
        try {
            String json = String.format(
                    "{\"type\":\"%s\",\"message\":\"%s\",\"timestamp\":\"%s\"}",
                    type,
                    message.replace("\"", "\\\""),
                    java.time.Instant.now());
            emitter.send(SseEmitter.event().data(json));
        } catch (IOException e) {
            log.debug("SSE client disconnected: {}", e.getMessage());
        }
    }

    private static void sendDone(SseEmitter emitter, int processed, int geocoded, int failed) {
        try {
            String json = String.format(
                    "{\"type\":\"done\",\"processed\":%d,\"geocoded\":%d,\"failed\":%d}",
                    processed, geocoded, failed);
            emitter.send(SseEmitter.event().data(json));
        } catch (IOException e) {
            log.debug("SSE client disconnected on done: {}", e.getMessage());
        }
    }

}
