-- beforeMigrate.sql — Supabase auth stubs for Testcontainers
--
-- V0.1 and V10 reference auth.users, auth.uid(), the 'authenticated' role,
-- and the 'supabase_realtime' publication. These objects only exist on
-- Supabase-managed Postgres instances.
--
-- This callback runs before every Flyway migration cycle and creates
-- minimal stubs so that all migrations can succeed on plain Postgres
-- (e.g., Testcontainers).
--
-- All statements use IF NOT EXISTS / OR REPLACE for idempotency.

-- 1. Auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- 2. Minimal auth.users table (columns referenced by FK constraints and triggers)
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. auth.uid() function (used in RLS policies)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$ SELECT NULL::UUID $$;

-- 4. 'authenticated' role (used in RLS policy TO clauses)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
END
$$;

-- 4a. 'anon' role (PostgREST role for unauthenticated browser requests; used in RLS
-- policy TO clauses and by V128's column-privilege REVOKE). Without this stub, a
-- role-existence-guarded REVOKE targeting `anon` silently no-ops on Testcontainers and
-- any test asserting anon's privileges would pass vacuously (#2280 false-green trap).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
END
$$;

-- 4b. 'service_role' role (Supabase's RLS-bypass role used by edge functions; referenced
-- defensively so any future migration or test that guards on its existence behaves the
-- same on Testcontainers as on a real Supabase instance).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
    END IF;
END
$$;

-- 5. supabase_realtime publication (referenced in V0.1)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;
