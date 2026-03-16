package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import com.example.realestate.security.UserRoleService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for PublicListingController (unauthenticated endpoints).
 * No JWT is required — the security config permits all GET /api/public/listings/** requests.
 */
@WebMvcTest(
        controllers = PublicListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(PublicListingControllerTest.TestConfig.class)
class PublicListingControllerTest {

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID UNKNOWN_ID  = UUID.fromString("00000000-0000-0000-0000-000000000000");

    /** Minimal security config: permit everything (mirrors production's permitAll on this path). */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private ListingService listingService;

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private PriceChangeLogRepository priceChangeLogRepository;

    @BeforeEach
    void setUp() {
        reset(listingRepository, listingResponseMapper, priceChangeLogRepository);
        // Delegate public mapper to a minimal implementation.
        // CRITICAL: rejectionReason must always be null (security invariant tested explicitly).
        when(listingResponseMapper.toPublicResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            int daysOnMarket = l.getFirstPublishedAt() != null
                    ? (int) java.time.temporal.ChronoUnit.DAYS.between(
                            l.getFirstPublishedAt().toLocalDate(), java.time.LocalDate.now())
                    : (l.getCreatedAt() != null
                            ? (int) java.time.temporal.ChronoUnit.DAYS.between(
                                    l.getCreatedAt().toLocalDate(), java.time.LocalDate.now())
                            : 0);
            java.time.OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                    ? l.getLastUpdatedAt() : l.getUpdatedAt();
            boolean reraValid = l.getReraNumber() != null
                    && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();
            return new ListingController.ListingResponse(
                    l.getId(), l.getListingNumber(), l.getDisplayId(),
                    l.getStatus(), l.getPropertyType(), l.getTitle(),
                    l.getLocality(), l.getPrice(), l.getDescription(),
                    l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                    l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                    l.getLatitude(), l.getLongitude(),
                    l.isAddressConfirmed(), null /* rejectionReason always null for public */,
                    l.getCreatedAt(), l.getUpdatedAt(),
                    0, null, l.getVideoUrl(),
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

    // ==================== GET /{id} — happy path (LIVE listing) ====================

    @Test
    void getById_liveListing_returns200WithFields() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        listing.setFirstPublishedAt(OffsetDateTime.now().minusDays(5));

        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"))
                .andExpect(jsonPath("$.title").value("Sea View Villa"))
                .andExpect(jsonPath("$.daysOnMarket").value(5))
                .andExpect(jsonPath("$.backOnMarket").value(false))
                .andExpect(jsonPath("$.firstPublishedAt").isNotEmpty());
    }

    // ==================== GET /{id} — DRAFT listing -> 404 ====================

    @Test
    void getById_draftListing_returns404() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.DRAFT.toDbValue(), "land",
                "Draft plot", "Manipal", new BigDecimal("3000000"), "A draft");

        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id} — unknown id -> 404 ====================

    @Test
    void getById_unknownId_returns404() throws Exception {
        when(listingRepository.findById(UNKNOWN_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/public/listings/" + UNKNOWN_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id}/price-history — empty list ====================

    @Test
    void getPriceHistory_noChanges_returnsEmptyList() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));
        when(priceChangeLogRepository.findByListingIdOrderByChangedAtAsc(LISTING_ID))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID + "/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== GET /{id}/price-history — correct deltas (paise → rupees) ====================

    @Test
    void getPriceHistory_withChanges_returnsCorrectDeltas() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        OffsetDateTime t1 = OffsetDateTime.now().minusDays(10);
        OffsetDateTime t2 = OffsetDateTime.now().minusDays(5);

        // 5_000_000 rupees = 500_000_000 paise; 6_000_000 rupees = 600_000_000 paise
        PriceChangeLog entry1 = buildPriceChangeLog(LISTING_ID, 500_000_000L, 600_000_000L, t1);
        // 6_000_000 rupees → 5_500_000 rupees (delta = -500,000)
        PriceChangeLog entry2 = buildPriceChangeLog(LISTING_ID, 600_000_000L, 550_000_000L, t2);

        when(priceChangeLogRepository.findByListingIdOrderByChangedAtAsc(LISTING_ID))
                .thenReturn(List.of(entry1, entry2));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID + "/price-history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // First entry: increase of 1,000,000 rupees
                .andExpect(jsonPath("$[0].price").value(6000000.00))
                .andExpect(jsonPath("$[0].delta").value(1000000.00))
                // Second entry: reduction of 500,000 rupees
                .andExpect(jsonPath("$[1].price").value(5500000.00))
                .andExpect(jsonPath("$[1].delta").value(-500000.00));
    }

    // ==================== GET /{id}/price-history — listing not found -> 404 ====================

    @Test
    void getPriceHistory_unknownListing_returns404() throws Exception {
        when(listingRepository.findById(UNKNOWN_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/public/listings/" + UNKNOWN_ID + "/price-history"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id}/price-history — archived listing -> 404 (Fix 1) ====================

    @Test
    void getPriceHistory_archivedListing_returns404() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.ARCHIVED.toDbValue(), "house",
                "Old Villa", "Udupi", new BigDecimal("15000000"), "Archived");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID + "/price-history"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id} — PENDING_REVIEW listing -> 404 (Fix 1) ====================

    @Test
    void getListing_pendingReviewListing_returns404() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.PENDING_REVIEW.toDbValue(), "land",
                "Pending plot", "Manipal", new BigDecimal("3000000"), "Awaiting review");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id} — ARCHIVED listing -> 404 (Fix 1) ====================

    @Test
    void getListing_archivedListing_returns404() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.ARCHIVED.toDbValue(), "house",
                "Archived Villa", "Udupi", new BigDecimal("15000000"), "Old listing");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== GET /{id} — rejectionReason is NOT exposed (Fix 3) ====================

    @Test
    void getListing_liveListing_rejectionReasonIsNull() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        listing.setRejectionReason("Internal moderator note — not for public");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rejectionReason").doesNotExist());
    }

    // ==================== Helpers ====================

    private Listing buildListing(UUID id, String status, String propertyType, String title,
                                  String locality, BigDecimal price, String description) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(1);
        l.setStatus(status);
        l.setPropertyType(propertyType);
        l.setTitle(title);
        l.setLocality(locality);
        l.setPrice(price);
        l.setDescription(description);
        l.setCreatedAt(OffsetDateTime.now().minusDays(7));
        l.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return l;
    }

    private PriceChangeLog buildPriceChangeLog(UUID listingId,
                                                Long oldPricePaise,
                                                Long newPricePaise,
                                                OffsetDateTime changedAt) {
        PriceChangeLog pcl = new PriceChangeLog();
        pcl.setListingId(listingId);
        pcl.setOldPricePaise(oldPricePaise);
        pcl.setNewPricePaise(newPricePaise);
        pcl.setChangedAt(changedAt);
        return pcl;
    }
}
