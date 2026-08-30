--
-- V49: listing_complaint table + RLS policies
--
-- RE-145: Introduce a per-listing complaint store.
-- Any authenticated user (excluding the listing owner) can file one complaint
-- per listing. The admin team then reviews and transitions complaints through
-- a defined status lifecycle.
--
-- Table design:
--   - listing_id FK → property_listings ON DELETE CASCADE.
--     Soft-deleted (ARCHIVED) listings are not hard-deleted (V35), so the cascade
--     is a safety net only for administrative hard-deletes.
--   - complainant_id FK → auth.users ON DELETE CASCADE.
--     Identifies the filer; bound to auth.uid() at INSERT time by the RLS policy
--     so users cannot impersonate another complainant.
--   - UNIQUE (listing_id, complainant_id) enforces one complaint per user per listing
--     at the DB level, providing a hard idempotency guarantee independent of the
--     application layer.
--   - complaint_type is constrained to the known complaint categories:
--       FAKE_LISTING  — the listing does not represent a real property
--       WRONG_PRICE   — the stated price is materially incorrect
--       UNAVAILABLE   — the property is no longer available for sale/rent
--       OTHER         — catch-all for complaints that do not fit the above
--   - description is optional free-text additional context provided by the filer.
--   - status tracks the admin review lifecycle: OPEN → UNDER_REVIEW → RESOLVED | DISMISSED.
--     The status is always 'OPEN' on INSERT (enforced by the INSERT RLS policy WITH CHECK).
--     Transitions are performed by the Spring Boot backend via service_role only.
--   - resolved_at / resolved_by are nullable; set by the backend when an admin
--     resolves or dismisses a complaint. Clients never write these columns.
--     The INSERT policy guards against client pre-population (same pattern as V48's
--     verified_at / verified_by).
--   - created_at / updated_at are set by the DB (DEFAULT now()). updated_at is
--     maintained by the application layer on every write (no trigger needed).
--
-- Business rule — owner cannot complain about their own listing:
--   A simple CHECK constraint cannot JOIN to another table, so this rule is enforced
--   at two layers for defence-in-depth:
--     1. Application layer (Spring Boot service): validates before persisting.
--     2. RLS INSERT policy WITH CHECK: the EXISTS sub-query confirms
--        property_listings.created_by != auth.uid() for the target listing.
--   There is no DB-level CHECK constraint for this rule — that is intentional.
--
-- RLS strategy:
--   - The Spring Boot backend writes UPDATE and DELETE operations via the
--     service_role key, which bypasses RLS entirely.
--     No UPDATE or DELETE policies are created for client roles — their absence
--     enforces least-privilege. This is intentional, not an oversight.
--   - Admin role: full access via FOR ALL (covers all operations, including direct
--     admin-tooling reads and manual overrides).
--   - Authenticated non-owner users: INSERT their own complaint and SELECT their own
--     submissions only. Ownership is bound to auth.uid() in both cases.
--   - A listing owner, anon users, and the 'service_role' (bypasses RLS) each
--     follow the expected patterns: owner blocked by the EXISTS guard in INSERT,
--     anon sees/inserts zero rows, service_role is unrestricted.
--

-- ============================================================
-- 1. Create listing_complaint
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_complaint (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    listing_id       UUID        NOT NULL,
    complainant_id   UUID        NOT NULL,
    complaint_type   VARCHAR(30) NOT NULL,
    description      TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
    status           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    resolved_at      TIMESTAMPTZ,
    resolved_by      UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT listing_complaint_pkey
        PRIMARY KEY (id),
    CONSTRAINT fk_lc_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.property_listings(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_lc_complainant
        FOREIGN KEY (complainant_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_lc_listing_complainant
        UNIQUE (listing_id, complainant_id),
    CONSTRAINT chk_lc_complaint_type
        CHECK (complaint_type IN ('FAKE_LISTING', 'WRONG_PRICE', 'UNAVAILABLE', 'OTHER')),
    CONSTRAINT chk_lc_status
        CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'))
);

-- FK indexes: PostgreSQL does not auto-index foreign keys.
-- idx_lc_listing_id: queries joining from property_listings to its complaints will use this index.
-- idx_lc_complainant_id: queries scoped to a complainant (e.g. "my complaints") will use this index.
CREATE INDEX IF NOT EXISTS idx_lc_listing_id
    ON public.listing_complaint(listing_id);

CREATE INDEX IF NOT EXISTS idx_lc_complainant_id
    ON public.listing_complaint(complainant_id);

-- ============================================================
-- 2. RLS on listing_complaint
-- ============================================================

ALTER TABLE public.listing_complaint ENABLE ROW LEVEL SECURITY;

-- Policy 1 — Admin: full access to all rows.
-- Admins may read or write complaint rows directly (e.g. admin tooling, manual overrides,
-- bulk resolution). is_admin() wraps the user_roles EXISTS check so future role changes
-- only need to be made in one place.
-- Note: UPDATE / DELETE for non-admin roles are intentionally omitted.
-- The backend service_role key bypasses RLS entirely and is the sole writer for
-- status transitions, resolved_at, and resolved_by. Omitting write policies
-- for client roles is the correct least-privilege choice here — not an oversight.
CREATE POLICY "Admins can manage all listing complaints"
    ON public.listing_complaint FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- Policy 2 — Authenticated INSERT: any authenticated non-owner user may file one complaint.
--
-- WITH CHECK guards:
--   complainant_id = auth.uid()
--     — users can only file as themselves; no impersonation of another user's identity.
--   status = 'OPEN'
--     — prevents a client from supplying a non-OPEN status on the initial insert
--       (e.g. self-resolving by inserting with status = 'RESOLVED').
--   resolved_at IS NULL
--     — prevents pre-population of the admin-only resolution timestamp.
--   resolved_by IS NULL
--     — prevents pre-population of the admin-only resolver identity.
--   EXISTS (pl.created_by != auth.uid())
--     — listing owners cannot file a complaint against their own listing.
--       This is the DB-layer enforcement of the owner-cannot-complain business rule.
--       The application layer enforces the same rule before reaching the DB.
--
-- No role check is added here: every authenticated user is assigned the 'user' role
-- by the handle_new_user() trigger (V0.1), so a role filter would be redundant.
-- The complainant_id = auth.uid() bind is the binding identity guard.
CREATE POLICY "Authenticated users can file a complaint against a listing they do not own"
    ON public.listing_complaint FOR INSERT
    TO authenticated
    WITH CHECK (
        listing_complaint.complainant_id = auth.uid()
        AND listing_complaint.status = 'OPEN'
        AND listing_complaint.resolved_at IS NULL
        AND listing_complaint.resolved_by IS NULL
        AND EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_complaint.listing_id
              AND pl.created_by != auth.uid()
        )
    );

-- Policy 3 — Complainant SELECT: authenticated users can read their own submissions.
-- The complainant_id = auth.uid() check is the sole predicate — no role check is
-- needed because any authenticated user can be a complainant, and the identity bind
-- is sufficient to scope the result set to the caller's own rows only.
-- Admins see all rows via Policy 1; this policy adds no overlap for admins because
-- Postgres evaluates policies with OR — the more permissive admin policy already covers them.
CREATE POLICY "Complainants can view their own complaints"
    ON public.listing_complaint FOR SELECT
    TO authenticated
    USING (listing_complaint.complainant_id = auth.uid());
