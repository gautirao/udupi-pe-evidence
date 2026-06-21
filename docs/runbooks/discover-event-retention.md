# Runbook — discover_event 180-day Retention Purge (M30)

> Operator runbook for the scheduled retention purge of the `discover_event` telemetry
> table. Introduced by issue #1531. Retention window is set by the #1520 legal retention
> policy (180 days).

## What it does

A scheduled job deletes `discover_event` rows older than **180 days** (UTC), in **bounded
batches**, so the deletes never hold a long table lock. It runs **daily at 03:00 UTC**.

- Component: `DiscoverEventRetentionJob` (`@Scheduled(cron = "0 0 3 * * *", zone = "UTC")`).
- Cutoff: `now(UTC) - 180 days`, recomputed each run (timezone-safe).
- Batch size: `500` rows per `DELETE`, looped until a batch returns fewer than 500 (i.e.
  no more eligible rows). Each batch commits independently — the job is **not** wrapped in
  a single transaction, so row locks are bounded to one batch at a time.
- **Idempotent:** re-running after a completed run deletes 0 rows.

## Metric to watch

| Metric | Type | Tags | Meaning |
|---|---|---|---|
| `discover_event.retention.rows_purged` | counter | none (low-cardinality) | total rows purged; **incremented on every run, including zero-row runs** |

Because the counter increments even on zero-row runs, the **absence** of any increment in
a ~24h window means the job itself did not run — alert on that, not on row count.

Related ingest metric:

| Metric | Type | Tags | Meaning |
|---|---|---|---|
| `discover_event.rate_limited` | counter | none | ingest requests rejected by the per-session rate limiter |

Both are exposed via Micrometer / Prometheus (`/actuator/prometheus`). Neither metric
carries any `session_id` or per-event tag (PII-free + cardinality-safe by design).

## Healthy signals

- `discover_event.retention.rows_purged` increments once per day (value may be 0).
- Row count of `discover_event` does not grow unbounded; oldest `ts` stays within ~180 days.

## Alerting suggestions

- **Job did not run:** no `discover_event.retention.rows_purged` increment for > 26h.
- **Backlog growth:** `SELECT min(ts) FROM discover_event` older than ~182 days (purge is
  falling behind — see "If purge falls behind").

## Manual run

The purge is a Spring `@Scheduled` method; there is no HTTP trigger. To force a run outside
the schedule, restart the service near a window or invoke the bean via an admin/ops hook if
one exists. A safe manual SQL equivalent (bounded; repeat until 0 rows):

```sql
-- Repeat until 0 rows affected. Run in a maintenance window.
DELETE FROM discover_event
WHERE id IN (
  SELECT id FROM discover_event
  WHERE ts < (now() AT TIME ZONE 'UTC') - INTERVAL '180 days'
  LIMIT 500
);
```

## If purge falls behind (large backlog)

The job deletes in 500-row batches with independent commits, so it will catch up across
runs without locking the table. If the backlog is very large and a single daily run cannot
drain it:

1. Confirm the job is running (metric increments daily).
2. Optionally run the manual SQL above in a maintenance window, repeating until 0 rows.
3. **Follow-up (not in #1531):** if purge time grows materially, consider partitioning
   `discover_event` by time and dropping whole partitions instead of row deletes. This was
   deliberately deferred to keep the V93 migration simple and reversible.

## Known limitations (foundational phase — documented, not defects)

- **Rate limiter is in-memory, per-instance.** Under a multi-replica deployment a client
  can submit up to `60 events / 10 min × (number of instances)`. A shared/distributed
  (e.g. Redis-backed) limiter is a **follow-up**, not in scope for #1531. Do not add new
  infra without a decision.
- **`session_id` is client-controlled.** A caller can rotate UUIDs to dilute the
  per-session limit. Accepted for the anonymous foundational stream; abuse surface noted as
  a follow-up.

## Rollback / migration

- Flyway migration: `V93__discover_event.sql` (append-only table + `ts` index).
- Reversal is data-destructive (`DROP TABLE discover_event`). The table has no FK
  dependents. Coordinate with ops before rolling back; events are ephemeral (180-day
  retention) and not backed up beyond standard DB snapshots.

## Privacy note

This stream is PII-free by construction (no personal columns; coarse fields only; consent
default-deny). The user-facing consent control is a separate dependency (**#1576**) and
must ship before broad production telemetry. See
[`docs/discover-event-contract.md`](../discover-event-contract.md).
