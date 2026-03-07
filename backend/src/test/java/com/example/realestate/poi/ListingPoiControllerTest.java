package com.example.realestate.poi;

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
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = ListingPoiController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(ListingPoiControllerTest.TestConfig.class)
class ListingPoiControllerTest {

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http.csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
            return http.build();
        }
    }

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    ListingPoiService service;

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Test
    void returnsOnlyApprovedPois() throws Exception {
        UUID poiId = UUID.randomUUID();
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(
                new PoiResponse(poiId, "Sri Temple", "WORSHIP", 250, 13.341, 74.747, false)
        ));

        mockMvc.perform(get("/api/listings/{id}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].category").value("WORSHIP"))
                .andExpect(jsonPath("$[0].distanceMeters").value(250));
    }

    @Test
    void noApprovedPois_returns200WithEmptyArray() throws Exception {
        when(service.getApproved(LISTING_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/listings/{id}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void nonExistentListing_returns200WithEmptyArray() throws Exception {
        UUID unknownId = UUID.randomUUID();
        when(service.getApproved(unknownId)).thenReturn(List.of());

        mockMvc.perform(get("/api/listings/{id}/pois", unknownId))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }

    @Test
    void pinnedPoiReturnedFirst_byService() throws Exception {
        UUID pinned = UUID.randomUUID();
        UUID closer = UUID.randomUUID();
        // Service handles ordering; controller just passes through
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(
                new PoiResponse(pinned, "Pinned Temple", "WORSHIP", 500, 13.344, 74.75, true),
                new PoiResponse(closer, "Nearby Clinic", "HOSPITAL", 100, 13.341, 74.747, false)
        ));

        mockMvc.perform(get("/api/listings/{id}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].pinned").value(true))
                .andExpect(jsonPath("$[1].pinned").value(false));
    }
}
