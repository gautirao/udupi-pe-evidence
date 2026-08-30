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

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} slice for {@link AgriDestinationsController} (#2151 PR C, C-B1).
 *
 * <p>Security is replaced by a local permit-all chain so tests focus on controller behaviour
 * (request mapping, response shape, Cache-Control, 503 propagation) without requiring a JWT. The
 * real {@link com.example.realestate.security.JwtConfig} permitAll wiring for this path is
 * verified separately (see {@code AgriDestinationsSecurityIT}).
 */
@WebMvcTest(
        controllers = AgriDestinationsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AgriDestinationsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class AgriDestinationsControllerTest {

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
    private AgriDestinationsService agriDestinationsService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(agriDestinationsService, userRoleService);
    }

    // ── anonymous 200 (no JWT required at the slice level) ────────────────────

    @Test
    void getAgriDestinations_anonymousRequest_returns200() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk());
    }

    // ── valid request returns correct AgriDestinationsResponse shape ──────────

    @Test
    void getAgriDestinations_validRequest_returnsCorrectShape() throws Exception {
        AgriDestinationBucketResponse bucket = new AgriDestinationBucketResponse(
                "IN|KA|Udupi|Area1", "N towards Brahmavar", 8.2, 12.5, "N", 4L, 9.75);
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of(bucket)));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.destinations", hasSize(1)))
                .andExpect(jsonPath("$.destinations[0].areaKey", is("IN|KA|Udupi|Area1")))
                .andExpect(jsonPath("$.destinations[0].displayName", is("N towards Brahmavar")))
                .andExpect(jsonPath("$.destinations[0].distanceKm", is(8.2)))
                .andExpect(jsonPath("$.destinations[0].bearingDeg", is(12.5)))
                .andExpect(jsonPath("$.destinations[0].direction", is("N")))
                .andExpect(jsonPath("$.destinations[0].parcelCount", is(4)))
                .andExpect(jsonPath("$.destinations[0].parcelAcreage", is(9.75)));
    }

    // ── null parcelAcreage omitted by @JsonInclude(NON_NULL) ──────────────────

    @Test
    void getAgriDestinations_nullParcelAcreage_omittedFromJson() throws Exception {
        AgriDestinationBucketResponse bucket = new AgriDestinationBucketResponse(
                "IN|KA|Udupi|Area1", "N corridor", 5.0, 0.0, "N", 0L, null);
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of(bucket)));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations[0].parcelAcreage").doesNotExist())
                .andExpect(jsonPath("$.destinations[0].parcelCount", is(0)));
    }

    // ── request params: city required, direction/maxKm/listingPurpose optional and passed through ──

    @Test
    void getAgriDestinations_missingCity_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/agri-destinations"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getAgriDestinations_serviceThrows400_returns400() throws Exception {
        when(agriDestinationsService.getDestinations(anyString(), any(), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "city_must_not_be_blank"));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", " "))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getAgriDestinations_directionMaxKmListingPurpose_passedThroughToService() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), eq("N"), eq(25.0), eq("sale")))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations")
                        .param("city", "udupi")
                        .param("direction", "N")
                        .param("maxKm", "25")
                        .param("listingPurpose", "sale"))
                .andExpect(status().isOk());

        verify(agriDestinationsService).getDestinations("udupi", "N", 25.0, "sale");
    }

    @Test
    void getAgriDestinations_optionalParamsAbsent_passedAsNull() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), isNull(), isNull(), isNull()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk());

        verify(agriDestinationsService).getDestinations("udupi", null, null, null);
    }

    // ── C-B3: 503 fail-closed propagates unchanged, not silently swallowed into 200 ───────────────

    @Test
    void getAgriDestinations_portThrows503_propagatesAs503NotSilentEmpty200() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "AGRI_DESTINATIONS_NOT_YET_PROMOTED"));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error", is("AGRI_DESTINATIONS_NOT_YET_PROMOTED")));
    }

    // ── C-B6: Cache-Control public, max-age=120 (auth-invariant payload — see controller javadoc) ──

    @Test
    void getAgriDestinations_responseHasCacheControlPublicMaxAge120() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=120")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    @Test
    void getAgriDestinations_responseIsJson() throws Exception {
        when(agriDestinationsService.getDestinations(eq("udupi"), any(), any(), any()))
                .thenReturn(new AgriDestinationsResponse("udupi", List.of()));

        mockMvc.perform(get("/api/discover/agri-destinations").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"));
    }

    // ── C-B4: response shape carries no price / exact-coordinate fields ───────────────────────────

    @Test
    void agriDestinationBucketResponse_hasNoPriceOrExactCoordinateFields() {
        var fieldNames = java.util.Arrays.stream(AgriDestinationBucketResponse.class.getRecordComponents())
                .map(c -> c.getName().toLowerCase())
                .toList();
        org.assertj.core.api.Assertions.assertThat(fieldNames)
                .as("destination buckets must never carry price or an exact parcel coordinate — "
                        + "distanceKm/bearingDeg are precomputed CORRIDOR geometry from the city origin, "
                        + "not a parcel location")
                .doesNotContain("priceppaise", "price", "latitude", "longitude");
    }
}
