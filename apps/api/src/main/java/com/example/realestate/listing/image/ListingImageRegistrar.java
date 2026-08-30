package com.example.realestate.listing.image;

import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.storage.LocalDevStorageService;
import com.example.realestate.quality.QualityRecomputeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
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
 *
 * noRollbackFor = PessimisticLockingFailureException.class: when the DB
 * statement_timeout or lock_timeout fires before the FOR UPDATE lock is granted
 * (common under rapid sequential calls on Render's shared Postgres), we want to
 * return 503 with Retry-After: 1 rather than let the exception bubble as a 500.
 * The lock is not held — there is no dirty state to roll back — but Spring will
 * mark the tx rollback-only if we do not suppress it here.
 */
@Service
class ListingImageRegistrar {

    private static final Logger log = LoggerFactory.getLogger(ListingImageRegistrar.class);

    private static final int MAX_IMAGES = 10;
    private static final String RETRY_AFTER_SECONDS = "1";

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    private final QualityRecomputeService qualityRecomputeService;
    private final LocalDevStorageService localDevStorageService;

    ListingImageRegistrar(ListingRepository listingRepository,
                          ListingImageRepository imageRepository,
                          QualityRecomputeService qualityRecomputeService,
                          LocalDevStorageService localDevStorageService) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.qualityRecomputeService = qualityRecomputeService;
        this.localDevStorageService = localDevStorageService;
    }

    @Transactional(noRollbackFor = {
            DataIntegrityViolationException.class,
            PessimisticLockingFailureException.class
    })
    ResponseEntity<?> register(UUID listingId,
                               ListingImageController.RegisterImageRequest req,
                               UUID callerId) {
        // Acquire exclusive row lock on the listing — serializes concurrent uploads.
        // PessimisticLockingFailureException is caught below if the DB timeout fires
        // before the lock is granted.
        //
        // Gap: if the listing was deleted between the ownership check in the controller
        // and this lock step, findByIdWithLock returns Optional.empty() and we proceed
        // to countByListingId and saveAndFlush. Either the FK constraint on listing_image
        // (listing_id → property_listings.id) prevents a phantom image row (preferred),
        // or — if no FK exists — a phantom row is inserted for a non-existent listing.
        // No 404 guard is added here without first confirming FK existence.
        try {
            listingRepository.findByIdWithLock(listingId);
        } catch (PessimisticLockingFailureException e) {
            log.warn("POST /api/listings/{}/images -> 503 lock timeout userId={}", listingId, callerId);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Retry-After", RETRY_AFTER_SECONDS);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .headers(headers)
                    .body(Map.of("error", "Upload temporarily busy, please retry"));
        }

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
            // Recompute quality after image add — PHOTOS score depends on photo count
            qualityRecomputeService.recomputeAfterCommit(listingId);
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ListingImageController.toResponse(saved, localDevStorageService));
        } catch (DataIntegrityViolationException e) {
            // UNIQUE constraint on (listing_id, storage_path) — idempotent duplicate
            log.info("POST /api/listings/{}/images -> 409 duplicate storagePath={} userId={}",
                    listingId, req.storagePath(), callerId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Image already registered"));
        }
    }
}
