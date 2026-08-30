package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.profile.ProfileRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.trust.otp.OtpService;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for {@link TrustController}.
 *
 * <p>Tests AC1 (public /trust), AC2 (owner-only /trust-progress), and the
 * "no trustTier / rankingScore" contract on both endpoints.
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerTest {

    private static final UUID OWNER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OTHER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID  = UUID.fromString("00000000-0000-0000-0000-000000000099");

    // ---- Test security config: permits all (no-op chain, JWT post-processor still works) ----
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
    private BadgeService badgeService;

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private PhotoHashService photoHashService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private ProfileRepository profileRepository;

    @MockitoBean
    private OtpService otpService;

    @MockitoBean
    private SupabaseStorageService supabaseStorageService;

    @MockitoBean
    private ListingVerificationDimensionRepository dimensionRepository;

    @MockitoBean
    private IdentityEvidenceRepository identityEvidenceRepository;

    @BeforeEach
    void setUp() {
        reset(badgeService, listingRepository, supabaseStorageService);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Listing brokerListing() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("broker");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        return l;
    }

    private Listing ownerListing() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("owner");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        return l;
    }

    private ListingVerificationDimension earnedRow(String type) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(LISTING_ID);
        d.setDimensionType(type);
        d.setBadgeState("EARNED");
        d.setGrantedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
        return d;
    }

    private ListingVerificationDimension stateRow(String type, String state) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(LISTING_ID);
        d.setDimensionType(type);
        d.setBadgeState(state);
        if ("EARNED".equals(state)) {
            d.setGrantedAt(OffsetDateTime.parse("2026-01-01T00:00:00Z"));
        }
        return d;
    }

    private ListingVerificationDimension stateRowWithRejectionReason(
            String type, String state, String rejectionReason) {
        ListingVerificationDimension d = stateRow(type, state);
        d.setRejectionReason(rejectionReason);
        return d;
    }

    // =========================================================================
    // AC1 — GET /api/listings/{id}/trust  (PUBLIC)
    // =========================================================================

    /**
     * Listing has 2 earned + 1 available row. Response must contain only the 2 earned badges.
     * Must NOT contain trustTier or rankingScore.
     */
    @Test
    void getPublicTrust_liveListing_returnsEarnedBadges() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(
                earnedRow("IDENTITY"),
                earnedRow("LOCATION"),
                stateRow("PHOTOS", "AVAILABLE")
        ));

        mockMvc.perform(get("/api/listings/{id}/trust", LISTING_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.badges").isArray())
                .andExpect(jsonPath("$.badges.length()").value(2))
                .andExpect(jsonPath("$.badges[0].dimensionType").value("IDENTITY"))
                .andExpect(jsonPath("$.badges[1].dimensionType").value("LOCATION"))
                .andExpect(jsonPath("$.badges[0].grantedAt").exists())
                // Neither trustTier nor rankingScore must appear in the response
                .andExpect(jsonPath("$.trustTier").doesNotExist())
                .andExpect(jsonPath("$.rankingScore").doesNotExist());
    }

    /**
     * Listing not found → 404.
     */
    @Test
    void getPublicTrust_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(any())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/listings/{id}/trust", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Non-LIVE listing (e.g. DRAFT) → 404 to prevent existence disclosure.
     */
    @Test
    void getPublicTrust_nonLiveListing_returns404() throws Exception {
        Listing draft = new Listing();
        draft.setId(LISTING_ID);
        draft.setStatus(ListingStatus.DRAFT.toDbValue());
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draft));

        mockMvc.perform(get("/api/listings/{id}/trust", LISTING_ID))
                .andExpect(status().isNotFound());
    }

    // =========================================================================
    // AC2 — GET /api/listings/{id}/trust-progress  (AUTHENTICATED, owner-only)
    // =========================================================================

    /**
     * Caller is not the owner and not an admin → 403.
     */
    @Test
    void getTrustProgress_nonOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied — not the listing owner"));
    }

    /**
     * Caller is the owner. DB has 1 earned row (IDENTITY); LOCATION, PHOTOS, AUTHORITY are
     * not in DB → appear as AVAILABLE. CTA must point to LOCATION (first AVAILABLE in order).
     * Response must NOT include trustTier or rankingScore.
     */
    @Test
    void getTrustProgress_owner_returnsAllStates_withCta() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(earnedRow("IDENTITY")));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cta").value("LOCATION"))
                .andExpect(jsonPath("$.badges").isArray())
                .andExpect(jsonPath("$.badges.length()").value(4)) // IDENTITY, LOCATION, PHOTOS, AUTHORITY
                .andExpect(jsonPath("$.badges[0].dimensionType").value("IDENTITY"))
                .andExpect(jsonPath("$.badges[0].badgeState").value("EARNED"))
                .andExpect(jsonPath("$.badges[1].dimensionType").value("LOCATION"))
                .andExpect(jsonPath("$.badges[1].badgeState").value("AVAILABLE"))
                // trustTier and rankingScore must never appear
                .andExpect(jsonPath("$.trustTier").doesNotExist())
                .andExpect(jsonPath("$.rankingScore").doesNotExist());
    }

    /**
     * sellerType="owner" → AUTHORITY badge must have autoGranted=true in the response.
     */
    @Test
    void getTrustProgress_ownerListing_authorityAutoGranted() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(
                earnedRow("IDENTITY"), earnedRow("LOCATION"), earnedRow("PHOTOS"), earnedRow("AUTHORITY")
        ));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.badges.length()").value(4))
                // AUTHORITY is last (appended after the OWNER_DIMENSIONS loop)
                .andExpect(jsonPath("$.badges[3].dimensionType").value("AUTHORITY"))
                .andExpect(jsonPath("$.badges[3].autoGranted").value(true));
    }

    /**
     * sellerType="broker" → AUTHORITY badge is included in canonical order and must have autoGranted=null.
     */
    @Test
    void getTrustProgress_brokerListing_authorityNotAutoGranted() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(
                earnedRow("IDENTITY"), earnedRow("LOCATION"), earnedRow("PHOTOS"), earnedRow("AUTHORITY")
        ));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.badges.length()").value(4))
                .andExpect(jsonPath("$.badges[3].dimensionType").value("AUTHORITY"))
                // autoGranted must be null (not true) for broker listings
                .andExpect(jsonPath("$.badges[3].autoGranted", Matchers.nullValue()));
    }

    /**
     * All 4 canonical dimensions EARNED → cta is null (no pending work).
     */
    @Test
    void getTrustProgress_allEarned_ctaNull() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(
                earnedRow("IDENTITY"), earnedRow("LOCATION"), earnedRow("PHOTOS"), earnedRow("AUTHORITY")
        ));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                // cta is null when all badges are EARNED
                .andExpect(jsonPath("$.cta", Matchers.nullValue()));
    }

    /**
     * PHOTOS badge in AVAILABLE state with a rejectionReason set → rejectionReason appears in response.
     * IDENTITY and LOCATION have no rejectionReason → field is null.
     */
    @Test
    void getTrustProgress_rejectedDimension_rejectionReasonPresent() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(
                earnedRow("IDENTITY"),
                earnedRow("LOCATION"),
                stateRowWithRejectionReason("PHOTOS", "AVAILABLE", "Document appears expired"),
                earnedRow("AUTHORITY")
        ));

        mockMvc.perform(get("/api/listings/{id}/trust-progress", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.badges[2].dimensionType").value("PHOTOS"))
                .andExpect(jsonPath("$.badges[2].badgeState").value("AVAILABLE"))
                .andExpect(jsonPath("$.badges[2].rejectionReason").value("Document appears expired"))
                // Badges without a reason must serialize rejectionReason as null
                .andExpect(jsonPath("$.badges[0].rejectionReason", Matchers.nullValue()));
    }
}
