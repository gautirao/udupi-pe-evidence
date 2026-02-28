package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private ListingImageRepository listingImageRepository;

    @BeforeEach
    void setUp() {
        reset(listingService, listingRepository, listingImageRepository);
        // Default stub: no images; individual tests override when imageCount matters.
        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
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
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingService.getListingsByOwner(eq(DEALER_ID), any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

        verify(listingService).getListingsByOwner(eq(DEALER_ID), any(Pageable.class));
    }

    // ==================== Test 3: PUT -> 200 ====================

    @Test
    void update_withDealerRole_returns200() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Updated title",
                "Manipal", new BigDecimal("6000000"), "Updated desc");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                eq("land"), eq("Updated title"), eq("Manipal"),
                eq(new BigDecimal("6000000")), eq("Updated desc"),
                isNull(), isNull(), isNull(), isNull()))
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
                new BigDecimal("6000000"), "Updated desc",
                null, null, null, null);
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
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
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

    // ==================== Test 8: PUT -> wrong status -> 409 ====================

    @Test
    void update_wrongStatus_returns409() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot update listing with status LIVE"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"New title"}
                                """))
                .andExpect(status().isConflict())
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

    // ==================== Submit: happy path -> 200 ====================

    @Test
    void submit_happyPath_returns200WithPendingReview() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing submitted = buildListing(LISTING_ID, "PENDING_REVIEW", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        submitted.setSubmittedAt(OffsetDateTime.now());
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false)).thenReturn(submitted);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));

        verify(listingService).submitListing(LISTING_ID, DEALER_ID, false);
    }

    // ==================== Submit: REJECTED -> PENDING_REVIEW ====================

    @Test
    void submit_rejectedListing_returns200() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing submitted = buildListing(LISTING_ID, "PENDING_REVIEW", "house", "House",
                "Udupi", new BigDecimal("8000000"), "Resubmitted");
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false)).thenReturn(submitted);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));
    }

    // ==================== Submit: missing land_area -> 422 ====================

    @Test
    void submit_missingLandArea_returns422() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "land_area",
                                "message", "Land area is required for land listings"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("land_area"));
    }

    // ==================== Submit: missing bedrooms -> 422 ====================

    @Test
    void submit_missingBedrooms_returns422() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "bedrooms",
                                "message", "Bedrooms is required for apartment listings"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("bedrooms"));
    }

    // ==================== Submit: too few images -> 422 ====================

    @Test
    void submit_tooFewImages_returns422() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "images",
                                "message", "At least 3 images required (found 1)"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("images"))
                .andExpect(jsonPath("$.errors[0].message").value("At least 3 images required (found 1)"));
    }

    // ==================== Submit: address not confirmed -> 422 ====================

    @Test
    void submit_addressNotConfirmed_returns422() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "address_confirmed",
                                "message", "Address must be confirmed before submission"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("address_confirmed"));
    }

    // ==================== Submit: other dealer's listing -> 404 ====================

    @Test
    void submit_otherDealerListing_returns404() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Submit: commercial type -> 422 ====================

    @Test
    void submit_commercialType_returns422() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "property_type",
                                "message", "Commercial submission not supported yet"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("property_type"))
                .andExpect(jsonPath("$.errors[0].message").value("Commercial submission not supported yet"));
    }

    // ==================== Submit: wrong status -> 400 ====================

    @Test
    void submit_wrongStatus_returns400() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot submit listing with status LIVE"));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot submit listing with status LIVE"));
    }

    // ==================== Submit: multiple errors -> 422 with all ====================

    @Test
    void submit_multipleErrors_returnsAllErrors() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "price", "message", "Price must be greater than 0"),
                        Map.of("field", "address_confirmed",
                                "message", "Address must be confirmed before submission"),
                        Map.of("field", "images",
                                "message", "At least 3 images required (found 0)"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors.length()").value(3))
                .andExpect(jsonPath("$.errors[0].field").value("price"))
                .andExpect(jsonPath("$.errors[1].field").value("address_confirmed"))
                .andExpect(jsonPath("$.errors[2].field").value("images"));
    }

    // ==================== PR-S7-5a: updateListing tests ====================

    @Test
    void updateListing_draftListing_returns200() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Draft Plot",
                "Manipal", new BigDecimal("5000000"), "Updated draft");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Draft Plot","locality":"Manipal","price":5000000}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void updateListing_rejectedListing_returns200() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "REJECTED", "house", "Fixed House",
                "Udupi", new BigDecimal("8000000"), "Fixed after rejection");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Fixed House","price":8000000}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    void updateListing_wrongOwner_returns403() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingOwnershipException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Someone else's listing"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different dealer"));
    }

    @Test
    void updateListing_pendingReviewStatus_returns409() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot update listing with status PENDING_REVIEW"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"New title"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot update listing with status PENDING_REVIEW"));
    }

    @Test
    void updateListing_liveListing_returns409() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new ListingService.ListingStatusException(
                        "Cannot update listing with status LIVE"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"New title"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot update listing with status LIVE"));
    }

    @Test
    void updateListing_listingNotFound_returns404() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any()))
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

    // ==================== PR-9.3: imageCount in ListingResponse ====================

    @Test
    void create_responseIncludesImageCount() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingService.createDraft(any(), any(), any(), any(), any(), any()))
                .thenReturn(saved);
        when(listingImageRepository.countByListingId(LISTING_ID)).thenReturn(2L);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test plot","locality":"Manipal",
                                 "price":5000000,"description":"Nice plot"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.imageCount").value(2));
    }

    @Test
    void mine_responseIncludesImageCount() throws Exception {
        when(listingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingService.getListingsByOwner(eq(DEALER_ID), any(Pageable.class))).thenReturn(page);
        when(listingImageRepository.countByListingId(LISTING_ID)).thenReturn(4L);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].imageCount").value(4));
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
