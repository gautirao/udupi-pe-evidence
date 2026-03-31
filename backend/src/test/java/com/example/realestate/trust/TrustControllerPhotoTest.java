package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.profile.ProfileRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the POST /api/listings/{id}/trust/photos/verify endpoint in {@link TrustController}.
 *
 * <p>Covers: 200 happy-path, 400 (empty, invalid mime, corrupt), 403, 404, 409, 413, 422.
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerPhotoTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerPhotoTest {

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
        reset(badgeService, listingRepository, photoHashService, userRoleService, supabaseStorageService);
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

    private static MockMultipartFile dummyPart() {
        // Minimal non-empty file bytes — actual content irrelevant as PhotoHashService is mocked
        return new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[]{1, 2, 3});
    }

    private static MockMultipartFile emptyPart() {
        return new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[0]);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * Caller is not the owner and not an admin -> 403.
     */
    @Test
    void submitPhoto_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Listing does not exist -> 404.
     */
    @Test
    void submitPhoto_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(any())).thenReturn(Optional.empty());

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", UUID.randomUUID())
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns FILE_EMPTY -> 400.
     */
    @Test
    void submitPhoto_emptyFile_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.FILE_EMPTY);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(emptyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns FILE_TOO_LARGE -> 413.
     */
    @Test
    void submitPhoto_fileTooLarge_returns413() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.FILE_TOO_LARGE);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isRequestEntityTooLarge())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns INVALID_IMAGE (unsupported type or corrupt bytes) -> 400.
     */
    @Test
    void submitPhoto_invalidMimeType_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.INVALID_IMAGE);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns INVALID_IMAGE for corrupt bytes -> 400.
     */
    @Test
    void submitPhoto_corruptImage_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.INVALID_IMAGE);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns BLOCKED -> 422.
     */
    @Test
    void submitPhoto_blockedHash_returns422() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.BLOCKED);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * verifyAndCheck returns OK, submitPhotos succeeds -> 200.
     */
    @Test
    void submitPhoto_validImage_returns200AndSetsPending() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.OK);

        ListingVerificationDimension pending = new ListingVerificationDimension();
        pending.setListingId(LISTING_ID);
        pending.setDimensionType("PHOTOS");
        pending.setBadgeState("PENDING");
        when(badgeService.submitPhotos(any(), any(), any())).thenReturn(pending);

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Photo submitted for review"));
    }

    /**
     * verifyAndCheck returns OK but PHOTOS badge already PENDING -> 409.
     */
    @Test
    void submitPhoto_alreadyPending_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(ownerListing()));
        when(photoHashService.verifyAndCheck(any())).thenReturn(PhotoVerifyResult.OK);
        when(badgeService.submitPhotos(any(), any(), any()))
                .thenThrow(new PhotoAlreadySubmittedException("PENDING"));

        mockMvc.perform(multipart("/api/listings/{id}/trust/photos/verify", LISTING_ID)
                        .file(dummyPart())
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Photo verification is already pending"));
    }
}
