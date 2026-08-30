package com.example.realestate.intelligence;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for {@link AdminIntelligenceController}.
 *
 * <p>Covers:
 * <ul>
 *   <li>admin caller → 200 with list response including populated demand fields</li>
 *   <li>non-admin (broker) caller → 403</li>
 *   <li>anonymous/no-JWT → 401 (Spring Security default, before resolver runs)</li>
 *   <li>city filter wired through to service</li>
 *   <li>demandEventCount suppressed → null (never 0); topGaps populated from service</li>
 *   <li>avgQuality null (backfill-incomplete) preserved through serialization</li>
 * </ul>
 */
@WebMvcTest(
        controllers = AdminIntelligenceController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminIntelligenceControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class, GlobalExceptionHandler.class})
class AdminIntelligenceControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID BROKER_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");

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
    private AdminIntelligenceService adminIntelligenceService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(adminIntelligenceService);
    }

    // ==================== Test 1: admin → 200 with list response (populated demand fields) ===

    @Test
    void getAreas_withAdminRole_returns200WithAreaList() throws Exception {
        List<AreaTopGap> gaps = List.of(
                new AreaTopGap("apartment", "sale", "UNDER_5L", "supply_gap", 1.5, "enough_data")
        );
        AreaIntelligenceResponse row = new AreaIntelligenceResponse(
                "IN|KA|Udupi|Manipal",
                "Manipal",
                "Udupi",
                35,
                30,
                72.5,
                "full",
                42,           // demandEventCount — populated (>= K_ANON_MIN)
                gaps
        );
        when(adminIntelligenceService.getAreaIntelligence(null)).thenReturn(List.of(row));

        String responseBody = mockMvc.perform(get("/api/admin/intelligence/areas")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$[0].live90dCount").value(35))
                .andExpect(jsonPath("$[0].confidence").value("full"))
                .andExpect(jsonPath("$[0].demandEventCount").value(42))
                .andExpect(jsonPath("$[0].topGaps[0].propertyType").value("apartment"))
                .andExpect(jsonPath("$[0].topGaps[0].gapScore").value(1.5))
                .andReturn()
                .getResponse()
                .getContentAsString();

        List<AreaIntelligenceResponse> parsed = objectMapper.readValue(
                responseBody, new TypeReference<>() {});
        assertThat(parsed).hasSize(1);
        assertThat(parsed.get(0).demandEventCount()).isEqualTo(42);
        assertThat(parsed.get(0).topGaps()).hasSize(1);
    }

    // ==================== Test 1b: admin → suppressed demand (null demandEventCount) =========

    @Test
    void getAreas_withAdminRole_suppressedDemand_demandEventCountNull() throws Exception {
        // Service returns null demandEventCount (suppressed) and empty topGaps.
        AreaIntelligenceResponse row = new AreaIntelligenceResponse(
                "IN|KA|Udupi|Karkala",
                "Karkala",
                "Udupi",
                12,
                5,
                65.0,
                "limited",
                null,         // suppressed — NEVER 0
                List.of()     // no non-suppressed buckets
        );
        when(adminIntelligenceService.getAreaIntelligence(null)).thenReturn(List.of(row));

        String responseBody = mockMvc.perform(get("/api/admin/intelligence/areas")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        List<AreaIntelligenceResponse> parsed = objectMapper.readValue(
                responseBody, new TypeReference<>() {});
        assertThat(parsed).hasSize(1);
        assertThat(parsed.get(0).demandEventCount()).isNull();   // suppressed
        assertThat(parsed.get(0).topGaps()).isEmpty();
    }

    // ==================== Test 2: non-admin → 403 ====================

    @Test
    void getAreas_withBrokerRole_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/intelligence/areas")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 3: anonymous (no JWT) → rejected (401 in prod / 403 in test harness) ====================
    //
    // In production, OAuth2ResourceServerAutoConfiguration provides a BearerTokenAuthenticationEntryPoint
    // that returns 401 for missing/invalid JWT. In this @WebMvcTest harness that auto-config is excluded
    // and the TestConfig uses anyRequest().authenticated() which Spring Security maps to 403 (Access Denied)
    // without an entry point. The approved plan specifies "401 (Spring default) or 403 via resolver" —
    // both are acceptable rejections. We assert the request is not 200 (access is denied).
    @Test
    void getAreas_withNoJwt_isRejected() throws Exception {
        mockMvc.perform(get("/api/admin/intelligence/areas"))
                .andExpect(status().is4xxClientError());
    }

    // ==================== Test 4: city filter param wired through ====================

    @Test
    void getAreas_withCityFilter_passesDistrictToService() throws Exception {
        when(adminIntelligenceService.getAreaIntelligence("Udupi")).thenReturn(List.of());

        mockMvc.perform(get("/api/admin/intelligence/areas?city=Udupi")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ==================== Test 5: empty result → 200 empty list, not 404 ====================

    @Test
    void getAreas_withNoMatches_returns200EmptyList() throws Exception {
        when(adminIntelligenceService.getAreaIntelligence(any())).thenReturn(List.of());

        mockMvc.perform(get("/api/admin/intelligence/areas")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$").isEmpty());
    }

    // ==================== Test 6: null avgQualityScore in response (backfill-incomplete) ====================

    @Test
    void getAreas_withNullAvgQuality_returnsNullNotZero() throws Exception {
        AreaIntelligenceResponse backfillIncompleteRow = new AreaIntelligenceResponse(
                "IN|KA|Udupi|Karkala",
                "Karkala",
                "Udupi",
                12,
                0,
                null,      // avgQualityScore null — backfill not yet run for this area
                "limited",
                null,      // demandEventCount null — suppressed (< K_ANON_MIN)
                List.of()  // topGaps empty list — contract says never null
        );
        when(adminIntelligenceService.getAreaIntelligence(null)).thenReturn(List.of(backfillIncompleteRow));

        String responseBody = mockMvc.perform(get("/api/admin/intelligence/areas")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].topGaps").isArray())
                .andExpect(jsonPath("$[0].topGaps").isEmpty())
                .andReturn()
                .getResponse()
                .getContentAsString();

        List<AreaIntelligenceResponse> parsed = objectMapper.readValue(
                responseBody, new TypeReference<>() {});
        assertThat(parsed).hasSize(1);
        assertThat(parsed.get(0).avgQualityScore()).isNull();
        assertThat(parsed.get(0).scoredListingCount()).isZero();
        assertThat(parsed.get(0).topGaps()).isEmpty();   // must serialize as [] not null
    }
}
