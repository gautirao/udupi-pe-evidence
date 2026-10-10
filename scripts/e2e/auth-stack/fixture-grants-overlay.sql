-- scripts/e2e/auth-stack/fixture-grants-overlay.sql - issue #2750 (local canonical auth stack)
--
-- TEST-FIXTURE ONLY. Applied by the gate to the disposable local PostGIS fixture AFTER scripts/db/restore-test-fixture.sh
-- and BEFORE PostgREST starts. It is never a Flyway migration and never touches a hosted/shared database.
--
-- WHY. The restored fixture has the three platform roles as bare NOLOGIN stubs and an auth.uid() that returns NULL
-- (restore-test-fixture.sh:236-261). Table grants on real Supabase come from the platform bootstrap
-- (`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role`), which Flyway never sees. A local
-- PostgREST needs (1) the `authenticator` login role, (2) an auth.uid() that reads the verified JWT claims, and
-- (3) that bootstrap-equivalent grant set.
--
-- PRIVACY (FC-27c, HARD RULE). Step 3 is exactly the step V128 documents as the privacy hazard: a table-wide GRANT ALL
-- re-opens property_listings.contact_phone / contact_info. So the overlay RE-APPLIES the V128 REVOKE + column allow-list
-- AFTER the blanket grant, by running the real V128 migration file verbatim (no copied column list -> no drift), then
-- asserts - and fails the whole fixture build if it is wrong - that anon/authenticated hold no SELECT/INSERT/UPDATE on the
-- contact columns. V141 (agricultural_import_*), V143 (commercial_import_*) and V146 (property_requests) contain NO
-- REVOKE: they are protected by ENABLE ROW LEVEL SECURITY + admin-only policies, which survive a GRANT ALL; step 5 asserts
-- RLS is still enabled on each of those tables.
--
-- Psql variable (required): authenticator_password   e.g.  psql -v authenticator_password="$PW" -f this-file

\set ON_ERROR_STOP on

-- 1. Roles ------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
END
$$;
ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD :'authenticator_password';
GRANT anon, authenticated, service_role TO authenticator;

-- 2. auth.uid() / auth.role() / auth.jwt() read the claims PostgREST sets per request ---------------------------------
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- 3. Supabase-bootstrap-equivalent grants (the hazard) ---------------------------------------------------------------
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
-- DML only, NOT `GRANT ALL`: PostgREST needs SELECT/INSERT/UPDATE/DELETE and nothing else. The first spike run used GRANT ALL
-- and FC-27c's before/after diff caught REFERENCES (also TRIGGER/TRUNCATE) landing on the V128-revoked columns, which V128
-- never revokes (it touches SELECT/INSERT/UPDATE only). Granting the narrower set keeps the overlay EXACTLY equal to the
-- Flyway-only reference on those columns; it is strictly narrower than the hosted bootstrap, never wider.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.jwt() TO anon, authenticated, service_role;

-- 4. Re-apply V128 AFTER the grant: explicit contact-column revokes, then the real migration verbatim ---------------
REVOKE SELECT (contact_phone, contact_info), INSERT (contact_phone, contact_info), UPDATE (contact_phone, contact_info)
  ON public.property_listings FROM anon, authenticated;
\ir ../../../apps/api/src/main/resources/db/migration/V128__revoke_browser_contact_column_grants.sql

-- 5. Fail closed: the overlay must not leave contact PII reachable, nor staging tables without RLS ------------------
DO $$
DECLARE r text; c text; p text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH c IN ARRAY ARRAY['contact_phone', 'contact_info'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
        IF has_column_privilege(r, 'public.property_listings', c, p) THEN
          RAISE EXCEPTION 'FC-27c overlay privacy regression: % holds % on property_listings.%', r, p, c;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['agricultural_import_batch', 'agricultural_import_candidate',
                           'commercial_import_batch', 'commercial_import_candidate', 'property_requests'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || t)) THEN
      RAISE EXCEPTION 'FC-27c overlay privacy regression: RLS is not enabled on public.%', t;
    END IF;
  END LOOP;
END
$$;
