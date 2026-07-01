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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Family-level structural DTO validation tests for {@link ListingController}.
 *
 * <p>Covers AC1–AC4, AC5 (doc), AC6, AC7, AC8, AC10 from the M38-11 acceptance criteria.
 * Each rejection test also asserts {@code verify(crudService, never())} (AC6).
 * AC11 (WiringGuard) is covered separately by {@link ListingFieldWiringGuardTest}.
 * AC3 agri value-set checks are covered by {@link ListingControllerAgriValidationTest}.
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingControllerFamilyValidationTest.TestConfig.class, WebMvcConfig.class,
        CallerInfoResolver.class, com.example.realestate.exception.GlobalExceptionHandler.class})
class ListingControllerFamilyValidationTest {

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

    @Autowired private MockMvc mockMvc;

    @MockitoBean private ListingCrudService listingCrudService;
    @MockitoBean private ListingWorkflowService listingWorkflowService;
    @MockitoBean private ListingImageRepository listingImageRepository;
    @MockitoBean private ListingResponseMapper listingResponseMapper;
    @MockitoBean private UserRoleService userRoleService;
    @MockitoBean private com.example.realestate.listing.crud.BrokerDashboardService brokerDashboardService;

    @BeforeEach
    void setUp() {
        reset(listingCrudService, listingWorkflowService, listingImageRepository, listingResponseMapper);

        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());

        Listing stub = minimalListing(LISTING_ID, "house");
        // Default stub: PUT /{id} falls back to this when the request omits propertyType, so the
        // effective-type resolution (#1626) has an existing listing to resolve against. Tests that
        // specifically target the existing-listing's type (e.g. residential_plot) override this.
        lenient().when(listingWorkflowService.findListingForCaller(any(), any(), anyBoolean()))
                .thenReturn(stub);
        lenient().when(listingCrudService.createDraft(
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any()))
                .thenReturn(stub);
        lenient().when(listingCrudService.updateListing(
                any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any()))
                .thenReturn(stub);

