package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@link WebMvcTest} for agri-field validation in {@link ListingController}.
 *
 * Covers:
 * - POST /api/listings with a canonical agri value → 201
 * - POST /api/listings with an unknown agri value → 400
 * - POST /api/listings with null agri value → 201 (null skipped, not validated)
 * - PUT  /api/listings/{id} with an unknown agri value → 400
 * - PUT  /api/listings/{id} with null agri value → 200 (null skipped)
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingControllerAgriValidationTest.TestConfig.class, WebMvcConfig.class,
        CallerInfoResolver.class, com.example.realestate.exception.GlobalExceptionHandler.class})
class ListingControllerAgriValidationTest {

    private static final UUID DEALER_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");
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

    @MockitoBean private ListingCrudService listingCrudService;
    @MockitoBean private ListingWorkflowService listingWorkflowService;
    @MockitoBean private ListingImageRepository listingImageRepository;
    @MockitoBean private ListingResponseMapper listingResponseMapper;
    @MockitoBean private UserRoleService userRoleService;
    @MockitoBean private com.example.realestate.listing.crud.BrokerDashboardService brokerDashboardService;

    @BeforeEach
    void setUp() {
        reset(listingCrudService, listingWorkflowService, listingImageRepository,
                listingResponseMapper);
        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());

        // Minimal stub listing returned by createDraft and updateListing.
        // Validation fires before service calls, so for 400 cases the stub is never reached.
        // For 201/200 cases we use lenient anyX() stubs covering the full arg list.
        Listing stub = minimalListing(LISTING_ID);
        // Default stub: PUT /{id} falls back to this when the request omits propertyType, so the
        // effective-type resolution (#1626) has an existing listing to resolve against.
        org.mockito.Mockito.lenient()
                .when(listingWorkflowService.findListingForCaller(any(), any(), anyBoolean()))
                .thenReturn(stub);
        // createDraft: 37 params — UUID + 36 typed params (all Object-compatible except primitives),
        // + ResidentialListingFields + CommercialListingFields (M38-FU2 / #1730)
        // + crops (#2044) = 40 total (#2043: +1 for agriConversionStatus)
        org.mockito.Mockito.lenient()
                .when(listingCrudService.createDraft(
                        any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any()))
                .thenReturn(stub);
        // updateListing: UUID, UUID, boolean (primitive), + 44 Object params
        // + ResidentialListingFields + CommercialListingFields (M38-FU2 / #1730)
        // + crops (#2044) = 50 total (#2043: +1 for agriConversionStatus)
        org.mockito.Mockito.lenient()
                .when(listingCrudService.updateListing(
                        any(), any(), anyBoolean(),
                        any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                        any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                        any(), any(), any(), any(),
                any(), any(), any()))
                .thenReturn(stub);

