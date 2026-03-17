-- flyway:executeInTransaction=false
--
-- V41: Expand phase — add 'broker' as a valid role/value alongside 'dealer'.
--
-- This is the EXPAND phase. It adds 'broker' without removing 'dealer'.
-- V42 (contract phase) will drop 'dealer' once the application has fully migrated.
--
-- Changes (in order):
--   1. Enum: add 'broker' to app_role
--   2. Column rename: viewing_requests.dealer_id -> broker_id (+ index rename)
--   3. Data migration: seller_type 'dealer' -> 'broker' in property_listings
--   4. Extend chk_seller_type constraint to include 'broker'
--   5. Data migration: cancelled_by 'dealer' -> 'broker' in viewing_requests
--   6. RLS policy updates: add 'broker' alongside 'dealer' in all relevant policies
--
-- NOTE on ALTER TYPE ... ADD VALUE and transactions:
--   PostgreSQL < 14 cannot run ALTER TYPE ADD VALUE inside a transaction.
--   PostgreSQL 14+ allows it, but Flyway wraps migrations in a transaction by
--   default. The flyway:executeInTransaction=false annotation above matches the
--   project convention established in V31 (same ALTER TYPE ADD VALUE pattern).
--   Each statement uses IF NOT EXISTS / IF EXISTS guards for idempotency except
--   where DDL semantics prevent it (RENAME COLUMN, DROP/ADD CONSTRAINT).

-- ============================================================
-- 1. Enum: add 'broker' to app_role
-- ============================================================
-- Cannot use IF NOT EXISTS on ADD VALUE in PG < 14, but this project targets
-- Supabase (PG 15+) so IF NOT EXISTS is supported.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'broker';

-- ============================================================
-- 2. Column rename: viewing_requests.dealer_id -> broker_id
-- ============================================================

-- Rename the column itself (idempotent: skip if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'viewing_requests' AND column_name = 'dealer_id'
  ) THEN
    ALTER TABLE viewing_requests RENAME COLUMN dealer_id TO broker_id;
  END IF;
END $$;

-- Drop the old index (exact name from V15)
DROP INDEX IF EXISTS idx_viewing_requests_dealer_id;

-- Recreate with the new column name, adding created_at for sort-order coverage
-- matching the backend's typical ORDER BY (status, created_at DESC) queries
CREATE INDEX IF NOT EXISTS idx_viewing_requests_broker_id
    ON public.viewing_requests (broker_id, status, created_at DESC);

-- Update the "Users can view own bookings" RLS policy which references dealer_id.
-- The policy body used `dealer_id = auth.uid()` — after the column rename the
-- existing policy SQL is stale in the pg_policies catalog. Drop and recreate it.
DROP POLICY IF EXISTS "Users can view own bookings" ON public.viewing_requests;

CREATE POLICY "Users can view own bookings"
    ON public.viewing_requests FOR SELECT
    TO authenticated
    USING (requester_id = auth.uid() OR broker_id = auth.uid());

-- ============================================================
-- 3. Data migration: seller_type 'dealer' -> 'broker'
-- ============================================================
-- All existing rows were stamped 'dealer' by the V33 DEFAULT.
-- Rename them to 'broker' so the new terminology is consistent.
-- The constraint update in step 4 must follow this update.
UPDATE public.property_listings
    SET seller_type = 'broker'
    WHERE seller_type = 'dealer';

-- ============================================================
-- 4. Extend chk_seller_type to include 'broker' (keep 'dealer' for expand phase)
-- ============================================================
-- Constraint name from V33: chk_seller_type
ALTER TABLE public.property_listings
    DROP CONSTRAINT IF EXISTS chk_seller_type;

ALTER TABLE public.property_listings
    ADD CONSTRAINT chk_seller_type
    CHECK (seller_type IN ('owner', 'dealer', 'broker', 'builder'));

