# City-region onboarding recovery (issue #1907)

Operator runbook for the manual, human-supervised recovery when a city has a
`city_region_policy` row (seeded by V113) but `city_regions` is empty for
that city — the Discover map falls back to showing individual areas instead
of North/South/East/West-style region bubbles for that city.

This is detected by `CityRegionBackfillReadinessHealthIndicator` /
`CityRegionBackfillReadinessScheduler` (#1907) but is deliberately **not**
auto-remediated — see [Why this is manual, not automatic](#why-this-is-manual-not-automatic)
below.

## 0. Prerequisites

- Backend deploy access (ability to set an environment variable / Spring
  property and restart the `backend` service).
- The target city's slug (e.g. `bangalore`, `udupi`) — confirm it via
  `SELECT slug FROM cities;` if unsure.
- Application log access for the deploy target (to read the dry-run/apply
  report emitted by `CityRegionOnboardingRunner`).

## 1. Confirm the gap

Check the readiness indicator's `staleCities` detail:

```bash
curl -s "$BACKEND_URL/actuator/health/cityRegionBackfill" | python3 -m json.tool
```

Expect a body like:

```json
{
  "status": "UP",
  "details": {
    "checkStatus": "OK",
    "staleCities": ["bangalore"],
    "staleCityCount": 1
  }
}
```

Confirm the API-level symptom too — the regions endpoint returns an empty
`regions` array for the affected city:

```bash
curl -s "$BACKEND_URL/api/discover/cities/<slug>/regions" | python3 -m json.tool
```

If `checkStatus` is `"ERROR"` (and `staleCityCount` is `-1`), the readiness
query itself failed (see application logs for
`CityRegionBackfillReadinessHealthIndicator` — this is distinct from a
genuine `checkStatus: "OK"` with `staleCityCount: 0`, which means no backfill
is needed).

`scripts/smoke_test.sh`'s "Discover City-Region Backfill" section also checks
the `/api/discover/cities/{slug}/regions` endpoint directly for a
configurable set of cities. It is gated by the `REGION_ENABLED_CITIES` env
var (comma-separated slugs) — the release pipeline sets this per-environment
as cities complete this runbook, with no script change required.

## 2. Dry-run first — always

Never go straight to `apply`. Set the following on the backend deploy target
and restart:

```
app.city-region-onboarding.enabled=true
app.city-region-onboarding.mode=dry-run
app.city-region-onboarding.city-slug=<slug>
```

On startup, `CityRegionOnboardingRunner` logs a dry-run report. Inspect it —
especially any `WARN` lines for the `DEGENERATE` group category:

```
CityRegionOnboardingRunner: dry-run group=<slug> category=SPLIT regions=[...]
CityRegionOnboardingRunner: dry-run group=<slug> category=DEGENERATE regions=[...]
```

**`SPLIT` is expected and informational — no operator action is required.**
A `SPLIT` group is one whose member areas legitimately project to more than
one region under the city's current policy (e.g. a curated area_group that
spans two directions). This is a supported shape (#1910): the region-scoped
groups endpoint renders such a group under each of its regions, showing only
that region's member subset, and `apply()` lets each member keep its own
independently-resolved region — it is never collapsed onto one region. You
only need to add a `regional_area_overrides` row for a `SPLIT` group if you
specifically want to force one or more of its members onto a different
region than their raw projection.

**Investigate every `DEGENERATE` line before proceeding to Apply —
re-running `apply` does not fix these.** `DEGENERATE` means an `area_group`'s
member areas project to no region at all under the city's current policy
(e.g. missing classification rows), and `apply()` refuses to guess a
resolution for them — this still blocks the whole apply and rolls back.
Resolve each one by inserting a `regional_area_overrides` row (author,
reason, and the `forced_region_key` you want that area assigned to) before
moving on. `UNIFIED` groups need no action.

## 3. Apply

Once every `DEGENERATE` group is resolved (or accepted as-is via an
override) — `SPLIT` groups need no resolution — flip the mode — keep
`enabled=true` and `city-slug` set:

```
app.city-region-onboarding.enabled=true
app.city-region-onboarding.mode=apply
app.city-region-onboarding.city-slug=<slug>
```

Restart, and confirm the completion log line:

```
CityRegionOnboardingRunner: apply completed cityId=<id> slug=<slug>
```

## 4. Verify

Query the materialized rows directly:

```sql
SELECT region_key, display_label, display_order
FROM city_regions
WHERE city_id = (SELECT id FROM cities WHERE slug = '<slug>')
ORDER BY display_order;
```

Then re-check the API and confirm `regions` is non-empty:

```bash
curl -s "$BACKEND_URL/api/discover/cities/<slug>/regions" | python3 -m json.tool
```

Finally, spot-check the Discover map in a browser for that city — it should
render region bubbles (e.g. North/South/East/West), not individual area
markers.

## 5. Disable the runner again — mandatory step

Set `app.city-region-onboarding.enabled=false` (or unset the property, since
its default is `false`) and restart.

**`CityRegionOnboardingRunner` re-runs its configured mode on EVERY
application startup while enabled.** Leaving `mode=apply` armed means every
future restart re-applies onboarding for that city — harmless if nothing
changed, but an unnecessary and unsupervised write on every deploy, and
actively wrong if `regional_area_overrides` or the city's policy changes in
the interim without a fresh dry-run review. Disabling is not optional cleanup
— it is the step that makes this a one-off, human-supervised action rather
than a standing background job.

## Why this is manual, not automatic

`CityRegionOnboardingRunner` is disabled-by-default and dry-run-by-default by
design (see its Javadoc). Onboarding a city is a one-off action that
requires a human to read the dry-run report and resolve any `DEGENERATE`
groups (`SPLIT` groups need no resolution — see Step 2) — it is not safe to
run unattended on every deploy, and there is deliberately no HTTP endpoint or
automatic trigger for it.

`CityRegionBackfillReadinessHealthIndicator` and
`CityRegionBackfillReadinessScheduler` (#1907) exist purely for **detection**
— `/actuator/health/cityRegionBackfill`, the
`discover.city_region_backfill.stale_cities` gauge, and the periodic WARN log
tell you a city needs this procedure. They never trigger remediation
themselves.

## Relationship to PR #1905's outbox poller

PR #1905 added an outbox-based poller (`AreaRegionReclassOutboxPoller`) that
keeps an **already-onboarded** city's region memberships correct going
forward when an individual area's classification changes after onboarding
(e.g. a boundary correction). It consumes reclassification events emitted for
areas that already have a `city_region_memberships` row.

It does **not** replace this procedure. If a city was never onboarded in the
first place, there is nothing in `city_region_memberships` for the poller to
reconcile — `city_regions` itself is empty, which is exactly the gap this
runbook addresses. Use this runbook for that historical, one-off gap; the
outbox poller's job starts only after this runbook's Step 3 (Apply) has run
at least once for the city.
