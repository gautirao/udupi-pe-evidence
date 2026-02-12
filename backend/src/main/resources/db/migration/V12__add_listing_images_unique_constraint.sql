-- V12: Add unique constraint on (listing_id, storage_path) for upload idempotency.
--
-- Required by IMAGE_UPLOAD_FAILURE_MODES.md §2: "The listing_images table must
-- have a UNIQUE constraint on (listing_id, storage_path)."
-- This prevents duplicate metadata rows when the client retries after a network
-- failure. Backend returns 409 Conflict if the path is already registered.

ALTER TABLE public.listing_images
    ADD CONSTRAINT uq_listing_images_listing_path
    UNIQUE (listing_id, storage_path);
