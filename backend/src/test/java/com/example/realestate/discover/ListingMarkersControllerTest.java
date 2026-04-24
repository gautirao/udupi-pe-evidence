package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = ListingMarkersController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingMarkersControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class ListingMarkersControllerTest {

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
    private ListingMarkersService listingMarkersService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingMarkersService, userRoleService);
    }

    @Test
    void getMarkers_returnsJsonWithCityAndMarkersList() throws Exception {
        UUID id = UUID.fromString("11111111-1111-1111-1111-111111111111");
        ListingMarker marker = new ListingMarker(id, 13.35, 74.79, 5_000_000L);
        when(listingMarkersService.getMarkersForCity("udupi"))
                .thenReturn(new ListingMarkersResponse("udupi", List.of(marker)));

        mockMvc.perform(get("/api/listings/markers").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.markers", hasSize(1)))
                .andExpect(jsonPath("$.markers[0].id", is(id.toString())))
                .andExpect(jsonPath("$.markers[0].lat", is(13.35)))
                .andExpect(jsonPath("$.markers[0].lon", is(74.79)))
                .andExpect(jsonPath("$.markers[0].pricePaise", is(5_000_000)));
    }

    @Test
    void getMarkers_unknownCity_returnsEmptyMarkers() throws Exception {
        when(listingMarkersService.getMarkersForCity("nowhere"))
                .thenReturn(new ListingMarkersResponse("nowhere", List.of()));

        mockMvc.perform(get("/api/listings/markers").param("city", "nowhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("nowhere")))
                .andExpect(jsonPath("$.markers", hasSize(0)));
    }

    @Test
    void getMarkers_validBbox_callsServiceWithBbox() throws Exception {
        UUID id = UUID.fromString("33333333-3333-3333-3333-333333333333");
        ListingMarker marker = new ListingMarker(id, 13.35, 74.79, null);
        when(listingMarkersService.getMarkersForCityInBbox("udupi", 13.1, 74.6, 13.5, 75.0))
                .thenReturn(new ListingMarkersResponse("udupi", List.of(marker)));

        mockMvc.perform(get("/api/listings/markers")
                        .param("city", "udupi")
                        .param("bbox", "13.1,74.6,13.5,75.0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.markers", hasSize(1)));
    }

    @Test
    void getMarkers_invalidBbox_fallsBackToCityOnly() throws Exception {
        when(listingMarkersService.getMarkersForCity("udupi"))
                .thenReturn(new ListingMarkersResponse("udupi", List.of()));

        mockMvc.perform(get("/api/listings/markers")
                        .param("city", "udupi")
                        .param("bbox", "not-a-bbox"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")));
    }

    @Test
    void parseBbox_validInput_returnsFourDoubles() {
        double[] result = ListingMarkersController.parseBbox("13.1,74.6,13.5,75.0");
        assertNotNull(result);
        assertEquals(13.1, result[0], 1e-9);
        assertEquals(74.6, result[1], 1e-9);
        assertEquals(13.5, result[2], 1e-9);
        assertEquals(75.0, result[3], 1e-9);
    }

    @Test
    void parseBbox_invertedLatRange_returnsNull() {
        assertNull(ListingMarkersController.parseBbox("13.5,74.6,13.1,75.0"));
    }

    @Test
    void parseBbox_nullOrBlank_returnsNull() {
        assertNull(ListingMarkersController.parseBbox(null));
        assertNull(ListingMarkersController.parseBbox("  "));
    }

    @Test
    void getMarkers_nullPricePaise_omittedFromResponse() throws Exception {
        UUID id = UUID.fromString("22222222-2222-2222-2222-222222222222");
        ListingMarker marker = new ListingMarker(id, 13.30, 74.80, null);
        when(listingMarkersService.getMarkersForCity("udupi"))
                .thenReturn(new ListingMarkersResponse("udupi", List.of(marker)));

        mockMvc.perform(get("/api/listings/markers").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.markers[0].pricePaise").doesNotExist());
    }
}
