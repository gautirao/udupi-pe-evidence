-- V50: Add trust-related columns to public.profiles
-- Part of RE-146 / Phase 3.1 — Trust Schema foundation.
--
-- phone_verified: flag set by the backend once OTP verification completes.
--   Default false — all existing and new profiles start unverified.
--
-- org_name: optional brokerage or organisation name supplied by the broker.
--   Nullable — private sellers and unregistered brokers may omit this.
--
-- rera_broker_id: optional RERA registration number for the broker.
--   Nullable — only registered brokers will supply this.
--
-- reputation_score: integer score derived from review and trust signals.
--   Default 0 — computation deferred to a later sprint (RE-148 / TrustTierCalculator).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified  BOOLEAN      NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_name        VARCHAR(200);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rera_broker_id  VARCHAR(100);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reputation_score INTEGER     NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_reputation_score_non_negative
      CHECK (reputation_score >= 0);
