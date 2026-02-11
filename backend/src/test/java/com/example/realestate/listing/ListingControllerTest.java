package com.example.realestate.listing;

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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for ListingController (dealer CRUD endpoints).
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks ListingService.
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(ListingControllerTest.TestConfig.class)
class ListingControllerTest {

    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

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

    @MockitoBean
    private ListingService listingService;

    @BeforeEach
    void setUp() {
        reset(listingService);
    }

    // ==================== Test 1: POST creates draft -> 201 ====================

    @Test
    void create_withDealerRole_returns201WithIdAndStatus() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingService.createDraft(eq(DEALER_ID), eq("land"), eq("Test plot"),
                eq("Manipal"), eq(new BigDecimal("5000000")), eq("Nice plot")))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test plot","locality":"Manipal",
                                 "price":5000000,"description":"Nice plot"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingService).createDraft(DEALER_ID, "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
    }

    // ==================== Test 2: GET /mine -> 200, array ====================

    @Test
    void mine_withDealerRole_returns200WithArray() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        when(listingService.getListingsByOwner(DEALER_ID)).thenReturn(List.of(listing));

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$[0].status").value("DRAFT"));

        verify(listingService).getListingsByOwner(DEALER_ID);
    }

    // ==================== Test 3: PUT -> 200 ====================

    @Test
    void update_withDealerRole_returns200() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Updated title",
                "Manipal", new BigDecimal("6000000"), "Updated desc");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                eq("land"), eq("Updated title"), eq("Manipal"),
                eq(new BigDecimal("6000000")), eq("Updated desc")))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Updated title","locality":"Manipal",
                                 "price":6000000,"description":"Updated desc"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.title").value("Updated title"));

        verify(listingService).updateListing(LISTING_ID, DEALER_ID, false,
                "land", "Updated title", "Manipal",
                new BigDecimal("6000000"), "Updated desc");
    }

    // ==================== Test 4: DELETE -> 204 ====================

    @Test
    void delete_withDealerRole_returns204() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(listingService).deleteListing(LISTING_ID, DEALER_ID, false);
    }

    // ==================== Test 5: No JWT -> 403 ====================

    @Test
    void create_withoutJwt_returnsForbidden() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test","locality":"X",
                                 "price":100,"description":"d"}
                                """))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 6: JWT with non-dealer role -> 403 ====================

    @Test
    void create_withViewerRole_returnsForbidden() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("viewer"));

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test","locality":"X",
                                 "price":100,"description":"d"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires dealer or admin role"));

        verify(listingService, never()).createDraft(any(), any(), any(), any(), any(), any());
    }

    // ==================== Test 7: PUT -> not found -> 404 ====================

    @Test
    void update_listingNotFound_returns404() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingNotFoundException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"New title"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 8: PUT -> wrong status -> 400 ====================

    @Test
    void update_wrongStatus_returns400() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot update listing with status LIVE"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"New title"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot update listing with status LIVE"));
    }

    // ==================== Test 9: DELETE -> not found -> 404 ====================

    @Test
    void delete_listingNotFound_returns404() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingService.ListingNotFoundException(LISTING_ID))
                .when(listingService).deleteListing(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 10: DELETE -> wrong status -> 400 ====================

    @Test
    void delete_wrongStatus_returns400() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingService.ListingStatusException(
                "Cannot delete listing with status LIVE"))
                .when(listingService).deleteListing(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot delete listing with status LIVE"));
    }

    // ==================== Helper ====================

    private Listing buildListing(UUID id, String status, String propertyType, String title,
                                  String locality, BigDecimal price, String description) {
        Listing l = new Listing();
        l.setId(id);
        l.setStatus(status);
        l.setPropertyType(propertyType);
        l.setTitle(title);
        l.setLocality(locality);
        l.setPrice(price);
        l.setDescription(description);
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }
}
