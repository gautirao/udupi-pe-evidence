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

import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/markers.
 * Uses anyRequest().authenticated() to enforce JWT; jwt() post-processor for happy-path tests.
 */
@WebMvcTest(
        controllers = DiscoverMarkersController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverMarkersControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverMarkersControllerTest {

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
    private DiscoverMarkersService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // ── 1. No JWT → 401/403 ──────────────────────────────────────────────────

    @Test
    void noJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/discover/markers").param("city", "udupi"))
                .andExpect(status().is4xxClientError());
    }

    // ── 2. Valid city → 200 ───────────────────────────────────────────────────

    @Test
    void validCity_returns200() throws Exception {
        DiscoverMarker marker = new DiscoverMarker("abc-id", 13.3, 74.7, 5_000_000L, "Malpe");
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(marker), false));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.markers", hasSize(1)))
                .andExpect(jsonPath("$.markers[0].id", is("abc-id")))
                .andExpect(jsonPath("$.markers[0].latitude", is(13.3)))
                .andExpect(jsonPath("$.markers[0].longitude", is(74.7)))
                .andExpect(jsonPath("$.markers[0].pricePaise", is(5_000_000)))
                .andExpect(jsonPath("$.truncated", is(false)));
    }

    // ── 3. Polygon with fewer than 3 vertices → 400 ───────────────────────────

    @Test
    void polygonWith2Vertices_returns400() throws Exception {
        String polygon = "[[13.3,74.7],[13.4,74.8]]";
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("polygon", polygon)
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 4. Partial school params → 400 ───────────────────────────────────────

    @Test
    void schoolLonWithoutSchoolLat_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .param("schoolLon", "74.0")
                        .with(jwt()))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 5. Service returns truncated=true → JSON reflects it ────────────────

    @Test
    void truncatedResponse_returnsTruncatedTrue() throws Exception {
        DiscoverMarker marker = new DiscoverMarker("abc-id", 13.3, 74.7, 5_000_000L, "Malpe");
        when(service.getMarkers(any())).thenReturn(
                new DiscoverMarkersResponse("udupi", List.of(marker), true));

        mockMvc.perform(get("/api/discover/markers")
                        .param("city", "udupi")
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.truncated", is(true)));
    }
}
