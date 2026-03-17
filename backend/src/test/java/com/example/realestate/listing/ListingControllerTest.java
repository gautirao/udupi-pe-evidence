package com.example.realestate.listing;

import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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
import java.time.LocalDate;
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
import org.mockito.invocation.InvocationOnMock;

/**
 * WebMvcTest for ListingController (broker CRUD endpoints).
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks ListingService.
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
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

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingService, listingRepository, listingImageRepository, listingResponseMapper, userRoleService);
        // Default stub: no images; individual tests override when imageCount matters.
        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());
        // Delegate mapper to a real-ish implementation so existing response-field assertions keep working.
        when(listingResponseMapper.toResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            int imageCount = (int) listingImageRepository.countByListingId(l.getId());
            String firstImageUrl = listingImageRepository
                    .findByListingIdOrderByPositionAsc(l.getId())
                    .stream().findFirst().map(ListingImage::getUrl).orElse(null);
            boolean reraValid = l.getReraNumber() != null
                    && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();
            int daysOnMarket = l.getFirstPublishedAt() != null
                    ? (int) java.time.temporal.ChronoUnit.DAYS.between(
                            l.getFirstPublishedAt().toLocalDate(), java.time.LocalDate.now())
                    : (l.getCreatedAt() != null
                            ? (int) java.time.temporal.ChronoUnit.DAYS.between(
                                    l.getCreatedAt().toLocalDate(), java.time.LocalDate.now())
                            : 0);
            java.time.OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                    ? l.getLastUpdatedAt() : l.getUpdatedAt();
            return new ListingController.ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), l.getDescription(),
                    l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                    l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                    l.getLatitude(), l.getLongitude(),
                    l.isAddressConfirmed(), l.getRejectionReason(),
                    l.getCreatedAt(), l.getUpdatedAt(),
                    imageCount, firstImageUrl, l.getVideoUrl(),
                    l.getReraNumber(), l.getListingPurpose(),
                    l.getCarpetArea(), l.getCarpetAreaUnit(),
                    l.getFloorNumber(), l.getTotalFloors(),
                    l.getFurnishingStatus(), l.getWashrooms(), l.getParkingCount(),
                    l.getRoadFrontageFt(), l.getCommercialUsage(), l.getNumberOfUnits(),
                    l.getMonthlyRent(), l.getSecurityDepositMonths(), l.getLockInMonths(),
                    l.getSellerType(), daysOnMarket, false, lastUpdatedAt,
                    l.getFirstPublishedAt(), l.getPossessionStatus(),
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid);
        });
    }

    // ==================== Test 1: POST creates draft -> 201 ====================

    @Test
    void create_withDealerRole_returns201WithIdAndStatus() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingService.createDraft(eq(DEALER_ID), eq("land"), eq("Test plot"),
                eq("Manipal"), eq(new BigDecimal("5000000")), eq("Nice plot"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("broker")))
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
                "Manipal", new BigDecimal("5000000"), "Nice plot",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "broker");
    }

    // ==================== Test 2: GET /mine -> 200, array ====================

    @Test
    void mine_withDealerRole_returns200WithArray() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

        verify(listingService).getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class));
    }

    // ==================== Test 3: PUT -> 200 ====================

    @Test
    void update_withDealerRole_returns200() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Updated title",
                "Manipal", new BigDecimal("6000000"), "Updated desc");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                eq("land"), eq("Updated title"), eq("Manipal"),
                eq(new BigDecimal("6000000")), eq("Updated desc"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(false), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull()))
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
                null, null, null, null, null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null);
    }

    // ==================== Test 4: DELETE -> 204 ====================

    @Test
    void delete_withDealerRole_returns204() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

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

    // ==================== Test 6: JWT with non-broker role -> 403 ====================

    @Test
    void create_withViewerRole_returnsForbidden() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("viewer"));

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test","locality":"X",
                                 "price":100,"description":"d"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, user, or admin role"));

        verify(listingService, never()).createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any());
    }

    // ==================== Test 7: PUT -> not found -> 404 ====================

    @Test
    void update_listingNotFound_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingService.ListingValidationException(List.of(
                        Map.of("field", "address_confirmed",
                                "message", "Address must be confirmed before submission"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("address_confirmed"));
    }

    // ==================== Submit: other broker's listing -> 404 ====================

    @Test
    void submit_otherDealerListing_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Draft Plot",
                "Manipal", new BigDecimal("5000000"), "Updated draft");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "REJECTED", "house", "Fixed House",
                "Udupi", new BigDecimal("8000000"), "Fixed after rejection");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
                .thenThrow(new ListingService.ListingOwnershipException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Someone else's listing"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void updateListing_pendingReviewStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingService.createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any()))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class))).thenReturn(page);
        when(listingImageRepository.countByListingId(LISTING_ID)).thenReturn(4L);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].imageCount").value(4));
    }

    // ==================== RE-72: status filter on /mine ====================

    @Test
    void mine_withStatusFilter_passesStatusToService() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingService.getListingsByOwner(eq(DEALER_ID), eq("DRAFT"), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/listings/mine?status=DRAFT")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

        verify(listingService).getListingsByOwner(eq(DEALER_ID), eq("DRAFT"), any(Pageable.class));
    }

    @Test
    void mine_withoutStatusFilter_passesNullStatusToService() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Page<Listing> page = new PageImpl<>(List.of());
        when(listingService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk());

        verify(listingService).getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class));
    }

    // ==================== RE-32: videoUrl in update ====================

    @Test
    void update_withVideoUrl_responseIncludesVideoUrl() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        updated.setVideoUrl("https://www.youtube.com/watch?v=abc123");
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("https://www.youtube.com/watch?v=abc123"), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"videoUrl":"https://www.youtube.com/watch?v=abc123","applyVideoUrl":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.videoUrl").value("https://www.youtube.com/watch?v=abc123"));

        verify(listingService).updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("https://www.youtube.com/watch?v=abc123"), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any());
    }

    @Test
    void update_withBlankVideoUrl_responseHasNullVideoUrl() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        // videoUrl is null — blank input normalised to null by the controller; applyVideoUrl=true clears it.
        when(listingService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                isNull(), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"videoUrl":"","applyVideoUrl":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.videoUrl").isEmpty());

        verify(listingService).updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                isNull(), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any());
    }

    // ==================== RE-99: RERA & docs readiness fields ====================

    @Test
    void get_withValidReraNumber_reraValidIsTrue() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing l = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Manipal", new BigDecimal("5000000"), "Desc");
        l.setCreatedBy(DEALER_ID);
        l.setReraNumber("PRM/KA/2023/0042");
        when(listingRepository.findById(LISTING_ID)).thenReturn(java.util.Optional.of(l));

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reraValid").value(true));
    }

    @Test
    void get_withMalformedReraNumber_reraValidIsFalse() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing l = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Manipal", new BigDecimal("5000000"), "Desc");
        l.setCreatedBy(DEALER_ID);
        l.setReraNumber("INVALID-RERA");
        when(listingRepository.findById(LISTING_ID)).thenReturn(java.util.Optional.of(l));

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reraValid").value(false));
    }

    @Test
    void get_withReraAndPossessionFields_responseIncludesAllFields() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing l = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Manipal", new BigDecimal("5000000"), "Desc");
        l.setCreatedBy(DEALER_ID);
        l.setReraNumber("PRM/KA/2023/0042");
        l.setPossessionStatus("under_construction");
        l.setExpectedPossessionDate(LocalDate.of(2026, 12, 31));
        l.setApprovalsDeclared("{\"building_plan\":true,\"occupancy_certificate\":false,\"local_authority_approval\":true}");
        when(listingRepository.findById(LISTING_ID)).thenReturn(java.util.Optional.of(l));

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reraValid").value(true))
                .andExpect(jsonPath("$.possessionStatus").value("under_construction"))
                .andExpect(jsonPath("$.expectedPossessionDate").value("2026-12-31"))
                .andExpect(jsonPath("$.approvalsDeclared").value(
                        "{\"building_plan\":true,\"occupancy_certificate\":false,\"local_authority_approval\":true}"));
    }

    // ==================== RE-75: GET /mine/stats ====================

    @Test
    void stats_withDealerRole_returnsCorrectCounts() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.getListingStats(DEALER_ID))
                .thenReturn(new ListingController.ListingStatsResponse(2, 1, 3, 1, 7));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCount").value(2))
                .andExpect(jsonPath("$.pendingReviewCount").value(1))
                .andExpect(jsonPath("$.liveCount").value(3))
                .andExpect(jsonPath("$.rejectedCount").value(1))
                .andExpect(jsonPath("$.totalCount").value(7));

        verify(listingService).getListingStats(DEALER_ID);
    }

    @Test
    void stats_withNoListings_returnsAllZeros() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingService.getListingStats(DEALER_ID))
                .thenReturn(new ListingController.ListingStatsResponse(0, 0, 0, 0, 0));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCount").value(0))
                .andExpect(jsonPath("$.pendingReviewCount").value(0))
                .andExpect(jsonPath("$.liveCount").value(0))
                .andExpect(jsonPath("$.rejectedCount").value(0))
                .andExpect(jsonPath("$.totalCount").value(0));
    }

    @Test
    void stats_withViewerRole_returnsForbidden() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("viewer"));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, user, or admin role"));

        verify(listingService, never()).getListingStats(any());
    }

    @Test
    void stats_withAdminRole_returnsOk() throws Exception {
        UUID adminId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        when(userRoleService.getUserRole(adminId)).thenReturn(Optional.of("admin"));
        when(listingService.getListingStats(adminId))
                .thenReturn(new ListingController.ListingStatsResponse(0, 0, 0, 0, 0));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(adminId.toString()))))
                .andExpect(status().isOk());

        verify(listingService).getListingStats(adminId);
    }

    // ==================== RE-86: Owner seller type tests ====================

    @Test
    void create_withUserRole_setsSellerTypeOwner() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("user"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "My plot",
                "Manipal", new BigDecimal("3000000"), "Owner listing");
        saved.setSellerType("owner");
        when(listingService.createDraft(eq(DEALER_ID), eq("land"), eq("My plot"),
                eq("Manipal"), eq(new BigDecimal("3000000")), eq("Owner listing"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("owner")))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"My plot","locality":"Manipal",
                                 "price":3000000,"description":"Owner listing"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellerType").value("owner"));

        verify(listingService).createDraft(DEALER_ID, "land", "My plot",
                "Manipal", new BigDecimal("3000000"), "Owner listing",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "owner");
    }

    @Test
    void create_withUserRole_atLimit_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("user"));
        when(listingService.createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("owner")))
                .thenThrow(new ListingService.OwnerListingLimitException(
                        "Owner accounts are limited to 3 active listings"));

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"4th listing","locality":"Udupi",
                                 "price":1000000,"description":"Over limit"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Owner accounts are limited to 3 active listings"));
    }

    @Test
    void create_withAdminRole_setsSellerTypeBroker() throws Exception {
        UUID adminId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        when(userRoleService.getUserRole(adminId)).thenReturn(Optional.of("admin"));

        Listing saved = buildListing(LISTING_ID, "DRAFT", "house", "Admin house",
                "Udupi", new BigDecimal("7000000"), "Admin-created");
        saved.setSellerType("broker");
        when(listingService.createDraft(eq(adminId), eq("house"), eq("Admin house"),
                eq("Udupi"), eq(new BigDecimal("7000000")), eq("Admin-created"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("broker")))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(adminId.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Admin house","locality":"Udupi",
                                 "price":7000000,"description":"Admin-created"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellerType").value("broker"));

        verify(listingService).createDraft(adminId, "house", "Admin house",
                "Udupi", new BigDecimal("7000000"), "Admin-created",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "broker");
    }

    // ==================== Helper ====================

    private Listing buildListing(UUID id, String status, String propertyType, String title,
                                  String locality, BigDecimal price, String description) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(42);
        l.setStatus(status);
        l.setPropertyType(propertyType);
        l.setTitle(title);
        l.setLocality(locality);
        l.setPrice(price);
        l.setDescription(description);
        l.setLandAreaUnit("sqft");
        l.setBuiltAreaUnit("sqft");
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }
}
