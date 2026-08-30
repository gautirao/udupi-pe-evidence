ALTER TABLE public.listing_verification_dimension
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500);
