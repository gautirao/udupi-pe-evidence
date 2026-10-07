-- V147: comment-only follow-up to V146 (#2792). No DDL on rows or constraints.
-- The retention purge now exists; replace the "no automated purge yet" wording.

COMMENT ON TABLE public.property_requests IS
    'Contains encrypted buyer phone (PII). Retention: 12 months from creation (owner decision #1793, PR #2791). Rows are hard-deleted by PropertyRequestRetentionJob (daily 03:00 UTC, retain_until < now(), #2792).';

COMMENT ON COLUMN public.property_requests.retain_until IS
    'Retention: 12 months from creation (owner decision #1793, PR #2791). Rows are hard-deleted by PropertyRequestRetentionJob (daily 03:00 UTC, retain_until < now(), #2792).';
