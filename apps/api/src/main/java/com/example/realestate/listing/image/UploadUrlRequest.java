package com.example.realestate.listing.image;

/**
 * Request body for POST /api/listings/{listingId}/images/upload-url.
 *
 * <p>{@code fileName} is used ONLY to derive and validate the file extension;
 * it is NEVER concatenated into {@code storagePath}. The server constructs
 * the storage path from DB-owned values (createdBy + listingId + UUID).
 *
 * @param fileName    original file name (e.g. "photo.jpg") — extension validation only
 * @param contentType MIME type of the file to be uploaded (e.g. "image/jpeg")
 * @param sizeBytes   declared file size in bytes; must be &gt; 0 and ≤ 5 MB
 */
public record UploadUrlRequest(String fileName, String contentType, long sizeBytes) {}
