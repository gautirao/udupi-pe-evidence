--
-- V48: authority_evidence table + RLS policies
--
-- RE-144: Introduce a per-listing authority evidence store.
-- Each row records one piece of evidence that a listing owner has submitted
-- to support the AUTHORITY verification dimension (e.g. an OTP from the
-- property owner, a mandate document, or a RERA registration number).
--
-- Table design:
--   - listing_id FK → property_listings ON DELETE CASCADE.
--     Soft-deleted (ARCHIVED) listings are not hard-deleted (V35), so the cascade
--     is a safety net only for administrative hard-deletes.
--   - evidence_type is constrained to the known proof types:
--       OWNER_OTP        — a one-time passcode delivered to the registered owner
--       MANDATE_DOCUMENT — a signed broker mandate document
--       RERA_NUMBER      — a RERA registration number for the property
--   - evidence_value is TEXT (free-text). Maximum 2000 characters is enforced
--     by the inline CHECK constraint (char_length <= 2000) and additionally at
--     the application layer as a defence-in-depth guard.
--   - review_state tracks the admin review lifecycle: PENDING → APPROVED | REJECTED | EXPIRED.
--     review_state is set to 'PENDING' by the client on INSERT and transitioned
--     by the backend service only (service_role bypasses RLS).
--   - verified_at / verified_by are nullable; set by the backend when an admin
--     approves a piece of evidence. Clients never write these columns.
--   - created_at / updated_at are set by the DB (DEFAULT now()). updated_at is
--     maintained by the application layer on every write (no trigger needed).
--
-- RLS strategy:
--   - The Spring Boot backend writes UPDATE and DELETE operations via the
--     service_role key, which bypasses RLS entirely.
--     No UPDATE or DELETE policies are created for client roles — their absence
--     enforces least-privilege. This is intentional, not an oversight.
--   - Admin role: full access via FOR ALL (covers all operations, including direct
--     admin-tooling reads and manual overrides).
--   - Listing owners (dealer / broker / user): INSERT and SELECT their own evidence
--     only (ownership established via join to property_listings.created_by).
--   - A plain authenticated user with none of the above roles, and all anon
--     requests, see and can insert zero rows.
--

-- ============================================================
-- 1. Create authority_evidence
-- ============================================================

CREATE TABLE IF NOT EXISTS public.authority_evidence (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    listing_id      UUID        NOT NULL,
    evidence_type   VARCHAR(30) NOT NULL,
    evidence_value  TEXT CHECK (evidence_value IS NULL OR char_length(evidence_value) <= 2000),
    verified_at     TIMESTAMPTZ,
    verified_by     UUID,
    review_state    VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT authority_evidence_pkey
        PRIMARY KEY (id),
    CONSTRAINT fk_ae_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.property_listings(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_ae_evidence_type
        CHECK (evidence_type IN ('OWNER_OTP', 'MANDATE_DOCUMENT', 'RERA_NUMBER')),
    CONSTRAINT chk_ae_review_state
        CHECK (review_state IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'))
);

-- FK index: PostgreSQL does not auto-index foreign keys.
-- Queries joining from property_listings to its evidence rows will use this index.
CREATE INDEX IF NOT EXISTS idx_ae_listing_id
    ON public.authority_evidence(listing_id);

-- ============================================================
-- 2. RLS on authority_evidence
-- ============================================================

ALTER TABLE public.authority_evidence ENABLE ROW LEVEL SECURITY;

-- Policy 1 — Admin: full access to all rows.
-- Admins may read or write evidence rows directly (e.g. admin tooling, manual overrides).
-- Note: UPDATE / DELETE for non-admin roles are intentionally omitted.
-- The backend service_role key bypasses RLS entirely and is the sole writer for
-- review_state transitions, verified_at, and verified_by. Omitting write policies
-- for client roles is the correct least-privilege choice here — not an oversight.
CREATE POLICY "Admins can manage all authority evidence"
    ON public.authority_evidence FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- Policy 2 — Owner INSERT: listing owner can submit evidence for their own listing.
-- The ownership predicate (pl.created_by = auth.uid()) is the binding constraint.
-- The role check (dealer / broker / user) is retained for defence-in-depth and
-- consistency with the V43/V47 pattern — a plain authenticated user with none of
-- these roles cannot insert rows even if they own a listing_id column value.
--
-- NOTE on 'user' role: Every new authenticated user is assigned 'user' by the
-- handle_new_user() trigger (V0.1). The role check alone does NOT gate access;
-- the ownership predicate is the binding guard.
--
-- Security guards on the new row:
--   review_state = 'PENDING'   — clients cannot self-approve by supplying 'APPROVED'
--   verified_at IS NULL         — clients cannot pre-populate the admin-only audit timestamp
--   verified_by IS NULL         — clients cannot pre-populate the admin-only verifier ID
CREATE POLICY "Owners can submit authority evidence for their own listings"
    ON public.authority_evidence FOR INSERT
    TO authenticated
    WITH CHECK (
        authority_evidence.review_state = 'PENDING'
        AND authority_evidence.verified_at IS NULL
        AND authority_evidence.verified_by IS NULL
        AND EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = authority_evidence.listing_id
              AND pl.created_by = auth.uid()
              AND (   public.has_role(auth.uid(), 'dealer')
                   OR public.has_role(auth.uid(), 'broker')
                   OR public.has_role(auth.uid(), 'user')
              )
        )
    );

-- Policy 3 — Owner SELECT: listing owner can read evidence rows for their own listing.
-- Mirrors the owner-read pattern from V43 (listing_status_history) and V47
-- (listing_verification_dimension). Any status listing is included so that owners
-- can see submitted evidence on DRAFT / PENDING / REJECTED listings.
CREATE POLICY "Owners can view their own authority evidence"
    ON public.authority_evidence FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = authority_evidence.listing_id
              AND pl.created_by = auth.uid()
              AND (   public.has_role(auth.uid(), 'dealer')
                   OR public.has_role(auth.uid(), 'broker')
                   OR public.has_role(auth.uid(), 'user')
              )
        )
    );
