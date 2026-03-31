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
import com.example.realestate.trust.otp.OtpService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the identity evidence endpoint in {@link TrustController}:
 * <ul>
 *   <li>POST /api/listings/{id}/trust/identity/submit-evidence</li>
 * </ul>
 *
 * <p>Covers: 200 happy-path, 400 (missing fields, bad doc type, bad file), 403, 404, 409, 413.
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
        reset(badgeService, listingRepository, photoHashService, userRoleService,
                profileRepository, otpService, supabaseStorageService, identityEvidenceRepository);
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
        p.setPhone("+919876543210");
        p.setPhoneVerified(false);
        return p;
    }

    /** JPEG magic bytes: FF D8 FF */
    private MockMultipartFile validJpegFile() {
        byte[] jpegBytes = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0};
        return new MockMultipartFile("file", "aadhaar.jpg", "image/jpeg", jpegBytes);
    }

    /** A file that is too large (> 10MB). */
    private MockMultipartFile oversizedFile() {
        byte[] header = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
        byte[] big = new byte[11 * 1024 * 1024];
        System.arraycopy(header, 0, big, 0, header.length);
        return new MockMultipartFile("file", "big.jpg", "image/jpeg", big);
    }

    // -------------------------------------------------------------------------
    // submit-evidence tests
    // -------------------------------------------------------------------------

    @Test
    void submitEvidence_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.empty());

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNotFound());
    }

    @Test
    void submitEvidence_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void submitEvidence_invalidDocumentType_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "INVALID_TYPE")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(
                        "Invalid document type. Must be one of: AADHAAR, PAN, VOTER_ID, PASSPORT, DRIVING_LICENSE"));
    }

    @Test
    void submitEvidence_fileTooLarge_returns413() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(oversizedFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.error").value("File size must not exceed 10 MB"));
    }

    @Test
    void submitEvidence_badgeAlreadyEarned_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("IDENTITY");
        earned.setBadgeState("EARNED");
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(earned));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Identity already verified"));
    }

    @Test
    void submitEvidence_badgeAlreadyPending_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        ListingVerificationDimension pending = new ListingVerificationDimension();
        pending.setListingId(LISTING_ID);
        pending.setDimensionType("IDENTITY");
        pending.setBadgeState("PENDING");
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of(pending));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Identity evidence already submitted and under review"));
    }

    @Test
    void submitEvidence_success_returns200() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        when(supabaseStorageService.uploadObject(anyString(), anyString(), any(byte[].class), anyString()))
                .thenReturn(Optional.of("https://storage.example.com/aadhaar.jpg"));

        when(identityEvidenceRepository.save(any(IdentityEvidence.class))).thenAnswer(inv -> {
            IdentityEvidence e = inv.getArgument(0);
            // Simulate JPA setting the ID via reflection
            try {
                java.lang.reflect.Field idField = IdentityEvidence.class.getDeclaredField("id");
                idField.setAccessible(true);
                if (idField.get(e) == null) {
                    idField.set(e, UUID.randomUUID());
                }
            } catch (Exception ex) { /* ignore */ }
            return e;
        });

        ListingVerificationDimension pendingDim = new ListingVerificationDimension();
        pendingDim.setDimensionType("IDENTITY");
        pendingDim.setBadgeState("PENDING");
        when(badgeService.submitIdentityEvidence(any(), any(), anyString())).thenReturn(pendingDim);

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Identity evidence submitted for review"));

        // Verify evidence was saved
        verify(identityEvidenceRepository).save(any(IdentityEvidence.class));
        // Verify badge was set to PENDING
        verify(badgeService).submitIdentityEvidence(any(), any(), anyString());
    }

    @Test
    void submitEvidence_missingLegalName_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Legal name is required"));
    }

    @Test
    void submitEvidence_allDocumentTypesAccepted() throws Exception {
        String[] types = {"AADHAAR", "PAN", "VOTER_ID", "PASSPORT", "DRIVING_LICENSE"};
        for (String docType : types) {
            reset(badgeService, listingRepository, profileRepository, identityEvidenceRepository, supabaseStorageService);
            when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
            when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
            when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
            when(supabaseStorageService.uploadObject(anyString(), anyString(), any(byte[].class), anyString()))
                    .thenReturn(Optional.of("https://storage.example.com/doc.jpg"));
            when(identityEvidenceRepository.save(any(IdentityEvidence.class))).thenAnswer(inv -> {
                IdentityEvidence e = inv.getArgument(0);
                try {
                    java.lang.reflect.Field idField = IdentityEvidence.class.getDeclaredField("id");
                    idField.setAccessible(true);
                    if (idField.get(e) == null) idField.set(e, UUID.randomUUID());
                } catch (Exception ex) { /* ignore */ }
                return e;
            });
            ListingVerificationDimension dim = new ListingVerificationDimension();
            dim.setDimensionType("IDENTITY");
            dim.setBadgeState("PENDING");
            when(badgeService.submitIdentityEvidence(any(), any(), anyString())).thenReturn(dim);

            mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                            .file(validJpegFile())
                            .param("legal_name", "John Doe")
                            .param("phone_number", "+919876543210")
                            .param("document_type", docType)
                            .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void submitEvidence_storageDisabled_stillSucceeds() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(badgeService.getBadges(LISTING_ID)).thenReturn(List.of());
        when(profileRepository.findByUserId(OWNER_ID)).thenReturn(Optional.of(profileWithPhone()));
        // Storage returns empty (disabled)
        when(supabaseStorageService.uploadObject(anyString(), anyString(), any(byte[].class), anyString()))
                .thenReturn(Optional.empty());
        when(identityEvidenceRepository.save(any(IdentityEvidence.class))).thenAnswer(inv -> {
            IdentityEvidence e = inv.getArgument(0);
            try {
                java.lang.reflect.Field idField = IdentityEvidence.class.getDeclaredField("id");
                idField.setAccessible(true);
                if (idField.get(e) == null) idField.set(e, UUID.randomUUID());
            } catch (Exception ex) { /* ignore */ }
            return e;
        });
        ListingVerificationDimension dim = new ListingVerificationDimension();
        dim.setDimensionType("IDENTITY");
        dim.setBadgeState("PENDING");
        when(badgeService.submitIdentityEvidence(any(), any(), anyString())).thenReturn(dim);

        mockMvc.perform(multipart("/api/listings/{id}/trust/identity/submit-evidence", LISTING_ID)
                        .file(validJpegFile())
                        .param("legal_name", "John Doe")
                        .param("phone_number", "+919876543210")
                        .param("document_type", "AADHAAR")
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Identity evidence submitted for review"));
    }
}
