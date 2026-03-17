-- flyway:executeInTransaction=false
--
-- V41: Add 'broker' as a valid value to app_role enum.
-- Must run in a separate non-transactional migration from the schema changes
-- that USE 'broker', because PostgreSQL plan cache does not refresh mid-script.
-- All schema changes that reference 'broker' are in V42.
--

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'broker';
