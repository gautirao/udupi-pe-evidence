# Runbook — City Launch Promotion (#1911 PR5)

> Operator runbook for `CityLaunchPromotionService` — the guarded launch that
> promotes a city_launch_revision's `sandbox_*` tables into production
> geography and activates the city. This is the only production-geography
> write path introduced by #1911.

## What it does

`POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch`
(admin-only) runs a single `@Transactional` promotion:

1. Guarded CAS `VALIDATED -> PROMOTING` (0 rows affected = not promotable,
   zero writes).
2. Recompute the revision checksum from the `sandbox_*` rows and compare to
   `persisted_revision_checksum` (mismatch = reject, zero writes, revision
   stays `VALIDATED`).
3. Lock production targets `FOR UPDATE` ascending by natural key and
   compare-before-write copy all six sandbox tables into their production
   counterparts.
4. Final CAS `PROMOTING -> PROMOTED` + `promoted_at` + `applied_revision_checksum`.
5. Activate the city (`cities.is_active` `false -> true`, where-scoped;
   never `true -> false`).

Because steps 1–5 are one transaction, any crash or exception mid-write rolls
everything back — the revision reverts to `VALIDATED` with zero partial
geography and no partial activation. A second call after a committed
`PROMOTED` revision returns `200` with `idempotentNoop: true` (no re-apply).

## Recovering a stuck PROMOTING row

Because the whole promotion is one transaction, a normal failure (exception,
checksum mismatch, business rejection) already rolls back to `VALIDATED` —
there is nothing to clean up. A row can only be left in `PROMOTING` if the
database connection itself died mid-transaction (e.g. pod killed, network
partition) before the rollback could be observed by a client, or before
Postgres released the in-flight transaction.

If you suspect a stuck `PROMOTING` row:

1. Confirm no promotion is actually still running (check application logs
   for a `PROMOTED-committed` or `REJECTED-with-reason` line for that
   `revision_id`; check for an active DB session against the row).
2. If genuinely stuck (no active transaction holding it, no recent log
   activity), it is safe to manually reset it to `VALIDATED`:

```sql
UPDATE city_launch_revision
SET lifecycle_status = 'VALIDATED'
WHERE id = :revisionId
  AND city_id = :cityId
  AND lifecycle_status = 'PROMOTING';
```

3. Re-launch from the admin readiness screen. This matches PR2's existing
   stuck-`PREPARING` recovery precedent — same manual-reset shape, different
   status value.

## Checksum mismatch / canonical drift (422)

A `422` on launch means the sandbox rows changed after the revision was
marked `VALIDATED` (or drifted from the persisted checksum some other way).
The launch made **zero writes** — production geography and the revision's
lifecycle status are untouched. The fix is always the same: **re-run prepare
and re-validate**, not to retry the launch as-is.

## Verifying a launch

```sql
SELECT lifecycle_status, promoted_at
FROM city_launch_revision
WHERE id = :revisionId AND city_id = :cityId;

SELECT is_active
FROM cities
WHERE id = :cityId;
```

Expect `lifecycle_status = 'PROMOTED'`, a non-null `promoted_at`, and
`is_active = true` after a successful launch.

## Observability

Structured SLF4J log lines (same convention as PR2's admin controllers, no
audit table): `PROMOTING-entered`, per-table promoted counts,
`PROMOTED-committed`, `REJECTED-with-reason` (`checksum-mismatch` |
`canonical-drift` | `CAS-lost`). The durable record of what happened is the
revision row itself (`lifecycle_status`, `promoted_at`,
`applied_revision_checksum`).

## Scope note

MVP is first-launch-into-empty-geography only. Re-launching / overwriting an
already-`PROMOTED` city's live geography is deferred — the schema
(`superseded_by`, `uq_clr_current_promoted`) supports it later without a
migration, but it is out of scope for this runbook.
