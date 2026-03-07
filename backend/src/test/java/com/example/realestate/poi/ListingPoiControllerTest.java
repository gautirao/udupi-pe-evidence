package com.example.realestate.poi;

import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for {@link ListingPoiController}.
 * Verifies public GET /api/listings/{listingId}/pois: ordering, empty list, and no-auth access.
 */
@WebMvcTest(
        controllers = ListingPoiController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(ListingPoiControllerTest.TestConfig.class)
class ListingPoiControllerTest {

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /** Security config matching real JwtConfig: GET /api/listings/{id}/pois is permitAll. */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers(HttpMethod.GET, "/api/listings/*/pois").permitAll()
                            .anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean private ListingPoiService service;
    @MockitoBean private OverpassService overpassService;
    @MockitoBean private ListingService listingService;
    @MockitoBean private ListingRepository listingRepository;

    // ==================== Test 1: returns only approved POIs ====================

    @Test
    void getApproved_returnsOnlyApprovedPois() throws Exception {
        PoiResponse poi1 = new PoiResponse("id-1", "District Hospital", "HOSPITAL", 150, 13.3415, 74.7430, false);
        PoiResponse poi2 = new PoiResponse("id-2", "St. Mary's School", "SCHOOL", 300, 13.3420, 74.7440, false);
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(poi1, poi2));

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value("id-1"))
                .andExpect(jsonPath("$[1].id").value("id-2"));
    }

    // ==================== Test 2: pinned appears first ====================

    @Test
    void getApproved_orderedPinnedFirst() throws Exception {
        // Service already returns correctly ordered results; controller just delegates.
        // Mock returns pinned(200m) first, then unpinned(50m) — verifying controller
        // passes through the service-ordered list unchanged.
        PoiResponse unpinned = new PoiResponse("id-unpinned", "Nearby ATM",   "BANK",    50,  13.3411, 74.7422, false);
        PoiResponse pinned   = new PoiResponse("id-pinned",   "Featured Park", "PARK",   200, 13.3430, 74.7450, true);
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(pinned, unpinned));

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].pinned").value(true))
                .andExpect(jsonPath("$[0].id").value("id-pinned"))
                .andExpect(jsonPath("$[1].pinned").value(false))
                .andExpect(jsonPath("$[1].id").value("id-unpinned"));
    }

    // ==================== Test 3: empty list returns 200 ====================

    @Test
    void getApproved_emptyList_returns200() throws Exception {
        when(service.getApproved(LISTING_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 4: no Authorization header → 200, not 401 ====================

    @Test
    void getApproved_noAuthRequired() throws Exception {
        when(service.getApproved(LISTING_ID)).thenReturn(List.of());

        // Deliberately omit Authorization header — endpoint must be publicly accessible.
        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID))
                .andExpect(status().isOk());
    }
}
