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

/**
 * Best-effort Supabase Storage object deletion via the Admin REST API (service_role key).
 *
 * <p>Enabled only when {@code supabase.storage.enabled=true}. Disabled by default so that
 * the backend starts cleanly in environments where SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * <p>Per IMAGE_UPLOAD_FAILURE_MODES.md §3: Storage delete is non-fatal. DB row is always
 * deleted first; this call is best-effort. Orphan cleanup (§5) covers any missed objects.
 */
@Service
public class SupabaseStorageService {

    private static final Logger log = LoggerFactory.getLogger(SupabaseStorageService.class);

    @Value("${supabase.storage.enabled:false}")
    private boolean enabled;

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service-role-key:}")
    private String serviceRoleKey;

    @Value("${supabase.storage.bucket:listing-images}")
    private String bucket;

    private final RestTemplate restTemplate;

    public SupabaseStorageService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    /**
     * Fail fast on startup if storage is enabled but required credentials are absent.
     * This prevents silent misconfiguration in production.
     */
    @PostConstruct
    public void validate() {
        if (enabled) {
            if (supabaseUrl == null || supabaseUrl.isBlank()
                    || serviceRoleKey == null || serviceRoleKey.isBlank()) {
                throw new IllegalStateException(
                        "supabase.storage.enabled=true but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. "
                        + "Set both environment variables or disable with SUPABASE_STORAGE_ENABLED=false.");
            }
            // Enforce HTTPS to prevent plaintext transmission of the service role key
            if (!supabaseUrl.startsWith("https://")) {
                throw new IllegalStateException(
                        "supabase.url must start with https:// — plaintext URLs are not permitted "
                        + "as they would transmit the SUPABASE_SERVICE_ROLE_KEY unencrypted.");
            }
            log.info("SupabaseStorageService: enabled — bucket={} url={}", bucket, supabaseUrl);
        } else {
            log.info("SupabaseStorageService: disabled (set SUPABASE_STORAGE_ENABLED=true to enable)");
        }
    }

    /**
     * Delete a Storage object by its path within the configured bucket.
     * Non-fatal: any exception is logged as a warning and swallowed.
     *
     * @param storagePath path relative to bucket root (e.g. {@code listings/{userId}/{listingId}/file.jpg})
     */
    public void deleteObjectBestEffort(String storagePath) {
        if (!enabled) {
            log.debug("Storage delete skipped (disabled): path={}", storagePath);
            return;
        }
        if (storagePath == null || storagePath.contains("..")) {
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
}
