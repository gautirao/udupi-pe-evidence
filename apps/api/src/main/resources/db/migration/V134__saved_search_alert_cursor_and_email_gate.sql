-- #2019 Slice B (review must-haves on 008f0d86):
--
-- 1. Lexicographic delivery cursor. The matcher pages by (eligibility timestamp, listing id)
--    with a per-run cap; a timestamp-only watermark would permanently skip listings that share
--    the boundary timestamp once a page fills. alert_watermark_listing_id is the id half of
--    the (alert_watermark, alert_watermark_listing_id) cursor; NULL means "no id component"
--    (first run / after a Slice A edit reset), which the matcher treats as the zero UUID.
--
-- 2. Email consent gate. No user-level email preference exists in this app; the existing
--    precedent is the per-subscription opt-out flag user_saved_areas.alerts_enabled (V20,
--    default true). Mirrored per saved search: email_alerts_enabled = false stops EMAIL only
--    (in-app notification + delivery bookkeeping continue), and is the owner-scoped
--    "unsubscribe" that alert emails link to.
--
-- Expand-only; never modify an existing migration.

ALTER TABLE public.saved_searches
    ADD COLUMN IF NOT EXISTS alert_watermark_listing_id UUID;

ALTER TABLE public.saved_searches
    ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.saved_search_alert_batches
    ADD COLUMN IF NOT EXISTS watermark_to_listing_id UUID;
