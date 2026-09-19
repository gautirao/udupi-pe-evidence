package com.example.realestate.listing.storage;

/**
 * Provider-owned metadata model for inspected storage objects.
 *
 * @param exists        whether the object exists in storage
 * @param contentLength object size in bytes, or null if unknown
 * @param contentType   media content type of object, or null if unknown
 */
public record ImageObjectMetadata(
        boolean exists,
        Long contentLength,
        String contentType
) {
    public static ImageObjectMetadata notFound() {
        return new ImageObjectMetadata(false, null, null);
    }
}
