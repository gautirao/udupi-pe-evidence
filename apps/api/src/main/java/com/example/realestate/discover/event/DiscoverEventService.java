package com.example.realestate.discover.event;

import io.github.bucket4j.Bucket;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Service layer for the discover_event ingest endpoint.
 *
 * <p>All validation is centralised here against {@link DiscoverEventAllowList} constants.
 * The controller is intentionally thin — it delegates immediately.
 *
 * <p><strong>Validation rules (whole-batch rejection on any violation):</strong>
 * <ol>
 *   <li>Batch size &le; {@link DiscoverEventAllowList#MAX_BATCH_SIZE}.</li>
 *   <li>session_id present and parseable as UUID.</li>
 *   <li>event_type in {@link DiscoverEventAllowList#EVENT_TYPES}.</li>
 *   <li>filters_jsonb keys subset of {@link DiscoverEventAllowList#ALLOWED_FILTER_KEYS}.</li>
 *   <li>filters_jsonb values are scalar (String / Number / Boolean). Nested maps and lists rejected.</li>
 *   <li>price_band (if present) in {@link DiscoverEventAllowList#ALLOWED_PRICE_BANDS}. Raw numeric price rejected.</li>
 *   <li>Per-session rate limit via {@link DiscoverEventRateLimiterService}.</li>
 * </ol>
 *
 * <p><strong>PII guarantee:</strong> no request body fields, client IP, User-Agent,
 * forwarded-for headers, or any session-derived value are logged or stored.
 * Rate-limit rejections are recorded via a low-cardinality Micrometer counter
 * ({@link #METRIC_RATE_LIMITED}) with NO session tag — never via a log line that
 * includes any session identifier or prefix.
 */
@Service
public class DiscoverEventService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverEventService.class);

    /**
     * Counter name for rate-limit rejections. LOW-CARDINALITY — no per-session tags.
     * Use this metric in Prometheus/alerting instead of log-based detection.
     */
    public static final String METRIC_RATE_LIMITED = "discover_event.rate_limited";

    private final DiscoverEventRepository repository;
    private final DiscoverEventRateLimiterService rateLimiter;
    private final Counter rateLimitedCounter;

    public DiscoverEventService(DiscoverEventRepository repository,
                                DiscoverEventRateLimiterService rateLimiter,
                                MeterRegistry meterRegistry) {
        this.repository = repository;
        this.rateLimiter = rateLimiter;
        this.rateLimitedCounter = Counter.builder(METRIC_RATE_LIMITED)
                .description("Number of discover_event ingest requests rejected by rate limiter")
                .register(meterRegistry);
    }

    /**
     * Validates and persists a batch of discover events.
     *
     * @param request the inbound batch DTO
     * @return the number of events accepted
     * @throws ResponseStatusException 400 on any validation violation (whole batch rejected)
     * @throws ResponseStatusException 413 if batch exceeds max size
     * @throws ResponseStatusException 429 if the first event's session_id is rate-limited
     */
    @Transactional
    public int ingestBatch(DiscoverEventRequest request) {
        List<DiscoverEventRequest.EventItem> events = request.events();

        // ── Guard: null or empty body ───────────────────────────────────────────
        if (events == null || events.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "events must be a non-empty array");
        }

        // ── Guard: batch size cap ───────────────────────────────────────────────
        if (events.size() > DiscoverEventAllowList.MAX_BATCH_SIZE) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Batch exceeds maximum size of " + DiscoverEventAllowList.MAX_BATCH_SIZE);
        }

        // ── Validate all events before any DB write (fail-fast, whole-batch rejection) ──
        List<DiscoverEvent> entities = new ArrayList<>(events.size());
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        for (int i = 0; i < events.size(); i++) {
            DiscoverEventRequest.EventItem item = events.get(i);
            String position = "events[" + i + "]";

            // session_id: required, must be a valid UUID
            if (item.sessionId() == null || item.sessionId().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ": session_id is required");
            }
            UUID sessionUuid = parseUuidOrReject(item.sessionId(), position + ".session_id");

            // event_type: required, in allow-list
            if (item.eventType() == null || !DiscoverEventAllowList.EVENT_TYPES.contains(item.eventType())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ": event_type must be one of " + DiscoverEventAllowList.EVENT_TYPES);
            }

            // areaKey / propertyType / listingPurpose: optional, but length-bounded.
            // Values are NOT reflected in the error message (no attacker-controlled string).
            checkFieldLength(item.areaKey(), position + ".area_key");
            checkFieldLength(item.propertyType(), position + ".property_type");
            checkFieldLength(item.listingPurpose(), position + ".listing_purpose");

            // price_band: if present, must be in coarse band set
            if (item.priceBand() != null && !DiscoverEventAllowList.ALLOWED_PRICE_BANDS.contains(item.priceBand())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ": price_band must be one of " + DiscoverEventAllowList.ALLOWED_PRICE_BANDS
                                + ". Raw numeric prices are not accepted.");
            }

            // filters: validate keys and value types
            Map<String, Object> safeFilters = validateFilters(item.filters(), position);

            entities.add(new DiscoverEvent(
                    sessionUuid,
                    item.eventType(),
                    item.areaKey(),
                    item.propertyType(),
                    item.listingPurpose(),
                    item.priceBand(),
                    safeFilters,
                    now));
        }

        // ── Rate limit: keyed on the first event's session_id ─────────────────
        // All events in a batch share the same session_id in practice; we consume
        // batch.size() tokens in one shot to charge for the whole batch.
        String sessionKey = events.get(0).sessionId();
        Bucket bucket = rateLimiter.getBucket(sessionKey);
        if (!bucket.tryConsume(events.size())) {
            // Increment low-cardinality counter — NO session id or prefix logged (PII contract).
            rateLimitedCounter.increment();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Rate limit exceeded. Max " + DiscoverEventRateLimiterService.CAPACITY
                            + " events per session per "
                            + DiscoverEventRateLimiterService.WINDOW.toMinutes() + " minutes.");
        }

        repository.saveAll(entities);
        log.info("discover_event ingest accepted={}", entities.size());
        return entities.size();
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Rejects a non-null field value that exceeds {@link DiscoverEventAllowList#MAX_FIELD_LENGTH}.
     * Null values are allowed (field is optional). The supplied value is NOT reflected in
     * the error message to avoid attacker-controlled string injection.
     */
    private void checkFieldLength(String value, String fieldPath) {
        if (value != null && value.length() > DiscoverEventAllowList.MAX_FIELD_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    fieldPath + ": exceeds maximum length of " + DiscoverEventAllowList.MAX_FIELD_LENGTH);
        }
    }

    private UUID parseUuidOrReject(String value, String fieldPath) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            // Do NOT reflect the caller-supplied value in the message.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    fieldPath + ": must be a valid UUID");
        }
    }

    /**
     * Validates {@code filters} against the allow-list and returns a safe copy.
     *
     * <p>Rules:
     * <ul>
     *   <li>Null or empty map → return empty map (allowed).</li>
     *   <li>Unknown key → 400.</li>
     *   <li>Value is a Map or List → 400 (nested object/array forbidden).</li>
     *   <li>Value type other than String/Number/Boolean → 400.</li>
     * </ul>
     */
    private Map<String, Object> validateFilters(Map<String, Object> filters, String position) {
        if (filters == null || filters.isEmpty()) {
            return Map.of();
        }

        Map<String, Object> safe = new HashMap<>(filters.size());
        for (Map.Entry<String, Object> entry : filters.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();

            // Unknown key
            if (!DiscoverEventAllowList.ALLOWED_FILTER_KEYS.contains(key)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ".filters: unknown key '" + key
                                + "'. Allowed keys: " + DiscoverEventAllowList.ALLOWED_FILTER_KEYS);
            }

            // Nested object or array
            if (value instanceof Map || value instanceof List) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ".filters['" + key + "']: nested objects and arrays are not allowed. "
                                + "Values must be scalar (string, number, or boolean).");
            }

            // Type check: only String, Number, Boolean are scalar
            if (value != null && !(value instanceof String) && !(value instanceof Number) && !(value instanceof Boolean)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        position + ".filters['" + key + "']: value type "
                                + value.getClass().getSimpleName() + " is not allowed. "
                                + "Values must be scalar (string, number, or boolean).");
            }

            safe.put(key, value);
        }
        return safe;
    }
}
