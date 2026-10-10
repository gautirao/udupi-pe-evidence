-- scripts/e2e/auth-stack/privacy-snapshot.sql - issue #2750 FC-27c before/after probe (read-only).
-- Run against the Flyway-only REFERENCE database and against the OVERLAY database; the two outputs must be byte-identical
-- for sections A, B, C and E. Section D (informational) is excluded from the equality because staging-table TABLE grants
-- legitimately differ (the overlay adds the platform's GRANT ALL; RLS is what protects those tables - section E).
\pset format unaligned
\pset tuples_only on
\pset footer off
\echo == A. has_column_privilege(role, property_listings, column, priv) for the V128-revoked columns
SELECT r || '.' || c || '.' || p || '=' || has_column_privilege(r, 'public.property_listings', c, p)
FROM unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['contact_phone','contact_info']) c,
     unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p ORDER BY 1;
\echo == B. information_schema.column_privileges rows on the revoked columns (anon, authenticated, PUBLIC)
SELECT count(*) FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'property_listings' AND column_name IN ('contact_phone','contact_info')
   AND grantee IN ('anon','authenticated','PUBLIC');
SELECT grantee || '.' || column_name || '.' || privilege_type FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND table_name = 'property_listings' AND column_name IN ('contact_phone','contact_info')
   AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY 1;
\echo == C. whole property_listings column surface per role/privilege (count + md5 of the granted column list)
SELECT r || '.' || p || ' cols=' || count(*) FILTER (WHERE has_column_privilege(r, 'public.property_listings', a.attname, p))
       || ' md5=' || md5(coalesce(string_agg(a.attname, ',' ORDER BY a.attname)
                                   FILTER (WHERE has_column_privilege(r, 'public.property_listings', a.attname, p)), ''))
FROM pg_attribute a, unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['SELECT','INSERT','UPDATE']) p
WHERE a.attrelid = 'public.property_listings'::regclass AND a.attnum > 0 AND NOT a.attisdropped
GROUP BY r, p ORDER BY r, p;
SELECT 'property_listings.total_columns=' || count(*) FROM pg_attribute
 WHERE attrelid = 'public.property_listings'::regclass AND attnum > 0 AND NOT attisdropped;
SELECT r || ' table-level ' || p || '=' || has_table_privilege(r, 'public.property_listings', p)
FROM unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['SELECT','INSERT','UPDATE']) p ORDER BY 1;
\echo == E. RLS state of the V141/V143/V146 protected tables
SELECT c.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity || ' policies=' ||
       coalesce((SELECT string_agg(polname, '|' ORDER BY polname) FROM pg_policy WHERE polrelid = c.oid), '-')
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN
  ('agricultural_import_batch','agricultural_import_candidate','commercial_import_batch','commercial_import_candidate','property_requests')
ORDER BY c.relname;
\echo == D. (informational, not part of the equality) table-level SELECT on the staging tables
SELECT r || ' ' || t || '=' || has_table_privilege(r, 'public.' || t, 'SELECT')
FROM unnest(ARRAY['anon','authenticated']) r,
     unnest(ARRAY['agricultural_import_batch','agricultural_import_candidate','commercial_import_batch','commercial_import_candidate']) t ORDER BY 1;
