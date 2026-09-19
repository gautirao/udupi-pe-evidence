package com.example.realestate.listing.image;

import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.storage.ListingImageStorage;
import com.example.realestate.listing.storage.LocalDevStorageService;
import com.example.realestate.listing.storage.UploadTarget;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfo;
import com.example.realestate.trust.BadgeInvalidationService;
import jakarta.servlet.http.HttpServletRequest;
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
import org.springframework.web.server.ResponseStatusException;

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
    private static final long MAX_FILE_SIZE = 5L * 1024 * 1024; // 5 MB
    private static final String LISTING_IMAGES_BUCKET = "listing-images";
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final Set<String> MUTABLE_STATUSES = Set.of(
            ListingStatus.DRAFT.toDbValue(), ListingStatus.REJECTED.toDbValue());
    private static final Pattern EXTENSION_PATTERN = Pattern.compile(".*\\.([a-zA-Z]+)$");

    private static final String IMAGE_CHANGE_TRIGGER = "IMAGE_CHANGE";

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    private final ListingImageRegistrar imageRegistrar;
    private final ListingImageService imageService;
    private final ListingWorkflowService listingWorkflowService;
    private final BadgeInvalidationService badgeInvalidationService;
    private final ListingImageStorage storageService;
    private final LocalDevStorageService localDevStorageService;
    private final RateLimiterService rateLimiterService;

    public ListingImageController(ListingRepository listingRepository,
                                   ListingImageRepository imageRepository,
                                   ListingImageRegistrar imageRegistrar,
                                   ListingImageService imageService,
                                   ListingWorkflowService listingWorkflowService,
                                   BadgeInvalidationService badgeInvalidationService,
                                   ListingImageStorage storageService,
                                   LocalDevStorageService localDevStorageService,
                                   RateLimiterService rateLimiterService) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.imageRegistrar = imageRegistrar;
        this.imageService = imageService;
        this.listingWorkflowService = listingWorkflowService;
        this.badgeInvalidationService = badgeInvalidationService;
        this.storageService = storageService;
        this.localDevStorageService = localDevStorageService;
        this.rateLimiterService = rateLimiterService;
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
        return ResponseEntity.ok(images.stream()
                .map(img -> toResponse(img, localDevStorageService))
                .toList());
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

        // Delegate to a separate Spring bean so @Transactional proxy is honoured.
        // Self-calls within the same bean bypass the proxy and would leave the
        // count-check and save running without a transaction or pessimistic lock.
        // Defensive catch: if PessimisticLockingFailureException somehow escapes
        // the registrar (e.g. thrown during transaction commit), surface 503 here
        // rather than letting the default exception handler return 500.
        try {
            ResponseEntity<?> response = imageRegistrar.register(listingId, req, caller.userId());
            if (response.getStatusCode().value() == HttpStatus.CREATED.value()) {
                badgeInvalidationService.invalidateSpecificDimension(
                        listingId, "PHOTOS", IMAGE_CHANGE_TRIGGER);
            }
            return response;
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

    // ==================== POST — request signed upload URL (#1686) ====================

    /**
     * Issues a Supabase Storage signed upload URL using the service-role key.
     *
     * <p>The frontend must PUT the file bytes directly to the returned {@code signedUrl},
     * then call POST .../images with {@code storagePath} to register metadata. This fixes
     * #1686: direct frontend uploads fail RLS because Spring manages roles in its own DB and
     * they are not mirrored into Supabase JWTs; the service-role key bypasses storage RLS.
     *
     * <p>Validation fires before any signed URL is minted to avoid wasting sign quota on
     * invalid requests.
     */
    @PostMapping("/upload-url")
    public ResponseEntity<?> requestUploadUrl(CallerInfo caller,
                                               @PathVariable UUID listingId,
                                               @RequestBody UploadUrlRequest req,
                                               HttpServletRequest request) {

        FindResult result = findOwnedListing(listingId, caller);
        if (result.error() != null) return result.error();
        Listing listing = result.listing();

        if (!MUTABLE_STATUSES.contains(listing.getStatus())) {
            return badRequest("Cannot upload images for listing with status " + listing.getStatus());
        }

        // Guard: scraped listings (null createdBy) have no valid storage path.
        // Non-admins are already blocked by findOwnedListing; this catches admin callers on scraped listings.
        if (listing.getCreatedBy() == null) {
            log.warn("POST /api/listings/{}/images/upload-url -> 403 reason=scraped_no_owner userId={}",
                    listingId, caller.userId());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Cannot upload images to a listing with no owner"));
        }

        // Validate BEFORE issuing the signed URL — no URL is minted on bad input.
        if (req.contentType() == null || !ALLOWED_CONTENT_TYPES.contains(req.contentType())) {
            return badRequest("Allowed content types: image/jpeg, image/png, image/webp");
        }

        String ext = extractExtension(req.fileName() != null ? req.fileName() : "");
        if (ext == null || !ALLOWED_EXTENSIONS.contains(ext)) {
            return badRequest("Allowed image types: jpg, jpeg, png, webp");
        }

        if (req.sizeBytes() <= 0 || req.sizeBytes() > MAX_FILE_SIZE) {
            return badRequest("File size must be between 1 byte and 5 MB");
        }

        // Per-user rate limit (#1699) — checked after ownership/status/scraped/metadata validation
        // so non-owner, unauthenticated, and invalid-metadata requests never consume the bucket.
        // IP fallback is defensive-only: Spring Security guarantees an authenticated caller.userId()
        // reaches this point.
        String rateLimitKey = caller.userId() != null
                ? "listing-upload-url:user:" + caller.userId()
                : "listing-upload-url:ip:" + request.getRemoteAddr();
        if (!rateLimiterService.getImageUploadUrlBucket(rateLimitKey).tryConsume(1)) {
            log.warn("POST /api/listings/{}/images/upload-url -> 429 rate limit exceeded key={}",
                    listingId, rateLimitKey);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
        }

        // Build storagePath server-side from DB-owned values (createdBy is from the listing entity,
        // never from the request). This keeps the existing register prefix validation passing.
        String storagePath = "listings/" + listing.getCreatedBy() + "/" + listingId
                + "/" + UUID.randomUUID() + "." + ext;

        Optional<UploadTarget> targetOpt = storageService.createUploadTarget(
                LISTING_IMAGES_BUCKET, storagePath, req.contentType());
        if (targetOpt.isEmpty()) {
            log.warn("POST /api/listings/{}/images/upload-url -> 503 storage unavailable userId={}",
                    listingId, caller.userId());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Image storage unavailable, please retry later"));
        }

        UploadTarget target = targetOpt.get();
        String expiresAtStr = target.expiresAt() != null ? target.expiresAt().toString() : null;
        UploadUrlResponse response = new UploadUrlResponse(
                target.signedUrl(),
                target.storagePath(),
                expiresAtStr,
                target.requiredHeaders()
        );
        log.info("POST /api/listings/{}/images/upload-url -> 200 storagePath={} userId={}",
                listingId, storagePath, caller.userId());
        return ResponseEntity.ok(response);
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

        badgeInvalidationService.invalidateSpecificDimension(
                listingId, "PHOTOS", IMAGE_CHANGE_TRIGGER);

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
            return ResponseEntity.ok(reordered.stream()
                    .map(img -> toResponse(img, localDevStorageService))
                    .toList());
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
        try {
            Listing listing = listingWorkflowService.findListingForCaller(
                    listingId, caller.userId(), caller.isAdmin());
            return FindResult.ok(listing);
        } catch (ListingNotFoundException e) {
            return FindResult.notFound(notFound("Listing not found"));
        } catch (ListingOwnershipException e) {
            // Distinguish scraped (null createdBy → 403) from wrong owner (non-null → 404).
            // Re-read is acceptable on the rare auth-fail path.
            Listing raw = listingRepository.findById(listingId).orElse(null);
            if (raw != null && raw.getCreatedBy() == null) {
                log.warn("findOwnedListing listingId={} caller={} reason=scraped_no_owner -> 403",
                        listingId, caller.userId());
                return FindResult.forbidden(ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Access denied: listing has no owner")));
            }
            return FindResult.notFound(notFound("Listing not found"));
        }
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

    /**
     * Builds the response DTO for an image, resolving the display URL.
     *
     * <p>The stored {@code img.getUrl()} is whatever URL the client supplied at registration
     * time (a real Supabase Storage URL in prod, or a Supabase-style placeholder in local dev —
     * see #2351). It must never be trusted as-is when local dev storage is enabled: the actual
     * bytes live in the local filesystem stub, not at that URL. When enabled, the display URL is
     * instead derived server-side from the image's own {@code storagePath} via
     * {@link LocalDevStorageService#resolveDisplayUrl}, which also owns the single contract for
     * every other listing-image display path (see {@link com.example.realestate.listing.api.ListingResponseMapper}).
     * When disabled (prod/CI), behavior is an exact pass-through of {@code img.getUrl()} — no
     * semantic change.
     */
    static ImageResponse toResponse(ListingImage img, LocalDevStorageService localDevStorageService) {
        String url = localDevStorageService != null
                ? localDevStorageService.resolveDisplayUrl(LISTING_IMAGES_BUCKET, img.getStoragePath(), img.getUrl())
                : img.getUrl();
        return new ImageResponse(
                img.getId(), img.getListingId(), img.getStoragePath(), url,
                img.getPosition(), img.getCreatedAt() != null ? img.getCreatedAt().toString() : null);
    }

    // ===== DTOs =====

    public record RegisterImageRequest(String storagePath) {}
    public record ReorderRequest(List<UUID> imageIds) {}
    public record ImageResponse(UUID id, UUID listingId, String storagePath, String url,
                                 int position, String createdAt) {}
}
