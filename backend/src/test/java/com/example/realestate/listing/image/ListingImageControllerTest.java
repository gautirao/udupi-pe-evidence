package com.example.realestate.listing.image;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(
        controllers = ListingImageController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingImageControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
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
    private ListingImageRegistrar imageRegistrar;

    @MockitoBean
    private UserRoleService userRoleService;

    private Listing draftListing;

    @BeforeEach
    void setUp() {
        reset(listingRepository, imageRepository, userRoleService);

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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));
    }

    // ==================== Test 1: POST register image -> 201 ====================

    @Test
    void register_validImage_returns201() throws Exception {
        stubDealerWithDraftListing();

        ListingImage saved = buildImage(IMAGE_ID, LISTING_ID, validPath(), validUrl(), 2);
        ResponseEntity<?> created201 = ResponseEntity.status(HttpStatus.CREATED)
                .body(ListingImageController.toResponse(saved));
        doReturn(created201).when(imageRegistrar).register(eq(LISTING_ID), any(), eq(DEALER_ID));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        draftListing.setStatus(ListingStatus.LIVE.toDbValue());
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
        when(userRoleService.getUserRole(OTHER_DEALER)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));
        // draftListing.createdBy = DEALER_ID, but caller is OTHER_DEALER

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(OTHER_DEALER.toString())))
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
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isNoContent());

        verify(imageRepository).delete(image);
    }

    // ==================== Test 10: DELETE image not found -> 404 ====================

    @Test
    void delete_imageNotFound_returns404() throws Exception {
        stubDealerWithDraftListing();
        when(imageRepository.findByIdAndListingId(IMAGE_ID, LISTING_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
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

        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "u1", 0);
        ListingImage img2 = buildImage(id2, LISTING_ID, "p2.jpg", "u2", 1);
        ListingImage img3 = buildImage(id3, LISTING_ID, "p3.jpg", "u3", 2);

        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of(img1, img2, img3))   // first call: load existing
                .thenReturn(List.of(img3, img1, img2));   // second call: return reordered

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s","%s","%s"]}
                                """.formatted(id3, id1, id2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));

        verify(imageRepository).saveAll(anyList());
    }

    // ==================== Test 12: PUT reorder with missing IDs -> 400 ====================

    @Test
    void reorder_missingIds_returns400() throws Exception {
        stubDealerWithDraftListing();

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000051");
        UUID id2 = UUID.fromString("00000000-0000-0000-0000-000000000052");

        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "u1", 0);
        ListingImage img2 = buildImage(id2, LISTING_ID, "p2.jpg", "u2", 1);

        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of(img1, img2));

        // Only send id1, missing id2
        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"imageIds":["%s"]}
                                """.formatted(id1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imageIds must contain exactly all images for this listing"));

        verify(imageRepository, never()).saveAll(anyList());
    }

    // ==================== Test 13: GET images — empty list -> 200 [] ====================

    @Test
    void getImages_withNoImages_returns200EmptyList() throws Exception {
        stubDealerWithDraftListing();
        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
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

        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of(img1, img2));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(id1.toString()))
                .andExpect(jsonPath("$[0].position").value(0))
                .andExpect(jsonPath("$[1].id").value(id2.toString()))
                .andExpect(jsonPath("$[1].position").value(1));
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
        when(userRoleService.getUserRole(OTHER_DEALER)).thenReturn(Optional.of("dealer"));
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(draftListing));
        // draftListing.createdBy = DEALER_ID, but caller is OTHER_DEALER

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(OTHER_DEALER.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    // ==================== Test 17: GET images — LIVE listing -> 200 (no status guard on GET) ====================

    @Test
    void getImages_liveListing_returns200() throws Exception {
        // getImages has no status guard; it intentionally works for any status the caller owns.
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        Listing liveListing = new Listing();
        liveListing.setId(LISTING_ID);
        liveListing.setCreatedBy(DEALER_ID);
        liveListing.setStatus(ListingStatus.LIVE.toDbValue());
        liveListing.setPropertyType("land");
        liveListing.setCreatedAt(OffsetDateTime.now());
        liveListing.setUpdatedAt(OffsetDateTime.now());
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(liveListing));

        UUID id1 = UUID.fromString("00000000-0000-0000-0000-000000000071");
        ListingImage img1 = buildImage(id1, LISTING_ID, "p1.jpg", "https://x.com/1.jpg", 0);
        when(imageRepository.findByListingIdOrderByPositionAsc(LISTING_ID))
                .thenReturn(List.of(img1));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
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
        when(userRoleService.getUserRole(adminId)).thenReturn(Optional.of("admin"));

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(adminId.toString())))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.LIVE.toDbValue());
        scraped.setPropertyType("house");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(get("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(delete("/api/listings/" + LISTING_ID + "/images/" + IMAGE_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(put("/api/listings/" + LISTING_ID + "/images/reorder")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
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
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        Listing scraped = new Listing();
        scraped.setId(LISTING_ID);
        scraped.setCreatedBy(null); // SCRAPED — no owner
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        when(listingRepository.findById(LISTING_ID)).thenReturn(Optional.of(scraped));

        mockMvc.perform(post("/api/listings/" + LISTING_ID + "/images")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"storagePath":"listings/some-path/photo.jpg","url":"https://x.com/photo.jpg"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: listing has no owner"));
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
}
