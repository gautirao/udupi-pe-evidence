package com.example.realestate.discover.event;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Controller-layer tests for POST /api/discover/events.
 *
 * <p>Uses the real {@link com.example.realestate.security.JwtConfig} security chain so
 * the permitAll rule for the ingest path is exercised by the real filter chain.
 *
 * <p>The service is mocked so no DB is needed for controller-layer tests.
 * Integration-level persistence is covered by {@link DiscoverEventRetentionJobIT}.
 */
@WebMvcTest(
        controllers = DiscoverEventController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({
        com.example.realestate.security.JwtConfig.class,
        IngestionApiKeyFilter.class,
        PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class
})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-ingestion-key",
        "app.metrics.api-key=test-metrics-key",
        "cors.allowed-origins=http://localhost:5174"
})
class DiscoverEventControllerTest {

    private static final String URL = "/api/discover/events";
    private static final String VALID_SESSION = UUID.randomUUID().toString();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private DiscoverEventService discoverEventService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void setUp() {
        reset(discoverEventService);
    }

    // ── Happy path ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("valid single event batch → 202 Accepted with accepted=1")
    void validBatch_returns202() throws Exception {
        when(discoverEventService.ingestBatch(any())).thenReturn(1);

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleEventBody(VALID_SESSION, "FILTER_APPLY")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(1));
    }

    @Test
    @DisplayName("endpoint is public — anonymous caller (no auth header) → 202")
    void anonymousCaller_publicEndpoint_returns202() throws Exception {
        when(discoverEventService.ingestBatch(any())).thenReturn(1);

        // No Authorization header — must not be rejected by Spring Security
        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleEventBody(VALID_SESSION, "FILTER_APPLY")))
                .andExpect(status().isAccepted());
    }

    // ── Validation: session_id ─────────────────────────────────────────────────

    @Test
    @DisplayName("missing session_id → 400")
    void missingSessionId_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "events[0]: session_id is required"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"event_type":"FILTER_APPLY","filters":{}}]}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("non-UUID session_id → 400")
    void nonUuidSessionId_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].session_id: must be a valid UUID, got: not-a-uuid"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"not-a-uuid","event_type":"FILTER_APPLY","filters":{}}]}
                                """))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: event_type ─────────────────────────────────────────────────

    @Test
    @DisplayName("invalid event_type → 400")
    void invalidEventType_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0]: event_type must be one of [FILTER_APPLY, PANEL_OPEN, LEAD_INTENT]"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleEventBody(VALID_SESSION, "UNKNOWN_EVENT")))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("missing event_type → 400")
    void missingEventType_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0]: event_type must be one of [FILTER_APPLY, PANEL_OPEN, LEAD_INTENT]"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","filters":{}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: unknown filter key ────────────────────────────────────────

    @Test
    @DisplayName("unknown filter key → 400")
    void unknownFilterKey_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters: unknown key 'user_email'"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"user_email":"test@example.com"}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: nested object in filters ──────────────────────────────────

    @Test
    @DisplayName("nested object in filter value → 400")
    void nestedObjectInFilter_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters['area_key']: nested objects and arrays are not allowed."));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"area_key":{"nested":"object"}}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("array value in filter → 400")
    void arrayValueInFilter_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters['area_key']: nested objects and arrays are not allowed."));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"area_key":["a","b"]}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: PII-shaped keys ───────────────────────────────────────────

    @Test
    @DisplayName("PII-shaped filter key (user_id) → 400 (unknown key rejection)")
    void piiFilterKey_userId_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters: unknown key 'user_id'"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"user_id":"some-uuid"}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PII-shaped filter key (email) → 400 (unknown key rejection)")
    void piiFilterKey_email_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters: unknown key 'email'"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"email":"user@example.com"}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PII-shaped filter key (phone) → 400 (unknown key rejection)")
    void piiFilterKey_phone_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0].filters: unknown key 'phone'"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "filters":{"phone":"+91-1234567890"}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: raw price in price_band ───────────────────────────────────

    @Test
    @DisplayName("raw numeric price_band → 400")
    void rawNumericPriceBand_returns400() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST,
                        "events[0]: price_band must be one of [...]. Raw numeric prices are not accepted."));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"events":[{"session_id":"%s","event_type":"FILTER_APPLY",
                                "price_band":"5000000","filters":{}}]}
                                """.formatted(VALID_SESSION)))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: oversized batch ───────────────────────────────────────────

    @Test
    @DisplayName("batch size > 50 → 413 Payload Too Large")
    void oversizedBatch_returns413() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE,
                        "Batch exceeds maximum size of 50"));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(oversizedBatchBody(51)))
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    @DisplayName("batch size exactly 50 → 202 Accepted")
    void exactlyMaxBatch_returns202() throws Exception {
        when(discoverEventService.ingestBatch(any())).thenReturn(50);

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(oversizedBatchBody(50)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.accepted").value(50));
    }

    // ── Rate limit ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("rate limit exceeded → 429")
    void rateLimitExceeded_returns429() throws Exception {
        when(discoverEventService.ingestBatch(any()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
                        "Rate limit exceeded."));

        mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleEventBody(VALID_SESSION, "FILTER_APPLY")))
                .andExpect(status().isTooManyRequests());
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static String singleEventBody(String sessionId, String eventType) {
        return """
                {"events":[{"session_id":"%s","event_type":"%s","filters":{}}]}
                """.formatted(sessionId, eventType);
    }

    private static String oversizedBatchBody(int count) {
        StringBuilder events = new StringBuilder();
        String session = UUID.randomUUID().toString();
        for (int i = 0; i < count; i++) {
            if (i > 0) events.append(",");
            events.append("""
                    {"session_id":"%s","event_type":"FILTER_APPLY","filters":{}}
                    """.formatted(session));
        }
        return "{\"events\":[" + events + "]}";
    }
}
