package com.example.realestate.savedsearch;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.security.UserRoleService;
import io.github.bucket4j.Bucket;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2019 Slice A: {@code @WebMvcTest} slice for {@link SavedSearchController}.
 *
 * <p>Mirrors {@code DiscoverListingsControllerTest} / {@code BookingControllerTest}:
 * {@code anyRequest().authenticated()} + the {@code jwt()} post-processor, service fully
 * mocked, {@link RateLimiterService} mocked with an allow-all bucket by default. Proves the
 * HTTP contract only: status mapping (201 create / 200 idempotent replay / 204 delete /
 * 404 IDOR / 429 rate limit / 400 validation), that the user id is derived from the JWT
 * subject (never the body), and that a rate-limited request never reaches the service.
 */
@WebMvcTest(
        controllers = SavedSearchController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({SavedSearchControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class SavedSearchControllerTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    private static final UUID USER_ID = UUID.fromString("aaaaaaaa-0000-0000-0000-0000000000a1");
    private static final UUID OTHER_USER_ID = UUID.fromString("bbbbbbbb-0000-0000-0000-0000000000b1");
    private static final UUID SEARCH_ID = UUID.fromString("cccccccc-0000-0000-0000-0000000000c1");

    private static final String AREA_SET_BODY = """
            {"citySlug":"bangalore","resultScopeKind":"AREA_SET","areaKeys":["IN|KA|Bangalore|Indiranagar"],
             "filters":{"minPrice":1000000},"label":"Indiranagar flats","alertFrequency":"DAILY"}
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SavedSearchService savedSearchService;

    @MockitoBean
    private RateLimiterService rateLimiterService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(savedSearchService, rateLimiterService);
        Bucket allowBucket = mock(Bucket.class);
        when(allowBucket.tryConsume(1)).thenReturn(true);
        when(rateLimiterService.getSavedSearchCreateBucket(anyString())).thenReturn(allowBucket);
        when(rateLimiterService.getSavedSearchUpdateBucket(anyString())).thenReturn(allowBucket);
    }

    private static SavedSearch sampleSearch(UUID userId) {
        OffsetDateTime now = OffsetDateTime.now();
        return new SavedSearch(
                SEARCH_ID, userId, "bangalore", ResultScopeKind.AREA_SET,
                List.of("IN|KA|Bangalore|Indiranagar"), null, null, null, null, null,
                Map.of("minPrice", 1000000), "fp-1", "Indiranagar flats",
                SavedSearchStatus.ACTIVE, AlertFrequency.DAILY, AlertStatus.IDLE, now, now);
    }

    // ── auth ─────────────────────────────────────────────────────────────────────────

    @Test
    void noJwt_list_returns4xx() throws Exception {
        mockMvc.perform(get("/api/saved-searches"))
                .andExpect(status().is4xxClientError());
        verify(savedSearchService, never()).list(any());
    }

    @Test
    void noJwt_create_returns4xx() throws Exception {
        mockMvc.perform(post("/api/saved-searches")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().is4xxClientError());
        verify(savedSearchService, never()).create(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    // ── create ───────────────────────────────────────────────────────────────────────

    @Test
    void create_new_returns201_andUserIdComesFromJwtSubject() throws Exception {
        when(savedSearchService.create(
                eq(USER_ID), eq("bangalore"), eq(ResultScopeKind.AREA_SET),
                eq(List.of("IN|KA|Bangalore|Indiranagar")), any(),
                any(), any(), any(), any(),
                eq(Map.of("minPrice", 1000000)), eq("Indiranagar flats"), eq(AlertFrequency.DAILY)))
                .thenReturn(new SavedSearchService.CreateOutcome(sampleSearch(USER_ID), true));

        mockMvc.perform(post("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", is(SEARCH_ID.toString())))
                .andExpect(jsonPath("$.citySlug", is("bangalore")))
                .andExpect(jsonPath("$.resultScopeKind", is("AREA_SET")))
                .andExpect(jsonPath("$.status", is("ACTIVE")))
                .andExpect(jsonPath("$.alertFrequency", is("DAILY")));
    }

    @Test
    void create_idempotentReplay_returns200() throws Exception {
        when(savedSearchService.create(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new SavedSearchService.CreateOutcome(sampleSearch(USER_ID), false));

        mockMvc.perform(post("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(SEARCH_ID.toString())));
    }

    @Test
    void create_serviceValidationFailure_returns400WithReason() throws Exception {
        when(savedSearchService.create(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "saved_search_unsupported_filter"));

        mockMvc.perform(post("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("saved_search_unsupported_filter")));
    }

    @Test
    void create_capReached_returns422() throws Exception {
        when(savedSearchService.create(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ResponseStatusException(
                        HttpStatus.UNPROCESSABLE_ENTITY, "saved_search_max_active_limit_reached"));

        mockMvc.perform(post("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error", is("saved_search_max_active_limit_reached")));
    }

    // ── rate limit ───────────────────────────────────────────────────────────────────

    @Test
    void create_rateLimitExhausted_returns429_andServiceNeverCalled() throws Exception {
        Bucket exhausted = mock(Bucket.class);
        when(exhausted.tryConsume(1)).thenReturn(false);
        when(rateLimiterService.getSavedSearchCreateBucket(USER_ID.toString())).thenReturn(exhausted);

        mockMvc.perform(post("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error", is("saved_search_rate_limit_exceeded")));

        verify(savedSearchService, never()).create(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void update_rateLimitExhausted_returns429_andServiceNeverCalled() throws Exception {
        Bucket exhausted = mock(Bucket.class);
        when(exhausted.tryConsume(1)).thenReturn(false);
        when(rateLimiterService.getSavedSearchUpdateBucket(USER_ID.toString())).thenReturn(exhausted);

        mockMvc.perform(patch("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isTooManyRequests());

        verify(savedSearchService, never()).update(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    // ── read / update / delete / pause / resume ──────────────────────────────────────

    @Test
    void get_owned_returns200() throws Exception {
        when(savedSearchService.get(USER_ID, SEARCH_ID)).thenReturn(sampleSearch(USER_ID));

        mockMvc.perform(get("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(SEARCH_ID.toString())));
    }

    @Test
    void get_notOwned_returns404NotFound_never403() throws Exception {
        when(savedSearchService.get(OTHER_USER_ID, SEARCH_ID))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "saved_search_not_found"));

        mockMvc.perform(get("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_USER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error", is("saved_search_not_found")));
    }

    @Test
    void list_returns200WithOwnersRows() throws Exception {
        when(savedSearchService.list(USER_ID)).thenReturn(List.of(sampleSearch(USER_ID)));

        mockMvc.perform(get("/api/saved-searches")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id", is(SEARCH_ID.toString())));
    }

    @Test
    void update_returns200() throws Exception {
        when(savedSearchService.update(
                eq(USER_ID), eq(SEARCH_ID), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(sampleSearch(USER_ID));

        mockMvc.perform(patch("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(SEARCH_ID.toString())));
    }

    @Test
    void update_fingerprintCollision_returns409() throws Exception {
        when(savedSearchService.update(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "saved_search_duplicate_fingerprint"));

        mockMvc.perform(patch("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(AREA_SET_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error", is("saved_search_duplicate_fingerprint")));
    }

    @Test
    void delete_returns204() throws Exception {
        mockMvc.perform(delete("/api/saved-searches/{id}", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(savedSearchService).delete(USER_ID, SEARCH_ID);
    }

    @Test
    void pause_returns200() throws Exception {
        when(savedSearchService.pause(USER_ID, SEARCH_ID)).thenReturn(sampleSearch(USER_ID));

        mockMvc.perform(patch("/api/saved-searches/{id}/pause", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());
    }

    @Test
    void resume_returns200() throws Exception {
        when(savedSearchService.resume(USER_ID, SEARCH_ID)).thenReturn(sampleSearch(USER_ID));

        mockMvc.perform(patch("/api/saved-searches/{id}/resume", SEARCH_ID)
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk());
    }
}
