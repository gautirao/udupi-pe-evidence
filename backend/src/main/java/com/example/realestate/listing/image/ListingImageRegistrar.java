package com.example.realestate.listing.image;

import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Handles the transactional, pessimistically-locked image registration step.
 *
 * Extracted from ListingImageController so that Spring's @Transactional proxy
 * is honoured — self-calls within the same bean bypass the proxy and would
 * leave the method running outside any transaction.
 *
 * Locking strategy: findByIdWithLock issues SELECT ... FOR UPDATE on the
 * property_listings row, forcing concurrent registerImage calls for the same
 * listing to serialize at the DB level. The count-check and INSERT both execute
 * inside that single transaction, closing the TOCTOU window.
 *
 * noRollbackFor = DataIntegrityViolationException.class: a UNIQUE violation on
 * (listing_id, storage_path) for a genuinely duplicate path must not mark the
 * transaction rollback-only, because we want to return 409 cleanly rather than
 * propagate an UnexpectedRollbackException as a 500.
 */
@Service
class ListingImageRegistrar {

    private static final Logger log = LoggerFactory.getLogger(ListingImageRegistrar.class);

    private static final int MAX_IMAGES = 10;

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;

    ListingImageRegistrar(ListingRepository listingRepository,
                          ListingImageRepository imageRepository) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
    }

    @Transactional(noRollbackFor = DataIntegrityViolationException.class)
    ResponseEntity<?> register(UUID listingId,
                               ListingImageController.RegisterImageRequest req,
                               UUID callerId) {
        // Acquire exclusive row lock on the listing — serializes concurrent uploads
        listingRepository.findByIdWithLock(listingId);

        long currentCount = imageRepository.countByListingId(listingId);
        if (currentCount >= MAX_IMAGES) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Maximum " + MAX_IMAGES + " images per listing"));
        }

        ListingImage image = new ListingImage();
        image.setListingId(listingId);
        image.setStoragePath(req.storagePath());
        image.setUrl(req.url());
        image.setPosition((int) currentCount);
        image.setCreatedAt(OffsetDateTime.now());

        try {
            ListingImage saved = imageRepository.saveAndFlush(image);
            log.info("POST /api/listings/{}/images -> 201 storagePath={} userId={}",
                    listingId, req.storagePath(), callerId);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ListingImageController.toResponse(saved));
        } catch (DataIntegrityViolationException e) {
            // UNIQUE constraint on (listing_id, storage_path) — idempotent duplicate
            log.info("POST /api/listings/{}/images -> 409 duplicate storagePath={} userId={}",
                    listingId, req.storagePath(), callerId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Image already registered"));
        }
    }
}
