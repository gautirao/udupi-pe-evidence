package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.exception.OwnerListingLimitException;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
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

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for ListingController (broker CRUD endpoints).
 * Uses jwt() post-processor to inject JwtAuthenticationToken.
 * Mocks ListingCrudService and ListingWorkflowService directly.
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        com.example.realestate.exception.GlobalExceptionHandler.class})
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
    private ListingCrudService listingCrudService;

    @MockitoBean
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingImageRepository listingImageRepository;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private com.example.realestate.listing.crud.BrokerDashboardService brokerDashboardService;

    @BeforeEach
    void setUp() {
        reset(listingCrudService, listingWorkflowService, listingImageRepository,
                listingResponseMapper);
        // Default stub: PUT /{id} falls back to this when the request omits propertyType, so the
        // effective-type resolution (#1626) has an existing listing to resolve against. Individual
        // tests override with a more specific stub when the existing listing's type/fields matter.
        lenient().when(listingWorkflowService.findListingForCaller(any(), any(), anyBoolean()))
                .thenReturn(buildListing(LISTING_ID, "DRAFT", "house", "Existing title",
                        "Udupi", new BigDecimal("5000000"), "Existing desc"));
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
            return new ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), l.getPricePaise(), l.getDescription(),
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
                    l.getFirstPublishedAt(), l.getLastConfirmedAt(), l.getPossessionStatus(),
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid, 0,
                    l.getTrustTier(), null, l.getAreaKey(), java.util.List.of(),
                    null, null, null, null, null, null, null, null, null, l.getBoundaryGeoJson(), null,
                    l.getBathrooms(), l.getBalconies(), l.getFacing(), l.getAvailabilityTimeline(),
                    l.getSuperBuiltArea(), l.getSuperBuiltAreaUnit(), l.getPropertyAge(), l.getResidentialWaterSource(),
                    l.getParking2wCount(), l.getParking4wCount(), l.getRoadWidthFt(), l.getPlotDimensions(),
                    l.getConversionStatus(), l.getKhataNumber(), l.getPropertyTaxPid(), l.getApprovingAuthority(),
                    l.getProjectName(), l.getBuilderName(), l.getMaintenancePaise(),
                    l.getHasLift(), l.getHasPowerBackup(), l.getIsGated(), l.getHasGarden(), l.getHasTerrace(),
                    l.getHasCompound(), l.getHasServantRoom(), l.getIsCornerPlot(), l.getHasBoundaryWall(),
                    l.getIsGatedLayout(), l.getHasWaterConnection(), l.getHasElectricityConnection(), l.getHasDrainage(),
                    l.getPriceNegotiable(), l.getRentNegotiable(), l.getPetsAllowed(), l.getMaintenanceIncluded(),
                    java.util.List.of(), java.util.List.of(), java.util.List.of(),
                    l.getCommercialSubtype(), l.getFloorChoice(), l.getFloorMode(), l.getHubType(),
                    l.getWashroomsPublic(), l.getWashroomsPrivate(),
                    l.getParkingPublicCount(), l.getParkingPrivateCount(),
                    l.getOfficeSeats(), l.getOfficeCabins(), l.getOfficeMeetingRooms(),
                    l.getOccupancyStatus(), l.getPowerLoadKva(),
                    l.getWarehouseClearHeightFt(), l.getWarehouseLoadingBays(),
                    l.getWarehouseTruckAccess(), l.getWarehouseFlooring(),
                    l.getCommercialZoning(), l.getCommercialOwnership(), l.getCommercialApprovals(),
                    l.getExpectedRentalYieldPct(), l.getCurrentMonthlyIncomePaise(),
                    l.getLeaseTermMonths(), l.getLeaseEscalationPct(),
                    l.getCommercialFurnishingStatus(), l.getCommercialAvailability(), l.getCommercialAreaUnit(),
                    java.util.List.of(), java.util.List.of());
        });
        // Batch variant: delegate each listing through the single-listing stub.
        when(listingResponseMapper.toResponseList(any())).thenAnswer(inv -> {
            java.util.List<Listing> listings = inv.getArgument(0);
            return listings.stream().map(l -> listingResponseMapper.toResponse(l)).toList();
        });
    }

    // ==================== Test 1: POST creates draft -> 201 ====================

    @Test
    void create_withDealerRole_returns201WithIdAndStatus() throws Exception {

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingCrudService.createDraft(eq(DEALER_ID), eq("land"), eq("Test plot"),
                eq("Manipal"), eq(new BigDecimal("5000000")), eq("Nice plot"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("broker"), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(),
                any(), any()))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test plot","locality":"Manipal",
                                 "price":5000000,"description":"Nice plot"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingCrudService).createDraft(DEALER_ID, "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "broker", null, null, null, null, null, null,
                null, null, null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
    }

    // ==================== Test 2: GET /mine -> 200, array ====================

    @Test
    void mine_withDealerRole_returns200WithArray() throws Exception {

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingCrudService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class))).thenReturn(page);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

        verify(listingCrudService).getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class));
    }

    // ==================== Test 3: PUT -> 200 ====================

    @Test
    void update_withDealerRole_returns200() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Updated title",
                "Manipal", new BigDecimal("6000000"), "Updated desc");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                eq("land"), eq("Updated title"), eq("Manipal"),
                eq(new BigDecimal("6000000")), eq("Updated desc"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(false), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Updated title","locality":"Manipal",
                                 "price":6000000,"description":"Updated desc"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.title").value("Updated title"));

        verify(listingCrudService).updateListing(LISTING_ID, DEALER_ID, false,
                "land", "Updated title", "Manipal",
                new BigDecimal("6000000"), "Updated desc",
                null, null, null, null, null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
    }

    // ==================== Test 4: DELETE -> 204 ====================

    @Test
    void delete_withDealerRole_returns204() throws Exception {

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNoContent());

        verify(listingCrudService).deleteListing(LISTING_ID, DEALER_ID, false);
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

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test","locality":"X",
                                 "price":100,"description":"d"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, user, or admin role"));

        verify(listingCrudService, never()).createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any());
    }

    // ==================== Test 7: PUT -> not found -> 404 ====================

    @Test
    void update_listingNotFound_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingStatusException(
                        "Cannot update listing with status LIVE"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        doThrow(new ListingNotFoundException(LISTING_ID))
                .when(listingCrudService).deleteListing(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 10: DELETE -> wrong status -> 409 ====================

    @Test
    void delete_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingStatusException(
                "Cannot delete listing with status LIVE"))
                .when(listingCrudService).deleteListing(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(delete("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot delete listing with status LIVE"));
    }

    // ==================== Submit: happy path -> 200 ====================

    @Test
    void submit_happyPath_returns200WithPendingReview() throws Exception {

        Listing submitted = buildListing(LISTING_ID, "PENDING_REVIEW", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        submitted.setSubmittedAt(OffsetDateTime.now());
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false)).thenReturn(submitted);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));

        verify(listingWorkflowService).submitListing(LISTING_ID, DEALER_ID, false);
    }

    // ==================== Submit: REJECTED -> PENDING_REVIEW ====================

    @Test
    void submit_rejectedListing_returns200() throws Exception {

        Listing submitted = buildListing(LISTING_ID, "PENDING_REVIEW", "house", "House",
                "Udupi", new BigDecimal("8000000"), "Resubmitted");
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false)).thenReturn(submitted);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));
    }

    // ==================== Submit: missing land_area -> 422 ====================

    @Test
    void submit_missingLandArea_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "land_area",
                                "message", "Land area is required for land listings"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("land_area"));
    }

    // ==================== Submit: missing bedrooms -> 422 ====================

    @Test
    void submit_missingBedrooms_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "bedrooms",
                                "message", "Bedrooms is required for apartment listings"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("bedrooms"));
    }

    // ==================== Submit: too few images -> 422 ====================

    @Test
    void submit_tooFewImages_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "images",
                                "message", "At least 3 images required (found 1)"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("images"))
                .andExpect(jsonPath("$.errors[0].message").value("At least 3 images required (found 1)"));
    }

    // ==================== Submit: address not confirmed -> 422 ====================

    @Test
    void submit_addressNotConfirmed_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "address_confirmed",
                                "message", "Address must be confirmed before submission"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("address_confirmed"));
    }

    // ==================== Submit: other broker's listing -> 404 ====================

    @Test
    void submit_otherDealerListing_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Submit: commercial type -> 422 ====================

    @Test
    void submit_commercialType_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "property_type",
                                "message", "Commercial submission not supported yet"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].field").value("property_type"))
                .andExpect(jsonPath("$.errors[0].message").value("Commercial submission not supported yet"));
    }

    // ==================== Submit: wrong status -> 409 ====================

    @Test
    void submit_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingStatusException(
                        "Cannot submit listing with status LIVE"));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot submit listing with status LIVE"));
    }

    // ==================== Submit: multiple errors -> 422 with all ====================

    @Test
    void submit_multipleErrors_returnsAllErrors() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.submitListing(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("field", "price", "message", "Price must be greater than 0"),
                        Map.of("field", "address_confirmed",
                                "message", "Address must be confirmed before submission"),
                        Map.of("field", "images",
                                "message", "At least 3 images required (found 0)"))));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/submit")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors.length()").value(3))
                .andExpect(jsonPath("$.errors[0].field").value("price"))
                .andExpect(jsonPath("$.errors[1].field").value("address_confirmed"))
                .andExpect(jsonPath("$.errors[2].field").value("images"));
    }

    // ==================== PR-S7-5a: updateListing tests ====================

    @Test
    void updateListing_draftListing_returns200() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Draft Plot",
                "Manipal", new BigDecimal("5000000"), "Updated draft");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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

        Listing updated = buildListing(LISTING_ID, "REJECTED", "house", "Fixed House",
                "Udupi", new BigDecimal("8000000"), "Fixed after rejection");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingStatusException(
                        "Cannot update listing with status PENDING_REVIEW"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingStatusException(
                        "Cannot update listing with status LIVE"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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

        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingCrudService.createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any()))
                .thenReturn(saved);
        when(listingImageRepository.countByListingId(LISTING_ID)).thenReturn(2L);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
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

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingCrudService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class))).thenReturn(page);
        when(listingImageRepository.countByListingId(LISTING_ID)).thenReturn(4L);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].imageCount").value(4));
    }

    // ==================== RE-72: status filter on /mine ====================

    @Test
    void mine_withStatusFilter_passesStatusToService() throws Exception {

        Listing listing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("10000000"), "A house");
        Page<Listing> page = new PageImpl<>(List.of(listing));
        when(listingCrudService.getListingsByOwner(eq(DEALER_ID), eq("DRAFT"), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/listings/mine?status=DRAFT")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("DRAFT"));

        verify(listingCrudService).getListingsByOwner(eq(DEALER_ID), eq("DRAFT"), any(Pageable.class));
    }

    @Test
    void mine_withoutStatusFilter_passesNullStatusToService() throws Exception {

        Page<Listing> page = new PageImpl<>(List.of());
        when(listingCrudService.getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/listings/mine")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk());

        verify(listingCrudService).getListingsByOwner(eq(DEALER_ID), isNull(), any(Pageable.class));
    }

    // ==================== RE-32: videoUrl in update ====================

    @Test
    void update_withVideoUrl_responseIncludesVideoUrl() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        updated.setVideoUrl("https://www.youtube.com/watch?v=abc123");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("https://www.youtube.com/watch?v=abc123"), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"videoUrl":"https://www.youtube.com/watch?v=abc123","applyVideoUrl":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.videoUrl").value("https://www.youtube.com/watch?v=abc123"));

        verify(listingCrudService).updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("https://www.youtube.com/watch?v=abc123"), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any());
    }

    @Test
    void update_withBlankVideoUrl_responseHasNullVideoUrl() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        // videoUrl is null — blank input normalised to null by the controller; applyVideoUrl=true clears it.
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                isNull(), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"videoUrl":"","applyVideoUrl":true}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.videoUrl").isEmpty());

        verify(listingCrudService).updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                isNull(), eq(true), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any());
    }

    // ==================== RE-99: RERA & docs readiness fields ====================

    @Test
    void get_withValidReraNumber_reraValidIsTrue() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing l = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Manipal", new BigDecimal("5000000"), "Desc");
        l.setCreatedBy(DEALER_ID);
        l.setReraNumber("PRM/KA/2023/0042");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false)).thenReturn(l);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
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
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false)).thenReturn(l);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
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
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false)).thenReturn(l);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
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
        when(listingCrudService.getListingStats(DEALER_ID))
                .thenReturn(new ListingStatsResponse(2, 1, 3, 1, 7));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCount").value(2))
                .andExpect(jsonPath("$.pendingReviewCount").value(1))
                .andExpect(jsonPath("$.liveCount").value(3))
                .andExpect(jsonPath("$.rejectedCount").value(1))
                .andExpect(jsonPath("$.totalCount").value(7));

        verify(listingCrudService).getListingStats(DEALER_ID);
    }

    @Test
    void stats_withNoListings_returnsAllZeros() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingCrudService.getListingStats(DEALER_ID))
                .thenReturn(new ListingStatsResponse(0, 0, 0, 0, 0));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCount").value(0))
                .andExpect(jsonPath("$.pendingReviewCount").value(0))
                .andExpect(jsonPath("$.liveCount").value(0))
                .andExpect(jsonPath("$.rejectedCount").value(0))
                .andExpect(jsonPath("$.totalCount").value(0));
    }

    @Test
    void stats_withViewerRole_returnsForbidden() throws Exception {

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, user, or admin role"));

        verify(listingCrudService, never()).getListingStats(any());
    }

    @Test
    void stats_withAdminRole_returnsOk() throws Exception {
        UUID adminId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        when(listingCrudService.getListingStats(adminId))
                .thenReturn(new ListingStatsResponse(0, 0, 0, 0, 0));

        mockMvc.perform(get("/api/listings/mine/stats")
                        .with(jwt().jwt(j -> j.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());

        verify(listingCrudService).getListingStats(adminId);
    }

    // ==================== RE-86: Owner seller type tests ====================

    @Test
    void create_withUserRole_setsSellerTypeOwner() throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "My plot",
                "Manipal", new BigDecimal("3000000"), "Owner listing");
        saved.setSellerType("owner");
        when(listingCrudService.createDraft(eq(DEALER_ID), eq("land"), eq("My plot"),
                eq("Manipal"), eq(new BigDecimal("3000000")), eq("Owner listing"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("owner"), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                any(), any()))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"My plot","locality":"Manipal",
                                 "price":3000000,"description":"Owner listing"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellerType").value("owner"));

        verify(listingCrudService).createDraft(DEALER_ID, "land", "My plot",
                "Manipal", new BigDecimal("3000000"), "Owner listing",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "owner", null, null, null, null, null, null, null, null, null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
    }

    @Test
    void create_withUserRole_atLimit_returns409() throws Exception {
        when(listingCrudService.createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                eq("owner"), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any()))
                .thenThrow(new OwnerListingLimitException(
                        "Owner accounts are limited to 3 active listings"));

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER")))
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
        Listing saved = buildListing(LISTING_ID, "DRAFT", "house", "Admin house",
                "Udupi", new BigDecimal("7000000"), "Admin-created");
        saved.setSellerType("broker");
        when(listingCrudService.createDraft(eq(adminId), eq("house"), eq("Admin house"),
                eq("Udupi"), eq(new BigDecimal("7000000")), eq("Admin-created"),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                eq("broker"), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                any(), any()))
                .thenReturn(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Admin house","locality":"Udupi",
                                 "price":7000000,"description":"Admin-created"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sellerType").value("broker"));

        verify(listingCrudService).createDraft(adminId, "house", "Admin house",
                "Udupi", new BigDecimal("7000000"), "Admin-created",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                "broker", null, null, null, null, null, null, null, null, null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
    }

    // ==================== RE-135: Archive endpoint tests ====================

    @Test
    void archive_happyPath_returns200WithArchivedStatus() throws Exception {

        Listing archived = buildListing(LISTING_ID, "ARCHIVED", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Nice plot");
        when(listingWorkflowService.archiveListing(LISTING_ID, DEALER_ID, null)).thenReturn(archived);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        verify(listingWorkflowService).archiveListing(LISTING_ID, DEALER_ID, null);
    }

    @Test
    void archive_notOwner_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).archiveListing(LISTING_ID, DEALER_ID, null);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void archive_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingStatusException("Cannot archive listing with status PENDING_REVIEW"))
                .when(listingWorkflowService).archiveListing(LISTING_ID, DEALER_ID, null);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot archive listing with status PENDING_REVIEW"));
    }

    @Test
    void archive_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingNotFoundException(LISTING_ID))
                .when(listingWorkflowService).archiveListing(LISTING_ID, DEALER_ID, null);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/archive")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== RE-135: Reopen (REJECTED→DRAFT) endpoint tests ====================

    @Test
    void reopen_happyPath_returns200WithDraftStatus() throws Exception {

        Listing reopened = buildListing(LISTING_ID, "DRAFT", "house", "House",
                "Udupi", new BigDecimal("8000000"), "Reopened");
        when(listingWorkflowService.reopenRejectedListing(LISTING_ID, DEALER_ID)).thenReturn(reopened);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).reopenRejectedListing(LISTING_ID, DEALER_ID);
    }

    @Test
    void reopen_notOwner_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).reopenRejectedListing(LISTING_ID, DEALER_ID);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void reopen_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingStatusException("Cannot reopen listing with status LIVE"))
                .when(listingWorkflowService).reopenRejectedListing(LISTING_ID, DEALER_ID);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot reopen listing with status LIVE"));
    }

    // ==================== RE-135: Reopen-as-draft (ARCHIVED→DRAFT) endpoint tests ====================

    @Test
    void reopenAsDraft_happyPath_returns200WithDraftStatus() throws Exception {

        Listing reopened = buildListing(LISTING_ID, "DRAFT", "land", "Plot",
                "Manipal", new BigDecimal("5000000"), "Reopened from archive");
        when(listingWorkflowService.reopenArchivedListingAsDraft(LISTING_ID, DEALER_ID)).thenReturn(reopened);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen-as-draft")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("DRAFT"));

        verify(listingWorkflowService).reopenArchivedListingAsDraft(LISTING_ID, DEALER_ID);
    }

    @Test
    void reopenAsDraft_notOwner_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).reopenArchivedListingAsDraft(LISTING_ID, DEALER_ID);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen-as-draft")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void reopenAsDraft_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingStatusException("Cannot reopen listing with status LIVE"))
                .when(listingWorkflowService).reopenArchivedListingAsDraft(LISTING_ID, DEALER_ID);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/reopen-as-draft")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot reopen listing with status LIVE"));
    }

    // ==================== RE-135: Withdraw (existing PUT, missing tests) ====================

    @Test
    void withdraw_happyPath_returns204() throws Exception {

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/withdraw")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNoContent());

        verify(listingWorkflowService).withdrawListingFromReview(LISTING_ID, DEALER_ID);
    }

    @Test
    void withdraw_notOwner_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).withdrawListingFromReview(LISTING_ID, DEALER_ID);

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/withdraw")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void withdraw_wrongStatus_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingStatusException("Cannot withdraw listing with status DRAFT"))
                .when(listingWorkflowService).withdrawListingFromReview(LISTING_ID, DEALER_ID);

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/withdraw")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Cannot withdraw listing with status DRAFT"));
    }

    @Test
    void withdraw_submissionAlreadyActioned_returns409() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingLifecycleException(
                ListingErrorCode.SUBMISSION_ALREADY_ACTIONED,
                "Admin has already acted on this submission — withdrawal not allowed"))
                .when(listingWorkflowService).withdrawListingFromReview(LISTING_ID, DEALER_ID);

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/withdraw")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SUBMISSION_ALREADY_ACTIONED"))
                .andExpect(jsonPath("$.message").value(
                        "Admin has already acted on this submission — withdrawal not allowed"));
    }

    // ==================== RE-135: Restore (existing PUT, missing tests) ====================

    @Test
    void restore_happyPath_returns200WithLiveStatus() throws Exception {

        Listing restored = buildListing(LISTING_ID, "LIVE", "house", "House",
                "Udupi", new BigDecimal("8000000"), "Restored");
        when(listingWorkflowService.restoreArchivedListing(LISTING_ID, DEALER_ID)).thenReturn(restored);

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"));

        verify(listingWorkflowService).restoreArchivedListing(LISTING_ID, DEALER_ID);
    }

    @Test
    void restore_notEligible_returns422() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.restoreArchivedListing(LISTING_ID, DEALER_ID))
                .thenThrow(new ListingLifecycleException(
                        ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                        "Listing was never published — use reopen-to-draft instead"));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("FAST_RESTORE_NOT_ELIGIBLE"))
                .andExpect(jsonPath("$.message").value(
                        "Listing was never published — use reopen-to-draft instead"));
    }

    @Test
    void restore_notOwner_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.restoreArchivedListing(LISTING_ID, DEALER_ID))
                .thenThrow(new ListingOwnershipException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void restore_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingWorkflowService.restoreArchivedListing(LISTING_ID, DEALER_ID))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/restore")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== getById tests (RE-166) ====================

    @Test
    void getById_scrapedListing_dealerCaller_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).findListingForCaller(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void getById_scrapedListing_adminCaller_returns200() throws Exception {
        UUID adminId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        Listing scraped = buildListing(LISTING_ID, "LIVE", "house", "Scraped House",
                "Udupi", new BigDecimal("8000000"), "Scraped listing");
        scraped.setCreatedBy(null); // SCRAPED: no owner
        when(listingWorkflowService.findListingForCaller(LISTING_ID, adminId, true)).thenReturn(scraped);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()));
    }

    @Test
    void getById_brokerOwnsListing_returns200() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing ownedListing = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("5000000"), "Mine");
        ownedListing.setCreatedBy(DEALER_ID);
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false)).thenReturn(ownedListing);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()));
    }

    @Test
    void getById_differentBroker_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingOwnershipException(LISTING_ID))
                .when(listingWorkflowService).findListingForCaller(LISTING_ID, DEALER_ID, false);

        mockMvc.perform(get("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Listing belongs to a different broker"));
    }

    @Test
    void getById_notFound_returns404() throws Exception {
        UUID unknownId = UUID.fromString("00000000-0000-0000-0000-000000000099");
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        doThrow(new ListingNotFoundException(unknownId))
                .when(listingWorkflowService).findListingForCaller(unknownId, DEALER_ID, false);

        mockMvc.perform(get("/api/listings/" + unknownId)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== RE-172: @Pattern validation on reraNumber ====================

    @Test
    void updateListing_invalidReraNumber_returns422() throws Exception {

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reraNumber":"INVALID"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields[0].field").value("reraNumber"))
                .andExpect(jsonPath("$.fields[0].message").value("must match RERA format: ABC/DE/YYYY/NNNN"));

        verify(listingCrudService, never()).updateListing(any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any());
    }

    @Test
    void updateListing_validReraNumber_returns200() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "House",
                "Udupi", new BigDecimal("5000000"), "Desc");
        updated.setReraNumber("PRM/KA/2023/0042");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reraNumber":"PRM/KA/2023/0042"}
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void updateListing_nullReraNumber_returns200() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "House",
                "Udupi", new BigDecimal("5000000"), "Desc");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reraNumber":null}
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void updateListing_nearMissReraNumber_returns422() throws Exception {

        // 3 digits in last segment instead of 4 — structurally close but invalid
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reraNumber":"PRM/KA/2023/004"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields[0].field").value("reraNumber"));

        // lowercase letters — must also fail (character-class guard)
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reraNumber":"prm/ka/2023/0042"}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields[0].field").value("reraNumber"));

        verify(listingCrudService, never()).updateListing(any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any());
    }

    // ==================== #1366: Polygon boundary tests ====================

    @Test
    void updateListing_validAgriBoundary_returns200WithBoundary() throws Exception {

        String boundaryGeoJson = "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.1],[74.0,13.0]]]}";
        Listing updated = buildListing(LISTING_ID, "DRAFT", "agricultural_land", "Agri Plot",
                "Manipal", new BigDecimal("2000000"), "Farm land");
        updated.setBoundaryGeoJson(boundaryGeoJson);

        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyType\":\"agricultural_land\",\"boundary\":\"" +
                                boundaryGeoJson.replace("\"", "\\\"") + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boundary").isNotEmpty());
    }

    @Test
    void updateListing_nonAgriBoundary_returns422WithCode() throws Exception {

        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("error", "boundary is only accepted for agricultural_land listings",
                               "code", "BOUNDARY_NON_AGRI_TYPE"))));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyType\":\"house\",\"boundary\":\"{\\\"type\\\":\\\"Polygon\\\",\\\"coordinates\\\":[[]]}\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("BOUNDARY_NON_AGRI_TYPE"));
    }

    @Test
    void updateListing_unclosedRing_returns422WithCode() throws Exception {

        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenThrow(new ListingValidationException(List.of(
                        Map.of("error", "boundary ring is not closed: first and last coordinates must be equal",
                               "code", "BOUNDARY_NOT_CLOSED"))));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyType\":\"agricultural_land\",\"boundary\":\"{\\\"type\\\":\\\"Polygon\\\",\\\"coordinates\\\":[[[]]]}\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errors[0].code").value("BOUNDARY_NOT_CLOSED"));
    }

    @Test
    void updateListing_residentialWithoutBoundary_boundaryNullInResponse() throws Exception {

        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "My House",
                "Udupi", new BigDecimal("8000000"), "No boundary");
        // getBoundaryGeoJson() returns null by default (not set)

        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyType\":\"house\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boundary").doesNotExist());
    }

    // ==================== #2048: residential ownershipType family-scoping ====================

    /** Stubs createDraft to return {@code saved} regardless of arguments (all-any() matcher, 38 params). */
    private void stubCreateDraftReturns(Listing saved) {
        when(listingCrudService.createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any()))
                .thenReturn(saved);
    }

    /** Stubs updateListing to return {@code updated} regardless of arguments (all-any() matcher, 48 params). */
    private void stubUpdateListingReturns(Listing updated) {
        when(listingCrudService.updateListing(any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any()))
                .thenReturn(updated);
    }

    // ---- E1 (AC1 reproduction) + E5 matrix: residential accepted ownershipType values, CREATE ----

    @ParameterizedTest(name = "create residential ownershipType={0} -> 201")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "COOPERATIVE_SOCIETY", "LEASEHOLD", "POWER_OF_ATTORNEY"})
    void create_residentialValidOwnershipTypes_returns201(String ownershipType) throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "house", "Test house",
                "Udupi", new BigDecimal("5000000"), "Nice house");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Test house","locality":"Udupi",
                                 "price":5000000,"description":"Nice house","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()));
    }

    // ---- E5 matrix: residential accepted ownershipType values, UPDATE ----

    @ParameterizedTest(name = "update residential ownershipType={0} -> 200")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "COOPERATIVE_SOCIETY", "LEASEHOLD", "POWER_OF_ATTORNEY"})
    void update_residentialValidOwnershipTypes_returns200(String ownershipType) throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "Updated title",
                "Udupi", new BigDecimal("5000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isOk());
    }

    // ---- E3: PUT omitting ownershipType stays unaffected (legacy-data / null-skip safety path) ----

    @Test
    void update_residentialOwnershipTypeOmitted_returns200() throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "Updated title",
                "Udupi", new BigDecimal("5000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Updated title"}
                                """))
                .andExpect(status().isOk());
    }

    // ---- D1 deliberate narrowing: agri-only ownership values are now INVALID for residential ----

    @Test
    void create_residentialInheritedOwnership_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Test house","locality":"Udupi",
                                 "price":5000000,"description":"Nice house","ownershipType":"INHERITED"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'INHERITED'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"));

        verify(listingCrudService, never()).createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any());
    }

    // ---- Genuinely invalid value: unchanged error-body shape ({"error": "..."}, no new exception type) ----

    @Test
    void create_residentialGenuinelyInvalidOwnershipType_returns400UnchangedErrorShape() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Test house","locality":"Udupi",
                                 "price":5000000,"description":"Nice house","ownershipType":"BOGUS_VALUE"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'BOGUS_VALUE'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    // ---- E4: PUT error-precedence pinning (C3) ----

    @Test
    void update_residentialInvalidOwnershipType_propertyTypeSupplied_returns400BeforeLookup() throws Exception {
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","ownershipType":"INHERITED"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'INHERITED'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"));

        // Precedence pin: when propertyType IS supplied, family resolves directly from the request
        // and validateFamilyOwnershipType runs BEFORE any listing lookup — so an invalid value
        // short-circuits to 400 without ever checking whether the listing exists/is owned by caller.
        verify(listingWorkflowService, never()).findListingForCaller(any(), any(), anyBoolean());
    }

    @Test
    void update_residentialInvalidOwnershipType_propertyTypeOmitted_returns404BeforeValidation() throws Exception {
        // Override the lenient default stub: this listing does not exist / is not owned by caller.
        when(listingWorkflowService.findListingForCaller(eq(LISTING_ID), eq(DEALER_ID), eq(false)))
                .thenThrow(new ListingNotFoundException(LISTING_ID));

        // Precedence pin: when propertyType is OMITTED, the effective-type resolution fetches the
        // existing listing FIRST (to determine effectivePropertyType) — so a not-found/not-owned
        // listing throws 404 before validateFamilyOwnershipType is ever reached, regardless of how
        // invalid the supplied ownershipType is.
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownershipType":"INHERITED"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ---- E5 matrix: agricultural ownershipType unchanged (all 7 values accepted) ----

    @ParameterizedTest(name = "create agricultural ownershipType={0} -> 201")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "INHERITED", "PATTA", "SURVEY_SETTLEMENT", "KATHA", "REVENUE", "OTHER"})
    void create_agriculturalValidOwnershipTypes_returns201(String ownershipType) throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "agricultural_land", "Test farm",
                "Udupi", new BigDecimal("2000000"), "Nice farm");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"agricultural_land","title":"Test farm","locality":"Udupi",
                                 "price":2000000,"description":"Nice farm","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isCreated());
    }

    @Test
    void create_agriculturalCooperativeSocietyOwnership_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"agricultural_land","title":"Test farm","locality":"Udupi",
                                 "price":2000000,"description":"Nice farm","ownershipType":"COOPERATIVE_SOCIETY"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'COOPERATIVE_SOCIETY'. "
                                + "Allowed values: FREEHOLD, INHERITED, KATHA, OTHER, PATTA, REVENUE, SURVEY_SETTLEMENT"));
    }

    // ---- E5 matrix: PLOT behaviour UNCHANGED (still validated against the agri set) ----
    // COMMERCIAL is narrowed as of #2063 — see the "#2063: commercial ownershipType family-scoping"
    // block below. Its own equivalent defect is tracked separately as issue #2067 (hard out of
    // scope for #2063 — do not add a PLOT branch here).

    @Test
    void create_plotOwnershipType_agriValueAccepted_returns201() throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "land", "Test plot",
                "Udupi", new BigDecimal("3000000"), "Nice plot");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test plot","locality":"Udupi",
                                 "price":3000000,"description":"Nice plot","ownershipType":"KATHA"}
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void create_plotOwnershipType_residentialValueRejected_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"land","title":"Test plot","locality":"Udupi",
                                 "price":3000000,"description":"Nice plot","ownershipType":"LEASEHOLD"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'LEASEHOLD'. "
                                + "Allowed values: FREEHOLD, INHERITED, KATHA, OTHER, PATTA, REVENUE, SURVEY_SETTLEMENT"));
    }

    // ---- AC9: propertyType=other UNCHANGED — still validated against the agricultural set on
    //      both paths. No committed test covered 'other' ownershipType before #2067; authored here
    //      to close that gap. ----

    @Test
    void create_otherOwnershipType_agriValueAccepted_returns201() throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "other", "Test other plot",
                "Udupi", new BigDecimal("3000000"), "Nice plot");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"other","title":"Test other plot","locality":"Udupi",
                                 "price":3000000,"description":"Nice plot","ownershipType":"PATTA"}
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void create_otherOwnershipType_residentialValueRejected_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"other","title":"Test other plot","locality":"Udupi",
                                 "price":3000000,"description":"Nice plot","ownershipType":"LEASEHOLD"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'LEASEHOLD'. "
                                + "Allowed values: FREEHOLD, INHERITED, KATHA, OTHER, PATTA, REVENUE, SURVEY_SETTLEMENT"));
    }

    // ==================== #2067: residential_plot ownershipType family-scoping ====================
    //
    // resolveFamily buckets residential_plot, land, and other together as PropertyFamily.PLOT for
    // STRUCTURAL field validation (validateFamilyFields / validateResidentialFieldSet). But only
    // residential_plot's broker UI renders an ownershipType control, offering the same four values
    // as ordinary RESIDENTIAL. Pre-#2067, validateFamilyOwnershipType routed the ENTIRE PLOT bucket
    // through AgriFieldOptions.VALID_OWNERSHIP_TYPES, wrongly rejecting 3 of those 4 UI-offered
    // values (COOPERATIVE_SOCIETY / LEASEHOLD / POWER_OF_ATTORNEY) for residential_plot on both
    // create and update. #2067 narrows ONLY residential_plot within the PLOT arm to
    // ResidentialFieldOptions.VALID_RESIDENTIAL_OWNERSHIP (owner-ruled P1 scope) using rawPropertyType
    // as the smallest local discriminator — land and other are UNCHANGED, proven above (AC8/AC9) and
    // by the two pre-existing tests directly above this section.

    // ---- AC1-AC4 matrix: residential_plot accepted ownershipType values, CREATE ----

    @ParameterizedTest(name = "create residential_plot ownershipType={0} -> 201")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "COOPERATIVE_SOCIETY", "LEASEHOLD", "POWER_OF_ATTORNEY"})
    void create_residentialPlotValidOwnershipTypes_returns201(String ownershipType) throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "residential_plot", "Test residential plot",
                "Udupi", new BigDecimal("4000000"), "Nice plot");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","title":"Test residential plot","locality":"Udupi",
                                 "price":4000000,"description":"Nice plot","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()));
    }

    // ---- AC5 matrix: residential_plot accepted ownershipType values, UPDATE (propertyType supplied) ----

    @ParameterizedTest(name = "update residential_plot ownershipType={0} -> 200")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "COOPERATIVE_SOCIETY", "LEASEHOLD", "POWER_OF_ATTORNEY"})
    void update_residentialPlotValidOwnershipTypes_returns200(String ownershipType) throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "residential_plot", "Updated title",
                "Udupi", new BigDecimal("4000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isOk());
    }

    // ---- AC13: PUT omitting ownershipType stays unaffected (legacy-data / null-skip safety path) ----

    @Test
    void update_residentialPlotOwnershipTypeOmitted_returns200() throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "residential_plot", "Updated title",
                "Udupi", new BigDecimal("4000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","title":"Updated title"}
                                """))
                .andExpect(status().isOk());
    }

    // ---- AC14 (R2 regression guard): PUT omitting propertyType on an EXISTING residential_plot
    //      listing must resolve the EFFECTIVE property type from the stored listing, not misroute
    //      to the agricultural set. Proves the discriminator reads effectivePropertyType — the same
    //      value already used to resolve PropertyFamily — never the raw (here: absent) request field. ----

    @Test
    void update_residentialPlotLeasehold_propertyTypeOmitted_resolvesEffectiveType_returns200() throws Exception {
        when(listingWorkflowService.findListingForCaller(eq(LISTING_ID), eq(DEALER_ID), eq(false)))
                .thenReturn(buildListing(LISTING_ID, "DRAFT", "residential_plot", "Existing residential plot",
                        "Udupi", new BigDecimal("4000000"), "Existing desc"));
        Listing updated = buildListing(LISTING_ID, "DRAFT", "residential_plot", "Existing residential plot",
                "Udupi", new BigDecimal("4000000"), "Existing desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownershipType":"LEASEHOLD"}
                                """))
                .andExpect(status().isOk());
    }

    // ---- AC6: genuinely invalid value -> 400, exact error string (residential allowed-values set),
    //      both paths ----

    @Test
    void create_residentialPlotGenuinelyInvalidOwnershipType_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","title":"Test residential plot","locality":"Udupi",
                                 "price":4000000,"description":"Nice plot","ownershipType":"NOT_A_REAL_VALUE"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'NOT_A_REAL_VALUE'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    @Test
    void update_residentialPlotGenuinelyInvalidOwnershipType_returns400() throws Exception {
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","ownershipType":"NOT_A_REAL_VALUE"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'NOT_A_REAL_VALUE'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"));
    }

    // ---- AC7 (deliberate narrowing): agricultural-only value (PATTA) is now INVALID for
    //      residential_plot — pinned explicitly as an intended P1 consequence, both paths, asserting
    //      the RESIDENTIAL allowed-values set (not the agri set) ----

    @Test
    void create_residentialPlotAgriOnlyOwnership_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","title":"Test residential plot","locality":"Udupi",
                                 "price":4000000,"description":"Nice plot","ownershipType":"PATTA"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'PATTA'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"));
    }

    @Test
    void update_residentialPlotAgriOnlyOwnership_returns400() throws Exception {
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"residential_plot","ownershipType":"PATTA"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'PATTA'. "
                                + "Allowed values: COOPERATIVE_SOCIETY, FREEHOLD, LEASEHOLD, POWER_OF_ATTORNEY"));
    }

    // ==================== #2063: commercial ownershipType family-scoping ====================

    // ---- AC1 + AC2 matrix: commercial accepted ownershipType values, CREATE ----

    @ParameterizedTest(name = "create commercial ownershipType={0} -> 201")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "LEASEHOLD", "POWER_OF_ATTORNEY", "OTHER"})
    void create_commercialValidOwnershipTypes_returns201(String ownershipType) throws Exception {
        Listing saved = buildListing(LISTING_ID, "DRAFT", "commercial_building", "Test building",
                "Udupi", new BigDecimal("8000000"), "Nice building");
        stubCreateDraftReturns(saved);

        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","title":"Test building","locality":"Udupi",
                                 "price":8000000,"description":"Nice building","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()));
    }

    // ---- AC2 matrix: commercial accepted ownershipType values, UPDATE ----

    @ParameterizedTest(name = "update commercial ownershipType={0} -> 200")
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"FREEHOLD", "LEASEHOLD", "POWER_OF_ATTORNEY", "OTHER"})
    void update_commercialValidOwnershipTypes_returns200(String ownershipType) throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "commercial_building", "Updated title",
                "Udupi", new BigDecimal("8000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","ownershipType":"%s"}
                                """.formatted(ownershipType)))
                .andExpect(status().isOk());
    }

    // ---- AC5: PUT omitting ownershipType stays unaffected (legacy-data / null-skip safety path) ----

    @Test
    void update_commercialOwnershipTypeOmitted_returns200() throws Exception {
        Listing updated = buildListing(LISTING_ID, "DRAFT", "commercial_building", "Updated title",
                "Udupi", new BigDecimal("8000000"), "Updated desc");
        stubUpdateListingReturns(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","title":"Updated title"}
                                """))
                .andExpect(status().isOk());
    }

    // ---- AC4 deliberate narrowing: agri-only ownership values are now INVALID for commercial ----
    //
    // Prior to #2063 this test (create_commercialOwnershipType_agriValueAccepted_returns201)
    // asserted 201 for PATTA on a commercial listing — that was PINNING THE DEFECT, not correct
    // behaviour. #2063 deliberately narrows COMMERCIAL to CommercialFieldOptions.VALID_COMMERCIAL_OWNERSHIP
    // (mirroring #2048/PR #2057 decision D1 for RESIDENTIAL), so the same request must now 400.

    @Test
    void create_commercialAgriOnlyOwnership_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","title":"Test building","locality":"Udupi",
                                 "price":8000000,"description":"Nice building","ownershipType":"PATTA"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'PATTA'. "
                                + "Allowed values: FREEHOLD, LEASEHOLD, OTHER, POWER_OF_ATTORNEY"));

        verify(listingCrudService, never()).createDraft(any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any());
    }

    // ---- AC3: genuinely invalid value -> unchanged error-body shape ({"error": "..."}, no new exception type) ----

    @Test
    void create_commercialGenuinelyInvalidOwnershipType_returns400UnchangedErrorShape() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","title":"Test building","locality":"Udupi",
                                 "price":8000000,"description":"Nice building","ownershipType":"BOGUS_VALUE"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'BOGUS_VALUE'. "
                                + "Allowed values: FREEHOLD, LEASEHOLD, OTHER, POWER_OF_ATTORNEY"))
                .andExpect(jsonPath("$.errors").doesNotExist());
    }

    // ---- AC7: residential-only value (COOPERATIVE_SOCIETY) is rejected for commercial;
    //      error body changes to the narrowed commercial allowed-values list ----

    @Test
    void create_commercialOwnershipType_residentialValueRejected_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"commercial_building","title":"Test building","locality":"Udupi",
                                 "price":8000000,"description":"Nice building","ownershipType":"COOPERATIVE_SOCIETY"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid value for ownershipType: 'COOPERATIVE_SOCIETY'. "
                                + "Allowed values: FREEHOLD, LEASEHOLD, OTHER, POWER_OF_ATTORNEY"));
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
