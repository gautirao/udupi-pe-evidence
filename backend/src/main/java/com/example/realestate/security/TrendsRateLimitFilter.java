package com.example.realestate.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Anti-abuse rate limiter for the PUBLIC trends GET/HEAD endpoint family (#1612).
 *
 * <p><strong>Scope:</strong> applies to {@code GET} and {@code HEAD} against
 * {@code /api/trends/**} — covering {@code /api/trends/options}, {@code /api/trends/overview},
 * {@code /api/trends/area-intelligence}, and {@code /api/trends/resolve-area}. Unlike
 * {@link DiscoverRateLimitFilter}, there is no authenticated sub-path exclusion here: every
 * {@code /api/trends/**} GET is {@code permitAll()} in {@link JwtConfig} (fully anonymous), so no
 * exclusion list is needed. {@code HEAD} is included alongside {@code GET} because Spring MVC's
 * {@code FrameworkServlet#doHead} dispatches {@code HEAD} to the same {@code @GetMapping} handler
 * (running the full request, only suppressing the response body) — excluding it would let a
 * {@code curl -I} loop execute the identical DB path with zero throttling.
 *
 * <p><strong>Pattern:</strong> mirrors {@link DiscoverRateLimitFilter} — {@link OncePerRequestFilter}
 * + Bucket4j + {@link ConcurrentHashMap} bucket-per-key + JSON 429 written directly to the response
 * (this filter runs before {@code DispatcherServlet}, so {@code GlobalExceptionHandler} is never in
 * play here).
 *
 * <p><strong>Keying:</strong> defaults to {@link HttpServletRequest#getRemoteAddr()}. When
 * {@code app.ratelimit.trends.trust-forwarded-header=true}, the leftmost {@code X-Forwarded-For}
 * entry is used instead. <strong>Honesty caveat:</strong> {@code X-Forwarded-For} is client-supplied
 * and trivially spoofable unless a trusted reverse proxy strips/overwrites it before this filter
 * runs; enabling the flag without such a proxy in front of the app lets a client pick its own rate
 * limit bucket. Trusted-proxy hop validation is deferred (out of scope for #1612). With the flag
 * off (default), all traffic behind a single load balancer collapses into one IP bucket — an
 * accepted trade-off for a first anti-abuse guard.
 *
 * <p><strong>Known path-matching limitation:</strong> like {@link DiscoverRateLimitFilter}, this
 * filter compares against the raw, servlet-container-decoded {@link HttpServletRequest#getRequestURI()}
 * rather than Spring Security's normalized {@code RequestPath}. Unusual percent-encoded path
 * segments could in theory desynchronize the two; this is an existing, accepted limitation shared
 * with the pre-existing filter this class mirrors, not a new regression.
 *
 * <p><strong>Memory bounding:</strong> buckets are evicted hourly ({@link #evictStaleBuckets()}),
 * following {@code DiscoverEventRateLimiterService}'s precedent, plus a hard {@code max-entries}
 * cap that clears the whole map before inserting past the cap (same pattern as
 * {@code RateLimiterService}). Distributed/Redis-backed limiting across multiple app instances is
 * out of scope — deferred to a follow-up.
 */
@Component
public class TrendsRateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TrendsRateLimitFilter.class);

    private static final String TRENDS_PATH_PREFIX = "/api/trends/";

    private static final String THROTTLED_COUNTER_NAME = "trends.ratelimit.throttled";
    private static final String RETRY_AFTER_SECONDS = "60";
    private static final String UNKNOWN_CLIENT_KEY = "unknown";
    private static final String FORWARDED_FOR_HEADER = "X-Forwarded-For";

    private final boolean enabled;
    private final int requestsPerMinute;
    private final boolean trustForwardedHeader;
    private final int maxEntries;
    private final ObjectMapper objectMapper;
    private final Counter throttledCounter;

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * {@code MeterRegistry} is resolved via {@link ObjectProvider} (optional) rather than a
     * required dependency. Spring Boot's {@code @WebMvcTest} auto-detects any {@code Filter}
     * bean (this class, via {@code OncePerRequestFilter}) application-wide regardless of
     * {@code controllers=}/{@code @Import} scoping — so this filter gets constructed inside
     * every sliced controller test in the module, most of which have no {@code MeterRegistry}
     * bean at all. Making it optional (counter becomes a no-op when absent) keeps every
     * unrelated {@code @WebMvcTest} loading unchanged; the real application always has a
     * {@code MeterRegistry} (Actuator + Micrometer Prometheus registry), so production metrics
     * are unaffected.
     */
    public TrendsRateLimitFilter(
            @Value("${app.ratelimit.trends.enabled:true}") boolean enabled,
            @Value("${app.ratelimit.trends.requests-per-minute:60}") int requestsPerMinute,
            @Value("${app.ratelimit.trends.trust-forwarded-header:false}") boolean trustForwardedHeader,
            @Value("${app.ratelimit.trends.max-entries:100000}") int maxEntries,
            ObjectMapper objectMapper,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        if (requestsPerMinute <= 0) {
            throw new IllegalArgumentException(
                    "app.ratelimit.trends.requests-per-minute must be > 0, got: " + requestsPerMinute);
        }
        if (maxEntries <= 0) {
            throw new IllegalArgumentException(
                    "app.ratelimit.trends.max-entries must be > 0, got: " + maxEntries);
        }
        this.enabled = enabled;
        this.requestsPerMinute = requestsPerMinute;
        this.trustForwardedHeader = trustForwardedHeader;
        this.maxEntries = maxEntries;
        this.objectMapper = objectMapper;
        MeterRegistry meterRegistry = meterRegistryProvider.getIfAvailable();
        this.throttledCounter = meterRegistry == null ? null : Counter.builder(THROTTLED_COUNTER_NAME)
                .description("Requests rejected by the public trends GET/HEAD per-IP rate limit")
                .register(meterRegistry);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!enabled) {
            return true;
        }
        // GET and HEAD are limited — Spring MVC's FrameworkServlet#doHead dispatches HEAD to the
        // same @GetMapping handler as GET (running the full request, only suppressing the
        // response body), so treating HEAD as unthrottled would let it execute the identical DB
        // path with zero rate limiting — a full bypass of this guard via `curl -I` loops.
        // OPTIONS (CORS preflight) passes untouched.
        String method = request.getMethod();
        if (!HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method)) {
            return true;
        }
        String path = normalize(request.getRequestURI());
        // The entire /api/trends/** GET family is permitAll() in JwtConfig — fully anonymous, so
        // (unlike DiscoverRateLimitFilter) there is no authenticated sub-path to exclude here.
        return path == null || !path.startsWith(TRENDS_PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        String clientKey = resolveClientKey(request);
        Bucket bucket = bucketFor(clientKey);

        if (!bucket.tryConsume(1)) {
            if (throttledCounter != null) {
                throttledCounter.increment();
            }
            log.warn("Public trends rate limit exceeded for clientKey={}", clientKey);
            response.setHeader("Retry-After", RETRY_AFTER_SECONDS);
            sendError(response, 429,
                    "Rate limit exceeded. Max " + requestsPerMinute + " requests per minute.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Bucket bucketFor(String clientKey) {
        if (buckets.size() >= maxEntries) {
            // Hard memory cap: clear-before-insert, same precedent as RateLimiterService /
            // DiscoverEventRateLimiterService. A benign race under heavy contention may clear
            // more than strictly necessary — acceptable, it only resets rate-limit history.
            buckets.clear();
        }
        return buckets.computeIfAbsent(clientKey, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.builder()
                                .capacity(requestsPerMinute)
                                .refillGreedy(requestsPerMinute, Duration.ofMinutes(1))
                                .build())
                        .build());
    }

    private String resolveClientKey(HttpServletRequest request) {
        if (trustForwardedHeader) {
            String forwarded = request.getHeader(FORWARDED_FOR_HEADER);
            if (forwarded != null && !forwarded.isBlank()) {
                String leftmost = forwarded.split(",")[0].trim();
                if (!leftmost.isEmpty()) {
                    return leftmost;
                }
            }
        }
        String remoteAddr = request.getRemoteAddr();
        return (remoteAddr == null || remoteAddr.isBlank()) ? UNKNOWN_CLIENT_KEY : remoteAddr;
    }

    private static String normalize(String uri) {
        if (uri == null) {
            return null;
        }
        if (uri.length() > 1 && uri.endsWith("/")) {
            return uri.substring(0, uri.length() - 1);
        }
        return uri;
    }

    /**
     * Evict all buckets hourly to reclaim memory — same pattern as
     * {@code DiscoverEventRateLimiterService#evictStaleBuckets()}.
     */
    @Scheduled(fixedRate = 3_600_000)
    public void evictStaleBuckets() {
        buckets.clear();
    }

    private void sendError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of("error", message));
    }
}
