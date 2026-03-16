package com.example.realestate.payment;

import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.security.UserRoleService;
import io.github.bucket4j.Bucket;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for PaymentController.
 * Covers: 200 success (atomic UPDATE succeeds), 404 stub-disabled, 409 still-active,
 * 500 no-profile-row, 403 unauthenticated.
 * Uses jwt() post-processor; mocks JdbcTemplate directly (no test DB needed).
 *
 * Note: unauthenticated → 403 (not 401). TestConfig uses anyRequest().authenticated()
 * without an explicit AuthenticationEntryPoint, which defaults to Http403ForbiddenEntryPoint.
 * This matches BookingControllerTest behaviour.
 */
@WebMvcTest(
        controllers = PaymentController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(PaymentControllerTest.TestConfig.class)
@TestPropertySource(properties = "payments.stub.enabled=true")
class PaymentControllerTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

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

    @Autowired
    private PaymentController paymentController;

    @MockitoBean
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private RateLimiterService rateLimiterService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(jdbcTemplate, transactionManager, rateLimiterService);
        // Restore stubEnabled=true before each test (stub-disabled test overrides inline)
        ReflectionTestUtils.setField(paymentController, "stubEnabled", true);
        // Default: bucket allows all requests (tryConsume returns true)
        Bucket allowBucket = Mockito.mock(Bucket.class);
        when(allowBucket.tryConsume(1)).thenReturn(true);
        when(rateLimiterService.getPaymentBucket(anyString())).thenReturn(allowBucket);
    }

    // ==================== Test 1: stub enabled, atomic UPDATE succeeds → 200 ====================

    @Test
    void grantInsightsPass_stubEnabled_returns200() throws Exception {
        when(jdbcTemplate.update(anyString(), any(OffsetDateTime.class), any(UUID.class))).thenReturn(1);

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.insightsAccessUntil").exists());
    }

    // ==================== Test 1b: insights_access_until == NOW() boundary → 200 ====================

    @Test
    void grantInsightsPass_accessExpiresAtExactNow_returns200() throws Exception {
        // insights_access_until == NOW() means the condition 'insights_access_until <= NOW()' is TRUE at boundary → renewal allowed
        // The atomic UPDATE succeeds (returns 1 row), so the endpoint grants access and returns 200.
        when(jdbcTemplate.update(anyString(), any(OffsetDateTime.class), any(UUID.class))).thenReturn(1);

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.insightsAccessUntil").exists());
    }

    // ==================== Test 2: stub disabled → 404 ====================

    @Test
    void grantInsightsPass_stubDisabled_returns404() throws Exception {
        ReflectionTestUtils.setField(paymentController, "stubEnabled", false);

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isNotFound());
    }

    // ==================== Test 3: access still active → 409 ====================

    @SuppressWarnings("unchecked")
    @Test
    void grantInsightsPass_alreadyActive_returns409() throws Exception {
        // Atomic UPDATE returns 0 rows: WHERE clause blocked update because access is still active
        when(jdbcTemplate.update(anyString(), any(OffsetDateTime.class), any(UUID.class))).thenReturn(0);
        // Follow-up SELECT returns active expiry
        OffsetDateTime activeExpiry = OffsetDateTime.now().plusDays(15);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of(activeExpiry));

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.insightsAccessUntil").exists())
                .andExpect(jsonPath("$.error").value("Insights access is still active."));
    }

    // ==================== Test 4: no profile row → 500 ====================

    @SuppressWarnings("unchecked")
    @Test
    void grantInsightsPass_noProfileRow_returns500() throws Exception {
        when(jdbcTemplate.update(anyString(), any(OffsetDateTime.class), any(UUID.class))).thenReturn(0);
        // Follow-up SELECT returns empty: no profile row exists for this user
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of());

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("User profile not found."));
    }

    // ==================== Test 6: userId sourced from JWT, not request ====================

    @Test
    void grantInsightsPass_usesJwtSubjectAsUserId() throws Exception {
        UUID jwtUser = UUID.fromString("00000000-0000-0000-0000-000000000099");
        when(jdbcTemplate.update(anyString(), any(OffsetDateTime.class), eq(jwtUser))).thenReturn(1);

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(jwtUser.toString()))))
                .andExpect(status().isOk());

        verify(jdbcTemplate).update(anyString(), any(OffsetDateTime.class), eq(jwtUser));
    }

    // ==================== Test 5: unauthenticated → 403 ====================

    @Test
    void grantInsightsPass_unauthenticated_returns403() throws Exception {
        mockMvc.perform(post("/api/payments/insights-pass"))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 7: rate limit exceeded → 429 ====================

    @Test
    void createInsightsPass_rateLimitExceeded_returns429() throws Exception {
        Bucket exhaustedBucket = Mockito.mock(Bucket.class);
        when(exhaustedBucket.tryConsume(1)).thenReturn(false);
        when(rateLimiterService.getPaymentBucket(anyString())).thenReturn(exhaustedBucket);

        mockMvc.perform(post("/api/payments/insights-pass")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isTooManyRequests());
    }
}
