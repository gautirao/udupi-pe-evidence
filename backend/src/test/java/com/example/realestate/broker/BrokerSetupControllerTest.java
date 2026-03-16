package com.example.realestate.broker;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import com.example.realestate.security.UserRoleService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for BrokerSetupController (/api/broker/setup alias).
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
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        reset(jdbcTemplate, transactionManager);
    }

    @Test
    void setup_withoutJwt_returns403() throws Exception {
        mockMvc.perform(post("/api/broker/setup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    void setup_happyPath_returns200WithDealerRole() throws Exception {
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any()))
                .thenReturn(List.of());
        when(jdbcTemplate.update(anyString(), any(Object[].class)))
                .thenReturn(1);

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isOk())
                // Response still returns role="dealer" (DB value unchanged)
                .andExpect(jsonPath("$.role").value("dealer"));
    }

    @Test
    void setup_alreadyBroker_returns409WithBrokerMessage() throws Exception {
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any()))
                .thenReturn(List.of("dealer"));

        mockMvc.perform(post("/api/broker/setup")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"phone":"+919876543210","acceptedTerms":true}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have a broker or admin role."));
    }

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
}
