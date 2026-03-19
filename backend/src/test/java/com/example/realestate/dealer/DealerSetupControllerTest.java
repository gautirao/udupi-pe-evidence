package com.example.realestate.dealer;

import com.example.realestate.profile.ProfileService;
import com.example.realestate.security.UserRoleService;
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
import org.springframework.transaction.PlatformTransactionManager;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for DealerSetupController.
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks ProfileService and UserRoleService.
 */
@WebMvcTest(
        controllers = DealerSetupController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(DealerSetupControllerTest.TestConfig.class)
class DealerSetupControllerTest {

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
    private ProfileService profileService;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        reset(userRoleService, profileService, transactionManager);
    }

    // ==================== Test 1: No JWT -> 401/403 ====================
    // Spring Security returns 403 (not 401) for unauthenticated requests when
    // no explicit AuthenticationEntryPoint is configured in the TestConfig SecurityFilterChain.
    // This is consistent with AdminListingControllerTest (test 6 expects 403 for no JWT).

    @Test
    void setup_withoutJwt_returns401() throws Exception {
        mockMvc.perform(post("/api/dealer/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 2: Happy path -> 200 ====================

    @Test
    void setup_happyPath_returns200WithDealerRole() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.empty());
        when(userRoleService.assignRole(USER_ID, "broker")).thenReturn(true);
        when(profileService.updatePhone(USER_ID, "+919876543210")).thenReturn(true);

        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("broker"));
    }

    // ==================== Test 3: M2 pre-check — already dealer -> 409 ====================

    @Test
    void setup_alreadyDealerSequential_returns409() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have a broker or admin role."));
    }

    // ==================== Test 4: C-2 TOCTOU concurrent duplicate -> 409 ====================

    @Test
    void setup_concurrentDuplicate_returns409() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.empty());
        // assignRole returns false: ON CONFLICT DO NOTHING suppressed the insert
        when(userRoleService.assignRole(USER_ID, "broker")).thenReturn(false);

        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have a broker or admin role."));
    }

    // ==================== Test 5: acceptedTerms=false -> 400 ====================

    @Test
    void setup_termsNotAccepted_returns400() throws Exception {
        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":false}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("acceptedTerms"));
    }

    // ==================== Test 6: phone="" -> 400 ====================

    @Test
    void setup_phoneEmpty_returns400() throws Exception {
        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 7: phone too long (16 chars) -> 400 ====================

    @Test
    void setup_phoneTooLong_returns400() throws Exception {
        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"1234567890123456","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 8: phone bad format -> 400 ====================

    @Test
    void setup_phoneBadFormat_returns400() throws Exception {
        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"abc-bad","acceptedTerms":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    // ==================== Test 9: missing profiles row -> 500 ====================
    // Reproduces the bug: phone UPDATE returns 0 (no profiles row) but role INSERT succeeds.
    // Before fix: code ignores return value and returns 200. After fix: returns 500.

    @Test
    void setup_missingProfileRow_returns500() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.empty());
        when(userRoleService.assignRole(USER_ID, "broker")).thenReturn(true);
        // updatePhone returns false: no profiles row found for this user
        when(profileService.updatePhone(USER_ID, "+919876543210")).thenReturn(false);

        mockMvc.perform(post("/api/dealer/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isInternalServerError());
    }
}
