-- V46: Add trust_tier and ranking_score to property_listings
-- Part of RE-142 / Phase 3.1 — Trust Schema foundation.
--
-- trust_tier: single char (A/B/C/D) representing the computed trust level.
--   Default 'D' — the lowest tier, applied to all existing and new rows until
--   TrustTierCalculator explicitly upgrades them.
--
-- ranking_score: integer score for search result ordering. Default 0.
--   Computation deferred to a later sprint (RE-148 / TrustTierCalculator).

ALTER TABLE public.property_listings
  ADD COLUMN IF NOT EXISTS trust_tier VARCHAR(1) NOT NULL DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS ranking_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.property_listings
  ADD CONSTRAINT chk_trust_tier CHECK (trust_tier IN ('A', 'B', 'C', 'D'));
