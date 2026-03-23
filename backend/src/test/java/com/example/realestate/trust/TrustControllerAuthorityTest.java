package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.profile.Profile;
import com.example.realestate.profile.ProfileRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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
import org.springframework.mock.web.MockMultipartFile;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the authority badge endpoints in {@link TrustController}:
 * <ul>
 *   <li>POST /api/listings/{id}/trust/authority/request-otp</li>
 *   <li>POST /api/listings/{id}/trust/authority/verify-otp</li>
 *   <li>POST /api/listings/{id}/trust/authority/submit-mandate</li>
 * </ul>
 *
 * <p>Covers: 200 happy-path, 400, 403, 404, 409, 413, 503.
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerAuthorityTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerAuthorityTest {

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

    private Listing ownerTypeListing() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("owner");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        return l;
    }

    private Listing brokerTypeListing() {
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

    private MockMultipartFile validPdfFile() {
        // PDF magic bytes: %PDF (25 50 44 46) followed by padding
        byte[] content = new byte[1024];
        content[0] = 0x25; // %
        content[1] = 0x50; // P
        content[2] = 0x44; // D
        content[3] = 0x46; // F
        return new MockMultipartFile(
                "file", "mandate.pdf", "application/pdf", content);
    }

    private MockMultipartFile oversizedFile() {
        // 11 MB > 10 MB limit
        return new MockMultipartFile(
                "file", "big.pdf", "application/pdf",
                new byte[11 * 1024 * 1024]);
    }

    private MockMultipartFile wrongTypeFile() {
        return new MockMultipartFile(
                "file", "mandate.txt", "text/plain",
                new byte[512]);
    }

    private MockMultipartFile emptyFile() {
        return new MockMultipartFile(
                "file", "empty.pdf", "application/pdf",
                new byte[0]);
    }

    // =========================================================================
    // request-otp tests
    // =========================================================================

    /**
     * Listing does not exist -> 404.
     */
    @Test
    void requestOtp_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Caller is not the listing owner and not an admin -> 403.
     */
    @Test
    void requestOtp_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Listing seller_type is "broker" (not "owner") -> 400.
     */
    @Test
    void requestOtp_brokerListing_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Authority OTP is for owner listings only"));
    }

    /**
     * Caller's profile has no phone number -> 400.
     */
    @Test
    void requestOtp_noPhone_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithoutPhone()));

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No phone number on profile"));
    }

    /**
     * AUTHORITY badge is already EARNED -> 409.
     */
    @Test
    void requestOtp_badgeAlreadyEarned_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("AUTHORITY");
        earned.setBadgeState("EARNED");
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(earned));

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Authority already verified"));
    }

    /**
     * OTP delivery throws OtpDeliveryException -> 503.
     */
    @Test
    void requestOtp_deliveryFailure_returns503() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(otpService.sendOtp(anyString())).thenThrow(new OtpDeliveryException("Provider unreachable"));

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("OTP delivery failed"));
    }

    /**
     * All checks pass, OTP sent successfully -> 200 with message (phone not echoed).
     */
    @Test
    void requestOtp_success_returns200() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(otpService.sendOtp(PHONE)).thenReturn(stubSendResult());

        mockMvc.perform(post("/api/listings/{id}/trust/authority/request-otp", LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("OTP sent"))
                .andExpect(jsonPath("$.phone").doesNotExist()); // phone must not be echoed
    }

    // =========================================================================
    // verify-otp tests
    // =========================================================================

    /**
     * OTP code is invalid or expired -> 400.
     */
    @Test
    void verifyOtp_invalidCode_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(otpService.verifyOtp(PHONE, "000000")).thenReturn(false);

        mockMvc.perform(post("/api/listings/{id}/trust/authority/verify-otp", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody("000000"))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Invalid or expired OTP"));
    }

    /**
     * OTP code is valid -> 200, authority badge granted.
     */
    @Test
    void verifyOtp_success_returns200AndGrantsBadge() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(otpService.verifyOtp(PHONE, "123456")).thenReturn(true);

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("AUTHORITY");
        earned.setBadgeState("EARNED");
        when(badgeService.grantAuthorityBadge(LISTING_ID, OWNER_ID)).thenReturn(earned);

        mockMvc.perform(post("/api/listings/{id}/trust/authority/verify-otp", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody("123456"))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Authority verified"));

        verify(badgeService).grantAuthorityBadge(LISTING_ID, OWNER_ID);
    }

    // =========================================================================
    // submit-mandate tests
    // =========================================================================

    /**
     * Listing does not exist -> 404.
     */
    @Test
    void submitMandate_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.empty());

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(validPdfFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Caller is not the listing owner and not an admin -> 403.
     */
    @Test
    void submitMandate_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(validPdfFile())
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Listing seller_type is "owner" (not "broker") -> 400.
     */
    @Test
    void submitMandate_ownerListing_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerTypeListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(validPdfFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Mandate upload is for broker listings only"));
    }

    /**
     * File is empty -> 400.
     */
    @Test
    void submitMandate_emptyFile_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(emptyFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No file uploaded"));
    }

    /**
     * File exceeds 10 MB -> 413.
     */
    @Test
    void submitMandate_fileTooLarge_returns413() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(oversizedFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error").value("File size must not exceed 10 MB"));
    }

    /**
     * File has wrong content type (text/plain) -> 400.
     */
    @Test
    void submitMandate_wrongContentType_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(wrongTypeFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("File must be a PDF or image (JPEG/PNG)"));
    }

    /**
     * BadgeService throws AuthorityMandateAlreadySubmittedException -> 409.
     */
    @Test
    void submitMandate_alreadySubmitted_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));
        when(badgeService.submitAuthorityMandate(any(), any(), any()))
                .thenThrow(new AuthorityMandateAlreadySubmittedException("PENDING"));

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(validPdfFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Authority mandate is already pending"));
    }

    /**
     * Valid PDF uploaded, AUTHORITY not yet submitted -> 200, submitAuthorityMandate called.
     */
    @Test
    void submitMandate_validPdf_returns200() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(brokerTypeListing()));

        ListingVerificationDimension pending = new ListingVerificationDimension();
        pending.setListingId(LISTING_ID);
        pending.setDimensionType("AUTHORITY");
        pending.setBadgeState("PENDING");
        when(badgeService.submitAuthorityMandate(any(), any(), any())).thenReturn(pending);

        mockMvc.perform(multipart("/api/listings/{id}/trust/authority/submit-mandate", LISTING_ID)
                        .file(validPdfFile())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Mandate submitted for review"));

        verify(badgeService).submitAuthorityMandate(any(), any(), any());
    }
}
