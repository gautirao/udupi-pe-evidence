package com.example.realestate.listing.storage;

import java.util.Optional;

/**
 * Provider-neutral boundary interface for listing image storage operations.
 *
 * <p>Decouples image metadata controllers, services, and registrars from concrete
 * storage providers (e.g. Supabase, R2, or local filesystem).
 */
public interface ListingImageStorage {

    /**
     * Derives the canonical public URL for a storage object.
     *
     * @param storageBucket bucket name (e.g. "listing-images")
     * @param storagePath   path within bucket or external path (e.g. "listings/...", "external:...")
     * @return canonical public URL
     */
    String getPublicUrl(String storageBucket, String storagePath);

    /**
     * Creates a provider-owned upload target with signed URL, headers, and metadata.
     *
     * @param storageBucket bucket name
     * @param storagePath   path within bucket
     * @param contentType   media content type (e.g. "image/jpeg")
     * @return Optional containing UploadTarget, or empty if storage unavailable
     */
    Optional<UploadTarget> createUploadTarget(String storageBucket, String storagePath, String contentType);

    /**
     * Deletes a storage object on a best-effort basis.
     * Implementations MUST skip deletion for external paths (e.g. starting with "external:").
     *
     * @param storagePath storage path or external URL
     */
    void deleteObjectBestEffort(String storagePath);

    /**
     * Inspects metadata of a stored image object.
     *
     * @param storagePath storage path or external URL
     * @return ImageObjectMetadata describing object presence and properties
     */
    ImageObjectMetadata inspect(String storagePath);
}
