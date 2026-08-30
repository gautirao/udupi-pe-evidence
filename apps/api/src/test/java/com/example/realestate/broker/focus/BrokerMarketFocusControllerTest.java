package com.example.realestate.broker.focus;

import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link BrokerMarketFocusController}.
 *
 * <p>Mirrors the pattern from {@code ListingQualityControllerTest}: jwt() post-processor,
 * {@code @MockitoBean} for service and UserRoleService, TestConfig for security filter,
 * and Import for CallerInfoResolver + WebMvcConfig + GlobalExceptionHandler.
 *
 * <p>POST /api/broker/market-focus body shape is now {@code {areaKey, propertyType,
 * listingPurpose}} — citySlug is absent because the server resolves it via the
 * areas→cities join. Tests verify the new contract and that an unknown areaKey
 * surfaces as HTTP 422.
 */
@WebMvcTest(
        controllers = BrokerMarketFocusController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({BrokerMarketFocusControllerTest.TestConfig.class,
         WebMvcConfig.class,
         CallerInfoResolver.class,
         com.example.realestate.exception.GlobalExceptionHandler.class})
class BrokerMarketFocusControllerTest {

    private static final UUID BROKER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Instant CREATED_AT = Instant.parse("2026-06-20T10:00:00Z");

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
    private ObjectMapper objectMapper;

    @MockitoBean
    private BrokerMarketFocusService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service);
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/market-focus — happy path
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET returns 200 with list of focus rows for broker role")
    void get_brokerRole_returns200WithRows() throws Exception {
        BrokerMarketFocusRow row = new BrokerMarketFocusRow(
                "udupi", "IN|KA|Udupi|Manipal", "land", "sale", "seeded", CREATED_AT);
        when(service.listFocus(BROKER_ID)).thenReturn(List.of(row));

        mockMvc.perform(get("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].citySlug").value("udupi"))
                .andExpect(jsonPath("$[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$[0].propertyType").value("land"))
                .andExpect(jsonPath("$[0].listingPurpose").value("sale"))
                .andExpect(jsonPath("$[0].source").value("seeded"));
    }

    @Test
    @DisplayName("GET returns empty list (not 404) when broker has no focus rows")
    void get_noRows_returnsEmptyList() throws Exception {
        when(service.listFocus(BROKER_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    @DisplayName("GET is allowed for dealer role")
    void get_dealerRole_returns200() throws Exception {
        when(service.listFocus(BROKER_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("GET is allowed for admin role")
    void get_adminRole_returns200() throws Exception {
        when(service.listFocus(BROKER_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // GET — role gate
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("GET returns 403 when caller has 'user' role")
    void get_userRole_returns403() throws Exception {
        mockMvc.perform(get("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, or admin role"));
    }

    @Test
    @DisplayName("GET returns 403 when no JWT supplied")
    void get_noJwt_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/broker/market-focus"))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/market-focus — add focus
    // New contract: body = {areaKey, propertyType, listingPurpose} — no citySlug
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("POST add returns 204 on success — body has areaKey/propertyType/listingPurpose only")
    void post_add_returns204() throws Exception {
        // Note: AddFocusRequest is now 3-field — no citySlug
        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(post("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isNoContent());

        verify(service).addFocus(eq(BROKER_ID), any(AddFocusRequest.class));
    }

    @Test
    @DisplayName("POST add is idempotent: 204 even when row already exists (no-op)")
    void post_add_idempotent_204() throws Exception {
        // service no-ops on conflict (ON CONFLICT DO NOTHING) — no exception thrown
        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(post("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("POST add returns 422 when areaKey is blank (validation)")
    void post_add_blankAreaKey_returns422() throws Exception {
        String body = "{\"areaKey\":\"\",\"propertyType\":\"land\",\"listingPurpose\":\"sale\"}";

        mockMvc.perform(post("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("POST add returns 422 when areaKey has no matching areas row (service-derived slug fails)")
    void post_add_unknownAreaKey_returns422() throws Exception {
        // Service throws 422 when slug cannot be resolved
        doThrow(new ResponseStatusException(UNPROCESSABLE_ENTITY, "Area not found: UNKNOWN|AREA|KEY"))
                .when(service).addFocus(eq(BROKER_ID), any(AddFocusRequest.class));

        AddFocusRequest req = new AddFocusRequest("UNKNOWN|AREA|KEY", "land", "sale");

        mockMvc.perform(post("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("Area not found: UNKNOWN|AREA|KEY"));
    }

    @Test
    @DisplayName("POST add returns 403 for user role")
    void post_add_userRole_returns403() throws Exception {
        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(post("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // DELETE /api/broker/market-focus — remove focus
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("DELETE returns 204 when row is removed")
    void delete_returns204() throws Exception {
        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(delete("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isNoContent());

        verify(service).removeFocus(eq(BROKER_ID), any(RemoveFocusRequest.class));
    }

    @Test
    @DisplayName("DELETE returns 404 when row not found (service throws 404)")
    void delete_notFound_returns404() throws Exception {
        doThrow(new ResponseStatusException(NOT_FOUND, "Market focus entry not found"))
                .when(service).removeFocus(eq(BROKER_ID), any(RemoveFocusRequest.class));

        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(delete("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Market focus entry not found"));
    }

    @Test
    @DisplayName("DELETE returns 403 for user role")
    void delete_userRole_returns403() throws Exception {
        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");

        mockMvc.perform(delete("/api/broker/market-focus")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/market-focus/seed — seed focus
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("POST seed returns 200 with inserted count")
    void post_seed_returns200WithCount() throws Exception {
        when(service.seedFocus(BROKER_ID)).thenReturn(5);

        mockMvc.perform(post("/api/broker/market-focus/seed")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inserted").value(5));

        verify(service).seedFocus(BROKER_ID);
    }

    @Test
    @DisplayName("POST seed returns 200 with inserted=0 when already up-to-date")
    void post_seed_alreadyUpToDate_returns200WithZero() throws Exception {
        when(service.seedFocus(BROKER_ID)).thenReturn(0);

        mockMvc.perform(post("/api/broker/market-focus/seed")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inserted").value(0));
    }

    @Test
    @DisplayName("POST seed returns 403 for user role")
    void post_seed_userRole_returns403() throws Exception {
        mockMvc.perform(post("/api/broker/market-focus/seed")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"))))
                .andExpect(status().isForbidden());
    }
}
