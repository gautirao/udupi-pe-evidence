package com.example.realestate.discover.event;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Service-layer unit tests for {@link DiscoverEventService}.
 *
 * <p>Covers all validation branches documented in the service Javadoc.
 * No DB or Spring context needed — pure Mockito.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DiscoverEventServiceTest {

    @Mock
    private DiscoverEventRepository repository;

    private DiscoverEventRateLimiterService rateLimiter;
    private SimpleMeterRegistry meterRegistry;
    private DiscoverEventService service;

    @BeforeEach
    void setUp() {
        // Real rate limiter so bucket capacity is actually tested
        rateLimiter = new DiscoverEventRateLimiterService();
        // Fresh registry per test — counters start at 0
        meterRegistry = new SimpleMeterRegistry();
        service = new DiscoverEventService(repository, rateLimiter, meterRegistry);

        when(repository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── Happy paths ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("valid single event → persisted, returns 1")
    void validSingleEvent_persisted() {
        DiscoverEventRequest request = new DiscoverEventRequest(List.of(
                item(UUID.randomUUID().toString(), "FILTER_APPLY",
                        Map.of("area_key", "IN|KA|Udupi|Manipal"), null)));

        int accepted = service.ingestBatch(request);

        assertThat(accepted).isEqualTo(1);
        ArgumentCaptor<List<DiscoverEvent>> captor = ArgumentCaptor.forClass((Class) List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getEventType()).isEqualTo("FILTER_APPLY");
    }

    @Test
    @DisplayName("valid batch of 3 events → all persisted")
    void validBatchOf3_persisted() {
        String session = UUID.randomUUID().toString();
        List<DiscoverEventRequest.EventItem> items = List.of(
                item(session, "FILTER_APPLY", Map.of("area_key", "key1"), null),
                item(session, "PANEL_OPEN", Map.of(), null),
                item(session, "LEAD_INTENT", Map.of("price_band", "20L_50L"), null));

        assertThat(service.ingestBatch(new DiscoverEventRequest(items))).isEqualTo(3);
    }

    @Test
    @DisplayName("all three valid event_types are accepted")
    void allEventTypes_accepted() {
        for (String type : DiscoverEventAllowList.EVENT_TYPES) {
            // Fresh service + fresh rate limiter per event type to avoid bucket exhaustion
            DiscoverEventService svc2 = new DiscoverEventService(
                    repository, new DiscoverEventRateLimiterService(), new SimpleMeterRegistry());
            assertThat(svc2.ingestBatch(new DiscoverEventRequest(List.of(
                    item(UUID.randomUUID().toString(), type, Map.of(), null))))).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("valid price_band label → accepted")
    void validPriceBand_accepted() {
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, null, null, "50L_1CR", Map.of());
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    @Test
    @DisplayName("null filters → treated as empty map, accepted")
    void nullFilters_acceptedAsEmpty() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY", null, null);
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    // ── Batch validation ───────────────────────────────────────────────────────

    @Test
    @DisplayName("null events list → 400")
    void nullEvents_returns400() {
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(null)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("empty events list → 400")
    void emptyEvents_returns400() {
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of())))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("batch size 51 → 413 Payload Too Large")
    void batchSizeExceeded_returns413() {
        List<DiscoverEventRequest.EventItem> items = new ArrayList<>();
        String session = UUID.randomUUID().toString();
        for (int i = 0; i < 51; i++) {
            items.add(item(session, "FILTER_APPLY", Map.of(), null));
        }
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(items)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE));
    }

    @Test
    @DisplayName("batch size exactly 50 → accepted")
    void batchSizeExactly50_accepted() {
        String session = UUID.randomUUID().toString();
        List<DiscoverEventRequest.EventItem> items = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            items.add(item(session, "FILTER_APPLY", Map.of(), null));
        }
        // Rate limiter capacity is 60 so 50 fits
        assertThat(service.ingestBatch(new DiscoverEventRequest(items))).isEqualTo(50);
    }

    // ── session_id validation ──────────────────────────────────────────────────

    @Test
    @DisplayName("null session_id → 400")
    void nullSessionId_returns400() {
        DiscoverEventRequest.EventItem ev = item(null, "FILTER_APPLY", Map.of(), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("blank session_id → 400")
    void blankSessionId_returns400() {
        DiscoverEventRequest.EventItem ev = item("  ", "FILTER_APPLY", Map.of(), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("non-UUID session_id → 400")
    void nonUuidSessionId_returns400() {
        DiscoverEventRequest.EventItem ev = item("not-a-uuid", "FILTER_APPLY", Map.of(), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── event_type validation ─────────────────────────────────────────────────

    @Test
    @DisplayName("invalid event_type → 400")
    void invalidEventType_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "CLICK", Map.of(), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("null event_type → 400")
    void nullEventType_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), null, Map.of(), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── filter key validation ─────────────────────────────────────────────────

    @Test
    @DisplayName("unknown filter key → 400")
    void unknownFilterKey_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("unknown_key", "value"), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("PII key 'user_id' in filters → 400 (unknown key)")
    void piiKey_userId_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("user_id", UUID.randomUUID().toString()), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("PII key 'email' in filters → 400 (unknown key)")
    void piiKey_email_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("email", "user@example.com"), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("PII key 'phone' in filters → 400 (unknown key)")
    void piiKey_phone_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("phone", "+91-1234567890"), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("PII key 'ip' in filters → 400 (unknown key)")
    void piiKey_ip_returns400() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("ip", "192.168.1.1"), null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── filter value type validation ──────────────────────────────────────────

    @Test
    @DisplayName("nested map in filter value → 400")
    void nestedMapInFilterValue_returns400() {
        Map<String, Object> filters = new java.util.HashMap<>();
        filters.put("area_key", Map.of("nested", "object"));
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY", filters, null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("list/array in filter value → 400")
    void arrayInFilterValue_returns400() {
        Map<String, Object> filters = new java.util.HashMap<>();
        filters.put("area_key", List.of("a", "b"));
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY", filters, null);
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("string scalar in filter value → accepted")
    void stringScalar_accepted() {
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY",
                Map.of("area_key", "IN|KA|Udupi|Manipal"), null);
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    @Test
    @DisplayName("numeric scalar in filter value → accepted")
    void numericScalar_accepted() {
        Map<String, Object> filters = new java.util.HashMap<>();
        filters.put("page", 2);
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY", filters, null);
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    @Test
    @DisplayName("boolean scalar in filter value → accepted")
    void booleanScalar_accepted() {
        Map<String, Object> filters = new java.util.HashMap<>();
        // 'sort_by' key uses a String but we can also put a boolean under a valid key
        filters.put("page", true);
        DiscoverEventRequest.EventItem ev = item(UUID.randomUUID().toString(), "FILTER_APPLY", filters, null);
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    // ── price_band validation ─────────────────────────────────────────────────

    @Test
    @DisplayName("raw numeric price_band → 400")
    void rawNumericPriceBand_returns400() {
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, null, null, "5000000", Map.of());
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("unknown price_band label → 400")
    void unknownPriceBand_returns400() {
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, null, null, "INVALID_BAND", Map.of());
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ── Free-text field length guards (S2) ────────────────────────────────────

    @Test
    @DisplayName("areaKey over MAX_FIELD_LENGTH → 400")
    void areaKey_overLength_returns400() {
        String overlong = "X".repeat(DiscoverEventAllowList.MAX_FIELD_LENGTH + 1);
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                overlong, null, null, null, Map.of());
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    // The overlong value must NOT appear in the message (no reflection)
                    assertThat(rse.getReason()).doesNotContain(overlong);
                });
    }

    @Test
    @DisplayName("propertyType over MAX_FIELD_LENGTH → 400")
    void propertyType_overLength_returns400() {
        String overlong = "Y".repeat(DiscoverEventAllowList.MAX_FIELD_LENGTH + 1);
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, overlong, null, null, Map.of());
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("listingPurpose over MAX_FIELD_LENGTH → 400")
    void listingPurpose_overLength_returns400() {
        String overlong = "Z".repeat(DiscoverEventAllowList.MAX_FIELD_LENGTH + 1);
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, null, overlong, null, Map.of());
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(ev))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("areaKey exactly at MAX_FIELD_LENGTH → accepted")
    void areaKey_exactlyMaxLength_accepted() {
        String maxLen = "A".repeat(DiscoverEventAllowList.MAX_FIELD_LENGTH);
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                maxLen, null, null, null, Map.of());
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    @Test
    @DisplayName("null areaKey/propertyType/listingPurpose → accepted (fields are optional)")
    void nullFreeTextFields_accepted() {
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                null, null, null, null, Map.of());
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    @Test
    @DisplayName("normal-length areaKey and propertyType → accepted")
    void normalLengthFreeTextFields_accepted() {
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                UUID.randomUUID().toString(), "FILTER_APPLY",
                "IN|KA|Udupi|Manipal", "agricultural_land", "sale", null, Map.of());
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(ev)))).isEqualTo(1);
    }

    // ── Rate limit ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("same session_id over limit → 429")
    void sameSession_overLimit_returns429() {
        String session = UUID.randomUUID().toString();
        // Exhaust capacity (60) then one more
        for (int i = 0; i < 60; i++) {
            service.ingestBatch(new DiscoverEventRequest(List.of(
                    item(session, "FILTER_APPLY", Map.of(), null))));
        }
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(
                item(session, "FILTER_APPLY", Map.of(), null)))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }

    @Test
    @DisplayName("different session_id unaffected by another session's rate limit")
    void differentSession_unaffected() {
        String sessionA = UUID.randomUUID().toString();
        String sessionB = UUID.randomUUID().toString();

        // Exhaust sessionA's bucket
        for (int i = 0; i < 60; i++) {
            service.ingestBatch(new DiscoverEventRequest(List.of(
                    item(sessionA, "FILTER_APPLY", Map.of(), null))));
        }

        // sessionB must still work
        assertThat(service.ingestBatch(new DiscoverEventRequest(List.of(
                item(sessionB, "FILTER_APPLY", Map.of(), null))))).isEqualTo(1);
    }

    @Test
    @DisplayName("rate-limit rejection increments low-cardinality counter (no session tag)")
    void rateLimitRejection_incrementsCounterWithNoSessionTag() {
        String session = UUID.randomUUID().toString();

        // Exhaust capacity
        for (int i = 0; i < 60; i++) {
            service.ingestBatch(new DiscoverEventRequest(List.of(
                    item(session, "FILTER_APPLY", Map.of(), null))));
        }

        // Trigger rate-limit rejection
        assertThatThrownBy(() -> service.ingestBatch(new DiscoverEventRequest(List.of(
                item(session, "FILTER_APPLY", Map.of(), null)))))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));

        // Counter must be registered and incremented to 1
        Counter counter = meterRegistry.find(DiscoverEventService.METRIC_RATE_LIMITED).counter();
        assertThat(counter)
                .as("rate_limited counter must be registered after a rejection")
                .isNotNull();
        assertThat(counter.count())
                .as("counter must be 1 after one rejection")
                .isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.001));

        // Counter must have NO session-derived tags (low-cardinality guarantee)
        assertThat(counter.getId().getTags())
                .as("rate_limited counter must have no per-session tags")
                .isEmpty();
    }

    // ── Persistence: persisted entity has correct whitelisted fields ───────────

    @Test
    @DisplayName("persisted entity has exactly the whitelisted coarse fields")
    void persistedEntity_hasCorrectFields() {
        String session = UUID.randomUUID().toString();
        DiscoverEventRequest.EventItem ev = new DiscoverEventRequest.EventItem(
                session, "PANEL_OPEN",
                "IN|KA|Udupi|Manipal",
                "residential",
                "sale",
                "20L_50L",
                Map.of("sort_by", "newest"));

        service.ingestBatch(new DiscoverEventRequest(List.of(ev)));

        ArgumentCaptor<List<DiscoverEvent>> captor = ArgumentCaptor.forClass((Class) List.class);
        verify(repository).saveAll(captor.capture());
        DiscoverEvent saved = captor.getValue().get(0);

        assertThat(saved.getSessionId()).isEqualTo(UUID.fromString(session));
        assertThat(saved.getEventType()).isEqualTo("PANEL_OPEN");
        assertThat(saved.getAreaKey()).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(saved.getPropertyType()).isEqualTo("residential");
        assertThat(saved.getListingPurpose()).isEqualTo("sale");
        assertThat(saved.getPriceBand()).isEqualTo("20L_50L");
        assertThat(saved.getFiltersJsonb()).containsEntry("sort_by", "newest");
        assertThat(saved.getTs()).isNotNull();
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    private DiscoverEventRequest.EventItem item(String sessionId, String eventType,
                                                 Map<String, Object> filters, String priceBand) {
        return new DiscoverEventRequest.EventItem(sessionId, eventType,
                null, null, null, priceBand, filters);
    }
}
