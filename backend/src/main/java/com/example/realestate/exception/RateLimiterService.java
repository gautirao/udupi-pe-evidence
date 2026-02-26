package com.example.realestate.exception;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-user in-memory rate limiter backed by Bucket4j.
 *
 * Limits:
 *   - Payments (POST /api/payments/insights-pass): 3 requests per user per hour
 *   - Bookings  (POST /api/bookings):              10 requests per user per hour
 *
 * Buckets are stored in ConcurrentHashMaps and evicted hourly to reclaim memory.
 */
@Service
public class RateLimiterService {

    private final ConcurrentHashMap<String, Bucket> paymentBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Bucket> bookingBuckets = new ConcurrentHashMap<>();

    public Bucket getPaymentBucket(String userId) {
        return paymentBuckets.computeIfAbsent(userId, id ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(3)
                                .refillGreedy(3, Duration.ofHours(1))
                                .build())
                        .build());
    }

    public Bucket getBookingBucket(String userId) {
        return bookingBuckets.computeIfAbsent(userId, id ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(10)
                                .refillGreedy(10, Duration.ofHours(1))
                                .build())
                        .build());
    }

    @Scheduled(fixedRate = 3_600_000)
    public void evictStaleBuckets() {
        paymentBuckets.clear();
        bookingBuckets.clear();
    }
}
