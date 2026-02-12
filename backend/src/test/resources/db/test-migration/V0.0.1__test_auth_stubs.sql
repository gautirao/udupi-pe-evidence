-- V0.0.1: Test-only stubs for Supabase-specific constructs.
-- Runs between V0 (schema) and V0.1 (auth/RLS) in Flyway ordering.
-- Provides: auth schema, auth.users table, auth.uid() function,
--           'authenticated' role, supabase_realtime publication.
--
-- NEVER deploy this migration to production. It exists only in
-- src/test/resources/db/test-migration/ for Testcontainers tests.

-- 1. Auth schema + minimal users table
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. auth.uid() function — returns a UUID from session setting.
--    Tests can set it via: SET LOCAL app.current_user_id = '<uuid>';
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID
$$;

-- 3. 'authenticated' role (used in RLS policies: TO authenticated)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END
$$;

-- 4. supabase_realtime publication (V0.1 adds tables to it)
CREATE PUBLICATION supabase_realtime;
