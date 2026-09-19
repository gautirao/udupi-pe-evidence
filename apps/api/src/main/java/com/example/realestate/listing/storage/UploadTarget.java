package com.example.realestate.listing.storage;

import java.time.Instant;
import java.util.Map;

/**
 * Provider-owned target model for client-side direct uploads.
 *
 * @param signedUrl       fully-qualified upload URL
 * @param storagePath     canonical storage path allocated by server
 * @param expiresAt       optional timestamp when the upload target expires (null if fixed/unknown)
 * @param requiredHeaders provider-specific HTTP headers required during upload
 */
public record UploadTarget(
        String signedUrl,
        String storagePath,
        Instant expiresAt,
        Map<String, String> requiredHeaders
) {}
