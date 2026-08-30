package com.example.realestate.broker;

import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
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

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for BrokerSetupController (/api/broker/setup).
 * Mirrors DealerSetupControllerTest to ensure the broker path is fully covered.
 */
@WebMvcTest(
        controllers = BrokerSetupController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(BrokerSetupControllerTest.TestConfig.class)
class BrokerSetupControllerTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000042");

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
    private UserRoleService userRoleService;

    @MockitoBean
    private BrokerOnboardingService onboardingService;

    @BeforeEach
    void setUp() {
        reset(userRoleService, onboardingService);
    }

    // ==================== Test 1: No JWT -> 403 ====================
    // Spring Security returns 403 (not 401) for unauthenticated requests when
    // no explicit AuthenticationEntryPoint is configured in the TestConfig SecurityFilterChain.

    @Test
    void setup_withoutJwt_returns403() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 2: Happy path -> 200 ====================

    @Test
    void setup_happyPath_returns200WithBrokerRole() throws Exception {
        when(userRoleService.findSecurityRole(USER_ID)).thenReturn(Optional.empty());
        when(onboardingService.assignRoleAndPhone(USER_ID, "broker", "+919876543210")).thenReturn(true);

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("broker"));
    }

    // ==================== Test 3: M2 pre-check — already broker/admin -> 409 ====================

    @Test
    void setup_alreadyBroker_returns409WithBrokerMessage() throws Exception {
        when(userRoleService.findSecurityRole(USER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have a broker or admin role."));

        verify(onboardingService, never()).assignRoleAndPhone(any(), any(), any());
    }

    // ==================== Test 4: acceptedTerms=false -> 400 ====================

    @Test
    void setup_termsNotAccepted_returns400() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":false}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("acceptedTerms"));
    }

    // ==================== Test 5: phone="" -> 400 ====================

    @Test
    void setup_phoneEmpty_returns400() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 6: phone too long (16 chars) -> 400 ====================

    @Test
    void setup_phoneTooLong_returns400() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"1234567890123456","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 7: phone bad format -> 400 ====================

    @Test
    void setup_phoneBadFormat_returns400() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"abc-bad","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 7b: phone without + prefix (not E.164) -> 400 ====================

    @Test
    void setup_phoneWithoutPlusPrefix_returns400() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"9876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 8: C-2 TOCTOU concurrent duplicate -> 409 ====================

    @Test
    void setup_assignRoleReturnsFalse_returns409() throws Exception {
        when(userRoleService.findSecurityRole(USER_ID)).thenReturn(Optional.empty());
        // assignRoleAndPhone returns false: ON CONFLICT DO NOTHING suppressed the role insert
        when(onboardingService.assignRoleAndPhone(USER_ID, "broker", "+919876543210")).thenReturn(false);

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have a broker or admin role."));
    }

    // ==================== Test 9: missing profiles row -> 500 ====================
    // Reproduces the bug: phone UPDATE returns false (no profiles row) but role INSERT succeeded.
    // BrokerOnboardingService throws 500 and rolls back the role insert transactionally.

    @Test
    void setup_updatePhoneReturnsFalse_returns500() throws Exception {
        when(userRoleService.findSecurityRole(USER_ID)).thenReturn(Optional.empty());
        when(onboardingService.assignRoleAndPhone(USER_ID, "broker", "+919876543210"))
                .thenThrow(new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "User profile not found — cannot complete broker setup."));

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isInternalServerError());
    }
}
