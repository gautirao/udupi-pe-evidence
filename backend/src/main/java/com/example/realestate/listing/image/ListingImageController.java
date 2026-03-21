package com.example.realestate.listing.image;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    private static final String RETRY_AFTER_SECONDS = "1";
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp");
    private static final Set<String> MUTABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());
    private static final Pattern EXTENSION_PATTERN = Pattern.compile(".*\\.([a-zA-Z]+)$");

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    private final ListingImageRegistrar imageRegistrar;
    private final ListingImageService imageService;

    public ListingImageController(ListingRepository listingRepository,
                                   ListingImageRepository imageRepository,
                                   ListingImageRegistrar imageRegistrar,
                                   ListingImageService imageService) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.imageRegistrar = imageRegistrar;
        this.imageService = imageService;
    }

    // ==================== GET — list images ====================

    @GetMapping
    public ResponseEntity<?> getImages(CallerInfo caller,
                                       @PathVariable UUID listingId) {

        FindResult result = findOwnedListing(listingId, caller);
        if (result.error() != null) return result.error();

        List<ListingImage> images = imageService.getImages(listingId);
        log.info("GET /api/listings/{}/images -> 200 count={} userId={}",
                listingId, images.size(), caller.userId());
        return ResponseEntity.ok(images.stream().map(ListingImageController::toResponse).toList());
    }

    // ==================== POST — register image metadata ====================

    @PostMapping
    public ResponseEntity<?> registerImage(CallerInfo caller,
                                            @PathVariable UUID listingId,
                                            @RequestBody RegisterImageRequest req) {

        FindResult result = findOwnedListing(listingId, caller);
        if (result.error() != null) return result.error();
        Listing listing = result.listing();

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        // Validate storage path prefix — SCRAPED listings have no owner (createdBy == null),
        // so no valid storage path can be constructed; treat as forbidden.
        if (listing.getCreatedBy() == null) {
            log.warn("POST /api/listings/{}/images -> 403 storagePath validation: listing has no owner (scraped)", listingId);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Cannot upload images to a listing with no owner"));
        }
        String expectedPrefix = "listings/" + listing.getCreatedBy() + "/" + listingId + "/";
        if (req.storagePath() == null || !req.storagePath().startsWith(expectedPrefix)) {
            return badRequest("Storage path must start with " + expectedPrefix);
        }

        // Validate file extension
        String extension = extractExtension(req.storagePath());
        if (extension == null || !ALLOWED_EXTENSIONS.contains(extension)) {
            return badRequest("Allowed image types: jpg, jpeg, png, webp");
        }

        // Validate url present (before acquiring the lock)
        if (req.url() == null || req.url().isBlank()) {
            return badRequest("URL is required");
        }

        // Delegate to a separate Spring bean so @Transactional proxy is honoured.
        // Self-calls within the same bean bypass the proxy and would leave the
        // count-check and save running without a transaction or pessimistic lock.
        // Defensive catch: if PessimisticLockingFailureException somehow escapes
        // the registrar (e.g. thrown during transaction commit), surface 503 here
        // rather than letting the default exception handler return 500.
        try {
            return imageRegistrar.register(listingId, req, caller.userId());
        } catch (PessimisticLockingFailureException e) {
            log.warn("POST /api/listings/{}/images -> 503 lock timeout (controller) userId={}",
                    listingId, caller.userId());
            HttpHeaders headers = new HttpHeaders();
            headers.set("Retry-After", RETRY_AFTER_SECONDS);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .headers(headers)
                    .body(Map.of("error", "Upload temporarily busy, please retry"));
        }
    }

    // ==================== DELETE — remove image metadata ====================

    @DeleteMapping("/{imageId}")
    public ResponseEntity<?> deleteImage(CallerInfo caller,
                                          @PathVariable UUID listingId,
                                          @PathVariable UUID imageId) {

        FindResult result = findOwnedListing(listingId, caller);
        if (result.error() != null) return result.error();
        Listing listing = result.listing();

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        Optional<ListingImage> imageOpt = imageRepository.findByIdAndListingId(imageId, listingId);
        if (imageOpt.isEmpty()) {
            return notFound("Image not found");
        }

        ListingImage image = imageOpt.get();
        imageService.deleteImage(image);

        log.info("DELETE /api/listings/{}/images/{} -> 204 storagePath={} userId={}",
                listingId, imageId, image.getStoragePath(), caller.userId());
        return ResponseEntity.noContent().build();
    }

    // ==================== PUT — reorder images ====================

    @PutMapping("/reorder")
    public ResponseEntity<?> reorderImages(CallerInfo caller,
                                            @PathVariable UUID listingId,
                                            @RequestBody ReorderRequest req) {

        FindResult result = findOwnedListing(listingId, caller);
        if (result.error() != null) return result.error();
        Listing listing = result.listing();

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot modify images for listing with status " + listing.getStatus());
        }

        if (req.imageIds() == null || req.imageIds().isEmpty()) {
            return badRequest("imageIds must not be empty");
        }

        try {
            List<ListingImage> reordered = imageService.reorderImages(listingId, req.imageIds());
            log.info("PUT /api/listings/{}/images/reorder -> 200 count={} userId={}",
                    listingId, reordered.size(), caller.userId());
            return ResponseEntity.ok(reordered.stream().map(ListingImageController::toResponse).toList());
        } catch (IllegalArgumentException e) {
            return badRequest(e.getMessage());
        }
    }

    /**
     * Resolves the listing and enforces ownership.
     *
     * <p>Returns a {@link FindResult} whose {@code error()} is non-null when the request must be
     * rejected immediately:
     * <ul>
     *   <li>404 — listing does not exist</li>
     *   <li>403 — SCRAPED listing (createdBy == null) and caller is not an admin; the listing has
     *       no owner so no non-admin can own it</li>
     *   <li>404 — listing exists but belongs to a different user and caller is not an admin</li>
     * </ul>
     *
     * <p>When {@code error()} is null, {@code listing()} is always non-null and the caller is
     * authorised to proceed.
     */
    private FindResult findOwnedListing(UUID listingId, CallerInfo caller) {
        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null) {
            return FindResult.notFound(notFound("Listing not found"));
        }
        if (!caller.isAdmin()) {
            if (listing.getCreatedBy() == null) {
                // SCRAPED listing — no owner; non-admin callers are forbidden, not "not found".
                log.warn("findOwnedListing listingId={} caller={} reason=scraped_no_owner -> 403",
                        listingId, caller.userId());
                return FindResult.forbidden(ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Access denied: listing has no owner")));
            }
            if (!caller.userId().equals(listing.getCreatedBy())) {
                return FindResult.notFound(notFound("Listing not found"));
            }
        }
        return FindResult.ok(listing);
    }

    /** Discriminated result from {@link #findOwnedListing}. */
    private record FindResult(Listing listing, ResponseEntity<?> error) {
        static FindResult ok(Listing listing)               { return new FindResult(listing, null); }
        static FindResult notFound(ResponseEntity<?> error) { return new FindResult(null, error); }
        static FindResult forbidden(ResponseEntity<?> error){ return new FindResult(null, error); }
    }

    // ===== Helpers =====

    private static String extractExtension(String path) {
        var matcher = EXTENSION_PATTERN.matcher(path);
        if (matcher.matches()) {
            return matcher.group(1).toLowerCase();
        }
        return null;
    }

    private static ResponseEntity<Map<String, String>> notFound(String message) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", message));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String message) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", message));
    }

    static ImageResponse toResponse(ListingImage img) {
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
