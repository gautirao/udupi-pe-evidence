package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/listings.
 * Uses anyRequest().authenticated() to enforce JWT; jwt() post-processor for happy-path tests.
 * Spring Security without AuthenticationEntryPoint returns 403 for unauthenticated requests.
 */
@WebMvcTest(
        controllers = DiscoverListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverListingsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverListingsControllerTest {

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

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverListingsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // ── 1. No JWT → 401/403 ──────────────────────────────────────────────────

    @Test
    void noJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/discover/listings").param("city", "udupi"))
                .andExpect(status().is4xxClientError());
    }

    // ── 2. Valid request → 200, service called ────────────────────────────────

    @Test
    void validRequest_returns200() throws Exception {
        DiscoverListingResponse listing = new DiscoverListingResponse(
                "abc", "L-001", "house", "Test title", "Malpe", "IN|KA|Udupi|Malpe",
                5_000_000L, null, null, 100.0, "sq m", 3, 13.3, 74.7,
                null, OffsetDateTime.now(), null, null, null,
                5, false, null, null, "A", null, "OWNER", "sale", "LIVE"
        );
        DiscoverListingsPage page = new DiscoverListingsPage(
                List.of(listing), 0, 20, 1L, 1, null);

        when(service.getListings(any())).thenReturn(page);

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.page", is(0)))
                .andExpect(jsonPath("$.totalElements", is(1)));

        verify(service).getListings(argThat(q -> q.city().equals("udupi")));
    }

    // ── 3. size=200 → clamped to 100 in service call ─────────────────────────

    @Test
    void sizeAboveMax_clampedTo100() throws Exception {
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 100, 0L, 0, null));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("size", "200")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(q -> q.size() == 100));
    }

    // ── 4. page=-1 → 400 ─────────────────────────────────────────────────────

    @Test
    void negativePageParam_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("page", "-1")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 5. polygon with 2 vertices → 400 ─────────────────────────────────────

    @Test
    void polygonWith2Vertices_returns400() throws Exception {
        String polygon = "[[13.3,74.7],[13.4,74.8]]";
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("polygon", polygon)
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 6. schoolLat without schoolLon → 400 ─────────────────────────────────

    @Test
    void schoolLatWithoutSchoolLon_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("schoolLat", "13.0")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 7. includeAggregates=true → service called with includeAggregates=true ──

    @Test
    void includeAggregatesTrue_passedToService() throws Exception {
        DiscoverListingsAggregates agg = new DiscoverListingsAggregates(
                List.of(new DiscoverListingsAggregates.LocalityCount("Malpe", 10)));
        when(service.getListings(any())).thenReturn(
                new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, agg));

        mockMvc.perform(get("/api/discover/listings")
                        .param("city", "udupi")
                        .param("includeAggregates", "true")
                        .with(jwt()))
                .andExpect(status().isOk());

        verify(service).getListings(argThat(DiscoverListingsQuery::includeAggregates));
    }
}
