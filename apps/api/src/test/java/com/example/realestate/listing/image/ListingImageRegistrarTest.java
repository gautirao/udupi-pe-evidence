package com.example.realestate.listing.image;

import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.storage.ImageObjectMetadata;
import com.example.realestate.listing.storage.ListingImageStorage;
import com.example.realestate.listing.storage.LocalDevStorageService;
import com.example.realestate.quality.QualityRecomputeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingImageRegistrarTest {

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID CALLER_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID IMAGE_ID   = UUID.fromString("00000000-0000-0000-0000-000000000050");

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ListingImageRepository imageRepository;

    @Mock
    private QualityRecomputeService qualityRecomputeService;

    @Mock
    private LocalDevStorageService localDevStorageService;

    @Mock
    private ListingImageStorage storageService;

    private ListingImageRegistrar registrar;

    @BeforeEach
    void setUp() {
        registrar = new ListingImageRegistrar(listingRepository, imageRepository, qualityRecomputeService,
                localDevStorageService, storageService);

        // findByIdWithLock is called at the start of every register() call.
        when(listingRepository.findByIdWithLock(LISTING_ID)).thenReturn(Optional.empty());
        // Default inspect response: object exists and is valid (lenient for short-circuit error paths)
        org.mockito.Mockito.lenient().when(storageService.inspect(any())).thenReturn(new ImageObjectMetadata(true, 1024L, "image/jpeg"));
    }

    private ListingImageController.RegisterImageRequest validRequest() {
        String path = "listings/" + CALLER_ID + "/" + LISTING_ID + "/photo.jpg";
        return new ListingImageController.RegisterImageRequest(path);
    }

    private String validUrl() {
        return "https://storage.supabase.co/storage/v1/object/public/listing-images/" + validRequest().storagePath();
    }

    // ==================== Test 1: valid upload → 201 ====================

    @Test
    void register_validUpload_returns201() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(2L);
        when(storageService.getPublicUrl("listing-images", validRequest().storagePath())).thenReturn(validUrl());

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validUrl());
        saved.setPosition(2);
        saved.setCreatedAt(OffsetDateTime.now());

        when(imageRepository.saveAndFlush(any(ListingImage.class))).thenReturn(saved);

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody()).isInstanceOf(ListingImageController.ImageResponse.class);
        ListingImageController.ImageResponse body = (ListingImageController.ImageResponse) response.getBody();
        assertThat(body.id()).isEqualTo(IMAGE_ID);
        assertThat(body.position()).isEqualTo(2);
    }

    // ==================== Test 1b: local dev storage enabled → response URL is the local display URL ====================

    @Test
    void register_localDevStorageEnabled_returnsLocalDisplayUrlNotClientSuppliedUrl() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.getPublicUrl("listing-images", validRequest().storagePath())).thenReturn(validUrl());

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validUrl());
        saved.setPosition(0);
        saved.setCreatedAt(OffsetDateTime.now());

        when(imageRepository.saveAndFlush(any(ListingImage.class))).thenReturn(saved);
        String localUrl = "http://localhost:8085/api/dev/local-storage/public/listing-images/"
                + validRequest().storagePath();
        when(localDevStorageService.resolveDisplayUrl(
                eq("listing-images"), eq(validRequest().storagePath()), eq(validUrl())))
                .thenReturn(localUrl);

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        ListingImageController.ImageResponse body = (ListingImageController.ImageResponse) response.getBody();
        assertThat(body.url()).isEqualTo(localUrl);
    }

    // ==================== Test 1c: local dev storage disabled → derived URL pass-through unchanged ====================

    @Test
    void register_localDevStorageDisabled_passesThroughClientSuppliedUrlUnchanged() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.getPublicUrl("listing-images", validRequest().storagePath())).thenReturn(validUrl());

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validUrl());
        saved.setPosition(0);
        saved.setCreatedAt(OffsetDateTime.now());

        when(imageRepository.saveAndFlush(any(ListingImage.class))).thenReturn(saved);
        when(localDevStorageService.resolveDisplayUrl(
                eq("listing-images"), eq(validRequest().storagePath()), eq(validUrl())))
                .thenReturn(validUrl());

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        ListingImageController.ImageResponse body = (ListingImageController.ImageResponse) response.getBody();
        assertThat(body.url()).isEqualTo(validUrl());
    }

    // ==================== Test 2: listing already has 10 images → 400 ====================

    @Test
    void register_countAtLimit_returns400() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(10L);

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ==================== Test 3: count exactly 9 → still allowed (boundary check) ====================

    @Test
    void register_countBelowLimit_isAllowed() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(9L);
        when(storageService.getPublicUrl("listing-images", validRequest().storagePath())).thenReturn(validUrl());

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validUrl());
        saved.setPosition(9);
        saved.setCreatedAt(OffsetDateTime.now());

        when(imageRepository.saveAndFlush(any(ListingImage.class))).thenReturn(saved);

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    // ==================== Test 4: duplicate storagePath → 409 ====================

    @Test
    void register_duplicateStoragePath_returns409() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(3L);
        when(imageRepository.saveAndFlush(any(ListingImage.class)))
                .thenThrow(new DataIntegrityViolationException("unique constraint violation"));

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    // ==================== Test 5: DB lock timeout (PessimisticLockingFailureException) → 503 ====================

    /**
     * RE-164: when Render's shared Postgres fires statement_timeout or lock_timeout
     * before the SELECT ... FOR UPDATE lock is granted, findByIdWithLock() throws
     * PessimisticLockingFailureException. register() must return 503 with
     * Retry-After: 1 rather than propagate as a 500.
     */
    @Test
    void register_lockTimeout_returns503WithRetryAfter() {
        when(listingRepository.findByIdWithLock(LISTING_ID))
                .thenThrow(new PessimisticLockingFailureException("lock timeout"));

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("1");
        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> body = (java.util.Map<String, Object>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("error")).isEqualTo("Upload temporarily busy, please retry");
    }

    // ==================== Test 6: listing deleted between controller check and lock step ====================

    /**
     * If the listing is deleted between the ownership check in the controller and the
     * findByIdWithLock call here, the repository returns Optional.empty().
     * register() does NOT guard on the empty result — it proceeds to countByListingId
     * and saveAndFlush.  In production, either the FK constraint on listing_image
     * (listing_id → property_listings.id) fires a DataIntegrityViolationException
     * (returned as 409) or — if no FK exists — the image row is inserted for a
     * non-existent listing.
     *
     * This test verifies the current observable behaviour at the unit level:
     * with an empty lock result and a saveAndFlush that succeeds (mock has no FK),
     * the method returns 201.  This is the known gap documented in the registrar
     * comment — it does not represent a regression target, but makes the behaviour
     * explicit so a future FK addition will cause this test to need updating.
     */
    @Test
    void register_listingDeletedBeforeLock_proceedsWithoutError() {
        // findByIdWithLock returns empty (listing deleted between controller check and here)
        when(listingRepository.findByIdWithLock(LISTING_ID)).thenReturn(Optional.empty());
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.getPublicUrl("listing-images", validRequest().storagePath())).thenReturn(validUrl());

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validUrl());
        saved.setPosition(0);
        saved.setCreatedAt(OffsetDateTime.now());

        when(imageRepository.saveAndFlush(any(ListingImage.class))).thenReturn(saved);

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        // Current behaviour: no FK at mock layer → 201 returned.
        // A real FK on property_listings.id would instead surface a
        // DataIntegrityViolationException → 409.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    // ==================== Test 7: object inspection fails (not found) → 400 & deleteBestEffort ====================

    @Test
    void register_objectNotFoundInStorage_returns400AndDeletesObject() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.inspect(validRequest().storagePath())).thenReturn(ImageObjectMetadata.notFound());

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        org.mockito.Mockito.verify(storageService).deleteObjectBestEffort(validRequest().storagePath());
    }

    // ==================== Test 8: object size > 5 MB → 400 & deleteBestEffort ====================

    @Test
    void register_objectSizeExceeds5MB_returns400AndDeletesObject() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.inspect(validRequest().storagePath()))
                .thenReturn(new ImageObjectMetadata(true, 6L * 1024 * 1024, "image/jpeg"));

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        org.mockito.Mockito.verify(storageService).deleteObjectBestEffort(validRequest().storagePath());
    }

    // ==================== Test 9: object disallowed Content-Type → 400 & deleteBestEffort ====================

    @Test
    void register_objectDisallowedContentType_returns400AndDeletesObject() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(0L);
        when(storageService.inspect(validRequest().storagePath()))
                .thenReturn(new ImageObjectMetadata(true, 1024L, "application/pdf"));

        ResponseEntity<?> response = registrar.register(LISTING_ID, validRequest(), CALLER_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        org.mockito.Mockito.verify(storageService).deleteObjectBestEffort(validRequest().storagePath());
    }
}
