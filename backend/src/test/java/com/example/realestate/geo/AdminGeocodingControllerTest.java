package com.example.realestate.geo;

import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for AdminGeocodingController.
 * Tests @IsAdmin auth guard (declarative, via @EnableMethodSecurity) and SSE streaming.
 *
 * <p>Role authorities are set via the {@code jwt().authorities(...)} post-processor,
 * mirroring the production path where {@link com.example.realestate.security.RoleAuthoritiesConverter}
 * populates the {@code JwtAuthenticationToken} before the request reaches the controller.
 */
@WebMvcTest(
        controllers = AdminGeocodingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminGeocodingControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
@TestPropertySource(properties = "spring.test.mockmvc.print=NONE")
class AdminGeocodingControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID USER_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");

    /** @EnableMethodSecurity is required for @IsAdmin (@PreAuthorize) to fire in tests. */
    @EnableMethodSecurity
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

    /**
     * UserRoleService mock is required to satisfy the JwtConfig → RoleAuthoritiesConverter
     * bean dependency in the WebMvcTest context. CallerInfoResolver no longer calls it.
     */
    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private GeocodingService geocodingService;

    @MockitoBean
    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        reset(userRoleService, geocodingService, jdbc);
    }

    // ===== Auth guard =====

    /**
     * Non-admin role: CallerInfoResolver resolves ROLE_DEALER → CallerInfo(dealer).
     * @IsAdmin fires → AccessDeniedException → 403.
     */
    @Test
    void geocodeMissing_nonAdmin_returns403() throws Exception {
        mockMvc.perform(post("/api/admin/geocode/missing")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden());

        verifyNoInteractions(jdbc, geocodingService);
    }

    /**
     * Unknown/absent role: CallerInfoResolver finds no ROLE_* authority → throws 403.
     * @IsAdmin never fires (CallerInfoResolver denies first).
     */
    @Test
    void geocodeMissing_unknownUser_returns403() throws Exception {
        // jwt() with no explicit authority → CallerInfoResolver rejects (no known ROLE_*)
        mockMvc.perform(post("/api/admin/geocode/missing")
                        .with(jwt().jwt(j -> j.subject(USER_ID.toString()))))
                .andExpect(status().isForbidden());

        verifyNoInteractions(jdbc, geocodingService);
    }

    // ===== SSE streaming — empty batch =====

    @Test
    void geocodeMissing_emptyBatch_emitsDoneEventWithZeros() throws Exception {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        MvcResult mvcResult = mockMvc.perform(post("/api/admin/geocode/missing")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(request().asyncStarted())
                .andReturn();

        mvcResult.getAsyncResult(2000L);

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM_VALUE))
                .andExpect(content().string(containsString("\"type\":\"info\"")))
                .andExpect(content().string(containsString("\"type\":\"done\"")))
                .andExpect(content().string(containsString("\"processed\":0")));

        verifyNoInteractions(geocodingService);
    }

    // ===== SSE streaming — one geocodable listing =====

    @Test
    void geocodeMissing_oneListing_geocodesAndEmitsSuccess() throws Exception {
        String listingId = UUID.randomUUID().toString();
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(
                List.of(Map.of("id", listingId, "locality", "Manipal")));
        when(geocodingService.geocode("Manipal"))
                .thenReturn(new GeocodingService.GeoResult(13.3528, 74.7906, "Manipal, Karnataka",
                        "India", "Karnataka", "Manipal", "Manipal", null));
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        MvcResult mvcResult = mockMvc.perform(post("/api/admin/geocode/missing")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(request().asyncStarted())
                .andReturn();

        mvcResult.getAsyncResult(3000L);

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("\"type\":\"success\"")))
                .andExpect(content().string(containsString("\"type\":\"done\"")))
                .andExpect(content().string(containsString("\"geocoded\":1")))
                .andExpect(content().string(containsString("\"failed\":0")));
    }

    // ===== SSE streaming — geocoding fails =====

    @Test
    void geocodeMissing_geocodeFailure_emitsWarningAndCountsFailed() throws Exception {
        String listingId = UUID.randomUUID().toString();
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(
                List.of(Map.of("id", listingId, "locality", "Unknown Place XYZ")));
        when(geocodingService.geocode("Unknown Place XYZ")).thenReturn(null);

        MvcResult mvcResult = mockMvc.perform(post("/api/admin/geocode/missing")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(request().asyncStarted())
                .andReturn();

        mvcResult.getAsyncResult(3000L);

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("\"type\":\"warning\"")))
                .andExpect(content().string(containsString("\"type\":\"done\"")))
                .andExpect(content().string(containsString("\"geocoded\":0")))
                .andExpect(content().string(containsString("\"failed\":1")));
    }

    // ===== Batch size clamping =====

    @Test
    void geocodeMissing_batchSizeZero_clampedToOne() throws Exception {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        MvcResult mvcResult = mockMvc.perform(post("/api/admin/geocode/missing?batchSize=0")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(request().asyncStarted())
                .andReturn();

        mvcResult.getAsyncResult(2000L);

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk());

        // jdbc called with clamped value of 1, not 0
        verify(jdbc).queryForList(anyString(), eq(1));
    }

    @Test
    void geocodeMissing_batchSizeOver50_clampedTo50() throws Exception {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        MvcResult mvcResult = mockMvc.perform(post("/api/admin/geocode/missing?batchSize=999")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(request().asyncStarted())
                .andReturn();

        mvcResult.getAsyncResult(2000L);

        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk());

        // jdbc called with clamped value of 50, not 999
        verify(jdbc).queryForList(anyString(), eq(50));
    }
}
