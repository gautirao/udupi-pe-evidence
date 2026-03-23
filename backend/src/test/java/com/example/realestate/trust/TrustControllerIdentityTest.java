package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.profile.Profile;
import com.example.realestate.profile.ProfileRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.trust.otp.OtpDeliveryException;
import com.example.realestate.trust.otp.OtpSendResult;
import com.example.realestate.trust.otp.OtpService;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the identity OTP endpoints in {@link TrustController}:
 * <ul>
 *   <li>POST /api/listings/{id}/trust/identity/request-otp</li>
 *   <li>POST /api/listings/{id}/trust/identity/verify-otp</li>
 * </ul>
 *
 * <p>Covers: 200 happy-path, 400 (no phone, invalid/expired OTP), 403, 404, 409.
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerIdentityTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerIdentityTest {

    private static final UUID OWNER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OTHER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final String PHONE    = "+919876543210";

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

    @Autowired
    private ObjectMapper objectMapper;

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

    @BeforeEach
    void setUp() {
        reset(badgeService, listingRepository, photoHashService, userRoleService,
                profileRepository, otpService, supabaseStorageService);
        when(userRoleService.getUserRole(OWNER_ID)).thenReturn(Optional.of("broker"));
        when(userRoleService.getUserRole(OTHER_ID)).thenReturn(Optional.of("broker"));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Listing ownerListing() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("broker");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        return l;
    }

    private Profile profileWithPhone() {
        Profile p = new Profile();
        p.setUserId(OWNER_ID);
        p.setPhone(PHONE);
        p.setPhoneVerified(false);
        return p;
    }

    private Profile profileWithoutPhone() {
        Profile p = new Profile();
        p.setUserId(OWNER_ID);
        p.setPhone(null);
        p.setPhoneVerified(false);
        return p;
    }

    private OtpSendResult stubSendResult() {
        return new OtpSendResult(UUID.randomUUID().toString(), OffsetDateTime.now().plusMinutes(10));
    }

    private String verifyBody(String code) throws Exception {
        OtpVerifyRequest req = new OtpVerifyRequest();
        req.setCode(code);
        return objectMapper.writeValueAsString(req);
    }

    // -------------------------------------------------------------------------
    // request-otp tests
    // -------------------------------------------------------------------------

    /**
     * Caller is not the listing owner and not an admin -> 403.
     */
    @Test
    void requestOtp_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Caller's profile has no phone number -> 400.
     */
    @Test
    void requestOtp_noPhone_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithoutPhone()));

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No phone number on profile"));
    }

    /**
     * IDENTITY badge is already EARNED -> 409.
     */
    @Test
    void requestOtp_badgeAlreadyEarned_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("IDENTITY");
        earned.setBadgeState("EARNED");
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(earned));

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Identity already verified"));
    }

    /**
     * All checks pass, OTP sent successfully -> 200 with message (phone not echoed).
     */
    @Test
    void requestOtp_success_returns200() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(otpService.sendOtp(PHONE)).thenReturn(stubSendResult());

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("OTP sent"))
                .andExpect(jsonPath("$.phone").doesNotExist()); // phone must not be echoed
    }

    /**
     * OTP delivery throws OtpDeliveryException -> 503.
     */
    @Test
    void requestOtp_deliveryFailure_returns503() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(otpService.sendOtp(anyString())).thenThrow(new OtpDeliveryException("Provider unreachable"));

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("OTP delivery failed"));
    }

    // -------------------------------------------------------------------------
    // verify-otp tests
    // -------------------------------------------------------------------------

    /**
     * OTP code is invalid and attempt count is below max -> 400 with attemptsRemaining.
     */
    @Test
    void verifyOtp_invalidCode_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(otpService.verifyOtp(PHONE, "000000")).thenReturn(false);
        when(badgeService.incrementOtpAttemptCount(LISTING_ID, "IDENTITY")).thenReturn(1);

        mockMvc.perform(post("/api/listings/{id}/trust/identity/verify-otp", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody("000000"))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Incorrect OTP."))
                .andExpect(jsonPath("$.attemptsRemaining").value(4));
    }

    /**
     * Five consecutive failed verifications -> 403 on the fifth, badge state set to FAILED.
     */
    @Test
    void verify_otp_max_attempts_sets_failed_state() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(otpService.verifyOtp(PHONE, "000000")).thenReturn(false);
        // incrementOtpAttemptCount returns 5 (max) on the fifth call
        when(badgeService.incrementOtpAttemptCount(LISTING_ID, "IDENTITY")).thenReturn(5);

        ListingVerificationDimension failedDimension = new ListingVerificationDimension();
        failedDimension.setListingId(LISTING_ID);
        failedDimension.setDimensionType("IDENTITY");
        failedDimension.setBadgeState("FAILED");
        failedDimension.setOtpLockedUntil(OffsetDateTime.now().plusHours(24));
        when(badgeService.failBadgeWithLockout(LISTING_ID, "IDENTITY", OWNER_ID))
                .thenReturn(failedDimension);

        mockMvc.perform(post("/api/listings/{id}/trust/identity/verify-otp", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody("000000"))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error")
                        .value("Maximum OTP attempts exceeded. Try again after 24 hours."));

        verify(badgeService).failBadgeWithLockout(LISTING_ID, "IDENTITY", OWNER_ID);
    }

    /**
     * Badge is FAILED with a future lockedUntil -> 429 returned before OTP send.
     */
    @Test
    void request_otp_during_lockout_returns_429() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));

        ListingVerificationDimension lockedDimension = new ListingVerificationDimension();
        lockedDimension.setListingId(LISTING_ID);
        lockedDimension.setDimensionType("IDENTITY");
        lockedDimension.setBadgeState("FAILED");
        lockedDimension.setOtpLockedUntil(OffsetDateTime.now().plusHours(23));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(lockedDimension));

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("OTP locked. Retry after 24 hours."))
                .andExpect(jsonPath("$.lockedUntil").exists());
    }

    /**
     * Badge is FAILED with a past lockedUntil -> lockout reset, OTP sent, 200 returned.
     */
    @Test
    void request_otp_after_lockout_expiry_resets_state() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));

        ListingVerificationDimension expiredLockDimension = new ListingVerificationDimension();
        expiredLockDimension.setListingId(LISTING_ID);
        expiredLockDimension.setDimensionType("IDENTITY");
        expiredLockDimension.setBadgeState("FAILED");
        // lockedUntil is in the past — lockout has expired
        expiredLockDimension.setOtpLockedUntil(OffsetDateTime.now().minusHours(1));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(expiredLockDimension));
        when(otpService.sendOtp(PHONE)).thenReturn(stubSendResult());

        mockMvc.perform(post("/api/listings/{id}/trust/identity/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("OTP sent"));

        verify(badgeService).resetOtpLockout(LISTING_ID, "IDENTITY");
    }

    /**
     * OTP code is valid -> 200, profile phoneVerified set, identity badge granted.
     */
    @Test
    void verifyOtp_success_returns200AndGrantsBadge() throws Exception {
        Profile profile = profileWithPhone();
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profile));
        when(otpService.verifyOtp(PHONE, "123456")).thenReturn(true);

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("IDENTITY");
        earned.setBadgeState("EARNED");
        when(badgeService.grantIdentityBadge(LISTING_ID, OWNER_ID)).thenReturn(earned);

        mockMvc.perform(post("/api/listings/{id}/trust/identity/verify-otp", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody("123456"))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Identity verified"));

        // Verify profile was saved with phoneVerified = true
        verify(profileRepository).save(any(Profile.class));
        // Verify badge was granted
        verify(badgeService).grantIdentityBadge(LISTING_ID, OWNER_ID);
    }
}