        // Minimal mapper stub — just return something that produces the status field
        when(listingResponseMapper.toResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            return new ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), l.getPricePaise(), l.getDescription(),
                    l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                    l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                    l.getLatitude(), l.getLongitude(),
                    l.isAddressConfirmed(), l.getRejectionReason(),
                    l.getCreatedAt(), l.getUpdatedAt(),
                    0, null, l.getVideoUrl(),
                    l.getReraNumber(), l.getListingPurpose(),
                    l.getCarpetArea(), l.getCarpetAreaUnit(),
                    l.getFloorNumber(), l.getTotalFloors(),
                    l.getFurnishingStatus(), l.getWashrooms(), l.getParkingCount(),
                    l.getRoadFrontageFt(), l.getCommercialUsage(), l.getNumberOfUnits(),
                    l.getMonthlyRent(), l.getSecurityDepositMonths(), l.getLockInMonths(),
                    l.getSellerType(), 0, false, l.getUpdatedAt(),
                    l.getFirstPublishedAt(), l.getLastConfirmedAt(), l.getPossessionStatus(),
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), false, 0,
                    l.getTrustTier(), null, l.getAreaKey(), List.of(),
                    null, null, null, null, null, null, null, null, null, null,
                    l.getBoundaryGeoJson(), null,
                    l.getBathrooms(), l.getBalconies(), l.getFacing(), l.getAvailabilityTimeline(),
                    l.getSuperBuiltArea(), l.getSuperBuiltAreaUnit(), l.getPropertyAge(), l.getResidentialWaterSource(),
                    l.getParking2wCount(), l.getParking4wCount(), l.getRoadWidthFt(), l.getPlotDimensions(),
                    l.getConversionStatus(), l.getKhataNumber(), l.getPropertyTaxPid(), l.getApprovingAuthority(),
                    l.getProjectName(), l.getBuilderName(), l.getMaintenancePaise(),
                    l.getHasLift(), l.getHasPowerBackup(), l.getIsGated(), l.getHasGarden(), l.getHasTerrace(),
                    l.getHasCompound(), l.getHasServantRoom(), l.getIsCornerPlot(), l.getHasBoundaryWall(),
                    l.getIsGatedLayout(), l.getHasWaterConnection(), l.getHasElectricityConnection(), l.getHasDrainage(),
                    l.getPriceNegotiable(), l.getRentNegotiable(), l.getPetsAllowed(), l.getMaintenanceIncluded(),
                    List.of(), List.of(), List.of(),
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
                    List.of(), List.of(), List.of(),
                    l.getPriceStatus(), l.isDuplicate(), l.getRepostCount());
        });
    }

    // ── POST create ───────────────────────────────────────────────────────────

    @Test
    void create_withCanonicalWaterSource_returns201() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "waterSource": "BOREWELL",
                                  "soilType": "RED_LATERITE",
                                  "roadAccess": "TARRED_ROAD",
                                  "cultivationStatus": "CULTIVATED",
                                  "ownershipType": "FREEHOLD"
                                }
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void create_withCanonicalCrops_returns201() throws Exception {
        // AC6 (#2044): canonical crop codes are accepted.
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "crops": ["PADDY", "COCONUT"]
                                }
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void create_withUnknownCrop_returns400() throws Exception {
        // AC6 (#2044): an unknown crop code must be rejected with 400, mirroring the
        // utilities/suitableUses list-valued rejectIfUnknown precedent.
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "crops": ["PADDY", "OTHER"]
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void update_withUnknownCrop_returns400() throws Exception {
        mockMvc.perform(put("/api/listings/" + UUID.randomUUID())
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "crops": ["NOT_A_REAL_CROP"]
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withNullAgriFields_returns201() throws Exception {
        // Null values must be skipped — not validated — so no rejection.
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "land",
                                  "title": "Test plot",
                                  "locality": "Udupi",
                                  "price": 1000000,
                                  "description": "desc"
                                }
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void create_withUnknownWaterSource_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "waterSource": "Borewell"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withUnknownSoilType_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "soilType": "Laterite"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withOldFreeTextSoilType_returns400() throws Exception {
        // "Red loam" was consolidated into RED_LATERITE via V91 — must be rejected
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "soilType": "Red loam"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withUnknownRoadAccess_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "roadAccess": "Tar road"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withUnknownCultivationStatus_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "cultivationStatus": "Areca plantation"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withUnknownOwnershipType_returns400() throws Exception {
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "ownershipType": "Freehold"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void create_withBlankWaterSource_returns201() throws Exception {
        // Blank values are treated the same as null — skipped, not validated
        mockMvc.perform(post("/api/listings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "propertyType": "agricultural_land",
                                  "title": "Test Farm",
                                  "locality": "Brahmavar",
                                  "price": 5000000,
                                  "description": "Test",
                                  "waterSource": ""
                                }
                                """))
                .andExpect(status().isCreated());
    }

    // ── PUT update ────────────────────────────────────────────────────────────

    @Test
    void update_withUnknownSoilType_returns400() throws Exception {
        mockMvc.perform(put("/api/listings/{id}", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "soilType": "Laterite"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void update_withNullAgriFields_returns200() throws Exception {
        mockMvc.perform(put("/api/listings/{id}", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "Updated Title"
                                }
                                """))
                .andExpect(status().isOk());
    }

    @Test
    void update_withCanonicalOwnershipType_returns200() throws Exception {
        mockMvc.perform(put("/api/listings/{id}", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "ownershipType": "PATTA"
                                }
                                """))
                .andExpect(status().isOk());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static Listing minimalListing(UUID id) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(1001);
        l.setStatus("DRAFT");
        l.setPropertyType("agricultural_land");
        l.setTitle("Test Farm");
        l.setLocality("Brahmavar");
        l.setPrice(new BigDecimal("5000000"));
        l.setDescription("Test");
        l.setSellerType("broker");
        l.setAddressConfirmed(false);
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }
}
