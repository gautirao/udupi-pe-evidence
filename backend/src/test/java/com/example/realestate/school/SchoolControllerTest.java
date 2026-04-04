package com.example.realestate.school;

import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for SchoolController (unauthenticated public endpoints).
 * No JWT is required — the security config permits all GET /api/public/schools/** requests.
 */
@WebMvcTest(
        controllers = SchoolController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(SchoolControllerTest.TestConfig.class)
class SchoolControllerTest {

    private static final UUID SCHOOL_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    /** Minimal security config: permit everything (mirrors production's permitAll on this path). */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private SchoolService schoolService;

    @BeforeEach
    void setUp() {
        reset(schoolService, userRoleService);
    }

    // ==================== GET /search — happy path ====================

    @Test
    void search_validQuery_returns200WithResults() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                13.3511, 74.7871, "Manipal, Udupi", null, null);

        when(schoolService.search(anyString(), anyInt()))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/search")
                        .param("q", "Sharada"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(SCHOOL_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("Sharada Vidyalaya"))
                .andExpect(jsonPath("$[0].boardType").value("CBSE"))
                .andExpect(jsonPath("$[0].latitude").value(13.3511))
                .andExpect(jsonPath("$[0].longitude").value(74.7871))
                .andExpect(jsonPath("$[0].prominenceTier").value((Object) null));
    }

    // ==================== GET /search — empty query -> 400 ====================

    @Test
    void search_blankQuery_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/search")
                        .param("q", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Query parameter 'q' is required"));
    }

    // ==================== GET /search — missing param -> 400 ====================

    @Test
    void search_missingParam_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/search"))
                .andExpect(status().isBadRequest());
    }

    // ==================== GET /nearby — happy path ====================

    @Test
    void nearby_validCoordinates_returns200WithResults() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Vidyodaya High School", "State",
                13.3409, 74.7421, "Ajjarkad, Udupi", 0.85, null);

        when(schoolService.findNearby(anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/nearby")
                        .param("lat", "13.3400")
                        .param("lon", "74.7400"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Vidyodaya High School"))
                .andExpect(jsonPath("$[0].distanceKm").value(0.85))
                .andExpect(jsonPath("$[0].prominenceTier").value((Object) null));
    }

    // ==================== GET /nearby — invalid lat -> 400 ====================

    @Test
    void nearby_invalidLat_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/nearby")
                        .param("lat", "91.0")
                        .param("lon", "74.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("lat must be between -90 and 90"));
    }

    // ==================== GET /nearby — invalid lon -> 400 ====================

    @Test
    void nearby_invalidLon_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/nearby")
                        .param("lat", "13.0")
                        .param("lon", "181.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("lon must be between -180 and 180"));
    }

    // ==================== GET /{id} — happy path ====================

    @Test
    void getById_existingSchool_returns200() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Christ King PU College", "State",
                13.3433, 74.7456, "Kunjibettu, Udupi", null, null);

        when(schoolService.findById(SCHOOL_ID)).thenReturn(Optional.of(school));

        mockMvc.perform(get("/api/public/schools/" + SCHOOL_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Christ King PU College"))
                .andExpect(jsonPath("$.boardType").value("State"))
                .andExpect(jsonPath("$.prominenceTier").value((Object) null));
    }

    // ==================== GET /{id} — not found -> 404 ====================

    @Test
    void getById_unknownSchool_returns404() throws Exception {
        UUID unknownId = UUID.fromString("00000000-0000-0000-0000-000000000099");
        when(schoolService.findById(unknownId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/public/schools/" + unknownId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("School not found"));
    }

    // ==================== GET /nearby — no results ====================

    @Test
    void nearby_noResults_returns200WithEmptyArray() throws Exception {
        when(schoolService.findNearby(anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/nearby")
                        .param("lat", "0.0")
                        .param("lon", "0.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
