package com.example.realestate.discover.event;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-session in-memory rate limiter for the discover_event ingest endpoint.
 *
 * <p><strong>Limit:</strong> 60 events per session per 10-minute window.
 * Rationale: a typical user session that actively filters might generate
 * ~5–15 FILTER_APPLY events; 60 gives ample headroom while blocking
 * scripted abuse (thousands of events per minute).
 *
 * <p><strong>Known limitation:</strong> buckets are in-memory and per-instance.
 * In a multi-instance deployment, a client could send up to {@code limit × instances}
 * events before being throttled. Redis-backed distribution is deferred to a
 * follow-up issue. For a foundational telemetry endpoint this trade-off is accepted.
 *
 * <p>Buckets are evicted hourly to reclaim memory, following the same pattern
 * as {@link com.example.realestate.exception.RateLimiterService}.
 */
@Service
public class DiscoverEventRateLimiterService {

    /** Maximum events per session per window. */
    static final int CAPACITY = 60;

    /** Refill window. */
    static final Duration WINDOW = Duration.ofMinutes(10);

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * Returns the Bucket4j bucket for the given session key (a UUID string).
     * Buckets are created lazily on first access.
     */
    public Bucket getBucket(String sessionKey) {
        return buckets.computeIfAbsent(sessionKey, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(CAPACITY)
                                .refillGreedy(CAPACITY, WINDOW)
                                .build())
                        .build());
    }

    /**
     * Evict all buckets hourly.
     * Memory bound: each bucket is ~200–400 bytes; a server with 100 k active
     * sessions in one hour uses ~40 MB worst-case, cleared on the hour.
     */
    @Scheduled(fixedRate = 3_600_000)
    public void evictStaleBuckets() {
        buckets.clear();
    }
}
