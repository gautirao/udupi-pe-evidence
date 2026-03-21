package com.example.realestate.listing.image;

import com.example.realestate.listing.storage.SupabaseStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Transactional service for listing image mutations.
 *
 * <p>Extracted from {@link ListingImageController} so that Spring's {@code @Transactional}
 * proxy is honoured — self-calls within the same bean bypass the proxy and would leave the
 * mutations running outside any transaction.
 *
 * <p>Authorization (ownership and status checks) remains the controller's responsibility.
 * This service receives already-validated, caller-owned entities and performs only the
 * DB/storage mutations.
 */
@Service
class ListingImageService {

    private static final Logger log = LoggerFactory.getLogger(ListingImageService.class);

    private final ListingImageRepository imageRepository;
    private final SupabaseStorageService storageService;

    ListingImageService(ListingImageRepository imageRepository,
                        SupabaseStorageService storageService) {
        this.imageRepository = imageRepository;
        this.storageService = storageService;
    }

    /**
     * Returns all images for a listing in position order.
     *
     * @param listingId the listing whose images to fetch
     * @return images ordered by position ascending
     */
    @Transactional(readOnly = true)
    public List<ListingImage> getImages(UUID listingId) {
        return imageRepository.findByListingIdOrderByPositionAsc(listingId);
    }

    /**
     * Deletes the image metadata from the DB and best-effort deletes the storage object.
     *
     * <p>DB row is deleted first; orphan cleanup covers any missed storage objects
     * per IMAGE_UPLOAD_FAILURE_MODES.md §3 and §5. Storage deletion failure is
     * non-fatal — it does not roll back the DB deletion.
     *
     * @param image the image to delete (already validated as owned by the caller)
     */
    @Transactional
    public void deleteImage(ListingImage image) {
        imageRepository.delete(image);
        // Best-effort Storage delete — non-fatal per IMAGE_UPLOAD_FAILURE_MODES.md §3.
        // DB row is deleted first; orphan cleanup (§5) covers any missed objects.
        storageService.deleteObjectBestEffort(image.getStoragePath());
    }

    /**
     * Reorders images for a listing according to the supplied ID sequence.
     *
     * @param listingId    the listing whose images are being reordered
     * @param requestedIds the desired order of all image IDs for this listing
     * @return images in their new order
     * @throws IllegalArgumentException if requestedIds contains duplicates or does not match the
     *                                  exact set of existing image IDs for the listing
     */
    @Transactional
    public List<ListingImage> reorderImages(UUID listingId, List<UUID> requestedIds) {
        List<ListingImage> existingImages = imageRepository.findByListingIdOrderByPositionAsc(listingId);

        Set<UUID> existingIds = new HashSet<>();
        for (ListingImage img : existingImages) {
            existingIds.add(img.getId());
        }

        // Validate: no duplicates in request
        Set<UUID> requestIds = new HashSet<>(requestedIds);
        if (requestIds.size() != requestedIds.size()) {
            throw new IllegalArgumentException("Duplicate image IDs in reorder request");
        }

        // Validate: exact match between request IDs and existing IDs
        if (!requestIds.equals(existingIds)) {
            throw new IllegalArgumentException("imageIds must contain exactly all images for this listing");
        }

        // Apply new positions
        Map<UUID, ListingImage> imageMap = new HashMap<>();
        for (ListingImage img : existingImages) {
            imageMap.put(img.getId(), img);
        }

        for (int i = 0; i < requestedIds.size(); i++) {
            ListingImage img = imageMap.get(requestedIds.get(i));
            img.setPosition(i);
        }
        imageRepository.saveAll(existingImages);

        return imageRepository.findByListingIdOrderByPositionAsc(listingId);
    }
}
