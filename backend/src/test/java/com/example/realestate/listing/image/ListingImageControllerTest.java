package com.example.realestate.listing.image;

import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.storage.LocalDevStorageService;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.example.realestate.trust.BadgeInvalidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.NestedTestConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.endsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = ListingImageController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingImageControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        RateLimiterService.class})
class ListingImageControllerTest {

    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID OTHER_DEALER = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID IMAGE_ID = UUID.fromString("00000000-0000-0000-0000-000000000050");

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}))
                    .build();
        }

        @Bean
        public JwtDecoder jwtDecoder() {
            // Stub decoder — the jwt() MockMvc post-processor bypasses actual JWT validation.
            return token -> { throw new UnsupportedOperationException("stub"); };
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ListingRepository listingRepository;

    @MockitoBean
    private ListingImageRepository imageRepository;

    @MockitoBean
    private SupabaseStorageService storageService;

    @MockitoBean
    private LocalDevStorageService localDevStorageService;

    @MockitoBean
    private ListingImageRegistrar imageRegistrar;

    @MockitoBean
    private ListingImageService imageService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private BadgeInvalidationService badgeInvalidationService;

    private Listing draftListing;

    @BeforeEach
    void setUp() {
        reset(listingRepository, imageRepository, imageService, listingWorkflowService);

        draftListing = new Listing();
        draftListing.setId(LISTING_ID);
        draftListing.setCreatedBy(DEALER_ID);
        draftListing.setStatus(ListingStatus.DRAFT.toDbValue());
        draftListing.setPropertyType("land");
        draftListing.setCreatedAt(OffsetDateTime.now());
        draftListing.setUpdatedAt(OffsetDateTime.now());
    }

    private String validPath() {
        return "listings/" + DEALER_ID + "/" + LISTING_ID + "/photo1.jpg";
    }

    private String validUrl() {
        return "https://storage.supabase.co/listing-images/" + validPath();
    }

    private void stubDealerWithDraftListing() {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(draftListing);
    }

    // ==================== Test 1: POST register image -> 201 ====================

    @Test
    void register_validImage_returns201() throws Exception {
        stubDealerWithDraftListing();

        ListingImage saved = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 2);
        ResponseEntity<?> created201 = ResponseEntity.status(HttpStatus.CREATED)
                .body(ListingImageController.toResponse(saved, localDevStorageService));
        doReturn(created201).when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(IMAGE_ID.toString()))
                .andExpect(jsonPath("$.position").value(2))
                .andExpect(jsonPath("$.storagePath").value(validPath()));
    }

    // ==================== Test 2: POST > 10 images -> 400 ====================

    @Test
    void register_maxImagesReached_returns400() throws Exception {
        stubDealerWithDraftListing();
        ResponseEntity<?> bad400 = ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", "Maximum 10 images per listing"));
        doReturn(bad400).when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Maximum 10 images per listing"));

        verify(imageRepository, never()).save(any());
    }

    // ==================== Test 3: POST wrong status -> 400 ====================

    @Test
    void register_liveStatus_returns400() throws Exception {

        draftListing.setStatus(ListingStatus.LIVE.toDbValue());
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(draftListing);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot modify images for listing with status LIVE"));
    }

    // ==================== Test 4: POST invalid extension -> 400 ====================

    @Test
    void register_invalidExtension_returns400() throws Exception {
        stubDealerWithDraftListing();
        String gifPath = "listings/" + DEALER_ID + "/" + LISTING_ID + "/photo.gif";

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"https://example.com/photo.gif"}
                                """.formatted(gifPath)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Allowed image types: jpg, jpeg, png, webp"));
    }

    // ==================== Test 5: POST wrong storage prefix -> 400 ====================

    @Test
    void register_wrongPrefix_returns400() throws Exception {
        stubDealerWithDraftListing();
        String wrongPath = "listings/wrong-user/" + LISTING_ID + "/photo.jpg";

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"https://example.com/photo.jpg"}
                                """.formatted(wrongPath)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());
    }

    // ==================== Test 6: POST other broker's listing -> 404 ====================

    @Test
    void register_otherDealerListing_returns404() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, OTHER_DEALER, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // draftListing.createdBy = DEALER_ID (non-null), so secondary re-read → 404
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(OTHER_DEALER.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"listings/%s/%s/photo.jpg","url":"https://x.com/p.jpg"}
                                """.formatted(OTHER_DEALER, LISTING_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 7: POST duplicate storagePath -> 409 ====================

    @Test
    void register_duplicatePath_returns409() throws Exception {
        stubDealerWithDraftListing();
        ResponseEntity<?> conflict409 = ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Image already registered"));
        doReturn(conflict409).when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Image already registered"));
    }

    // ==================== Test 8: POST without JWT -> 401 ====================

    @Test
    void register_withoutJwt_returns401() throws Exception {
        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"x","url":"y"}
                                """))
                .andExpect(status().isUnauthorized());
    }

    // ==================== Test 9: DELETE image -> 204 ====================

    @Test
    void delete_existingImage_returns204() throws Exception {
        stubDealerWithDraftListing();
        ListingImage image = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 0);
        when(imageRepository.findByIdAndListingId(IMAGE_ID, LISTING_ID))
                .thenReturn(Optional.of(image));
        doNothing().when(imageService).deleteImage(image);

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNoContent());

        verify(imageService).deleteImage(image);
    }

    // ==================== Test 10: DELETE image not found -> 404 ====================

    @Test
    void delete_imageNotFound_returns404() throws Exception {
        stubDealerWithDraftListing();
        when(imageRepository.findByIdAndListingId(IMAGE_ID, LISTING_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Image not found"));
    }

    // ==================== Test 11: PUT reorder -> 200 ====================

    @Test
    void reorder_validOrder_returns200() throws Exception {
        stubDealerWithDraftListing();

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000051");
        UUID id2 = UUID.fromString("00000000-0000-0000-0000-000000000052");
        UUID id3 = UUID.fromString("00000000-0000-0000-0000-000000000053");

        ListingImage img3 = buildImage(id3, LISTING_ID, "p3.jpg", "u3", 0);
        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "u1", 1);
        ListingImage img2 = buildImage(id2, LISTING_ID, "p2.jpg", "u2", 2);

        when(imageService.reorderImages(eq(LISTING_ID), anyList()))
                .thenReturn(List.of(img3, img1, img2));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s","%s","%s"]}
                                """.formatted(id3, id1, id2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));

        verify(imageService).reorderImages(eq(LISTING_ID), anyList());
    }

    // ==================== Test 12: PUT reorder with missing IDs -> 400 ====================

    @Test
    void reorder_missingIds_returns400() throws Exception {
        stubDealerWithDraftListing();

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000051");

        when(imageService.reorderImages(eq(LISTING_ID), anyList()))
                .thenThrow(new IllegalArgumentException("imageIds must contain exactly all images for this listing"));

        // Only send id1, missing id2
        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s"]}
                                """.formatted(id1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imageIds must contain exactly all images for this listing"));

        verify(imageRepository, never()).saveAll(anyList());
    }

    // ==================== Test 12b: PUT reorder — local dev storage enabled -> URL overridden (#2351) ====================

    @Test
    void reorder_localDevStorageEnabled_returnsLocalDisplayUrl() throws Exception {
        stubDealerWithDraftListing();

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000071");
        ListingImage img1 = buildImage(id1, LISTING_ID, validPath(), validUrl(), 0);

        when(imageService.reorderImages(eq(LISTING_ID), anyList())).thenReturn(List.of(img1));

        String localUrl = "http://localhost:8085/api/dev/local-storage/public/listing-images/" + validPath();
        when(localDevStorageService.resolveDisplayUrl("listing-images", validPath(), validUrl()))
                .thenReturn(localUrl);

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s"]}
                                """.formatted(id1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].url").value(localUrl));
    }

    // ==================== Test 13: GET images — empty list -> 200 [] ====================

    @Test
    void getImages_withNoImages_returns200EmptyList() throws Exception {
        stubDealerWithDraftListing();
        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ==================== Test 14: GET images — ordered list -> 200 ====================

    @Test
    void getImages_withImages_returnsOrderedList() throws Exception {
        stubDealerWithDraftListing();

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000061");
        UUID id2 = UUID.fromString("00000000-0000-0000-0000-000000000062");
        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "https://x.com/1.jpg", 0);
        ListingImage img2 = buildImage(id2, LISTING_ID, "p2.jpg", "https://x.com/2.jpg", 1);

        when(imageService.getImages(LISTING_ID))
                .thenReturn(List.of(img1, img2));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(id1.toString()))
                .andExpect(jsonPath("$[0].position").value(0))
                .andExpect(jsonPath("$[1].id").value(id2.toString()))
                .andExpect(jsonPath("$[1].position").value(1));
    }

    // ==================== Test 14b: GET images — local dev storage enabled -> URL overridden (#2351) ====================

    /**
     * #2351 BLOCKING fix: when local dev storage is enabled, getImages must return the local
     * display URL from {@link LocalDevStorageService#getPublicUrl}, never the client-supplied
     * (Supabase-style) URL persisted on the entity.
     */
    @Test
    void getImages_localDevStorageEnabled_returnsLocalDisplayUrl() throws Exception {
        stubDealerWithDraftListing();

        ListingImage img1 = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 0);
        when(imageService.getImages(LISTING_ID)).thenReturn(List.of(img1));

        String localUrl = "http://localhost:8085/api/dev/local-storage/public/listing-images/" + validPath();
        when(localDevStorageService.resolveDisplayUrl("listing-images", validPath(), validUrl()))
                .thenReturn(localUrl);

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].url").value(localUrl));
    }

    // ==================== Test 14c: GET images — local dev storage disabled -> Supabase URL unchanged (regression guard) ====================

    @Test
    void getImages_localDevStorageDisabled_passesThroughClientSuppliedUrlUnchanged() throws Exception {
        stubDealerWithDraftListing();

        ListingImage img1 = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 0);
        when(imageService.getImages(LISTING_ID)).thenReturn(List.of(img1));
        when(localDevStorageService.resolveDisplayUrl("listing-images", validPath(), validUrl()))
                .thenReturn(validUrl());

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].url").value(validUrl()));
    }

    // ==================== Test 15: GET images — no auth -> 401 ====================

    @Test
    void getImages_withoutAuth_returns401() throws Exception {
        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images"))
                .andExpect(status().isUnauthorized());
    }

    // ==================== Test 16: GET images — different broker -> 404 ====================

    @Test
    void getImages_differentDealer_returns403or404() throws Exception {

        when(listingWorkflowService.findListingForCaller(LISTING_ID, OTHER_DEALER, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // draftListing.createdBy = DEALER_ID (non-null), so secondary re-read → 404
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(OTHER_DEALER.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 17: GET images — LIVE listing -> 200 (no status guard on GET) ====================

    @Test
    void getImages_liveListing_returns200() throws Exception {
        // getImages has no status guard; it intentionally works for any status the caller owns.

        Listing liveListing = new Listing();
        liveListing.setId(LISTING_ID);
        liveListing.setCreatedBy(DEALER_ID);
        liveListing.setStatus(ListingStatus.LIVE.toDbValue());
        liveListing.setPropertyType("land");
        liveListing.setCreatedAt(OffsetDateTime.now());
        liveListing.setUpdatedAt(OffsetDateTime.now());
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(liveListing);

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000071");
        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "https://x.com/1.jpg", 0);
        when(imageService.getImages(LISTING_ID))
                .thenReturn(List.of(img1));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id1.toString()));
    }

    // ==================== Test 18: POST register — SCRAPED listing (null createdBy) -> 403 ====================

    /**
     * RE-166: when a listing has no owner (SCRAPED), storage-path validation must return 403,
     * not produce a "listings/null/..." path and return a misleading 400.
     * Admins can pass findOwnedListing (isAdmin bypasses ownership check), so the null-owner
     * guard in registerImage is the only protection for this path.
     */
    @Test
    void register_scrapedListing_nullCreatedBy_returns403() throws Exception {
        UUID adminId = UUID.fromString("00000000-0000-0000-0000-000000000099");

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        // Admin bypasses ownership check — findListingForCaller returns the listing.
        // The null-owner guard fires later inside registerImage itself.
        when(listingWorkflowService.findListingForCaller(LISTING_ID, adminId, true))
                .thenReturn(scraped);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(adminId.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"listings/some-path/photo.jpg","url":"https://x.com/photo.jpg"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Cannot upload images to a listing with no owner"));
    }

    // ==================== Test 19: GET images — SCRAPED listing + dealer caller -> 403 ====================

    /**
     * RE-166 BLOCKING: getImages must return 403 (not 404) when the listing is SCRAPED
     * (createdBy == null) and the caller is a non-admin dealer.
     */
    @Test
    void getImages_scrapedListing_dealerCaller_returns403() throws Exception {


        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.LIVE.toDbValue());
        scraped.setPropertyType("house");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // Secondary re-read: null createdBy → 403
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: listing has no owner"));
    }

    // ==================== Test 20: DELETE image — SCRAPED listing + dealer caller -> 403 ====================

    /**
     * RE-166 BLOCKING: deleteImage must return 403 (not 404) when the listing is SCRAPED
     * (createdBy == null) and the caller is a non-admin dealer.
     */
    @Test
    void deleteImage_scrapedListing_dealerCaller_returns403() throws Exception {


        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // Secondary re-read: null createdBy → 403
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: listing has no owner"));
    }

    // ==================== Test 21: PUT reorder — SCRAPED listing + dealer caller -> 403 ====================

    /**
     * RE-166 BLOCKING: reorderImages must return 403 (not 404) when the listing is SCRAPED
     * (createdBy == null) and the caller is a non-admin dealer.
     */
    @Test
    void reorderImages_scrapedListing_dealerCaller_returns403() throws Exception {


        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // Secondary re-read: null createdBy → 403
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s"]}
                                """.formatted(IMAGE_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: listing has no owner"));
    }

    // ==================== Test 22: POST register — lock timeout bubbles from registrar -> 503 ====================

    /**
     * RE-164: if PessimisticLockingFailureException escapes the registrar bean
     * (e.g. thrown during transaction commit), the controller's defensive catch
     * must return 503 with Retry-After: 1 rather than let Spring's default
     * exception handler return 500.
     */
    @Test
    void register_lockTimeoutBubblesFromRegistrar_returns503() throws Exception {
        stubDealerWithDraftListing();
        doThrow(new PessimisticLockingFailureException("lock timeout"))
                .when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Retry-After", "1"))
                .andExpect(jsonPath("$.error").value("Upload temporarily busy, please retry"));
    }

    // ==================== Test 23: POST register — SCRAPED listing + non-admin dealer caller -> 403 from findOwnedListing ====================

    /**
     * RE-166 ADVISORY-FIX: registerImage must return 403 (via findOwnedListing → FindResult.forbidden)
     * when the listing is SCRAPED (createdBy == null) and the caller is a non-admin dealer.
     * This is distinct from Test 18 which uses an admin caller: the admin bypasses the ownership
     * check in findOwnedListing and instead hits the later null-owner guard inside registerImage itself,
     * returning a different message. Here the 403 originates in findOwnedListing.
     */
    @Test
    void registerImage_scrapedListing_dealerCaller_returns403() throws Exception {


        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // Secondary re-read: null createdBy → 403
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"listings/some-path/photo.jpg","url":"https://x.com/photo.jpg"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: listing has no owner"));
    }

    // ==================== Test 24: POST register — success triggers PHOTOS badge invalidation ====================

    @Test
    void register_validImage_triggersBadgeInvalidation() throws Exception {
        stubDealerWithDraftListing();

        ListingImage saved = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 0);
        ResponseEntity<?> created201 = ResponseEntity.status(HttpStatus.CREATED)
                .body(ListingImageController.toResponse(saved, localDevStorageService));
        doReturn(created201).when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));
        doNothing().when(badgeInvalidationService)
                .invalidateSpecificDimension(eq(LISTING_ID), eq("PHOTOS"), eq("IMAGE_CHANGE"));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"%s","url":"%s"}
                                """.formatted(validPath(), validUrl())))
                .andExpect(status().isCreated());

        verify(badgeInvalidationService).invalidateSpecificDimension(LISTING_ID, "PHOTOS", "IMAGE_CHANGE");
    }

    // ==================== Test 25: DELETE image — success triggers PHOTOS badge invalidation ====================

    @Test
    void delete_existingImage_triggersBadgeInvalidation() throws Exception {
        stubDealerWithDraftListing();
        ListingImage image = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 0);
        when(imageRepository.findByIdAndListingId(IMAGE_ID, LISTING_ID))
                .thenReturn(Optional.of(image));
        doNothing().when(imageService).deleteImage(image);
        doNothing().when(badgeInvalidationService)
                .invalidateSpecificDimension(eq(LISTING_ID), eq("PHOTOS"), eq("IMAGE_CHANGE"));

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER"))))
                .andExpect(status().isNoContent());

        verify(badgeInvalidationService).invalidateSpecificDimension(LISTING_ID, "PHOTOS", "IMAGE_CHANGE");
    }

    // ==================== Tests 26–33: POST upload-url ====================

    private static final String SIGNED_URL =
            "https://example.supabase.co/storage/v1/object/upload/sign/listing-images/listings/uid/lid/uuid.jpg?token=tok";

    /** Test 26: happy path — owner + DRAFT + valid input → 200. */
    @Test
    void uploadUrl_ownerDraftValidInput_returns200() throws Exception {
        stubDealerWithDraftListing();
        when(storageService.createSignedUploadUrl(eq("listing-images"), anyString()))
                .thenReturn(Optional.of(SIGNED_URL));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":102400}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedUrl").value(SIGNED_URL))
                .andExpect(jsonPath("$.storagePath", startsWith("listings/" + DEALER_ID + "/" + LISTING_ID + "/")))
                .andExpect(jsonPath("$.storagePath", endsWith(".jpg")))
                // Service-role key must never appear in the response
                .andExpect(jsonPath("$.serviceRoleKey").doesNotExist())
                .andExpect(jsonPath("$.authorization").doesNotExist());

        verify(storageService).createSignedUploadUrl(eq("listing-images"), anyString());
    }

    /** Test 27: no JWT → 401. */
    @Test
    void uploadUrl_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isUnauthorized());

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    /** Test 28: authenticated non-owner (existing listing owned by DEALER_ID, caller=OTHER_DEALER) → 404. */
    @Test
    void uploadUrl_nonOwner_returns404() throws Exception {
        when(listingWorkflowService.findListingForCaller(LISTING_ID, OTHER_DEALER, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // draftListing.createdBy = DEALER_ID (non-null) → secondary re-read → 404
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(OTHER_DEALER.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    /** Test 29: scraped listing (null createdBy) + non-admin caller → 403 from findOwnedListing. */
    @Test
    void uploadUrl_scrapedListing_nonAdmin_returns403() throws Exception {
        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null);
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenThrow(new ListingOwnershipException(LISTING_ID));
        // Secondary re-read: null createdBy → 403
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isForbidden());

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    /** Test 30: contentType not in allowlist (application/pdf) → 400; createSignedUploadUrl NOT called. */
    @Test
    void uploadUrl_invalidContentType_returns400_noSignCall() throws Exception {
        stubDealerWithDraftListing();

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"doc.pdf","contentType":"application/pdf","sizeBytes":1024}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    /** Test 31: sizeBytes > 5 MB → 400; createSignedUploadUrl NOT called. */
    @Test
    void uploadUrl_fileTooLarge_returns400_noSignCall() throws Exception {
        stubDealerWithDraftListing();
        long sixMb = 6L * 1024 * 1024;

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":%d}
                                """.formatted(sixMb)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    /** Test 32: storage disabled / sign failure (createSignedUploadUrl returns empty) → 503. */
    @Test
    void uploadUrl_storageUnavailable_returns503() throws Exception {
        stubDealerWithDraftListing();
        when(storageService.createSignedUploadUrl(eq("listing-images"), anyString()))
                .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").exists());
    }

    /** Test 33: listing in non-mutable status (LIVE) → 400; createSignedUploadUrl NOT called. */
    @Test
    void uploadUrl_liveStatus_returns400() throws Exception {
        draftListing.setStatus(ListingStatus.LIVE.toDbValue());
        when(listingWorkflowService.findListingForCaller(LISTING_ID, DEALER_ID, false))
                .thenReturn(draftListing);

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").exists());

        verify(storageService, never()).createSignedUploadUrl(any(), any());
    }

    // ==================== Helper ====================

    private ListingImage buildImage(UUID id, UUID listingId, String path, String url, int position) {
        ListingImage img = new ListingImage();
        img.setId(id);
        img.setListingId(listingId);
        img.setStoragePath(path);
        img.setUrl(url);
        img.setPosition(position);
        img.setCreatedAt(OffsetDateTime.now());
        return img;
    }

    // ==================== Nested: upload-url rate limiting (#1699) ====================

    /**
     * Runs against a dedicated Spring context ({@code @NestedTestConfiguration(OVERRIDE)}) with a
     * tiny configured limit (2/min via {@code @TestPropertySource}), rather than the outer class's
     * real default (30/min). This keeps the throttling test fast and deterministic without looping
     * 31 times against the real default, and — since it's a separate {@code ApplicationContext} —
     * its {@link RateLimiterService} bucket state can never leak into/from the outer class's tests.
     *
     * <p>Each test method uses its own dedicated caller UUID so per-user bucket state can't leak
     * between test methods either, regardless of JUnit execution order.
     */
    @Nested
    @NestedTestConfiguration(NestedTestConfiguration.EnclosingConfiguration.OVERRIDE)
    @WebMvcTest(
            controllers = ListingImageController.class,
            excludeAutoConfiguration = {
                    org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
            }
    )
    @Import({TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class, RateLimiterService.class})
    @TestPropertySource(properties = "listing.images.upload-url.rate-limit.per-minute=2")
    class UploadUrlRateLimitTests {

        private final UUID withinLimitOwner = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
        private final UUID overLimitOwner = UUID.fromString("00000000-0000-0000-0000-0000000000a2");
        private final UUID unaffectedOwner = UUID.fromString("00000000-0000-0000-0000-0000000000a3");

        @Autowired
        private MockMvc mockMvc;

        @MockitoBean
        private ListingRepository listingRepository;

        @MockitoBean
        private ListingImageRepository imageRepository;

        @MockitoBean
        private SupabaseStorageService storageService;

        @MockitoBean
        private LocalDevStorageService localDevStorageService;

        @MockitoBean
        private ListingImageRegistrar imageRegistrar;

        @MockitoBean
        private ListingImageService imageService;

        @MockitoBean
        private UserRoleService userRoleService;

        @MockitoBean
        private ListingWorkflowService listingWorkflowService;

        @MockitoBean
        private BadgeInvalidationService badgeInvalidationService;

        @BeforeEach
        void setUp() {
            stubOwnedDraftListing(withinLimitOwner);
            stubOwnedDraftListing(overLimitOwner);
            stubOwnedDraftListing(unaffectedOwner);
            when(storageService.createSignedUploadUrl(eq("listing-images"), anyString()))
                    .thenReturn(Optional.of(SIGNED_URL));
        }

        private void stubOwnedDraftListing(UUID ownerId) {
            Listing listing = new Listing();
            listing.setId(LISTING_ID);
            listing.setCreatedBy(ownerId);
            listing.setStatus(ListingStatus.DRAFT.toDbValue());
            listing.setPropertyType("land");
            listing.setCreatedAt(OffsetDateTime.now());
            listing.setUpdatedAt(OffsetDateTime.now());
            when(listingWorkflowService.findListingForCaller(LISTING_ID, ownerId, false))
                    .thenReturn(listing);
        }

        private org.springframework.test.web.servlet.ResultActions performUploadUrl(UUID ownerId) throws Exception {
            return mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                    .with(jwt().jwt(j -> j.subject(ownerId.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                            {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                            """));
        }

        /** (a) Owner within the configured limit — 200, unaffected by the new guard. */
        @Test
        void uploadUrl_ownerWithinLimit_returns200() throws Exception {
            performUploadUrl(withinLimitOwner)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.signedUrl").value(SIGNED_URL));
        }

        /** (b) Owner over the configured limit (2/min) — 429 with the existing {"error": ...} shape. */
        @Test
        void uploadUrl_ownerOverLimit_returns429() throws Exception {
            performUploadUrl(overLimitOwner).andExpect(status().isOk());
            performUploadUrl(overLimitOwner).andExpect(status().isOk());

            performUploadUrl(overLimitOwner)
                    .andExpect(status().isTooManyRequests())
                    .andExpect(jsonPath("$.error").value("RATE_LIMIT_EXCEEDED"));

            verify(storageService, times(2)).createSignedUploadUrl(eq("listing-images"), anyString());
        }

        /**
         * (c) Non-owner (404) and invalid-metadata (400) requests never reach the limiter — both
         * fail before the rate-limit check runs, so they don't consume this owner's 2/min budget,
         * which remains fully available afterward.
         */
        @Test
        void uploadUrl_nonOwnerAndInvalidMetadata_unaffectedByLimiter() throws Exception {
            UUID nonOwnerCaller = UUID.fromString("00000000-0000-0000-0000-0000000000a9");
            when(listingWorkflowService.findListingForCaller(LISTING_ID, nonOwnerCaller, false))
                    .thenThrow(new ListingOwnershipException(LISTING_ID));
            when(listingRepository.findById(LISTING_ID))
                    .thenReturn(Optional.of(ownedListing(unaffectedOwner)));

            mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                            .with(jwt().jwt(j -> j.subject(nonOwnerCaller.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                    """))
                    .andExpect(status().isNotFound());

            mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images/upload-url")
                            .with(jwt().jwt(j -> j.subject(unaffectedOwner.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"fileName":"doc.pdf","contentType":"application/pdf","sizeBytes":1024}
                                    """))
                    .andExpect(status().isBadRequest());

            // Neither of the above consumed the 2/min budget — both owner-path calls still succeed.
            performUploadUrl(unaffectedOwner).andExpect(status().isOk());
            performUploadUrl(unaffectedOwner).andExpect(status().isOk());

            verify(storageService, times(2)).createSignedUploadUrl(eq("listing-images"), anyString());
        }

        private Listing ownedListing(UUID ownerId) {
            Listing listing = new Listing();
            listing.setId(LISTING_ID);
            listing.setCreatedBy(ownerId);
            listing.setStatus(ListingStatus.DRAFT.toDbValue());
            listing.setPropertyType("land");
            listing.setCreatedAt(OffsetDateTime.now());
            listing.setUpdatedAt(OffsetDateTime.now());
            return listing;
        }
    }
}
