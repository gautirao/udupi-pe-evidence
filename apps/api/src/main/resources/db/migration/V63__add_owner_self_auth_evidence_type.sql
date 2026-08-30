-- V63: Add OWNER_SELF_AUTH to authority_evidence evidence_type check constraint.
-- Supports auto-granting Authority badge for owners when Identity is earned.
ALTER TABLE authority_evidence DROP CONSTRAINT chk_ae_evidence_type;
ALTER TABLE authority_evidence ADD CONSTRAINT chk_ae_evidence_type
    CHECK (evidence_type IN ('OWNER_OTP', 'MANDATE_DOCUMENT', 'RERA_NUMBER', 'OWNER_SELF_AUTH'));