        when(listingResponseMapper.toResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            return new ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), null, l.getDescription(),
                    null, null, null, "sqft", "sqft",
                    null, null, false, null,
                    l.getCreatedAt(), l.getUpdatedAt(),
                    0, null, null,
                    null, null, null, null, null, null, null, null, null,
                    null, null, null,
                    null, null, null,
                    "broker", 0, false, l.getUpdatedAt(),
                    null, null, null, null, false, 0,
                    null, null, List.of(),
                    null, null, null, null, null, null, null, null, null, null, null,
                    // 36 nulls: bathrooms .. maintenanceIncluded (residential typed fields, M38-13A / #1626)
                    null, null, null, null, null, null,
                    null, null, null, null, null, null,
                    null, null, null, null, null, null,
                    null, null, null, null, null, null,
                    null, null, null, null, null, null,
                    null, null, null, null, null, null,
                    List.of(), List.of(), List.of());
        });
    }

    // ======================== AC1: RESIDENTIAL rejects agri-only fields ========================

    @Test
    void ac1_house_withWaterSource_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","waterSource":"BOREWELL"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_apartment_withSoilType_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"apartment","title":"Flat","locality":"Udupi",
                 "price":3000000,"description":"desc","soilType":"RED_LATERITE"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_house_withCultivationStatus_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","cultivationStatus":"CULTIVATED"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_house_withFarmhouseAvailable_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","farmhouseAvailable":true}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_house_withCommercialUsage_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","commercialUsage":"OFFICE"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_house_withRoadFrontageFt_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","roadFrontageFt":30}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac1_house_withNumberOfUnits_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","numberOfUnits":4}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    // ======================== AC2: COMMERCIAL rejects agri fields and bedrooms ========================

    @Test
    void ac2_commercial_withAgriField_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"commercial","title":"Shop","locality":"Udupi",
                 "price":2000000,"description":"desc","soilType":"RED_LATERITE"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac2_commercialBuilding_withBedrooms_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"commercial_building","title":"Block","locality":"Udupi",
                 "price":10000000,"description":"desc","bedrooms":3}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac2_warehouse_withFencingDone_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"warehouse","title":"WH","locality":"Udupi",
                 "price":8000000,"description":"desc","fencingDone":true}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac2_commercialLand_withLandCategory_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"commercial_land","title":"CommLand","locality":"Udupi",
                 "price":3000000,"description":"desc","landCategory":"DRY_LAND"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    // ======================== AC3: AGRICULTURAL rejects parking, BHK, furnishing, commercial ========================

    @Test
    void ac3_agri_withParkingCount_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc","parkingCount":2}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac3_agri_withBedrooms_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc","bedrooms":2}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac3_agri_withFurnishingStatus_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc","furnishingStatus":"FURNISHED"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac3_agri_withCommercialUsage_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc","commercialUsage":"WAREHOUSE"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac3_agri_withNumberOfUnits_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc","numberOfUnits":3}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    // ======================== AC4: PLOT rejects BHK, unit-count, floor-plan, unit-area ========================

    @Test
    void ac4_land_withBedrooms_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","bedrooms":3}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withWashrooms_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","washrooms":2}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withNumberOfUnits_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","numberOfUnits":10}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_other_withBuiltArea_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"other","title":"Misc","locality":"Udupi",
                 "price":1000000,"description":"desc","builtArea":1200}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withFurnishingStatus_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","furnishingStatus":"SEMI_FURNISHED"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withFloorNumber_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","floorNumber":2}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withTotalFloors_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","totalFloors":5}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac4_land_withCarpetArea_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc","carpetArea":900}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    // ======================== AC5: Warehouse (commercial family) accepts commercial fields ========================
    // Structural satisfaction: office/shop-only forward fields not present on the flat request shape.

    @Test
    void ac5_warehouse_withCommercialFields_returns201() throws Exception {
        performCreate("""
                {"propertyType":"warehouse","title":"WH A","locality":"Udupi",
                 "price":8000000,"description":"desc",
                 "commercialUsage":"WAREHOUSE","roadFrontageFt":40,"numberOfUnits":1,
                 "floorNumber":1,"totalFloors":2,"parkingCount":10}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    // ======================== AC7: Backward-compat regression — valid family payloads ========================

    @Test
    void ac7_house_sharedFieldsAccepted_returns201() throws Exception {
        // floorNumber, totalFloors, washrooms, parkingCount valid for residential — must NOT be rejected.
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":8000000,"description":"desc",
                 "bedrooms":3,"washrooms":2,"parkingCount":1,
                 "builtArea":1800,"carpetArea":1500,
                 "floorNumber":1,"totalFloors":3,"furnishingStatus":"SEMI_FURNISHED"}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac7_commercial_sharedFieldsAccepted_returns201() throws Exception {
        // floorNumber, totalFloors, washrooms, parkingCount valid for commercial — must NOT be rejected.
        performCreate("""
                {"propertyType":"commercial","title":"Office","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "commercialUsage":"OFFICE","roadFrontageFt":30,"numberOfUnits":5,
                 "floorNumber":2,"totalFloors":8,"washrooms":4,"parkingCount":10}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac7_agri_validPayload_returns201() throws Exception {
        performCreate("""
                {"propertyType":"agricultural_land","title":"Farm","locality":"Brahmavar",
                 "price":5000000,"description":"desc",
                 "waterSource":"BOREWELL","soilType":"RED_LATERITE",
                 "farmhouseAvailable":false,"fencingDone":true,"surveyNumber":"123/4"}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac7_plot_validPayload_returns201() throws Exception {
        // PLOT: landArea, parkingCount, surveyNumber, ownershipType accepted.
        performCreate("""
                {"propertyType":"land","title":"Plot","locality":"Udupi",
                 "price":2000000,"description":"desc",
                 "landArea":5000,"parkingCount":2,"surveyNumber":"456/7","ownershipType":"FREEHOLD"}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac7_update_nullPropertyType_validatesAgainstExistingType_returns200() throws Exception {
        // Partial update with no propertyType → family validation now runs against the EXISTING
        // listing's stored type ("house", per the default stub in setUp()). A plain title update
        // carries no family-specific fields, so it still passes (#1626 blocking-fix regression).
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(dealer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Updated title"}
                                """))
                .andExpect(status().isOk());
        verifyUpdateCalledOnce();
    }

    // ======================== AC8: Rental/lease terms gated on listingPurpose ========================

    @Test
    void ac8_monthlyRent_withPurposeRENT_returns201() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"RENT","monthlyRent":15000}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac8_monthlyRent_withPurposeLease_caseInsensitive_returns201() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"lease","monthlyRent":20000,"securityDepositMonths":2}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    @Test
    void ac8_monthlyRent_withNullPurpose_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_monthlyRent_withBlankPurpose_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"","monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_monthlyRent_withPurposeSale_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"SALE","monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_securityDeposit_withUnrecognizedPurpose_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"unknown_purpose","securityDepositMonths":3}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_noRentalFields_withSalePurpose_returns201() throws Exception {
        // Sale purpose is fine when no rental fields are present.
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc","listingPurpose":"SALE"}
                """)
                .andExpect(status().isCreated());
        verifyCreateCalledOnce();
    }

    // ── Adversarial: substring false-positives that would pass a contains() check ──────────────────
    // These prove the fix uses exact-match (RENTAL_PURPOSES set) not contains().

    @Test
    void ac8_adversarial_purposeForSaleNotRent_returns400_crudNeverCalled() throws Exception {
        // "for-sale-not-rent" contains "rent" as a substring — must still be rejected.
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"for-sale-not-rent","monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_adversarial_purposeContainsLeaseSubstring_returns400_crudNeverCalled() throws Exception {
        // "parent-lease-v2" contains "lease" as a substring — must be rejected.
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"parent-lease-v2","monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_adversarial_purposeRental_notExactMatch_returns400_crudNeverCalled() throws Exception {
        // "rental" contains "rent" but is not exactly "RENT" — must be rejected.
        performCreate("""
                {"propertyType":"house","title":"House","locality":"Udupi",
                 "price":5000000,"description":"desc",
                 "listingPurpose":"rental","monthlyRent":15000}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac8_update_monthlyRent_withPurposeRent_returns200() throws Exception {
        // Update path: propertyType provided → family check + rental check both run.
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(dealer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","listingPurpose":"RENT","monthlyRent":18000}
                                """))
                .andExpect(status().isOk());
        verifyUpdateCalledOnce();
    }

    @Test
    void ac8_update_lockInMonths_withNullPurpose_returns400_crudNeverCalled() throws Exception {
        // Rental field present, purpose absent → 400 even on update.
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(dealer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"lockInMonths":12}
                                """))
                .andExpect(status().isBadRequest());
        verifyUpdateNeverCalled();
    }

    // ======================== AC10: Unknown / null propertyType → 400 ========================

    @Test
    void ac10_unknownPropertyType_onCreate_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"propertyType":"foobar","title":"Test","locality":"Udupi",
                 "price":1000000,"description":"desc"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac10_nullPropertyType_onCreate_returns400_crudNeverCalled() throws Exception {
        performCreate("""
                {"title":"Test","locality":"Udupi","price":1000000,"description":"desc"}
                """)
                .andExpect(status().isBadRequest());
        verifyCreateNeverCalled();
    }

    @Test
    void ac10_unknownPropertyType_onUpdate_returns400_crudNeverCalled() throws Exception {
        // NOTE: "villa" is intentionally NOT used here — M38-13A (#1626) added it as a valid
        // PropertyType. "bungalow" remains genuinely unknown and exercises the same 400 path.
        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(dealer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"bungalow","title":"Bungalow"}
                                """))
                .andExpect(status().isBadRequest());
        verifyUpdateNeverCalled();
    }

    // ======================== BLOCKING fix regression (#1626 code review): propertyType-omitted
    // update must still validate against the EXISTING listing's stored propertyType ============

    @Test
    void ac10b_bathroomsOnResidentialPlot_propertyTypeOmitted_usesExistingType_returns400_crudNeverCalled()
            throws Exception {
        // Every other field on this PUT is optional (partial-update pattern). Before this fix,
        // omitting propertyType entirely bypassed validateFamilyFields/validateResidentialFieldSet,
        // so a residence-only field like bathrooms could be silently written onto an existing
        // residential_plot listing. The effective-type resolution must fetch the EXISTING listing's
        // stored propertyType and validate against it even though the request supplies none.
        Listing existingPlot = minimalListing(LISTING_ID, "residential_plot");
        when(listingWorkflowService.findListingForCaller(eq(LISTING_ID), any(), anyBoolean()))
                .thenReturn(existingPlot);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(dealer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bathrooms":3}
                                """))
                .andExpect(status().isBadRequest());
        verifyUpdateNeverCalled();
    }

    // ======================== Shared helpers ========================

    private RequestPostProcessor dealer() {
        return jwt().jwt(j -> j.subject(DEALER_ID.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_DEALER"));
    }

    private org.springframework.test.web.servlet.ResultActions performCreate(String body) throws Exception {
        return mockMvc.perform(post("/api/listings")
                .with(dealer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private void verifyCreateNeverCalled() {
        verify(listingCrudService, never()).createDraft(
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any());
    }

    private void verifyCreateCalledOnce() {
        verify(listingCrudService).createDraft(
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any());
    }

    private void verifyUpdateNeverCalled() {
        verify(listingCrudService, never()).updateListing(
                any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any());
    }

    private void verifyUpdateCalledOnce() {
        verify(listingCrudService).updateListing(
                any(), any(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any());
    }

    private static Listing minimalListing(UUID id, String propertyType) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(42);
        l.setStatus("DRAFT");
        l.setPropertyType(propertyType);
        l.setTitle("Stub title");
        l.setLocality("Stub locality");
        l.setPrice(new BigDecimal("5000000"));
        l.setDescription("Stub desc");
        l.setSellerType("broker");
        l.setAddressConfirmed(false);
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }
}
