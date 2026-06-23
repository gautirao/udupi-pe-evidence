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

@WebMvcTest(
        controllers = AreaGroupsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AreaGroupsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class AreaGroupsControllerTest {

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
    private AreaGroupsService areaGroupsService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(areaGroupsService, userRoleService);
    }

    // ── happy path ────────────────────────────────────────────────────────────

    @Test
    void getAreaGroups_returnsCityAndGroupsWrapper() throws Exception {
        AreaGroupResponse group = new AreaGroupResponse(
                "tech-corridor", "Tech Corridor", "IT hubs", "East Bangalore", 1,
                List.of("IN|KA|Bengaluru|Whitefield", "IN|KA|Bengaluru|Marathahalli"),
                12.9645, 77.7000, 12.9000, 77.6200, 13.0000, 77.7800, null
        );
        when(areaGroupsService.getGroupsByCity("bangalore"))
                .thenReturn(new AreaGroupsResponse("bangalore", List.of(group)));

        mockMvc.perform(get("/api/discover/area-groups").param("city", "bangalore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("bangalore")))
                .andExpect(jsonPath("$.groups", hasSize(1)))
                .andExpect(jsonPath("$.groups[0].slug", is("tech-corridor")))
                .andExpect(jsonPath("$.groups[0].name", is("Tech Corridor")))
                .andExpect(jsonPath("$.groups[0].subtitle", is("IT hubs")))
                .andExpect(jsonPath("$.groups[0].regionLabel", is("East Bangalore")))
                .andExpect(jsonPath("$.groups[0].displayOrder", is(1)))
                .andExpect(jsonPath("$.groups[0].areaKeys", hasSize(2)))
                .andExpect(jsonPath("$.groups[0].areaKeys[0]", is("IN|KA|Bengaluru|Whitefield")))
                .andExpect(jsonPath("$.groups[0].areaKeys[1]", is("IN|KA|Bengaluru|Marathahalli")))
                .andExpect(jsonPath("$.groups[0].focusLat", is(12.9645)))
                .andExpect(jsonPath("$.groups[0].focusLon", is(77.7000)));
    }

    // ── unknown city → 200 with empty groups array ────────────────────────────

    @Test
    void getAreaGroups_unknownCity_returnsEmptyGroups() throws Exception {
        when(areaGroupsService.getGroupsByCity("nowhere"))
                .thenReturn(new AreaGroupsResponse("nowhere", List.of()));

        mockMvc.perform(get("/api/discover/area-groups").param("city", "nowhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("nowhere")))
                .andExpect(jsonPath("$.groups", hasSize(0)));
    }

    // ── null focus/bounds fields omitted from JSON (NON_NULL) ─────────────────

    @Test
    void getAreaGroups_nullFocusBounds_omittedFromJson() throws Exception {
        AreaGroupResponse group = new AreaGroupResponse(
                "city-centre", "City Centre", null, null, 3,
                List.of("IN|KA|Udupi|Udupi"),
                null, null, null, null, null, null, null
        );
        when(areaGroupsService.getGroupsByCity("udupi"))
                .thenReturn(new AreaGroupsResponse("udupi", List.of(group)));

        mockMvc.perform(get("/api/discover/area-groups").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].slug", is("city-centre")))
                .andExpect(jsonPath("$.groups[0].focusLat").doesNotExist())
                .andExpect(jsonPath("$.groups[0].focusLon").doesNotExist())
                .andExpect(jsonPath("$.groups[0].minLat").doesNotExist())
                .andExpect(jsonPath("$.groups[0].subtitle").doesNotExist())
                .andExpect(jsonPath("$.groups[0].regionLabel").doesNotExist());
    }

    // ── areaKeys ordering preserved ───────────────────────────────────────────

    @Test
    void getAreaGroups_areaKeysOrderPreserved() throws Exception {
        List<String> orderedKeys = List.of(
                "IN|KA|Udupi|Udupi",
                "IN|KA|Udupi|Kunjibettu",
                "IN|KA|Udupi|Amoghapura"
        );
        AreaGroupResponse group = new AreaGroupResponse(
                "city-centre", "City Centre", "Core urban", "Central Udupi", 3,
                orderedKeys, 13.3409, 74.7421, null, null, null, null, null
        );
        when(areaGroupsService.getGroupsByCity("udupi"))
                .thenReturn(new AreaGroupsResponse("udupi", List.of(group)));

        mockMvc.perform(get("/api/discover/area-groups").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].areaKeys[0]", is("IN|KA|Udupi|Udupi")))
                .andExpect(jsonPath("$.groups[0].areaKeys[1]", is("IN|KA|Udupi|Kunjibettu")))
                .andExpect(jsonPath("$.groups[0].areaKeys[2]", is("IN|KA|Udupi|Amoghapura")));
    }

    // ── multiple groups, display_order preserved ──────────────────────────────

    @Test
    void getAreaGroups_multipleGroups_displayOrderPreserved() throws Exception {
        AreaGroupResponse g1 = new AreaGroupResponse(
                "university-belt", "University Belt", null, null, 1,
                List.of("IN|KA|Udupi|Manipal"), null, null, null, null, null, null, null
        );
        AreaGroupResponse g2 = new AreaGroupResponse(
                "coastal-strip", "Coastal Strip", null, null, 2,
                List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null
        );
        when(areaGroupsService.getGroupsByCity("udupi"))
                .thenReturn(new AreaGroupsResponse("udupi", List.of(g1, g2)));

        mockMvc.perform(get("/api/discover/area-groups").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups", hasSize(2)))
                .andExpect(jsonPath("$.groups[0].slug", is("university-belt")))
                .andExpect(jsonPath("$.groups[0].displayOrder", is(1)))
                .andExpect(jsonPath("$.groups[1].slug", is("coastal-strip")))
                .andExpect(jsonPath("$.groups[1].displayOrder", is(2)));
    }

    // ── missing required param → 400 ─────────────────────────────────────────

    @Test
    void getAreaGroups_missingCityParam_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/area-groups"))
                .andExpect(status().isBadRequest());
    }

    // ── Cache-Control: public, max-age=120 ───────────────────────────────────

    @Test
    void getAreaGroups_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(areaGroupsService.getGroupsByCity("udupi"))
                .thenReturn(new AreaGroupsResponse("udupi", List.of()));

        // andDo(print()) captures the exact rendered Cache-Control string in test output
        mockMvc.perform(get("/api/discover/area-groups").param("city", "udupi"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }
}
