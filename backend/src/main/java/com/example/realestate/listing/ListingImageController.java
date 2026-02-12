package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Listing image metadata endpoints (hybrid upload model).
 * Frontend uploads bytes to Supabase Storage; this controller manages DB metadata only.
 * Complies with docs/IMAGE_UPLOAD_FAILURE_MODES.md.
 */
@RestController
@RequestMapping("/api/listings/{listingId}/images")
public class ListingImageController {

    private static final Logger log = LoggerFactory.getLogger(ListingImageController.class);

    private static final int MAX_IMAGES = 10;
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp");
    private static final Set<String> MUTABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());
    private static final Set<String> ALLOWED_ROLES = Set.of("dealer", "admin");
    private static final Pattern EXTENSION_PATTERN = Pattern.compile(".*\\.([a-zA-Z]+)$");

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    private final ListingService listingService;

    public ListingImageController(ListingRepository listingRepository,
                                   ListingImageRepository imageRepository,
                                   ListingService listingService) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.listingService = listingService;
    }

    // ==================== POST — register image metadata ====================

    @PostMapping
    public ResponseEntity<?> registerImage(JwtAuthenticationToken auth,
                                            @PathVariable UUID listingId,
                                            @RequestBody RegisterImageRequest req) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        Listing listing = findOwnedListing(listingId, caller);
        if (listing == null) return notFound("Listing not found");

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        // Validate storage path prefix
        String expectedPrefix = "listings/" + listing.getCreatedBy() + "/" + listingId + "/";
        if (req.storagePath() == null || !req.storagePath().startsWith(expectedPrefix)) {
            return badRequest("Storage path must start with " + expectedPrefix);
        }

        // Validate file extension
        String extension = extractExtension(req.storagePath());
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension)) {
            return badRequest("Allowed image types: jpg, jpeg, png, webp");
        }

        // Validate max images
        long currentCount = imageRepository.countByListingId(listingId);
        if (currentCount >= MAX_IMAGES) {
            return badRequest("Maximum " + MAX_IMAGES + " images per listing");
        }

        // Validate url present
        if (req.url() == null || req.url().isBlank()) {
            return badRequest("URL is required");
        }

        // Insert metadata
        ListingImage image = new ListingImage();
        image.setListingId(listingId);
        image.setStoragePath(req.storagePath());
        image.setUrl(req.url());
        image.setPosition((int) currentCount);
        image.setCreatedAt(OffsetDateTime.now());

        try {
            ListingImage saved = imageRepository.save(image);
            log.info("POST /api/listings/{}/images -> 201 storagePath={} userId={}",
                    listingId, req.storagePath(), caller.userId());
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved));
        } catch (DataIntegrityViolationException e) {
            // UNIQUE constraint on (listing_id, storage_path) — idempotent duplicate
            log.info("POST /api/listings/{}/images -> 409 duplicate storagePath={} userId={}",
                    listingId, req.storagePath(), caller.userId());
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Image already registered"));
        }
    }

    // ==================== DELETE — remove image metadata ====================

    @DeleteMapping("/{imageId}")
    public ResponseEntity<?> deleteImage(JwtAuthenticationToken auth,
                                          @PathVariable UUID listingId,
                                          @PathVariable UUID imageId) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        Listing listing = findOwnedListing(listingId, caller);
        if (listing == null) return notFound("Listing not found");

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        Optional<ListingImage> imageOpt = imageRepository.findByIdAndListingId(imageId, listingId);
        if (imageOpt.isEmpty()) {
            return notFound("Image not found");
        }

        ListingImage image = imageOpt.get();
        imageRepository.delete(image);

        // TODO: best-effort Storage delete when Supabase admin SDK is available.
        // Per IMAGE_UPLOAD_FAILURE_MODES.md §3: Storage delete is non-fatal.
        // Orphan cleanup strategy in §5 covers this case.

        log.info("DELETE /api/listings/{}/images/{} -> 204 storagePath={} userId={}",
                listingId, imageId, image.getStoragePath(), caller.userId());
        return ResponseEntity.noContent().build();
    }

    // ==================== PUT — reorder images ====================

    @PutMapping("/reorder")
    @Transactional
    public ResponseEntity<?> reorderImages(JwtAuthenticationToken auth,
                                            @PathVariable UUID listingId,
                                            @RequestBody ReorderRequest req) {
        CallerInfo caller = resolveCallerOrForbid(auth);
        if (caller == null) return forbidden();

        Listing listing = findOwnedListing(listingId, caller);
        if (listing == null) return notFound("Listing not found");

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        if (req.imageIds() == null || req.imageIds().isEmpty()) {
            return badRequest("imageIds must not be empty");
        }

        // Load all images for this listing
        List<ListingImage> existingImages = imageRepository.findByListingIdOrderByPositionAsc(listingId);
        Set<UUID> existingIds = new HashSet<>();
        for (ListingImage img : existingImages) {
            existingIds.add(img.getId());
        }

        // Validate: no duplicates in request
        Set<UUID> requestIds = new HashSet<>(req.imageIds());
        if (requestIds.size() != req.imageIds().size()) {
            return badRequest("Duplicate image IDs in reorder request");
        }

        // Validate: exact match between request IDs and existing IDs
        if (!requestIds.equals(existingIds)) {
            return badRequest("imageIds must contain exactly all images for this listing");
        }

        // Apply new positions
        Map<UUID, ListingImage> imageMap = new java.util.HashMap<>();
        for (ListingImage img : existingImages) {
            imageMap.put(img.getId(), img);
        }

        for (int i = 0; i < req.imageIds().size(); i++) {
            ListingImage img = imageMap.get(req.imageIds().get(i));
            img.setPosition(i);
        }
        imageRepository.saveAll(existingImages);

        // Return in new order
        List<ListingImage> reordered = imageRepository.findByListingIdOrderByPositionAsc(listingId);

        log.info("PUT /api/listings/{}/images/reorder -> 200 count={} userId={}",
                listingId, reordered.size(), caller.userId());
        return ResponseEntity.ok(reordered.stream().map(ListingImageController::toResponse).toList());
    }

    // ===== Auth =====

    private CallerInfo resolveCallerOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = listingService.getUserRole(userId).orElse(null);
        if (role == null || !ALLOWED_ROLES.contains(role)) {
            return null;
        }
        return new CallerInfo(userId, role, "admin".equals(role));
    }

    private record CallerInfo(UUID userId, String role, boolean isAdmin) {}

    private Listing findOwnedListing(UUID listingId, CallerInfo caller) {
        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) return null;
        if (!caller.isAdmin() && !caller.userId().equals(listing.getCreatedBy())) {
            return null;
        }
        return listing;
    }

    // ===== Helpers =====

    private static String extractExtension(String path) {
        var matcher = EXTENSION_PATTERN.matcher(path);
        if (matcher.matches()) {
            return matcher.group(1).toLowerCase();
        }
        return null;
    }

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires dealer or admin role"));
    }

    private static ResponseEntity<Map<String, String>> notFound(String message) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", message));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", message));
    }

    private static ImageResponse toResponse(ListingImage img) {
        return new ImageResponse(
                img.getId(), img.getListingId(), img.getStoragePath(), img.getUrl(),
                img.getPosition(), img.getCreatedAt() != null ? img.getCreatedAt().toString() : null);
    }

    // ===== DTOs =====

    public record RegisterImageRequest(String storagePath, String url) {}
    public record ReorderRequest(List<UUID> imageIds) {}
    public record ImageResponse(UUID id, UUID listingId, String storagePath, String url,
                                 int position, String createdAt) {}
}