-- ============================================================
-- 5. Data migration: cancelled_by 'dealer' -> 'broker' in viewing_requests
-- ============================================================
-- cancelled_by is a TEXT column (not an enum). Rows set to 'dealer' by prior
-- application code are updated to the new canonical value 'broker'.
UPDATE public.viewing_requests
    SET cancelled_by = 'broker'
    WHERE cancelled_by = 'dealer';

-- ============================================================
-- 6. RLS policy updates — add 'broker' role alongside 'dealer'
-- ============================================================
-- Strategy: DROP existing policy by exact name (from V34), then CREATE with the
-- same name but expanded OR condition. Policy names are unchanged so downstream
-- references and audit trails remain consistent.
--
-- Tables affected:
--   a. property_listings   (4 policies from V34)
--   b. listing_images      (3 policies from V34)
--
-- The viewing_requests policy was already updated in step 2 above.
-- The "Admins can manage all bookings" policy is unchanged.

-- ── a. property_listings ──────────────────────────────────────────────────────

-- SELECT: own listings in any status
DROP POLICY IF EXISTS "Dealers and owners can view own listings"
    ON public.property_listings;

CREATE POLICY "Dealers and owners can view own listings"
    ON public.property_listings FOR SELECT
    TO authenticated
    USING (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
    );

-- INSERT: create DRAFT listings
DROP POLICY IF EXISTS "Dealers and owners can create listings"
    ON public.property_listings;

CREATE POLICY "Dealers and owners can create listings"
    ON public.property_listings FOR INSERT
    TO authenticated
    WITH CHECK (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status = 'DRAFT'
    );

-- UPDATE: own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers and owners can update own draft or rejected listings"
    ON public.property_listings;

CREATE POLICY "Dealers and owners can update own draft or rejected listings"
    ON public.property_listings FOR UPDATE
    TO authenticated
    USING (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    )
    WITH CHECK (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- DELETE: own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings;

CREATE POLICY "Dealers and owners can delete own draft or rejected listings"
    ON public.property_listings FOR DELETE
    TO authenticated
    USING (
        (   public.has_role(auth.uid(), 'dealer')
         OR public.has_role(auth.uid(), 'broker')
         OR public.has_role(auth.uid(), 'user')
        )
        AND created_by = auth.uid()
        AND status IN ('DRAFT', 'REJECTED')
    );

-- ── b. listing_images ─────────────────────────────────────────────────────────

-- SELECT: images of visible listings (own listings + public listings)
DROP POLICY IF EXISTS "Authenticated users can view images of visible listings"
    ON public.listing_images;

CREATE POLICY "Authenticated users can view images of visible listings"
    ON public.listing_images FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND (
                pl.status = 'LIVE'
                OR (pl.status = 'SCRAPED' AND pl.is_valid = true)
                OR (
                    (   public.has_role(auth.uid(), 'dealer')
                     OR public.has_role(auth.uid(), 'broker')
                     OR public.has_role(auth.uid(), 'user')
                    )
                    AND pl.created_by = auth.uid()
                )
                OR public.is_admin(auth.uid())
            )
        )
    );

-- INSERT: upload images to own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers and owners can upload images to own listings"
    ON public.listing_images;

CREATE POLICY "Dealers and owners can upload images to own listings"
    ON public.listing_images FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (   public.has_role(auth.uid(), 'dealer')
                 OR public.has_role(auth.uid(), 'broker')
                 OR public.has_role(auth.uid(), 'user')
                )
        )
    );

-- DELETE: delete images from own DRAFT or REJECTED listings
DROP POLICY IF EXISTS "Dealers and owners can delete images from own listings"
    ON public.listing_images;

CREATE POLICY "Dealers and owners can delete images from own listings"
    ON public.listing_images FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_id
            AND pl.created_by = auth.uid()
            AND pl.status IN ('DRAFT', 'REJECTED')
            AND (   public.has_role(auth.uid(), 'dealer')
                 OR public.has_role(auth.uid(), 'broker')
                 OR public.has_role(auth.uid(), 'user')
                )
        )
    );
