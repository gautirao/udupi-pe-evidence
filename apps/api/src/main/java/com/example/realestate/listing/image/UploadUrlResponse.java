package com.example.realestate.listing.image;

import java.util.Map;

/**
 * Response body for POST /api/listings/{listingId}/images/upload-url.
 *
 * <p>The frontend must PUT the file bytes directly to {@code signedUrl} using {@code requiredHeaders},
 * then call POST /api/listings/{listingId}/images with {@code storagePath} to register the metadata.
 *
 * @param signedUrl       fully-qualified absolute PUT target (includes the upload token in the
 *                        query string); expires when the Supabase Storage token expires
 * @param storagePath     path within the {@code listing-images} bucket; pass verbatim to the
 *                        subsequent register call
 * @param expiresAt       {@code null} — the upload token lifetime is server-fixed by Supabase
 *                        Storage; the {@code expiresIn} hint is forwarded in the sign request but
 *                        is not reliably honoured by all storage-api versions, so fabricating a
 *                        client-visible timestamp would be misleading
 * @param requiredHeaders provider-neutral HTTP headers required for the direct upload PUT request
 */
public record UploadUrlResponse(
        String signedUrl,
        String storagePath,
        String expiresAt,
        Map<String, String> requiredHeaders
) {}

