package com.example.realestate.poi;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for {@link ListingPoiController}.
 * Verifies GET /api/listings/{listingId}/pois: ordering, empty list, and auth enforcement.
 */
@WebMvcTest(
        controllers = ListingPoiController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingPoiControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
class ListingPoiControllerTest {

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /**
     * Security config matching real JwtConfig: all requests require authentication.
     * The exceptionHandling entry point returns 401 (not Spring's default 403) to mirror
     * production behaviour where oauth2ResourceServer sends WWW-Authenticate: Bearer.
     */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .anyRequest().authenticated())
                    .exceptionHandling(ex -> ex
                            .authenticationEntryPoint((req, res, authEx) -> res.setStatus(401)))
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean private ListingPoiService service;
    @MockitoBean private OverpassService overpassService;
    @MockitoBean private ListingWorkflowService listingWorkflowService;
    @MockitoBean private UserRoleService userRoleService;

    // ==================== Test 1: returns only approved POIs ====================

    @Test
    void getApproved_returnsOnlyApprovedPois() throws Exception {
        PoiResponse poi1 = new PoiResponse("id-1", "District Hospital", "HOSPITAL", 150, 13.3415, 74.7430, false, true, false);
        PoiResponse poi2 = new PoiResponse("id-2", "St. Mary's School", "SCHOOL", 300, 13.3420, 74.7440, false, true, false);
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(poi1, poi2));

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID).with(jwt()))
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
        PoiResponse unpinned = new PoiResponse("id-unpinned", "Nearby ATM",   "BANK",    50,  13.3411, 74.7422, false, true, false);
        PoiResponse pinned   = new PoiResponse("id-pinned",   "Featured Park", "PARK",   200, 13.3430, 74.7450, true,  true, false);
        when(service.getApproved(LISTING_ID)).thenReturn(List.of(pinned, unpinned));

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID).with(jwt()))
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

        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID).with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 4: no Authorization header → 401 ====================

    @Test
    void getApproved_withoutAuth_returns401() throws Exception {
        // Deliberately omit Authorization header — endpoint requires authentication.
        mockMvc.perform(get("/api/listings/{listingId}/pois", LISTING_ID))
                .andExpect(status().isUnauthorized());
    }

    // ==================== RE-166: SCRAPED listing null-owner guard (5 management endpoints) ====================

    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID POI_ID    = UUID.fromString("00000000-0000-0000-0000-000000000042");

    @Test
    void getSuggestions_scrapedListing_dealerCaller_returns403() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(get("/api/listings/{listingId}/pois/suggestions", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
    }

    @Test
    void approvePoi_scrapedListing_dealerCaller_returns403() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(patch("/api/listings/{listingId}/pois/{poiId}/approve", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
    }

    @Test
    void pinPoi_scrapedListing_dealerCaller_returns403() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(patch("/api/listings/{listingId}/pois/{poiId}/pin", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
    }

    @Test
    void addManual_scrapedListing_dealerCaller_returns403() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"HOSPITAL","latitude":13.34,"longitude":74.74}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
    }

    @Test
    void deletePoi_scrapedListing_dealerCaller_returns403() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(delete("/api/listings/{listingId}/pois/{poiId}", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
    }

    // ==================== RE-166: admin can access SCRAPED listing POI suggestions ====================

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /**
     * RE-166 ADVISORY: admin callers bypass the owner check and must receive 200 for SCRAPED
     * listings (createdBy == null). This confirms the admin bypass path is not broken by the
     * null-owner guard added for non-admin callers.
     */
    // ==================== #2642: manual POI distanceMeters persistence ====================

    private static Listing ownedListing() {
        Listing listing = new Listing();
        listing.setId(LISTING_ID);
        listing.setCreatedBy(DEALER_ID);
        listing.setStatus("LIVE");
        listing.setPropertyType("house");
        return listing;
    }

    @Test
    void addManual_withDistanceMeters_persistsOnEntity() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(ownedListing());

        ArgumentCaptor<ListingPoi> captor = ArgumentCaptor.forClass(ListingPoi.class);
        ListingPoi saved = new ListingPoi();
        saved.setId(UUID.randomUUID());
        saved.setListingId(LISTING_ID);
        saved.setName("Test POI");
        saved.setCategory("HOSPITAL");
        saved.setDistanceMeters(1300);
        saved.setApproved(true);
        saved.setPinned(false);
        when(service.save(captor.capture())).thenReturn(saved);

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"HOSPITAL","distanceMeters":1300}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distanceMeters").value(1300));

        org.junit.jupiter.api.Assertions.assertEquals(1300, captor.getValue().getDistanceMeters());
    }

    @Test
    void addManual_withSmallerDistanceMeters_persistsOnEntity() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(ownedListing());

        ArgumentCaptor<ListingPoi> captor = ArgumentCaptor.forClass(ListingPoi.class);
        ListingPoi saved = new ListingPoi();
        saved.setId(UUID.randomUUID());
        saved.setListingId(LISTING_ID);
        saved.setName("Test POI");
        saved.setCategory("SCHOOL");
        saved.setDistanceMeters(850);
        saved.setApproved(true);
        saved.setPinned(false);
        when(service.save(captor.capture())).thenReturn(saved);

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"SCHOOL","distanceMeters":850}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distanceMeters").value(850));

        org.junit.jupiter.api.Assertions.assertEquals(850, captor.getValue().getDistanceMeters());
    }

    @Test
    void addManual_withNullDistanceMeters_persistsNull() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(ownedListing());

        ArgumentCaptor<ListingPoi> captor = ArgumentCaptor.forClass(ListingPoi.class);
        ListingPoi saved = new ListingPoi();
        saved.setId(UUID.randomUUID());
        saved.setListingId(LISTING_ID);
        saved.setName("Test POI");
        saved.setCategory("HOSPITAL");
        saved.setDistanceMeters(null);
        saved.setApproved(true);
        saved.setPinned(false);
        when(service.save(captor.capture())).thenReturn(saved);

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"HOSPITAL"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.distanceMeters").value(org.hamcrest.Matchers.nullValue()));

        org.junit.jupiter.api.Assertions.assertNull(captor.getValue().getDistanceMeters());
    }

    @Test
    void addManual_withZeroDistanceMeters_returns400() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(ownedListing());

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"HOSPITAL","distanceMeters":0}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void addManual_withNegativeDistanceMeters_returns400() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(ownedListing());

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Test POI","category":"HOSPITAL","distanceMeters":-50}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getSuggestions_scrapedListing_adminCaller_returns200() throws Exception {
        // Listing has no coordinates — this bypasses overpassService calls so no additional stubs needed.
        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus("LIVE");
        scraped.setPropertyType("house");
        scraped.setLatitude(null);
        scraped.setLongitude(null);
        when(listingWorkflowService.findListingForCaller(LISTING_ID, ADMIN_ID, true))
                .thenReturn(scraped);

        when(service.getAll(LISTING_ID)).thenReturn(List.of());

        mockMvc.perform(get("/api/listings/{listingId}/pois/suggestions", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pois.length()").value(0))
                .andExpect(jsonPath("$.providerIssue").value(false));
    }
}
