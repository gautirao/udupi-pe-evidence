package com.example.realestate.insights;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = SavedAreaController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(SavedAreaControllerTest.TestConfig.class)
class SavedAreaControllerTest {

    private static final UUID USER_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID AREA_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

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
    private SavedAreaRepository savedAreaRepository;

    @BeforeEach
    void setUp() {
        reset(savedAreaRepository);
    }

    // ==================== Test 1: GET saved areas -> 200 with array ====================

    @Test
    void list_returnsAreasForUser() throws Exception {
        SavedArea area = buildArea(AREA_ID, USER_A, "india|karnataka|udupi|manipal", "Manipal, Udupi");
        when(savedAreaRepository.findByUserIdOrderByCreatedAtDesc(USER_A))
                .thenReturn(List.of(area));

        mockMvc.perform(get("/api/saved-areas")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(AREA_ID.toString()))
                .andExpect(jsonPath("$[0].areaKey").value("india|karnataka|udupi|manipal"))
                .andExpect(jsonPath("$[0].areaLabel").value("Manipal, Udupi"));
    }

    // ==================== Test 2: GET empty -> 200 with [] ====================

    @Test
    void list_emptyReturnsEmptyArray() throws Exception {
        when(savedAreaRepository.findByUserIdOrderByCreatedAtDesc(USER_A))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/saved-areas")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 3: POST save area -> 201 ====================

    @Test
    void save_validArea_returns201() throws Exception {
        SavedArea saved = buildArea(AREA_ID, USER_A, "india|karnataka|udupi|manipal", "Manipal, Udupi");
        when(savedAreaRepository.save(any(SavedArea.class))).thenReturn(saved);

        mockMvc.perform(post("/api/saved-areas")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"areaKey":"india|karnataka|udupi|manipal","areaLabel":"Manipal, Udupi"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(AREA_ID.toString()))
                .andExpect(jsonPath("$.areaKey").value("india|karnataka|udupi|manipal"));
    }

    // ==================== Test 4: POST duplicate -> 409 ====================

    @Test
    void save_duplicateAreaKey_returns409() throws Exception {
        when(savedAreaRepository.save(any(SavedArea.class)))
                .thenThrow(new org.springframework.dao.DataIntegrityViolationException("unique constraint"));

        mockMvc.perform(post("/api/saved-areas")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"areaKey":"india|karnataka|udupi|manipal","areaLabel":"Manipal, Udupi"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Area already saved"));
    }

    // ==================== Test 5: POST without JWT -> 403 ====================

    @Test
    void save_withoutJwt_returns403() throws Exception {
        mockMvc.perform(post("/api/saved-areas")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"areaKey":"x","areaLabel":"y"}
                                """))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 6: DELETE -> 204 ====================

    @Test
    void delete_existingArea_returns204() throws Exception {
        SavedArea area = buildArea(AREA_ID, USER_A, "india|karnataka|udupi|manipal", "Manipal, Udupi");
        when(savedAreaRepository.findByIdAndUserId(AREA_ID, USER_A))
                .thenReturn(Optional.of(area));

        mockMvc.perform(delete("/api/saved-areas/" + AREA_ID)
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(savedAreaRepository).delete(area);
    }

    // ==================== Test 7: DELETE not found / not owned -> 404 ====================

    @Test
    void delete_notFoundOrNotOwned_returns404() throws Exception {
        when(savedAreaRepository.findByIdAndUserId(AREA_ID, USER_B))
                .thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/saved-areas/" + AREA_ID)
                        .with(jwt().jwt(j -> j.subject(USER_B.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Saved area not found"));
    }

    // ==================== Test 8: PATCH threshold -> 200 ====================

    @Test
    void updateThreshold_setsThreshold_returns200() throws Exception {
        SavedArea area = buildArea(AREA_ID, USER_A, "india|karnataka|udupi|manipal", "Manipal, Udupi");
        when(savedAreaRepository.findByIdAndUserId(AREA_ID, USER_A)).thenReturn(Optional.of(area));
        when(savedAreaRepository.save(any(SavedArea.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(patch("/api/saved-areas/" + AREA_ID + "/threshold")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"priceThresholdRupees":5000000}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceThresholdRupees").value(5000000));
    }

    @Test
    void updateThreshold_clearThreshold_returns200WithNull() throws Exception {
        SavedArea area = buildArea(AREA_ID, USER_A, "india|karnataka|udupi|manipal", "Manipal, Udupi");
        area.setPriceThresholdRupees(5_000_000L);
        when(savedAreaRepository.findByIdAndUserId(AREA_ID, USER_A)).thenReturn(Optional.of(area));
        when(savedAreaRepository.save(any(SavedArea.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(patch("/api/saved-areas/" + AREA_ID + "/threshold")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"priceThresholdRupees":null}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceThresholdRupees").doesNotExist());
    }

    @Test
    void updateThreshold_notFound_returns404() throws Exception {
        when(savedAreaRepository.findByIdAndUserId(AREA_ID, USER_A)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/api/saved-areas/" + AREA_ID + "/threshold")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"priceThresholdRupees":5000000}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Saved area not found"));
    }

    // ==================== Helper ====================

    private SavedArea buildArea(UUID id, UUID userId, String areaKey, String areaLabel) {
        SavedArea a = new SavedArea();
        a.setId(id);
        a.setUserId(userId);
        a.setAreaKey(areaKey);
        a.setAreaLabel(areaLabel);
        a.setCreatedAt(OffsetDateTime.now());
        return a;
    }
}
