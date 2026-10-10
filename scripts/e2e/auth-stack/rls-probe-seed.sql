-- scripts/e2e/auth-stack/rls-probe-seed.sql - POSITIVE CONTROLS for rls-probe.mjs (disposable fixture only).
-- The gate removes every row this file creates with rls-probe-cleanup.sql right after the probe, so the canonical
-- suite runs against the same data it would have without the probe.
-- Without rows in these tables, "non-admin sees zero rows" would pass vacuously. Run as the fixture superuser.
\set ON_ERROR_STOP on
INSERT INTO public.profiles (user_id, email)
  SELECT user_id, 'probe-' || left(user_id::text, 8) || '@e2e.test' FROM public.user_roles
  ON CONFLICT DO NOTHING;
INSERT INTO public.agricultural_import_batch (import_issue, source_platform, city) VALUES (2750, 'probe', 'probe');
INSERT INTO public.agricultural_import_candidate (batch_id, source_platform, source_listing_id, outcome)
  SELECT id, 'probe', 'probe-1', 'STAGED' FROM public.agricultural_import_batch WHERE source_platform = 'probe';
INSERT INTO public.commercial_import_batch (import_issue, source_platform, city) VALUES (2750, 'probe', 'probe');
INSERT INTO public.commercial_import_candidate (batch_id, source_platform, source_listing_id, outcome)
  SELECT id, 'probe', 'probe-1', 'STAGED' FROM public.commercial_import_batch WHERE source_platform = 'probe';
