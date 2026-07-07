-- V107: Create saved_listings table (#1566 — persist saved homes)
--
-- NOTE: the approved plan specified V100 as the next free version at the time it was
-- written. By the time this executed, main had already advanced through V100 (add_area_slug)
-- .. V106 (seed_bangalore_macro_region_mapping) — confirmed via `ls db/migration`, no V107
-- present. Renumbered to V107, the actual next free slot; table/column design is unchanged.
--
-- Lets an authenticated user "save" a property listing for later (heart/bookmark).
-- Additive-only, expand-only migration — no changes to any existing table.
--
-- user_id is a SOFT reference to Supabase auth.users: no FK constraint, matching the
-- existing convention on public.user_saved_areas (V9) and public.notifications (V9).
-- The Spring Boot backend and Supabase auth are different systems/pools here, and a
-- cross-system FK would require a foreign data wrapper or duplicated user table —
-- consistent with how every other per-user table in this schema (notifications,
-- user_saved_areas) treats user_id as an opaque UUID validated only by the JWT subject.
--
-- listing_id IS a HARD FK to property_listings(id) ON DELETE CASCADE: when a listing
-- row is deleted outright (not just archived/soft-deleted), its saved-listing rows
-- have no reason to survive, and CASCADE keeps this from becoming an orphaned-row
-- cleanup chore. (Soft-deleted/archived listings are NOT deleted rows — they remain
-- in property_listings with archived_at set — so a user's saved listing continues to
-- reference a valid row even after archival; the API layer badges it accordingly.)
CREATE TABLE IF NOT EXISTS public.saved_listings (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    listing_id   UUID        NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_saved_listings PRIMARY KEY (id),
    CONSTRAINT uq_saved_listings_user_listing UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_listings_user_id ON public.saved_listings (user_id);
