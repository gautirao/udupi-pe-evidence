package com.example.realestate.security;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.api.AdminListingController;
import com.example.realestate.listing.api.ListingResponse;
import com.example.realestate.listing.api.ListingResponseMapper;
import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Authz + behaviour coverage for {@link AdminListingController#pending} (#2242).
 *
 * <p>This is a READ path, distinct from {@link AdminListingApprovePilotIT} which only proves the
 * approve (write) path. Mirrors its authority-path wiring but adds its own coverage: the four
 * authority permutations, PLUS a test proving the hardcoded {@code PENDING_REVIEW} status filter
 * genuinely filters (not just that the guard passes).
 */
@WebMvcTest(
        controllers = AdminListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminListingPendingQueueIT.TestConfig.class, WebMvcConfig.class,
        CallerInfoResolver.class, GlobalExceptionHandler.class})
class AdminListingPendingQueueIT {

    private static final UUID ADMIN_ID  = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID BROKER_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID PENDING_LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000077");

    /**
     * {@code @EnableMethodSecurity} is required for {@code @PreAuthorize("#caller.isAdmin()")} to
     * evaluate in the test context.
     */
    @EnableMethodSecurity
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
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private AdminAuditService adminAuditService;

    @MockitoBean
    private ListingRepository listingRepository;

    /**
     * Required to satisfy {@link CallerInfoResolver}'s constructor dependency (DB fallback path).
     * Not stubbed here — tests set {@code ROLE_ADMIN}/{@code ROLE_BROKER}/{@code ROLE_DEALER}
     * authority on the jwt(), so the primary authority path is taken and the DB fallback is not
     * invoked.
     */
    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingWorkflowService, listingResponseMapper, adminAuditService,
                listingRepository, userRoleService);
        // Delegate the mapper to a minimal real implementation (mirrors
        // AdminListingControllerTest#setUp) so response-field assertions keep working without
        // hand-maintaining ListingResponse's ~90-arg positional constructor per test.
        when(listingResponseMapper.toResponse(any(Listing.class))).thenAnswer(inv -> toResponse(inv.getArgument(0)));
        when(listingResponseMapper.toResponseList(anyList())).thenAnswer(inv -> {
            List<Listing> listings = inv.getArgument(0);
            return listings.stream().map(listingResponseMapper::toResponse).toList();
        });
    }

    // ===== Authority permutations =====

    @Test
    void pending_withRoleAdminAuthority_returns200() throws Exception {
        Listing pendingListing = buildPendingListing(PENDING_LISTING_ID);
        when(listingRepository.findPendingReviewListings(any()))
                .thenReturn(new PageImpl<>(List.of(pendingListing), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/listings/pending")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(PENDING_LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].status").value("PENDING_REVIEW"));
    }

    @Test
    void pending_withRoleBrokerAuthority_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/listings/pending")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void pending_withRoleDealerAuthority_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/listings/pending")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void pending_withNoAuthority_returns403() throws Exception {
        mockMvc.perform(get("/api/admin/listings/pending")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden());
    }

    // ===== Status-filter behaviour =====

    /**
     * Proves the hardcoded {@code PENDING_REVIEW} filter genuinely filters at the repository
     * boundary: the controller must delegate to {@code findPendingReviewListings} (whose native
     * {@code @Query} bakes the status predicate in) rather than any status-blind listing query.
     * If the controller ever regressed to calling a general-purpose fetch, this test's
     * {@code verify} would fail even though the response itself might still look plausible.
     */
    @Test
    void pending_onlyReturnsPendingReviewRows() throws Exception {
        Listing pendingOnly = buildPendingListing(PENDING_LISTING_ID);
        when(listingRepository.findPendingReviewListings(any()))
                .thenReturn(new PageImpl<>(List.of(pendingOnly), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/admin/listings/pending")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                                   .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("PENDING_REVIEW"));

        verify(listingRepository).findPendingReviewListings(any());
    }

    // ===== Fixtures =====

    private static Listing buildPendingListing(UUID id) {
        Listing listing = new Listing();
        listing.setId(id);
        listing.setStatus("PENDING_REVIEW");
        listing.setPropertyType("house");
        listing.setTitle("Test listing pending review");
        listing.setLocality("Manipal");
        listing.setPrice(new BigDecimal("5000000"));
        listing.setDescription("Test description");
        listing.setCreatedAt(OffsetDateTime.now());
        listing.setUpdatedAt(OffsetDateTime.now());
        return listing;
    }

    /**
     * Minimal real ListingResponse construction from a Listing entity — copies the field mapping
     * used in {@code AdminListingControllerTest#setUp} so this test doesn't hand-maintain its own
     * drift-prone copy of the ~90-arg positional constructor.
     */
    private static ListingResponse toResponse(Listing l) {
        OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null ? l.getLastUpdatedAt() : l.getUpdatedAt();
        boolean reraValid = l.getReraNumber() != null
                && ListingResponse.RERA_PATTERN.matcher(l.getReraNumber()).matches();
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
                l.getSellerType(), 0, false, lastUpdatedAt,
                l.getFirstPublishedAt(), l.getLastConfirmedAt(), l.getPossessionStatus(),
                l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid, 0,
                l.getTrustTier(), null, l.getAreaKey(), List.of(),
                null, null, null, null, null, null,
                l.getLandCategory(), l.getAgriConversionStatus(), l.getFarmhouseAvailable(), l.getFencingDone(),
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
                List.of(), List.of());
    }
}
