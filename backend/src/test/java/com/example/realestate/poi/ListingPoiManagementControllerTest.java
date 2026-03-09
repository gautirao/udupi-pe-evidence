package com.example.realestate.poi;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the dealer/admin management endpoints in {@link ListingPoiController}.
 * Covers: suggestions, approve, pin, manual add, delete — auth and business logic paths.
 */
@WebMvcTest(
        controllers = ListingPoiController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(ListingPoiManagementControllerTest.TestConfig.class)
class ListingPoiManagementControllerTest {

    private static final UUID OWNER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OTHER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID ADMIN_ID   = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID POI_ID     = UUID.fromString("00000000-0000-0000-0000-000000000077");

    /** Require authentication for all requests; disable CSRF for ease of test PATCH/POST/DELETE. */
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

    @MockitoBean private ListingPoiService service;
    @MockitoBean private OverpassService overpassService;
    @MockitoBean private ListingService listingService;
    @MockitoBean private ListingRepository listingRepository;

    @BeforeEach
    void setUp() {
        reset(service, overpassService, listingService, listingRepository);
    }

    // ===== Helpers =====

    /** Builds a minimal Listing owned by the given createdBy UUID, with coords. */
    private Listing ownerListing(UUID createdBy) {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(createdBy);
        l.setLatitude(13.3415);
        l.setLongitude(74.7430);
        return l;
    }

    /** Builds a minimal ListingPoi for the test listing. */
    private ListingPoi buildPoi(boolean approved, boolean pinned) {
        ListingPoi p = new ListingPoi();
        p.setId(POI_ID);
        p.setListingId(LISTING_ID);
        p.setName("District Hospital");
        p.setCategory("HOSPITAL");
        p.setDistanceMeters(200);
        p.setSource("overpass");
        p.setApproved(approved);
        p.setPinned(pinned);
        return p;
    }

    // ==================== Test 1: suggestions — owner can access → 200 ====================

    @Test
    void suggestions_ownerCanAccess_returns200() throws Exception {
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));
        when(overpassService.fetchAndCache(eq(LISTING_ID), any(Double.class), any(Double.class)))
                .thenReturn(List.of());

        ListingPoi poi = buildPoi(false, false);
        when(service.getAll(LISTING_ID)).thenReturn(List.of(poi));

        mockMvc.perform(get("/api/listings/{listingId}/pois/suggestions", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(POI_ID.toString()));
    }

    // ==================== Test 2: suggestions — non-owner → 403 ====================

    @Test
    void suggestions_nonOwner_returns403() throws Exception {
        when(listingService.getUserRole(OTHER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        mockMvc.perform(get("/api/listings/{listingId}/pois/suggestions", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden());

        verify(service, never()).getAll(any());
    }

    // ==================== Test 3: approve — owner approves own listing's POI → approved=true ====================

    @Test
    void approve_ownerApprovesOwnPoi_returns200() throws Exception {
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        ListingPoi unapproved = buildPoi(false, false);
        when(service.findById(POI_ID)).thenReturn(Optional.of(unapproved));

        // Simulate save: return the same object (approved=true will have been set by controller)
        when(service.save(any(ListingPoi.class))).thenAnswer(inv -> {
            ListingPoi p = inv.getArgument(0);
            return p;
        });

        mockMvc.perform(patch("/api/listings/{listingId}/pois/{poiId}/approve", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(POI_ID.toString()));

        verify(service).save(any(ListingPoi.class));
    }

    // ==================== Test 4: manual add — valid category → 201 ====================

    @Test
    void manualAdd_validCategory_returns201() throws Exception {
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        when(service.save(any(ListingPoi.class))).thenAnswer(inv -> {
            ListingPoi p = inv.getArgument(0);
            p.setId(POI_ID);
            return p;
        });

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"City Hospital","category":"HOSPITAL","latitude":13.34,"longitude":74.74}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("HOSPITAL"));
    }

    // ==================== Test 5: manual add — invalid category → 400 ====================

    @Test
    void manualAdd_invalidCategory_returns400() throws Exception {
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        mockMvc.perform(post("/api/listings/{listingId}/pois/manual", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bad POI","category":"INVALID","latitude":13.34,"longitude":74.74}
                                """))
                .andExpect(status().isBadRequest());

        verify(service, never()).save(any());
    }

    // ==================== Test 6: delete — owner deletes own POI → 204 ====================

    @Test
    void delete_ownerDeletes_returns204() throws Exception {
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        ListingPoi poi = buildPoi(true, false);
        when(service.findById(POI_ID)).thenReturn(Optional.of(poi));

        mockMvc.perform(delete("/api/listings/{listingId}/pois/{poiId}", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(service).delete(POI_ID);
    }

    // ==================== Test 7: delete — non-owner → 403 ====================

    @Test
    void delete_nonOwner_returns403() throws Exception {
        when(listingService.getUserRole(OTHER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));

        mockMvc.perform(delete("/api/listings/{listingId}/pois/{poiId}", LISTING_ID, POI_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden());

        verify(service, never()).delete(any());
    }

    // ==================== Test 8: admin can access any listing's suggestions → 200 ====================

    @Test
    void admin_canAccessAnyListing() throws Exception {
        // Admin accesses a listing owned by a different dealer (OWNER_ID)
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing(OWNER_ID)));
        when(overpassService.fetchAndCache(eq(LISTING_ID), any(Double.class), any(Double.class)))
                .thenReturn(List.of());

        ListingPoi poi = buildPoi(true, false);
        when(service.getAll(LISTING_ID)).thenReturn(List.of(poi));

        mockMvc.perform(get("/api/listings/{listingId}/pois/suggestions", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }
}
