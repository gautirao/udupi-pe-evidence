--
-- V43: listing_status_history table + lifecycle columns on property_listings
--
-- RE-117: Introduce a full audit trail for every listing status transition,
-- plus new lifecycle tracking columns so the service layer can stamp the
-- exact actor and timestamp for each state change.
--
-- Changes:
--   1. Create public.listing_status_history (audit table, FK → property_listings ON DELETE RESTRICT)
--   2. Enable RLS on listing_status_history (admin full access; broker/dealer/user read-own)
--   3. ADD COLUMN on property_listings — new lifecycle fields only; no existing columns touched
--
-- Columns deliberately NOT added (already exist):
--   first_published_at, last_live_at  — added in V38
--   archived_at                        — added in V35
--   submitted_at, rejection_reason,
--   reviewed_at, reviewed_by           — added in V8
--
-- RLS strategy:
--   - Backend service uses service_role which bypasses RLS for INSERT/UPDATE/DELETE
--   - Admin read+write via is_admin() FOR ALL policy
--   - Broker/dealer/owner SELECT via EXISTS join to property_listings (role + ownership check)
--   - No public SELECT — a plain authenticated user with no matching listing cannot read any row
--

-- ============================================================
-- 1. Create listing_status_history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_status_history (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid(),
    listing_id               UUID        NOT NULL,
    from_status              public.listing_status,          -- NULL on first insert (initial state)
    to_status                public.listing_status NOT NULL,
    actor_type               VARCHAR(20) NOT NULL,
    actor_id                 UUID,                           -- NULL when actor_type = 'SYSTEM'
    reason_code              VARCHAR(100),
    note                     TEXT,
    actioned_submission_count INTEGER,                       -- nullable; tracks submission count at time of action
    occurred_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT listing_status_history_pkey
        PRIMARY KEY (id),
    CONSTRAINT fk_lsh_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.property_listings(id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_lsh_actor_type
        CHECK (actor_type IN ('ADMIN', 'SYSTEM', 'BROKER'))
);

-- Audit-log index: fetch all history for a listing ordered by time (most recent first)
CREATE INDEX IF NOT EXISTS idx_lsh_listing_occurred
    ON public.listing_status_history (listing_id, occurred_at DESC);

-- ============================================================
-- 2. RLS on listing_status_history
-- ============================================================

ALTER TABLE public.listing_status_history ENABLE ROW LEVEL SECURITY;

-- Admin: full access to all rows
CREATE POLICY "Admins can manage all listing status history"
    ON public.listing_status_history FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- Broker / dealer / owner: SELECT own listing history only.
-- Uses expanded role check (all three roles) so that a plain authenticated user
-- with none of these roles gets zero rows even if they somehow know a listing_id.
CREATE POLICY "Brokers and owners can view own listing status history"
    ON public.listing_status_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_listings pl
            WHERE pl.id = listing_status_history.listing_id
              AND pl.created_by = auth.uid()
              AND (   public.has_role(auth.uid(), 'dealer')
                   OR public.has_role(auth.uid(), 'broker')
                   OR public.has_role(auth.uid(), 'user')
              )
        )
    );

-- ============================================================
-- 3. New lifecycle columns on property_listings (expand-only)
-- ============================================================
-- All nullable (or with a safe DEFAULT) so existing rows are unaffected.
-- IF NOT EXISTS guards every clause for idempotency.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS status_changed_at              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status_changed_by_actor_type   VARCHAR(20),
    ADD COLUMN IF NOT EXISTS status_changed_by_actor_id     UUID,
    ADD COLUMN IF NOT EXISTS status_reason_code             VARCHAR(100),
    ADD COLUMN IF NOT EXISTS status_reason_note             TEXT,
    ADD COLUMN IF NOT EXISTS approved_at                    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_at                    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submission_count               INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS review_submitted_at            TIMESTAMPTZ;
