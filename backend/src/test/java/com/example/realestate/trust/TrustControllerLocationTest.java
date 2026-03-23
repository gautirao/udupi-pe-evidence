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
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for the POST /api/listings/{id}/trust/location/verify endpoint in {@link TrustController}.
 *
 * <p>Covers: 200 happy-path, 400 (no stored coords), 403, 404, 409, 422 (outside threshold).
 */
@WebMvcTest(
        controllers = TrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({TrustControllerLocationTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class TrustControllerLocationTest {

    private static final UUID OWNER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OTHER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /** Listing stored at Udupi town center (approx). */
    private static final double LISTING_LAT = 13.3409;
    private static final double LISTING_LON = 74.7421;

    /** A point ~175m away from the listing — within the 200m threshold. */
    private static final double NEAR_LAT  = 13.3409;
    private static final double NEAR_LON  = 74.7439;   // ~175m east (0.0018° lon at 13° lat)

    /** A point ~400m away from the listing — outside the 200m threshold. */
    private static final double FAR_LAT  = 13.3409;
    private static final double FAR_LON  = 74.7461;   // ~400m east

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
                supabaseStorageService, dimensionRepository);
        when(userRoleService.getUserRole(OWNER_ID)).thenReturn(Optional.of("broker"));
        when(userRoleService.getUserRole(OTHER_ID)).thenReturn(Optional.of("broker"));
        // Default: no existing LOCATION dimension row — controller creates a fresh one (0 attempts).
        when(dimensionRepository.findByListingIdAndDimensionType(any(), any()))
                .thenReturn(Optional.empty());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Listing listingWithCoords() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("broker");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        l.setLatitude(LISTING_LAT);
        l.setLongitude(LISTING_LON);
        return l;
    }

    private Listing listingWithoutCoords() {
        Listing l = new Listing();
        l.setId(LISTING_ID);
        l.setCreatedBy(OWNER_ID);
        l.setSellerType("broker");
        l.setStatus(ListingStatus.LIVE.toDbValue());
        // latitude and longitude are intentionally null
        return l;
    }

    private String requestBody(double lat, double lon) throws Exception {
        LocationVerifyRequest req = new LocationVerifyRequest();
        req.setLatitude(lat);
        req.setLongitude(lon);
        req.setAccuracy(15.0);
        return objectMapper.writeValueAsString(req);
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * Caller is not the listing owner and not an admin -> 403.
     */
    @Test
    void verifyLocation_notOwner_returns403() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OTHER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Listing does not exist -> 404.
     */
    @Test
    void verifyLocation_listingNotFound_returns404() throws Exception {
        when(listingRepository.findById(any())).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").exists());
    }

    /**
     * Listing exists but has no stored lat/lng -> 400.
     */
    @Test
    void verifyLocation_noStoredCoords_returns400() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithoutCoords()));

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Listing has no stored location to compare against"));
    }

    /**
     * Submitted coordinates are within 200m of the listing location -> 200 with distanceMeters.
     */
    @Test
    void verifyLocation_withinThreshold_returns200() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("LOCATION");
        earned.setBadgeState("EARNED");
        when(badgeService.grantLocationBadge(any(), any(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(earned);

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Location verified"))
                .andExpect(jsonPath("$.distanceMeters").exists());
    }

    /**
     * Submitted coordinates are more than 200m from the listing location -> 422 with actual distance.
     */
    @Test
    void verifyLocation_outsideThreshold_returns422() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(FAR_LAT, FAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value(
                        org.hamcrest.Matchers.containsString("Location does not match")));
    }

    /**
     * LOCATION badge is already EARNED -> 409.
     */
    @Test
    void verifyLocation_alreadyVerified_returns409() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));
        when(badgeService.grantLocationBadge(any(), any(), anyDouble(), anyDouble(), anyDouble()))
                .thenThrow(new LocationAlreadyVerifiedException());

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Location already verified"));
    }

    /**
     * Caller has already made 5 attempts within the current 24-hour window.
     * The 6th attempt must be rejected with 429.
     */
    @Test
    void verifyLocation_6thAttemptInWindow_returns429() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));

        // Dimension already has 5 attempts recorded within a fresh window.
        ListingVerificationDimension rateLimitedDimension = new ListingVerificationDimension();
        rateLimitedDimension.setListingId(LISTING_ID);
        rateLimitedDimension.setDimensionType("LOCATION");
        rateLimitedDimension.setBadgeState("AVAILABLE");
        rateLimitedDimension.setLocationVerifyAttempts(5);
        rateLimitedDimension.setLocationVerifyWindowStart(OffsetDateTime.now().minusHours(1));
        when(dimensionRepository.findByListingIdAndDimensionType(LISTING_ID, "LOCATION"))
                .thenReturn(Optional.of(rateLimitedDimension));

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value(
                        "Too many location verification attempts. Try again tomorrow."));
    }

    /**
     * The previous window started 25 hours ago (expired).
     * The attempt must succeed — the window resets and the 429 gate is not triggered.
     */
    @Test
    void verifyLocation_windowResetAfter24h_allowsAttempt() throws Exception {
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(listingWithCoords()));

        // Window opened 25h ago with 5 attempts — but the window has expired.
        ListingVerificationDimension expiredWindowDimension = new ListingVerificationDimension();
        expiredWindowDimension.setListingId(LISTING_ID);
        expiredWindowDimension.setDimensionType("LOCATION");
        expiredWindowDimension.setBadgeState("AVAILABLE");
        expiredWindowDimension.setLocationVerifyAttempts(5);
        expiredWindowDimension.setLocationVerifyWindowStart(OffsetDateTime.now().minusHours(25));
        when(dimensionRepository.findByListingIdAndDimensionType(LISTING_ID, "LOCATION"))
                .thenReturn(Optional.of(expiredWindowDimension));

        ListingVerificationDimension earned = new ListingVerificationDimension();
        earned.setListingId(LISTING_ID);
        earned.setDimensionType("LOCATION");
        earned.setBadgeState("EARNED");
        when(badgeService.grantLocationBadge(any(), any(), anyDouble(), anyDouble(), anyDouble()))
                .thenReturn(earned);

        mockMvc.perform(post("/api/listings/{id}/trust/location/verify", LISTING_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody(NEAR_LAT, NEAR_LON))
                        .with(jwt().jwt(j -> j.subject(OWNER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Location verified"));
    }
}
