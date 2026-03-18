package com.example.realestate.listing.image;

import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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

    private ListingImageRegistrar registrar;

    @BeforeEach
    void setUp() {
        registrar = new ListingImageRegistrar(listingRepository, imageRepository);

        // findByIdWithLock is called at the start of every register() call.
        // Return an empty Optional — the lock is acquired and the result is not used by the method.
        when(listingRepository.findByIdWithLock(LISTING_ID)).thenReturn(Optional.empty());
    }

    private ListingImageController.RegisterImageRequest validRequest() {
        String path = "listings/" + CALLER_ID + "/" + LISTING_ID + "/photo.jpg";
        String url  = "https://storage.example.com/" + path;
        return new ListingImageController.RegisterImageRequest(path, url);
    }

    // ==================== Test 1: valid upload → 201 ====================

    @Test
    void register_validUpload_returns201() {
        when(imageRepository.countByListingId(LISTING_ID)).thenReturn(2L);

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validRequest().url());
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

        ListingImage saved = new ListingImage();
        saved.setId(IMAGE_ID);
        saved.setListingId(LISTING_ID);
        saved.setStoragePath(validRequest().storagePath());
        saved.setUrl(validRequest().url());
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
}
