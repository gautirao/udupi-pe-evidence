package com.example.realestate.poi;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
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

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = ListingPoiController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(ListingPoiManagementControllerTest.TestConfig.class)
class ListingPoiManagementControllerTest {

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
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;

    @MockitoBean
    ListingPoiService service;
    @MockitoBean
    OverpassService overpassService;
    @MockitoBean
    ListingService listingService;
    @MockitoBean
    ListingRepository listingRepository;

    static final UUID OWNER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID OTHER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000002");
    static final UUID ADMIN_ID   = UUID.fromString("00000000-0000-0000-0000-000000000003");
    static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    static final UUID POI_ID     = UUID.fromString("00000000-0000-0000-0000-000000000088");

    Listing mockListing;

    @BeforeEach
    void setUp() {
        reset(service, overpassService, listingService, listingRepository);

        mockListing = mock(Listing.class);
        when(mockListing.getCreatedBy()).thenReturn(OWNER_ID);
        when(mockListing.getLatitude()).thenReturn(13.34);
        when(mockListing.getLongitude()).thenReturn(74.74);

        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(mockListing));
        when(listingService.getUserRole(OWNER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.getUserRole(OTHER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
    }

    // ===== Approve =====

    @Nested
    class ApproveTests {

        @Test
        void owner_canApproveOwnListingPoi() throws Exception {
            ListingPoi poi = poiWith(POI_ID, LISTING_ID, false);
            when(service.findById(POI_ID)).thenReturn(Optional.of(poi));
            when(service.save(any())).thenAnswer(inv -> inv.getArgument(0));

            mockMvc.perform(patch("/api/listings/{lid}/pois/{pid}/approve", LISTING_ID, POI_ID)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(POI_ID.toString()));
        }

        @Test
        void nonOwnerDealer_cannotApproveOtherListingPoi() throws Exception {
            mockMvc.perform(patch("/api/listings/{lid}/pois/{pid}/approve", LISTING_ID, POI_ID)
                            .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                    .andExpect(status().isForbidden());

            verify(service, never()).save(any());
        }

        @Test
        void admin_canApproveAnyListing() throws Exception {
            ListingPoi poi = poiWith(POI_ID, LISTING_ID, false);
            when(service.findById(POI_ID)).thenReturn(Optional.of(poi));
            when(service.save(any())).thenAnswer(inv -> inv.getArgument(0));

            mockMvc.perform(patch("/api/listings/{lid}/pois/{pid}/approve", LISTING_ID, POI_ID)
                            .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                    .andExpect(status().isOk());
        }
    }

    // ===== Manual add =====

    @Nested
    class ManualAddTests {

        @Test
        void owner_manualAddCreatesApprovedPoi() throws Exception {
            when(service.save(any())).thenAnswer(inv -> {
                ListingPoi p = inv.getArgument(0);
                p.setId(UUID.randomUUID());
                return p;
            });

            String body = objectMapper.writeValueAsString(
                    new ManualPoiRequest("New Hotel", "HOTEL", 13.341, 74.747));

            mockMvc.perform(post("/api/listings/{lid}/pois/manual", LISTING_ID)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.category").value("HOTEL"));

            verify(service).save(argThat(p ->
                    p.isApproved()
                            && "manual".equals(p.getSource())
                            && "HOTEL".equals(p.getCategory())
            ));
        }

        @Test
        void invalidCategory_returns400() throws Exception {
            String body = objectMapper.writeValueAsString(
                    new ManualPoiRequest("Junk", "INVALID_CAT", 13.341, 74.747));

            mockMvc.perform(post("/api/listings/{lid}/pois/manual", LISTING_ID)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }
    }

    // ===== Delete =====

    @Nested
    class DeleteTests {

        @Test
        void owner_canDeleteOwnListingPoi() throws Exception {
            when(service.findById(POI_ID)).thenReturn(Optional.of(poiWith(POI_ID, LISTING_ID, true)));

            mockMvc.perform(delete("/api/listings/{lid}/pois/{pid}", LISTING_ID, POI_ID)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                    .andExpect(status().isNoContent());

            verify(service).delete(POI_ID);
        }

        @Test
        void nonOwner_cannotDelete() throws Exception {
            mockMvc.perform(delete("/api/listings/{lid}/pois/{pid}", LISTING_ID, POI_ID)
                            .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                    .andExpect(status().isForbidden());

            verify(service, never()).delete(any());
        }
    }

    // ===== Suggestions =====

    @Nested
    class SuggestionsTests {

        @Test
        void owner_triggersFetchAndReturnsAllPois() throws Exception {
            when(overpassService.fetchAndCache(any(), anyDouble(), anyDouble())).thenReturn(List.of());
            when(service.getAll(LISTING_ID)).thenReturn(List.of());

            mockMvc.perform(get("/api/listings/{lid}/pois/suggestions", LISTING_ID)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                    .andExpect(status().isOk())
                    .andExpect(content().json("[]"));

            verify(overpassService).fetchAndCache(eq(LISTING_ID), anyDouble(), anyDouble());
        }

        @Test
        void nonOwner_suggestionsForbidden() throws Exception {
            mockMvc.perform(get("/api/listings/{lid}/pois/suggestions", LISTING_ID)
                            .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                    .andExpect(status().isForbidden());

            verify(overpassService, never()).fetchAndCache(any(), anyDouble(), anyDouble());
        }
    }

    // ===== Helper =====

    private static ListingPoi poiWith(UUID poiId, UUID listingId, boolean approved) {
        ListingPoi p = new ListingPoi();
        p.setId(poiId);
        p.setListingId(listingId);
        p.setName("Test POI");
        p.setCategory("WORSHIP");
        p.setLatitude(13.341);
        p.setLongitude(74.747);
        p.setDistanceMeters(200);
        p.setSource("overpass");
        p.setApproved(approved);
        p.setPinned(false);
        return p;
    }
}
