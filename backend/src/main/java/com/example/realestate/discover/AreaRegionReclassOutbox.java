package com.example.realestate.discover;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Durably records that a city needs region reclassification after an area apply, WITHOUT ever
 * triggering it synchronously (#1887 PR2, design decision D5). ENQUEUE ONLY — no consumer/poller
 * exists in this class or anywhere in this PR; draining {@code area_region_reclass_outbox} is
 * explicitly PR3+ scope. This class never calls {@code CityRegionOnboardingService},
 * {@code RegionalClassificationBackfillService}, or any OpenSearch/indexing code.
 */
@Component
class AreaRegionReclassOutbox {

    static final String EVENT_TYPE = "CITY_REGION_RECLASSIFICATION_NEEDED";
    private static final String EVENT_ID_NAMESPACE = "area-region-reclass";

    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;

    AreaRegionReclassOutbox(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
    }

    /**
     * Deterministic name-based (UUIDv5-style) event id over {@code "area-region-reclass:<batchId>:<cityId>"}
     * — re-applying the SAME batch always computes the identical id, so the
     * {@code ON CONFLICT (event_id) DO NOTHING} insert in {@link #enqueue} is a true no-op on a
     * second apply (#1887 AC4). Package-private static for direct unit testing (pure logic, no DB
     * dependency).
     */
    static UUID deterministicEventId(long batchId, int cityId) {
        String name = EVENT_ID_NAMESPACE + ":" + batchId + ":" + cityId;
        return UUID.nameUUIDFromBytes(name.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Inserts a durable outbox row for {@code cityId}/{@code batchId} if one doesn't already
     * exist (by deterministic event_id). Returns {@code true} iff a NEW row was inserted.
     */
    boolean enqueue(int cityId, long batchId, Set<String> affectedAreaKeys, String reason) {
        UUID eventId = deterministicEventId(batchId, cityId);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("cityId", cityId);
        payload.put("batchId", batchId);
        payload.put("affectedAreaKeys", affectedAreaKeys);
        payload.put("reason", reason);
        payload.put("enqueuedAt", OffsetDateTime.now().toString());

        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            // payload is a plain Map of String/int/long/Set<String> — Jackson cannot fail here.
            throw new IllegalStateException("Failed to serialize area_region_reclass_outbox payload", e);
        }

        int rows = jdbcOperations.update(INSERT_OUTBOX_SQL,
                eventId, cityId, batchId, EVENT_TYPE, payloadJson);
        return rows > 0;
    }

    private static final String INSERT_OUTBOX_SQL = """
            INSERT INTO area_region_reclass_outbox (event_id, city_id, batch_id, event_type, payload)
            VALUES (?, ?, ?, ?, ?::jsonb)
            ON CONFLICT (event_id) DO NOTHING
            """;
}
