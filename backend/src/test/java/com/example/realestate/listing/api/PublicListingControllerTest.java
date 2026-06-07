package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.school.SchoolService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import com.example.realestate.security.UserRoleService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
    private ListingRepository listingRepository;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private PriceChangeLogRepository priceChangeLogRepository;

    @MockitoBean
    private SchoolService schoolService;

    @BeforeEach
    void setUp() {
        reset(listingRepository, listingResponseMapper, priceChangeLogRepository, userRoleService, schoolService);
        SecurityContextHolder.clearContext();

        // Delegate public mapper to a minimal implementation.
        // CRITICAL: rejectionReason must always be null (security invariant tested explicitly).
        // Single-listing path always populates images[] (#758).
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
            return new ListingResponse(
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
                    l.getExpectedPossessionDate(), l.getApprovalsDeclared(), reraValid, 0,
                    l.getTrustTier(), l.getAreaKey(),
                    java.util.List.of(
                            new ListingImageDTO("https://cdn.example.com/img-a.jpg", null, 0),
                            new ListingImageDTO("https://cdn.example.com/img-b.jpg", null, 1),
                            new ListingImageDTO("https://cdn.example.com/img-c.jpg", null, 2)),
                    null, null, null, null, null, null, l.getBoundaryGeoJson(), null);
        });

        // Teaser mapper — single listing
        when(listingResponseMapper.toTeaserResponse(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            return new ListingTeaserResponse(
                    l.getId(), null, 0, l.getPrice(),
                    l.getPropertyType(), l.getLocality(), l.getListingPurpose());
        });

        // Teaser mapper — batch
        when(listingResponseMapper.toTeaserResponseList(anyList())).thenAnswer(inv -> {
            List<Listing> listings = inv.getArgument(0);
            return listings.stream()
                    .map(l -> new ListingTeaserResponse(
                            l.getId(), null, 0, l.getPrice(),
                            l.getPropertyType(), l.getLocality(), l.getListingPurpose()))
                    .toList();
        });
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ==================== GET /{id} — anonymous caller → teaser response ====================

    @Test
    void getById_anonymous_returnsTeaserWith200() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        listing.setListingPurpose("SALE");
        listing.setFirstPublishedAt(OffsetDateTime.now().minusDays(5));

        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        // No authentication in SecurityContext → teaser path
        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.price").value(15000000))
                .andExpect(jsonPath("$.propertyType").value("house"))
                .andExpect(jsonPath("$.locality").value("Udupi"))
                .andExpect(jsonPath("$.listingPurpose").value("SALE"))
                .andExpect(jsonPath("$.imageCount").value(0))
                // sensitive fields absent from teaser
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.title").doesNotExist())
                .andExpect(jsonPath("$.latitude").doesNotExist())
                .andExpect(jsonPath("$.longitude").doesNotExist())
                .andExpect(jsonPath("$.description").doesNotExist());
    }

    // ==================== GET /{id} — authenticated caller → full ListingResponse ====================

    @Test
    void getById_authenticated_returnsFullResponseWith200() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Sea View Villa", "Udupi", new BigDecimal("15000000"), "A nice villa");
        listing.setFirstPublishedAt(OffsetDateTime.now().minusDays(5));

        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listing));

        // Populate security context with an authenticated principal (not AnonymousAuthenticationToken)
        var authToken = new UsernamePasswordAuthenticationToken(
                "user@example.com", null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(authToken);

        mockMvc.perform(get("/api/public/listings/" + LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.status").value("LIVE"))
                .andExpect(jsonPath("$.title").value("Sea View Villa"))
                .andExpect(jsonPath("$.daysOnMarket").value(5))
                .andExpect(jsonPath("$.backOnMarket").value(false))
                .andExpect(jsonPath("$.firstPublishedAt").isNotEmpty())
                // #758: single-listing response exposes images[] with non-empty URLs, ordered by position
                .andExpect(jsonPath("$.images.length()").value(3))
                .andExpect(jsonPath("$.images[0].url").value("https://cdn.example.com/img-a.jpg"))
                .andExpect(jsonPath("$.images[0].position").value(0))
                .andExpect(jsonPath("$.images[1].url").value("https://cdn.example.com/img-b.jpg"))
                .andExpect(jsonPath("$.images[1].position").value(1))
                .andExpect(jsonPath("$.images[2].url").value("https://cdn.example.com/img-c.jpg"))
                .andExpect(jsonPath("$.images[2].position").value(2))
                // Whitelist: no internal fields leak
                .andExpect(jsonPath("$.images[0].storagePath").doesNotExist())
                .andExpect(jsonPath("$.images[0].storage_path").doesNotExist())
                .andExpect(jsonPath("$.images[0].id").doesNotExist())
                .andExpect(jsonPath("$.images[0].listingId").doesNotExist());
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

    // ==================== GET /within-polygon — happy path (empty result) ====================

    @Test
    void withinPolygon_validPolygon_returns200WithPaginatedResponse() throws Exception {
        Page<Listing> emptyPage = new PageImpl<>(List.of(), PageRequest.of(0, 50), 0);
        when(listingRepository.findLiveListingsWithinPolygon(anyString(), any(PageRequest.class)))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/public/listings/within-polygon")
                        .param("polygon", "[[13.35,74.79],[13.36,74.80],[13.34,74.80]]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(0))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(50));
    }

    // ==================== GET /within-polygon — with results (teaser fields) ====================

    @Test
    void withinPolygon_withResults_returns200WithTeaserContent() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "house",
                "Polygon Villa", "Udupi", new BigDecimal("15000000"), "Inside polygon");
        listing.setListingPurpose("SALE");
        Page<Listing> page = new PageImpl<>(List.of(listing), PageRequest.of(0, 50), 1);
        when(listingRepository.findLiveListingsWithinPolygon(anyString(), any(PageRequest.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/public/listings/within-polygon")
                        .param("polygon", "[[13.35,74.79],[13.36,74.80],[13.34,74.80]]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                // teaser fields present
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].locality").value("Udupi"))
                .andExpect(jsonPath("$.content[0].propertyType").value("house"))
                .andExpect(jsonPath("$.content[0].listingPurpose").value("SALE"))
                // sensitive fields absent
                .andExpect(jsonPath("$.content[0].latitude").doesNotExist())
                .andExpect(jsonPath("$.content[0].title").doesNotExist());
    }

    // ==================== GET /discovery — empty result ====================

    @Test
    void discovery_noListings_returns200WithEmptyContent() throws Exception {
        Page<Listing> emptyPage = new PageImpl<>(List.of(), PageRequest.of(0, 50), 0);
        when(listingRepository.findAllLiveListings(any(PageRequest.class))).thenReturn(emptyPage);

        mockMvc.perform(get("/api/public/listings/discovery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(50));
    }

    // ==================== GET /discovery — with results (teaser fields) ====================

    @Test
    void discovery_withListings_returnsTeaserContent() throws Exception {
        Listing listing = buildListing(LISTING_ID, ListingStatus.LIVE.toDbValue(), "land",
                "Discovery Plot", "Manipal", new BigDecimal("3000000"), "A plot");
        listing.setListingPurpose("SALE");
        Page<Listing> page = new PageImpl<>(List.of(listing), PageRequest.of(0, 50), 1);
        when(listingRepository.findAllLiveListings(any(PageRequest.class))).thenReturn(page);

        mockMvc.perform(get("/api/public/listings/discovery"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.totalPages").value(1))
                // teaser fields present
                .andExpect(jsonPath("$.content[0].id").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$.content[0].locality").value("Manipal"))
                .andExpect(jsonPath("$.content[0].propertyType").value("land"))
                .andExpect(jsonPath("$.content[0].listingPurpose").value("SALE"))
                .andExpect(jsonPath("$.content[0].price").value(3000000))
                // sensitive fields absent
                .andExpect(jsonPath("$.content[0].latitude").doesNotExist())
                .andExpect(jsonPath("$.content[0].title").doesNotExist())
                .andExpect(jsonPath("$.content[0].description").doesNotExist());
    }

    // ==================== GET /within-polygon — invalid JSON -> 400 ====================

    @Test
    void withinPolygon_invalidJson_returns400() throws Exception {
        mockMvc.perform(get("/api/public/listings/within-polygon")
                        .param("polygon", "not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Invalid polygon JSON: expected array of [lat,lng] pairs"));
    }

    // ==================== GET /within-polygon — too few vertices -> 400 ====================

    @Test
    void withinPolygon_tooFewVertices_returns400() throws Exception {
        mockMvc.perform(get("/api/public/listings/within-polygon")
                        .param("polygon", "[[13.35,74.79],[13.36,74.80]]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Polygon must have at least 3 vertices"));
    }

    // ==================== GET /within-polygon — missing polygon param -> 400 ====================

    @Test
    void withinPolygon_missingParam_returns400() throws Exception {
        mockMvc.perform(get("/api/public/listings/within-polygon"))
                .andExpect(status().isBadRequest());
    }

    // ==================== GET /within-polygon — coordinates out of range -> 400 ====================

    @Test
    void withinPolygon_coordsOutOfRange_returns400() throws Exception {
        mockMvc.perform(get("/api/public/listings/within-polygon")
                        .param("polygon", "[[91.0,74.79],[13.36,74.80],[13.34,74.80]]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Coordinates out of range: lat must be [-90,90], lng must be [-180,180]"));
    }

    // ==================== parsePolygon unit tests ====================

    @Test
    void parsePolygon_autoClosesRing() {
        List<double[]> result = PublicListingController.parsePolygon(
                "[[13.35,74.79],[13.36,74.80],[13.34,74.80]]");
        // 3 vertices + 1 auto-close = 4
        assertEquals(4, result.size());
        assertEquals(result.get(0)[0], result.get(3)[0]);
        assertEquals(result.get(0)[1], result.get(3)[1]);
    }

    @Test
    void parsePolygon_alreadyClosedRing_noDoubleClose() {
        List<double[]> result = PublicListingController.parsePolygon(
                "[[13.35,74.79],[13.36,74.80],[13.34,74.80],[13.35,74.79]]");
        // Already closed, no extra point
        assertEquals(4, result.size());
    }

    @Test
    void toPolygonWkt_correctFormat() {
        List<double[]> coords = List.of(
                new double[]{13.35, 74.79},
                new double[]{13.36, 74.80},
                new double[]{13.34, 74.80},
                new double[]{13.35, 74.79}
        );
        String wkt = PublicListingController.toPolygonWkt(coords);
        // WKT uses lng lat order
        assertEquals("POLYGON((74.790000 13.350000, 74.800000 13.360000, 74.800000 13.340000, 74.790000 13.350000))", wkt);
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
