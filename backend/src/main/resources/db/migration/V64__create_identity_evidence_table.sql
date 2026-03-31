-- V64: Create identity_evidence table for admin-reviewed identity verification
-- Replaces the OTP-based identity verification flow with document-based evidence.

CREATE TABLE identity_evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES profiles(id),
    listing_id      UUID NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE,
    legal_name      VARCHAR(200) NOT NULL,
    phone_number    VARCHAR(100) NOT NULL,
    document_type   VARCHAR(30) NOT NULL,
    document_url    TEXT NOT NULL,
    review_state    VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    reviewed_by     UUID,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ie_document_type CHECK (document_type IN ('AADHAAR', 'PAN', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENSE')),
    CONSTRAINT chk_ie_review_state CHECK (review_state IN ('PENDING', 'APPROVED', 'REJECTED'))
);

ALTER TABLE identity_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_evidence_owner_select ON identity_evidence
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY identity_evidence_owner_insert ON identity_evidence
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY identity_evidence_admin_all ON identity_evidence
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
