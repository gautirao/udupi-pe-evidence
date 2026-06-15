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
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} slice for {@link DiscoverAgriMapListingsController}.
 *
 * <p>Security is replaced by a local permit-all chain so tests focus on controller
 * behaviour (response shape, Cache-Control, param validation, PII exclusion) without
 * requiring a JWT. The real {@link com.example.realestate.security.JwtConfig}
 * permitAll line for this path is verified separately.
 */
@WebMvcTest(
        controllers = DiscoverAgriMapListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({DiscoverAgriMapListingsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class DiscoverAgriMapListingsControllerTest {

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
    private DiscoverAgriMapListingsService agriMapListingsService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(agriMapListingsService, userRoleService);
    }

    // ── AC1: anonymous 200 (no JWT required) ──────────────────────────────────

    @Test
    void getAgriMapListings_anonymousRequest_returns200() throws Exception {
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of()));

        // No Authorization header — must succeed (public endpoint)
        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isOk());
    }

    // ── AC2: valid request returns correct AgriMapListingsResponse shape ──────

    @Test
    void getAgriMapListings_validRequest_returnsCorrectShape() throws Exception {
        AgriMapListingItem item = new AgriMapListingItem(
                "listing-id-1", "3-Acre Farmland, Kundapur",
                "IN|KA|Udupi|Area1",
                13.3, 74.7,
                "agricultural_land", "Kundapur",
                "{\"type\":\"Polygon\",\"coordinates\":[]}",
                new BigDecimal("2.5"), "acres",
                new BigDecimal("2.5"), 5000000L, null,
                null, null, null, null
        );
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(item)));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.listings", hasSize(1)))
                .andExpect(jsonPath("$.listings[0].id", is("listing-id-1")))
                .andExpect(jsonPath("$.listings[0].title", is("3-Acre Farmland, Kundapur")))
                .andExpect(jsonPath("$.listings[0].areaKey", is("IN|KA|Udupi|Area1")))
                .andExpect(jsonPath("$.listings[0].latitude", is(13.3)))
                .andExpect(jsonPath("$.listings[0].longitude", is(74.7)))
                .andExpect(jsonPath("$.listings[0].propertyType", is("agricultural_land")))
                .andExpect(jsonPath("$.listings[0].locality", is("Kundapur")))
                .andExpect(jsonPath("$.listings[0].landArea", is(2.5)))
                .andExpect(jsonPath("$.listings[0].pricePaise", is(5000000)));
    }

    // ── CRITICAL: no PII fields in serialised JSON ────────────────────────────

    @Test
    void getAgriMapListings_responseJson_containsNoPiiFields() throws Exception {
        AgriMapListingItem item = new AgriMapListingItem(
                "id-pii-check", "PII Check Farmland",
                "IN|KA|Udupi|Area1",
                13.3, 74.7, "agricultural_land", "TestLocality",
                null, null, null, null, null, null,
                null, null, null, null
        );
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(item)));

        String responseBody = mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Verify no PII or internal fields in the JSON response
        assertThat(responseBody).doesNotContainIgnoringCase("seller");
        assertThat(responseBody).doesNotContainIgnoringCase("owner");
        assertThat(responseBody).doesNotContainIgnoringCase("phone");
        assertThat(responseBody).doesNotContainIgnoringCase("email");
        assertThat(responseBody).doesNotContainIgnoringCase("rejectionReason");
        assertThat(responseBody).doesNotContainIgnoringCase("archived");
        assertThat(responseBody).doesNotContainIgnoringCase("duplicate");
        assertThat(responseBody).doesNotContainIgnoringCase("adminStatus");
        assertThat(responseBody).doesNotContainIgnoringCase("internalNotes");
        // status is not included in the DTO
        assertThat(responseBody).doesNotContain("\"status\"");
        // title IS present (public-safe listing title)
        assertThat(responseBody).contains("\"title\"");
        assertThat(responseBody).contains("PII Check Farmland");
    }

    // ── AC3: Cache-Control: public, max-age=120 ───────────────────────────────

    @Test
    void getAgriMapListings_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    // ── AC4: Content-Type: application/json ───────────────────────────────────

    @Test
    void getAgriMapListings_responseIsJson() throws Exception {
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"));
    }

    // ── AC5: 400 on missing city param ────────────────────────────────────────

    @Test
    void getAgriMapListings_missingCity_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isBadRequest());
    }

    // ── AC6: 400 on missing areaKeys param ────────────────────────────────────

    @Test
    void getAgriMapListings_missingAreaKeys_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi"))
                .andExpect(status().isBadRequest());
    }

    // ── AC7: 400 when service throws 400 (e.g. empty areaKeys passed as empty list) ─

    @Test
    void getAgriMapListings_serviceThrows400_returns400() throws Exception {
        when(agriMapListingsService.findAgriMapListings(anyString(), anyList(), any(), anyBoolean(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty"));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "somekey"))
                .andExpect(status().isBadRequest());
    }

    // ── AC8: multiple areaKeys in request returns listings for all ────────────

    @Test
    void getAgriMapListings_multipleAreaKeys_returnsCorrectSet() throws Exception {
        AgriMapListingItem item1 = new AgriMapListingItem(
                "id-1", null, "IN|KA|Udupi|Area1", 13.3, 74.7,
                "agricultural_land", "Area1", null,
                null, null, null, null, null,
                null, null, null, null);
        AgriMapListingItem item2 = new AgriMapListingItem(
                "id-2", null, "IN|KA|Udupi|Area2", 13.4, 74.8,
                "agricultural_land", "Area2", null,
                null, null, null, null, null,
                null, null, null, null);

        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(item1, item2)));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1")
                        .param("areaKeys", "IN|KA|Udupi|Area2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings", hasSize(2)))
                .andExpect(jsonPath("$.listings[0].id", is("id-1")))
                .andExpect(jsonPath("$.listings[1].id", is("id-2")));
    }

    // ── null fields omitted by @JsonInclude(NON_NULL) ─────────────────────────

    @Test
    void getAgriMapListings_nullBoundaryGeoJson_omittedFromJson() throws Exception {
        AgriMapListingItem item = new AgriMapListingItem(
                "id-null-boundary", null,
                "IN|KA|Udupi|Area1",
                13.3, 74.7, "agricultural_land", "Kundapur",
                null, // boundaryGeoJson = null
                null, null, null, null, null,
                null, null, null, null
        );
        when(agriMapListingsService.findAgriMapListings(eq("udupi"), anyList(), any(), anyBoolean(), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(item)));

        mockMvc.perform(get("/api/discover/agri-map-listings")
                        .param("city", "udupi")
                        .param("areaKeys", "IN|KA|Udupi|Area1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings[0].boundaryGeoJson").doesNotExist());
    }
}
