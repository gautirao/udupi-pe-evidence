package com.example.realestate.listing.storage;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.Optional;

/**
 * Best-effort Supabase Storage object deletion via the Admin REST API (service_role key).
 *
 * <p>Enabled only when {@code supabase.storage.enabled=true} AND both {@code SUPABASE_URL}
 * and {@code SUPABASE_SERVICE_ROLE_KEY} are set. Disabled by default so that the backend
 * starts cleanly in environments where the service-role key is not available.
 *
 * <p>If {@code enabled=true} but credentials are missing, the service logs a single WARN at
 * startup, marks itself internally disabled, and continues booting. This allows prod
 * operators to toggle {@code SUPABASE_STORAGE_ENABLED} without also supplying the two
 * secrets in the same deploy. Status is surfaced at {@code /actuator/info} via
 * {@link SupabaseStorageInfoContributor}.
 *
 * <p>HTTPS enforcement on {@code supabase.url} remains a hard fail — plaintext
 * transmission of the service-role key is never permitted.
 *
 * <p>Per IMAGE_UPLOAD_FAILURE_MODES.md §3: Storage delete is non-fatal. DB row is always
 * deleted first; this call is best-effort. Orphan cleanup (§5) covers any missed objects.
 */
@Service
public class SupabaseStorageService implements ListingImageStorage {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageService.class);

    /** Sentinel value persisted to {@code identity_evidence.document_url} when storage is disabled. */
    public static final String STORAGE_DISABLED_SENTINEL_PREFIX = "storage-disabled://";

    /** Reason surfaced at /actuator/info. */
    enum StatusReason {
        ENABLED("enabled"),
        DISABLED_BY_FLAG("disabled-by-flag"),
        MISSING_CREDENTIALS("missing-credentials");

        private final String value;
        StatusReason(String value) { this.value = value; }
        public String value() { return value; }
    }

    @Value("${supabase.storage.enabled:false}")
    private boolean configuredEnabled;

    @Value("${supabase.storage.upload-url-ttl-seconds:300}")
    private int uploadUrlTtlSeconds;

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service-role-key:}")
    private String serviceRoleKey;

    @Value("${supabase.storage.bucket:listing-images}")
    private String bucket;

    /** Effective runtime state. Set by {@link #validate()}. */
    private boolean enabled;

    /** Human-readable reason for the current state. Set by {@link #validate()}. */
    private StatusReason statusReason = StatusReason.DISABLED_BY_FLAG;

    private final RestTemplate restTemplate;
    private final LocalDevStorageService localDevStorageService;

    public SupabaseStorageService(RestTemplate restTemplate, LocalDevStorageService localDevStorageService) {
        this.restTemplate = restTemplate;
        this.localDevStorageService = localDevStorageService;
    }

    /**
     * Reconcile configuration into effective runtime state on startup.
     *
     * <p>Behaviour:
     * <ul>
     *   <li>{@code enabled=false} → internally disabled, reason=disabled-by-flag (info log).</li>
     *   <li>{@code enabled=true} + both creds present + HTTPS URL → internally enabled (info log).</li>
     *   <li>{@code enabled=true} + URL or key missing → graceful downgrade: WARN once, internally disabled,
     *       reason=missing-credentials. No exception thrown.</li>
     *   <li>{@code enabled=true} + non-HTTPS URL → hard fail ({@link IllegalStateException}).
     *       Plaintext transmission of the service-role key is never permitted.</li>
     * </ul>
     */
    @PostConstruct
    public void validate() {
        if (!configuredEnabled) {
            this.enabled = false;
            this.statusReason = StatusReason.DISABLED_BY_FLAG;
            log.info("SupabaseStorageService: disabled (set SUPABASE_STORAGE_ENABLED=true to enable)");
            return;
        }

        boolean urlMissing = supabaseUrl == null || supabaseUrl.isBlank();
        boolean keyMissing = serviceRoleKey == null || serviceRoleKey.isBlank();
        if (urlMissing || keyMissing) {
            this.enabled = false;
            this.statusReason = StatusReason.MISSING_CREDENTIALS;
            // Single WARN at startup — hot paths stay on log.debug.
            log.warn("SupabaseStorageService: supabase.storage.enabled=true but {} is missing. "
                    + "Service will run in disabled mode; uploads/signed-URLs/deletes are no-ops. "
                    + "Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to activate, "
                    + "or set SUPABASE_STORAGE_ENABLED=false to silence this warning.",
                    (urlMissing && keyMissing)
                            ? "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
                            : urlMissing ? "SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY");
            return;
        }

        // Enforce HTTPS to prevent plaintext transmission of the service role key.
        // This remains a hard fail — no graceful downgrade for an unsafe URL scheme.
        if (!supabaseUrl.startsWith("https://")) {
            throw new IllegalStateException(
                    "supabase.url must start with https:// — plaintext URLs are not permitted "
                    + "as they would transmit the SUPABASE_SERVICE_ROLE_KEY unencrypted.");
        }

        this.enabled = true;
        this.statusReason = StatusReason.ENABLED;
        log.info("SupabaseStorageService: enabled — bucket={} url={}", bucket, supabaseUrl);
    }

    /**
     * @return {@code true} iff the service is live (configured enabled AND credentials present AND HTTPS).
     */
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * @return human-readable reason for the current effective state. Stable across reads.
     */
    public String getStatusReason() {
        return statusReason.value();
    }

    /**
     * Upload bytes to Supabase Storage and return the public URL.
     * Non-fatal: returns {@link Optional#empty()} on any failure.
     *
     * @param storageBucket bucket name (e.g. "trust-assets")
     * @param storagePath   path within bucket (e.g. "listingId/photos/uuid.jpg")
     * @param content       file bytes
     * @param contentType   MIME type (e.g. "image/jpeg", "application/pdf")
     * @return Optional containing the public URL, or empty if disabled or upload failed
     */
    public Optional<String> uploadObject(
            String storageBucket, String storagePath, byte[] content, String contentType) {
        if (!enabled) {
            log.debug("Storage upload skipped (disabled): path={}", storagePath);
            return Optional.empty();
        }
        if (storagePath == null || storagePath.contains("..")) {
            log.warn("Storage upload rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }

        String url = UriComponentsBuilder.fromHttpUrl(supabaseUrl)
                .pathSegment("storage", "v1", "object", storageBucket)
                .path("/" + storagePath)
                .build().toUriString();

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + serviceRoleKey);
            headers.set("Content-Type", contentType);
            restTemplate.exchange(url, HttpMethod.POST,
                    new HttpEntity<>(content, headers), Void.class);

            // Build the public URL
            String publicUrl = UriComponentsBuilder.fromHttpUrl(supabaseUrl)
                    .pathSegment("storage", "v1", "object", "public", storageBucket)
                    .path("/" + storagePath)
                    .build().toUriString();

            log.info("Storage object uploaded: path={}", storagePath);
            return Optional.of(publicUrl);
        } catch (RestClientResponseException e) {
            log.warn("Storage upload failed — path={} status={}", storagePath, e.getStatusCode());
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Storage upload failed — path={} error={}", storagePath, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    /**
     * Derives the canonical public URL for a storage object.
     *
     * @param storageBucket bucket name (e.g. "listing-images")
     * @param storagePath   path within bucket (e.g. "listings/user/listing/uuid.jpg" or "external:https://...")
     * @return canonical public URL
     */
    @Override
    public String getPublicUrl(String storageBucket, String storagePath) {
        if (storagePath == null) {
            return "";
        }
        if (storagePath.startsWith("external:")) {
            return storagePath.substring("external:".length());
        }
        if (localDevStorageService != null && localDevStorageService.isEnabled()) {
            return localDevStorageService.getPublicUrl(storageBucket, storagePath).orElse("");
        }
        String cleanPath = storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;
        String baseUrl = (supabaseUrl != null && !supabaseUrl.isBlank())
                ? supabaseUrl
                : "https://storage.supabase.co";
        return UriComponentsBuilder.fromHttpUrl(baseUrl)
                .pathSegment("storage", "v1", "object", "public", storageBucket)
                .path("/" + cleanPath)
                .build().toUriString();
    }

    /**
     * Create a short-lived signed URL for a private Storage object.
     * Uses the Supabase Storage {@code POST /object/sign} endpoint.
     *
     * @param storageBucket bucket name (e.g. "identity-evidence")
     * @param storagePath   path within bucket (e.g. "userId/AADHAAR/uuid.jpg")
     * @param expiresInSeconds TTL for the signed URL (e.g. 900 = 15 minutes)
     * @return Optional containing the full signed URL, or empty if disabled or request failed
     */
    @SuppressWarnings("unchecked")
    public Optional<String> createSignedUrl(
            String storageBucket, String storagePath, int expiresInSeconds) {
        if (!enabled) {
            log.debug("Signed URL skipped (disabled): path={}", storagePath);
            return Optional.empty();
        }
        if (storagePath == null || storagePath.contains("..")) {
            log.warn("Signed URL rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }

        String url = UriComponentsBuilder.fromHttpUrl(supabaseUrl)
                .pathSegment("storage", "v1", "object", "sign", storageBucket)
                .path("/" + storagePath)
                .build().toUriString();

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + serviceRoleKey);
            headers.set("Content-Type", "application/json");

            Map<String, Object> body = Map.of("expiresIn", expiresInSeconds);
            var response = restTemplate.exchange(url, HttpMethod.POST,
                    new HttpEntity<>(body, headers), Map.class);

            Map<String, Object> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("signedURL")) {
                String signedPath = (String) responseBody.get("signedURL");
                // signedURL is relative — prepend the Supabase base URL
                String fullUrl = supabaseUrl + "/storage/v1" + signedPath;
                log.debug("Signed URL created: path={} ttl={}s", storagePath, expiresInSeconds);
                return Optional.of(fullUrl);
            }
            log.warn("Signed URL response missing signedURL key: path={}", storagePath);
            return Optional.empty();
        } catch (RestClientResponseException e) {
            log.warn("Signed URL failed — path={} status={}", storagePath, e.getStatusCode());
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Signed URL failed — path={} error={}", storagePath, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    /**
     * Create a short-lived signed URL for uploading an object to Supabase Storage.
     * Uses the service-role key on {@code POST /storage/v1/object/upload/sign/{bucket}/{path}},
     * which bypasses storage RLS and is the correct fix for #1686 (user Supabase JWTs lack the
     * Spring-managed role claim that storage RLS requires).
     *
     * <p>The response {@code url} key is relative (e.g. {@code /object/upload/sign/...?token=...});
     * this method prepends {@code {supabase.url}/storage/v1} to form the absolute PUT target.
     *
     * <p>Note: the upload-sign endpoint may not honour {@code expiresIn} in all storage-api
     * versions; token lifetime is server-fixed. Callers must not fabricate an expiry timestamp.
     *
     * @param storageBucket bucket name (e.g. "listing-images")
     * @param storagePath   path within bucket (e.g. "listings/{userId}/{listingId}/uuid.jpg")
     * @return Optional containing the absolute signed upload URL, or empty if disabled or request failed
     */
    @SuppressWarnings("unchecked")
    public Optional<String> createSignedUploadUrl(String storageBucket, String storagePath) {
        if (!enabled) {
            // Local dev worktrees have no real Supabase Storage credentials (#2351). When the
            // operator has explicitly opted into local.dev.storage.enabled=true, fall back to a
            // filesystem-backed stub so the real-UI upload path works without touching real/shared
            // Supabase Storage. Never set outside a local apps/api/.env — see docs/local-dev-storage.md.
            if (localDevStorageService.isEnabled()) {
                return localDevStorageService.createSignedUploadUrl(storageBucket, storagePath);
            }
            log.debug("Signed upload URL skipped (disabled): path={}", storagePath);
            return Optional.empty();
        }
        if (storagePath == null || storagePath.contains("..")) {
            log.warn("Signed upload URL rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }

        String url = UriComponentsBuilder.fromHttpUrl(supabaseUrl)
                .pathSegment("storage", "v1", "object", "upload", "sign", storageBucket)
                .path("/" + storagePath)
                .build().toUriString();

        try {
            HttpHeaders headers = new HttpHeaders();
            // Authorization header is never logged — it carries the service-role key.
            headers.set("Authorization", "Bearer " + serviceRoleKey);
            headers.set("Content-Type", "application/json");

            Map<String, Object> body = Map.of("expiresIn", uploadUrlTtlSeconds);
            var response = restTemplate.exchange(url, HttpMethod.POST,
                    new HttpEntity<>(body, headers), Map.class);

            Map<String, Object> responseBody = response.getBody();
            if (responseBody != null && responseBody.containsKey("url")) {
                String relativeUrl = (String) responseBody.get("url");
                // relativeUrl is relative to the storage-api base (e.g. /object/upload/sign/...?token=...)
                // Prepend {supabase.url}/storage/v1 to form the absolute PUT target.
                // Log status only — response body carries the upload token; never log it.
                String absoluteSignedUrl = supabaseUrl + "/storage/v1" + relativeUrl;
                log.debug("Signed upload URL created: path={} ttl={}s", storagePath, uploadUrlTtlSeconds);
                return Optional.of(absoluteSignedUrl);
            }
            log.warn("Signed upload URL response missing `url` key: path={}", storagePath);
            return Optional.empty();
        } catch (RestClientResponseException e) {
            // Log status code only — response body may contain token fragments.
            log.warn("Signed upload URL failed — path={} status={}", storagePath, e.getStatusCode());
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Signed upload URL failed — path={} error={}", storagePath, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    /**
     * Delete a Storage object by its path within the configured bucket.
     * Non-fatal: any exception is logged as a warning and swallowed.
     *
     * @param storagePath path relative to bucket root (e.g. {@code listings/{userId}/{listingId}/file.jpg})
     */
    @Override
    public void deleteObjectBestEffort(String storagePath) {
        if (storagePath == null || storagePath.startsWith("external:")) {
            log.debug("Storage delete skipped (external or null): path={}", storagePath);
            return;
        }
        if (!enabled) {
            log.debug("Storage delete skipped (disabled): path={}", storagePath);
            return;
        }
        if (storagePath.contains("..")) {
            log.warn("Storage delete rejected — unsafe path: path={}", storagePath);
            return;
        }

        // Build URL with proper percent-encoding to prevent path injection
        String url = UriComponentsBuilder.fromHttpUrl(supabaseUrl)
                .pathSegment("storage", "v1", "object", bucket)
                .path("/" + storagePath) // storagePath contains '/' separators — preserve them
                .build().toUriString();

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + serviceRoleKey);
            restTemplate.exchange(url, HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
            log.info("Storage object deleted: path={}", storagePath);
        } catch (RestClientResponseException e) {
            // Log status code only — response body may contain token fragments
            log.warn("Best-effort Storage delete failed — path={} status={}", storagePath, e.getStatusCode());
        } catch (Exception e) {
            log.warn("Best-effort Storage delete failed — path={} error={}", storagePath, e.getClass().getSimpleName());
        }
    }

    @Override
    public Optional<UploadTarget> createUploadTarget(String storageBucket, String storagePath, String contentType) {
        Optional<String> signedUrlOpt = createSignedUploadUrl(storageBucket, storagePath);
        if (signedUrlOpt.isEmpty()) {
            return Optional.empty();
        }
        Map<String, String> headers = (contentType != null && !contentType.isBlank())
                ? Map.of("Content-Type", contentType)
                : Map.of();
        return Optional.of(new UploadTarget(signedUrlOpt.get(), storagePath, null, headers));
    }

    @Override
    public ImageObjectMetadata inspect(String storagePath) {
        if (storagePath == null) {
            return ImageObjectMetadata.notFound();
        }
        if (storagePath.startsWith("external:")) {
            return new ImageObjectMetadata(true, null, null);
        }
        if (!enabled && (localDevStorageService == null || !localDevStorageService.isEnabled())) {
            return ImageObjectMetadata.notFound();
        }
        return new ImageObjectMetadata(true, null, null);
    }
}
