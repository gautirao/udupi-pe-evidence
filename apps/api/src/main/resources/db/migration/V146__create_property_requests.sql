-- V146: property_requests (#1793, PR-B).
--
-- A buyer's "request this property" submission, captured from the public discover
-- zero-result recovery card. Written by the Spring Boot backend only (POST
-- /api/public/property-requests); read by admins only (GET /api/admin/property-requests).
--
-- PII: phone_enc holds the buyer's phone encrypted by PhoneEncryptionConverter
-- (AES-256-GCM, "ENC:" prefix). phone_hash is a KEYED HMAC-SHA256 of the normalised
-- digits (never an unkeyed hash) used only for per-phone rate limiting.
--
-- No user FK: the submitter is an anonymous visitor.

CREATE TABLE IF NOT EXISTS public.property_requests (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    city            text        NOT NULL,
    area_key        text,
    area_label      text,
    journey         text        NOT NULL CHECK (journey IN ('AREA', 'SCHOOL', 'MAP')),
    intent          text        NOT NULL CHECK (intent IN ('BUY', 'RENT')),
    requirement     text        CHECK (requirement IS NULL OR char_length(requirement) <= 500),
    budget_min      bigint      CHECK (budget_min IS NULL OR budget_min >= 0),
    budget_max      bigint      CHECK (budget_max IS NULL OR budget_max >= 0),
    phone_enc       text        NOT NULL,
    phone_hash      text        NOT NULL,
    contact_via     text        NOT NULL CHECK (contact_via IN ('PHONE', 'WHATSAPP')),
    consent_version text        NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 32),
    consented_at    timestamptz NOT NULL,
    status          text        NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    retain_until    timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
    CONSTRAINT chk_property_requests_budget_range
        CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_max >= budget_min)
);

CREATE INDEX IF NOT EXISTS idx_property_requests_phone_hash
    ON public.property_requests (phone_hash);

CREATE INDEX IF NOT EXISTS idx_property_requests_created_at
    ON public.property_requests (created_at DESC);

COMMENT ON TABLE public.property_requests IS
    'Contains encrypted buyer phone (PII). Retention: 12 months from creation (owner decision #1793, PR #2791). No automated purge exists yet; purge is a separate follow-up issue.';

COMMENT ON COLUMN public.property_requests.retain_until IS
    'Retention: 12 months from creation (owner decision #1793, PR #2791). No automated purge exists yet; purge is a separate follow-up issue.';

-- RLS: admin-only, mirroring V143 (commercial_import_*). The Spring Boot backend writes as the
-- table owner / service_role, which bypasses RLS, so no client-role policy is needed for the
-- public POST. anon and non-admin authenticated get ZERO applicable policies = default-deny,
-- regardless of the platform's table-level GRANT ALL. Deliberately NO FORCE ROW LEVEL SECURITY
-- (it would break the backend's own writes) and NO REVOKE/GRANT (see V143's rationale).
ALTER TABLE public.property_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all property_requests rows"
    ON public.property_requests FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()));
