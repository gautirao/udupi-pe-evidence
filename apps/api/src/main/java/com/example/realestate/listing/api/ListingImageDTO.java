package com.example.realestate.listing.api;

/**
 * Whitelisted projection of a listing image for API responses.
 *
 * <p>Only url, alt, and position are exposed. The storage key (storage_path),
 * database id, listing_id, created_at, and uploader information are deliberately
 * NOT exposed to protect owner-only / internal fields and prevent CDN bypass.
 *
 * <p>{@code alt} is emitted as {@code null} until the underlying schema adds an
 * alt-text column; the frontend falls back to the listing title in that case.
 */
public record ListingImageDTO(
        String url,
        String alt,
        int position
) {
}
