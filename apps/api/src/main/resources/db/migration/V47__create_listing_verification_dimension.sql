--
-- V47: listing_verification_dimension table + RLS policies
--
-- RE-143: Introduce a per-listing, per-dimension trust badge store.
-- Each row records the current badge state for one verification dimension
-- (e.g. IDENTITY, LOCATION, PHOTOS) on one listing.
--
-- Table design:
--   - (listing_id, dimension_type) is the natural key — enforced by UNIQUE constraint.
--   - badge_state tracks the badge lifecycle: AVAILABLE → PENDING → EARNED → EXPIRED/SUSPENDED.
--   - granted_at / expires_at / suspended_at are nullable lifecycle timestamps set by the
--     backend TrustTierCalculator and badge-grant service; they are never set by clients.
--   - created_at / updated_at are set by the DB (DEFAULT now()); updated_at is maintained
--     by the application layer on every write (no trigger needed for this table).
--   - ON DELETE CASCADE on the FK: if a listing is hard-deleted its dimension rows go with it.
--     Soft-deleted (ARCHIVED) listings are not hard-deleted (V35), so cascade is a safety net
--     only for administrative hard-deletes.
--
-- RLS strategy:
--   - The Spring Boot backend writes all rows via the service_role key, which bypasses RLS
--     entirely. No INSERT / UPDATE / DELETE policies are created for client roles — they are
--     not needed and their absence enforces least-privilege.
--   - Admin role: full access via FOR ALL (read + write via admin-UI tooling if needed).
--   - Public / other authenticated users: SELECT dimensions only for LIVE or valid SCRAPED
--     listings (mirrors the public-read pattern on listing_images — V34 lines 70-85).
--   - Listing owners (dealer / broker / user roles): SELECT dimensions for their own listings
--     regardless of status (mirrors listing_status_history owner-read pattern — V43 lines 70-83).
--   - Plain authenticated users with none of the above roles, and all anon requests, see zero rows.
--

-- ============================================================
-- 1. Create listing_verification_dimension
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_verification_dimension (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    listing_id      UUID        NOT NULL,
    dimension_type  VARCHAR(20) NOT NULL,
    badge_state     VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    granted_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    suspended_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT listing_verification_dimension_pkey
        PRIMARY KEY (id),
    CONSTRAINT fk_lvd_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.property_listings(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_lvd_listing_dimension
        UNIQUE (listing_id, dimension_type),
    CONSTRAINT chk_lvd_dimension_type
        CHECK (dimension_type IN ('IDENTITY', 'LOCATION', 'PHOTOS', 'AUTHORITY', 'DOCUMENTS', 'FIELD')),
    CONSTRAINT chk_lvd_badge_state
        CHECK (badge_state IN ('AVAILABLE', 'PENDING', 'EARNED', 'EXPIRED', 'SUSPENDED'))
);

-- FK index: PostgreSQL does not auto-index foreign keys.
-- Queries joining from property_listings to its dimensions will use this index.
CREATE INDEX IF NOT EXISTS idx_lvd_listing_id
    ON public.listing_verification_dimension(listing_id);

-- ============================================================
-- 2. RLS on listing_verification_dimension
-- ============================================================

ALTER TABLE public.listing_verification_dimension ENABLE ROW LEVEL SECURITY;

-- Policy 1 — Admin: full access to all rows.
-- Admins may read or write dimension rows directly (e.g. admin tooling, manual overrides).
-- Note: INSERT / UPDATE / DELETE for non-admin roles are intentionally omitted.
-- The backend service_role key bypasses RLS entirely and is the sole writer for normal
-- badge operations. Omitting write policies for client roles is the correct least-privilege
-- choice here — it is not an oversight.
CREATE POLICY "Admins can manage all listing verification dimensions"
    ON public.listing_verification_dimension FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- Policy 2 — Public SELECT for LIVE / valid SCRAPED listing dimensions.
-- Any authenticated user (including plain users with no special role) may see dimension
-- badges for publicly visible listings. Mirrors the public-read pattern from V34.
CREATE POLICY "Authenticated users can view dimensions of visible listings"
    ON public.listing_verification_dimension FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_verification_dimension.listing_id
              AND (pl.status = 'LIVE'
                   OR (pl.status = 'SCRAPED' AND pl.is_valid = true))
        )
    );

-- Policy 3 — Owner SELECT for own listing dimensions (any status).
-- A broker / dealer / user can read dimension badges for their own listings regardless
-- of listing status (so they can see badge progress on DRAFT/PENDING/REJECTED listings).
-- Mirrors the owner-read pattern from V43.
--
-- NOTE on 'user' role: Every new authenticated user is assigned 'user' by the
-- handle_new_user() trigger (V0.1). This means the role check on its own does NOT
-- gate access. The binding constraint is the ownership predicate pl.created_by = auth.uid().
-- The role check is retained for consistency with the V43 pattern and as a defence-in-depth
-- guard against hypothetical future schema paths where a row might exist without an owner.
CREATE POLICY "Brokers and owners can view own listing verification dimensions"
    ON public.listing_verification_dimension FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_verification_dimension.listing_id
              AND pl.created_by = auth.uid()
              AND (   public.has_role(auth.uid(), 'dealer')
                   OR public.has_role(auth.uid(), 'broker')
                   OR public.has_role(auth.uid(), 'user')
              )
        )
    );
