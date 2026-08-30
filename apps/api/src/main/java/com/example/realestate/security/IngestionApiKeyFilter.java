package com.example.realestate.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class IngestionApiKeyFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(IngestionApiKeyFilter.class);
    private static final String INGEST_PATH = "/api/ingestion/ingest-posts";
    private static final String API_KEY_HEADER = "X-Ingestion-Api-Key";
    private static final int RATE_LIMIT_PER_MINUTE = 10;

    private final String expectedApiKey;
    private final ObjectMapper objectMapper;
    // Rate limit buckets keyed by first 8 chars of the key (fingerprint, not full value)
    private final ConcurrentHashMap<String, Bucket> rateLimitBuckets = new ConcurrentHashMap<>();

    public IngestionApiKeyFilter(
            @Value("${app.ingestion.api-key}") String expectedApiKey,
            ObjectMapper objectMapper) {
        this.expectedApiKey = expectedApiKey;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !INGEST_PATH.equals(request.getRequestURI())
                || !"POST".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String providedKey = request.getHeader(API_KEY_HEADER);

        if (providedKey == null || !isValidKey(providedKey)) {
            log.warn("Ingestion API key authentication failed — missing or invalid key");
            sendError(response, HttpServletResponse.SC_UNAUTHORIZED, "Invalid or missing API key");
            return;
        }

        String keyFingerprint = providedKey.substring(0, Math.min(8, providedKey.length()));
        Bucket bucket = rateLimitBuckets.computeIfAbsent(keyFingerprint, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(RATE_LIMIT_PER_MINUTE)
                                .refillGreedy(RATE_LIMIT_PER_MINUTE, Duration.ofMinutes(1))
                                .build())
                        .build()
        );

        if (!bucket.tryConsume(1)) {
            log.warn("Ingestion rate limit exceeded keyFingerprint={}***", keyFingerprint);
            response.setHeader("Retry-After", "60");
            sendError(response, 429, "Rate limit exceeded. Max " + RATE_LIMIT_PER_MINUTE + " requests per minute.");
            return;
        }

        log.info("Ingestion API key authentication succeeded keyFingerprint={}***", keyFingerprint);
        filterChain.doFilter(request, response);
    }

    private boolean isValidKey(String provided) {
        try {
            byte[] expected = expectedApiKey.getBytes(StandardCharsets.UTF_8);
            byte[] actual = provided.getBytes(StandardCharsets.UTF_8);
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            return false;
        }
    }

    private void sendError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of("error", message));
    }
}
