package com.example.realestate.school;

import com.example.realestate.area.AreaNotFoundException;
import com.example.realestate.exception.GlobalExceptionHandler;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
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
@Import({SchoolControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class SchoolControllerTest {

    private static final UUID SCHOOL_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID SCHOOL_ID2 = UUID.fromString("00000000-0000-0000-0000-000000000002");

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
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, null, null, null, null);

        when(schoolService.search(anyString(), anyInt(), eq(null)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/search")
                        .param("q", "Sharada"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(SCHOOL_ID.toString()))
                .andExpect(jsonPath("$[0].name").value("Sharada Vidyalaya"))
                .andExpect(jsonPath("$[0].boardType").value("CBSE"))
                .andExpect(jsonPath("$[0].board").value("CBSE"))
                .andExpect(jsonPath("$[0].latitude").value(13.3511))
                .andExpect(jsonPath("$[0].longitude").value(74.7871))
                .andExpect(jsonPath("$[0].prominenceTier").value((Object) null));

        // Guardrail: no city param supplied — must delegate with city=null (unscoped, backward compatible)
        verify(schoolService).search("Sharada", 10, null);
    }

    // ==================== GET /search — city scope param (issue #1798) ====================

    @Test
    void search_withCityScope_delegatesCityToService_regressionScopeExclusion() throws Exception {
        // Regression: GET /search?q=heb&city=bangalore must scope to Bangalore-district schools
        // only, not the globally-unscoped match that previously leaked Udupi schools into a
        // Bangalore search.
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Hebbal Public School", "CBSE",
                "CBSE", 13.0451, 77.5977, "Hebbal, Bengaluru", null, null, null, null, null);

        when(schoolService.search(eq("heb"), anyInt(), eq("bangalore")))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/search")
                        .param("q", "heb")
                        .param("city", "bangalore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Hebbal Public School"));

        verify(schoolService).search("heb", 10, "bangalore");
    }

    @Test
    void search_blankCityScope_passedThroughAsBlank_serviceHandlesUnscoping() throws Exception {
        // Controller does not strip blank city — SchoolService.search treats blank as unscoped.
        when(schoolService.search(eq("heb"), anyInt(), eq("  ")))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/search")
                        .param("q", "heb")
                        .param("city", "  "))
                .andExpect(status().isOk());

        verify(schoolService).search("heb", 10, "  ");
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
                null, 13.3409, 74.7421, "Ajjarkad, Udupi", 0.85, null, null, null, null);

        when(schoolService.findNearby(anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/nearby")
                        .param("lat", "13.3400")
                        .param("lon", "74.7400"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Vidyodaya High School"))
                .andExpect(jsonPath("$[0].board").value((Object) null))
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
                null, 13.3433, 74.7456, "Kunjibettu, Udupi", null, null, null, null, null);

        when(schoolService.findById(SCHOOL_ID)).thenReturn(Optional.of(school));

        mockMvc.perform(get("/api/public/schools/" + SCHOOL_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Christ King PU College"))
                .andExpect(jsonPath("$.boardType").value("State"))
                .andExpect(jsonPath("$.board").value((Object) null))
                .andExpect(jsonPath("$.prominenceTier").value((Object) null))
                .andExpect(jsonPath("$.areaKey").value((Object) null));
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

    // ==================== GET /popular — city-only mode (backward compatibility) ====================

    @Test
    void popular_missingCity_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/popular"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Query parameter 'city' is required"));
    }

    @Test
    void popular_blankCity_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Query parameter 'city' is required"));
    }

    @Test
    void popular_validCity_noFilters_routesToExistingMethod() throws Exception {
        SchoolResponse school1 = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, 3, null);
        SchoolResponse school2 = new SchoolResponse(
                SCHOOL_ID2.toString(), "Aloysius PU College", "ICSE",
                "ICSE", 13.3370, 74.7950, "Sastan, Udupi", null, "notable", null, 0, null);

        when(schoolService.findPopularByCity("udupi", 10))
                .thenReturn(List.of(school1, school2));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("Sharada Vidyalaya"))
                .andExpect(jsonPath("$[0].prominenceTier").value("notable"))
                .andExpect(jsonPath("$[0].nearbyListingCount").value(3))
                .andExpect(jsonPath("$[1].name").value("Aloysius PU College"))
                .andExpect(jsonPath("$[1].prominenceTier").value("notable"))
                .andExpect(jsonPath("$[1].nearbyListingCount").value(0));

        // Guardrail: must route to the original method, not the filtered one
        verify(schoolService).findPopularByCity("udupi", 10);
    }

    @Test
    void popular_unknownCity_returns200WithEmptyArray() throws Exception {
        when(schoolService.findPopularByCity("nonexistent", 10))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "nonexistent"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void popular_limitOver50_doesNotReturn400() throws Exception {
        when(schoolService.findPopularByCity(eq("udupi"), anyInt()))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("limit", "51"))
                .andExpect(status().isOk());
    }

    // ==================== GET /popular — area-narrowing mode (no filters) ====================

    @Test
    void popular_validAreaKey_noFilters_returns200WithNearbySchools() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, 5, null);

        when(schoolService.findPopularByArea("IN|KA|Udupi|Manipal", 10))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("areaKey", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Sharada Vidyalaya"))
                .andExpect(jsonPath("$[0].nearbyListingCount").value(5));

        verify(schoolService).findPopularByArea("IN|KA|Udupi|Manipal", 10);
    }

    @Test
    void popular_invalidAreaKey_returns404() throws Exception {
        when(schoolService.findPopularByArea("IN|KA|Udupi|Invalid", 10))
                .thenThrow(new AreaNotFoundException("IN|KA|Udupi|Invalid"));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("areaKey", "IN|KA|Udupi|Invalid"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void popular_areaKeyEmpty_ignoresAndUsesCity() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, 2, null);

        when(schoolService.findPopularByCity("udupi", 10))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("areaKey", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    // ==================== GET /popular — with board filter ====================

    @Test
    void popular_withBoardFilter_routesToFilteredMethod() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, 1, null);

        when(schoolService.getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("board", "CBSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].board").value("CBSE"))
                .andExpect(jsonPath("$[0].prominenceTier").value("notable"))
                .andExpect(jsonPath("$[0].nearbyListingCount").value(1));

        verify(schoolService).getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10));
    }

    // ==================== GET /popular — with category filter ====================

    @Test
    void popular_withCategoryFilter_routesToFilteredMethod() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Manipal Primary School", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", "Primary", 0, null);

        when(schoolService.getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("category", "Primary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].schoolCategory").value("Primary"))
                .andExpect(jsonPath("$[0].nearbyListingCount").value(0));

        verify(schoolService).getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10));
    }

    // ==================== GET /popular — with board+category combined ====================

    @Test
    void popular_withBoardAndCategoryFilters_routesToFilteredMethod() throws Exception {
        when(schoolService.getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/popular")
                        .param("city", "udupi")
                        .param("board", "CBSE")
                        .param("category", "Primary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        verify(schoolService).getPopularSchoolsWithFilters(eq("udupi"), any(), any(), eq(10));
    }

    // ==================== GET /by-area — missing areaKey -> 400 ====================

    @Test
    void byArea_missingAreaKey_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/by-area"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void byArea_blankAreaKey_returns400() throws Exception {
        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Query parameter 'areaKey' is required"));
    }

    // ==================== GET /by-area — invalid area -> 404 ====================

    @Test
    void byArea_unknownAreaKey_returns404() throws Exception {
        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Unknown"), any(), any(), anyInt(), anyInt()))
                .thenThrow(new AreaNotFoundException("IN|KA|Udupi|Unknown"));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Unknown"))
                .andExpect(status().isNotFound());
    }

    // ==================== GET /by-area — happy path, no filters ====================

    @Test
    void byArea_validAreaKey_noFilters_returns200() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Sharada Vidyalaya"))
                .andExpect(jsonPath("$[0].id").value(SCHOOL_ID.toString()));
    }

    // ==================== GET /by-area — pagination size clamped at controller level ====================

    @Test
    void byArea_sizeOver50_passedToServiceForClamping() throws Exception {
        // Controller passes size through; service clamps. No 400 from controller.
        when(schoolService.getSchoolsByArea(anyString(), any(), any(), anyInt(), anyInt()))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("size", "100"))
                .andExpect(status().isOk());
    }

    // ==================== GET /by-area — board filter single ====================

    @Test
    void byArea_singleBoardFilter_returns200() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("board", "CBSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].board").value("CBSE"));
    }

    // ==================== GET /by-area — multiple board filters ====================

    @Test
    void byArea_multipleBoardFilters_returns200() throws Exception {
        SchoolResponse s1 = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Vidyalaya", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, "notable", null, null, null);
        SchoolResponse s2 = new SchoolResponse(
                SCHOOL_ID2.toString(), "Aloysius PU College", "ICSE",
                "ICSE", 13.3370, 74.7950, "Sastan, Udupi", null, "directory", null, null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(s1, s2));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("board", "CBSE")
                        .param("board", "ICSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    // ==================== GET /by-area — category filter single ====================

    @Test
    void byArea_singleCategoryFilter_returns200() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Manipal Primary", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, null, "Primary", null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("category", "Primary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].schoolCategory").value("Primary"));
    }

    // ==================== GET /by-area — multiple category filters ====================

    @Test
    void byArea_multipleCategoryFilters_returns200() throws Exception {
        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("category", "Primary")
                        .param("category", "Secondary"))
                .andExpect(status().isOk());
    }

    // ==================== GET /by-area — combined board+category filters ====================

    @Test
    void byArea_combinedBoardAndCategory_returns200() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Sharada Primary", "CBSE",
                "CBSE", 13.3511, 74.7871, "Manipal, Udupi", null, null, "Primary", null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("board", "CBSE")
                        .param("category", "Primary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].board").value("CBSE"))
                .andExpect(jsonPath("$[0].schoolCategory").value("Primary"));
    }

    // ==================== GET /by-area — empty result ====================

    @Test
    void byArea_validAreaNoMatchingSchools_returns200EmptyArray() throws Exception {
        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Manipal"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Manipal")
                        .param("board", "AICTE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== GET /by-area — schoolCategory field present in response ====================

    @Test
    void byArea_response_includesSchoolCategoryField() throws Exception {
        SchoolResponse school = new SchoolResponse(
                SCHOOL_ID.toString(), "Udupi District School", null,
                "STATE", 13.3400, 74.7400, "Udupi", null, "directory", "Higher Secondary", null, null);

        when(schoolService.getSchoolsByArea(eq("IN|KA|Udupi|Udupi"), any(), any(), eq(0), eq(20)))
                .thenReturn(List.of(school));

        mockMvc.perform(get("/api/public/schools/by-area")
                        .param("areaKey", "IN|KA|Udupi|Udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].schoolCategory").value("Higher Secondary"))
                .andExpect(jsonPath("$[0].prominenceTier").value("directory"));
    }
}
