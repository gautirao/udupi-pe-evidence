package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} slice for {@link RegionalAreaGroupsController}.
 *
 * <p>Security is replaced by a local permit-all chain so these tests focus on
 * controller behaviour (response shape, Cache-Control, param validation) without
 * requiring a JWT. The real {@link com.example.realestate.security.JwtConfig}
 * permitAll line for this path is exercised separately by
 * {@link RegionalAreaGroupsSecurityIT}.
 */
@WebMvcTest(
        controllers = RegionalAreaGroupsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({RegionalAreaGroupsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class RegionalAreaGroupsControllerTest {

    @TestConfiguration
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
    private RegionalAreaGroupsService regionalAreaGroupsService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(regionalAreaGroupsService, userRoleService);
    }

    // ── AC1: anonymous 200 (no JWT required) ─────────────────────────────────

    @Test
    void getRegionalAreaGroups_anonymousRequest_returns200() throws Exception {
        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of()));

        // No Authorization header — must succeed (public endpoint)
        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk());
    }

    // ── AC2: group shape — label + areaKeys + listingCount + agriAcreage ─────

    @Test
    void getRegionalAreaGroups_returnsGroupShape() throws Exception {
        RegionalAreaGroup group = new RegionalAreaGroup(
                "North of Udupi · 25–50 km", "N", "25_50", 5L, 12.3,
                List.of("IN|KA|Udupi|Kundapur", "IN|KA|Udupi|Koteshwara")
        );
        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of(group)));

        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.groups", hasSize(1)))
                .andExpect(jsonPath("$.groups[0].label", is("North of Udupi · 25–50 km")))
                .andExpect(jsonPath("$.groups[0].directionKey", is("N")))
                .andExpect(jsonPath("$.groups[0].distanceBandKey", is("25_50")))
                .andExpect(jsonPath("$.groups[0].listingCount", is(5)))
                .andExpect(jsonPath("$.groups[0].agriAcreage", is(12.3)))
                .andExpect(jsonPath("$.groups[0].areaKeys", hasSize(2)))
                .andExpect(jsonPath("$.groups[0].areaKeys[0]", is("IN|KA|Udupi|Kundapur")));
    }

    // ── AC7: two cities — results scoped to the requested city ───────────────

    @Test
    void getRegionalAreaGroups_twoCities_scopedToRequestedCity() throws Exception {
        RegionalAreaGroup udupiGroup = new RegionalAreaGroup(
                "North of Udupi · 10–25 km", "N", "10_25", 2L, null,
                List.of("IN|KA|Udupi|Area1")
        );
        RegionalAreaGroup bangaloreGroup = new RegionalAreaGroup(
                "East of Bangalore · Within 10 km", "E", "0_10", 4L, 5.5,
                List.of("IN|KA|Bengaluru|Whitefield")
        );

        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of(udupiGroup)));
        when(regionalAreaGroupsService.getRegionalGroups("bangalore", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("bangalore", List.of(bangaloreGroup)));

        // Udupi request
        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.groups[0].label", is("North of Udupi · 10–25 km")));

        // Bangalore request
        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "bangalore")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("bangalore")))
                .andExpect(jsonPath("$.groups[0].label", is("East of Bangalore · Within 10 km")));
    }

    // ── AC8: Cache-Control: public, max-age=120 ───────────────────────────────

    @Test
    void getRegionalAreaGroups_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    // ── null agriAcreage omitted from JSON (@JsonInclude NON_NULL) ────────────

    @Test
    void getRegionalAreaGroups_nullAcreage_omittedFromJson() throws Exception {
        RegionalAreaGroup group = new RegionalAreaGroup(
                "North of Udupi · 10–25 km", "N", "10_25", 1L, null, // agriAcreage = null
                List.of("IN|KA|Udupi|Area1")
        );
        when(regionalAreaGroupsService.getRegionalGroups("udupi", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("udupi", List.of(group)));

        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].agriAcreage").doesNotExist());
    }

    // ── missing required params → 400 ────────────────────────────────────────

    @Test
    void getRegionalAreaGroups_missingCityParam_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getRegionalAreaGroups_missingPropertyTypeParam_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "udupi"))
                .andExpect(status().isBadRequest());
    }

    // ── empty groups array for unknown city ───────────────────────────────────

    @Test
    void getRegionalAreaGroups_unknownCity_returnsEmptyGroups() throws Exception {
        when(regionalAreaGroupsService.getRegionalGroups("nowhere", "agricultural_land"))
                .thenReturn(new RegionalAreaGroupsResponse("nowhere", List.of()));

        mockMvc.perform(get("/api/discover/regional-area-groups")
                        .param("city", "nowhere")
                        .param("propertyType", "agricultural_land"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("nowhere")))
                .andExpect(jsonPath("$.groups", hasSize(0)));
    }
}
