-- scripts/e2e/auth-stack/rls-probe-cleanup.sql - removes exactly the rows rls-probe-seed.sql created (disposable fixture only).
\set ON_ERROR_STOP on
DELETE FROM public.agricultural_import_candidate WHERE source_platform = 'probe';
DELETE FROM public.agricultural_import_batch WHERE source_platform = 'probe';
DELETE FROM public.commercial_import_candidate WHERE source_platform = 'probe';
DELETE FROM public.commercial_import_batch WHERE source_platform = 'probe';
DELETE FROM public.profiles WHERE email LIKE 'probe-%@e2e.test';
