-- V19: Admin audit log table
-- Persists a tamper-evident record of admin actions (approve, reject, locality rename).
-- Written asynchronously after each admin action; read via /api/admin/audit-log (PR-13.8).

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    uuid        NOT NULL,
    action      varchar(64) NOT NULL,
    entity_type varchar(64),
    entity_id   uuid,
    before_json jsonb,
    after_json  jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by admin (most common read pattern: "show my recent actions")
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_created_at
    ON public.admin_audit_log (admin_id, created_at DESC);

-- Fast lookup by entity (e.g. "show all actions on listing X")
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
    ON public.admin_audit_log (entity_type, entity_id)
    WHERE entity_id IS NOT NULL;
