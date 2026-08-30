-- V29: Add listing_number column for human-friendly PROP-XXXXX display IDs.
-- Steps: add nullable column -> backfill -> create sequence -> set default -> set NOT NULL -> add UNIQUE.

-- 1. Add column (nullable initially)
ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS listing_number INTEGER;

-- 2. Backfill existing rows with sequential numbers ordered by created_at, id (deterministic)
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
    FROM public.property_listings
    WHERE listing_number IS NULL
)
UPDATE public.property_listings pl
SET listing_number = numbered.rn
FROM numbered
WHERE pl.id = numbered.id;

-- 3. Create sequence starting at MAX(listing_number) + 1
DO $$
DECLARE
    max_val INTEGER;
BEGIN
    SELECT COALESCE(MAX(listing_number), 0) + 1 INTO max_val
    FROM public.property_listings;

    -- Drop and recreate to ensure correct start value (idempotent on re-run)
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'listing_number_seq') THEN
        EXECUTE format('CREATE SEQUENCE public.listing_number_seq START WITH %s', max_val);
    ELSE
        EXECUTE format('ALTER SEQUENCE public.listing_number_seq RESTART WITH %s', max_val);
    END IF;
END $$;

-- 4. Set column default to nextval
ALTER TABLE public.property_listings
    ALTER COLUMN listing_number SET DEFAULT nextval('public.listing_number_seq');

-- 5. Set NOT NULL constraint
ALTER TABLE public.property_listings
    ALTER COLUMN listing_number SET NOT NULL;

-- 6. Add UNIQUE constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_listing_number' AND conrelid = 'public.property_listings'::regclass
    ) THEN
        ALTER TABLE public.property_listings
            ADD CONSTRAINT uq_listing_number UNIQUE (listing_number);
    END IF;
END $$;
