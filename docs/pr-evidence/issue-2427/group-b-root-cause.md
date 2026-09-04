# Issue #2427 — Group B root cause

J1, J5 and gap 2 are all anonymous journeys. They survived the Group A fix
unchanged, which is the expected result: none of them ever presents a token, so
no amount of role seeding could affect them.

The cause is not timing, not contention, and not a product regression. All three
assert against **canonical navigation data that the E2E fixture has never
contained**.

## What the specs demand

| Spec | Node keys it hard-codes |
| --- | --- |
| `discover-schools-canonical-2124.spec.ts` J5 | `d:central`, `c:central:in-ka-bengaluru-btm-layout-in-ka-bengaluru-koramangala`, `a:IN\|KA\|Bengaluru\|Koramangala` |
| `discover-schools-canonical-2124.spec.ts` gap 2 | `a:IN\|KA\|Bengaluru\|BTM Layout` |
| `discover-real-data-smoke.spec.ts` J1 | `d:n`, `a:IN\|KA\|Udupi\|Brahmavar` |

## What the fixture actually contains

`scripts/db/fixtures/navigation-hierarchy-fixture-seed.sql` holds exactly 13
Bangalore nodes, and no Udupi nodes at all:

```
a:IN|KA|Bengaluru|Avalahalli
a:IN|KA|Bengaluru|Chandra Layout Extension
a:IN|KA|Bengaluru|Deepanjali Nagar
a:IN|KA|Bengaluru|Gnana Bharathi
a:IN|KA|Bengaluru|Hoskote
a:IN|KA|Bengaluru|Kannamangala - Whitefield Hoskote Road
a:IN|KA|Bengaluru|Nagarbhavi
a:IN|KA|Bengaluru|RR Nagar
a:IN|KA|Bengaluru|Vijayanagar
c:northeast:hoskote-kannamangala-whitefield-hoskote-road
d:northeast
d:southeast
d:southwest
```

No `d:central`. No central cluster. No Koramangala. No BTM Layout. No Udupi
navigation node of any kind. Not one of the five node keys the three tests
target exists.

The fixture load itself is healthy and asserts as much during restore:
`Bangalore navigation_nodes count: 13`, `Bangalore PROMOTED
city_launch_revision count: 1`. The data that is there is correct; the data
these specs need was never added.

## Confirmed against the rendered page

Playwright's own failure snapshot for J5 shows the panel mounting correctly and
offering three directions, none of them Central:

```
- heading "Where do you want schools?" [level=2]
- paragraph: 2 schools in these areas. Pick a direction, or search a school by name...
- text: Explore schools in Bangalore 3
- list:
  - listitem: button "South-East Bangalore 2 schools 3 areas with schools"
  - listitem: button "North-East Bangalore 0 schools 2 areas with schools"
  - listitem: button "South-West Bangalore 0 schools 3 areas with schools"
```

J1's snapshot shows Udupi rendering the **legacy** area list rather than any
canonical Direction hierarchy:

```
- button "Manipal 5 properties"
- button "Kaup 4 properties"
- button "Malpe 4 properties"
- generic: Areas with properties
- generic: 13 properties in Udupi
```

That also explains J1's specific first failure. Its earliest assertion is that
the city-root camera-sync writes a zoom into the URL; in this legacy city-root
state it never does, so the test dies at `zoom >= 1` long before it reaches the
`d:n` marker it could never have found either.

## Why they broke, and when

Before `0a087495` (2026-09-02, PR #2423), `scripts/run-e2e-local.sh` started no
database of its own. `apps/api/run-local.sh` fell through to whatever
`apps/api/.env` resolved — in practice the **shared hosted Supabase database**,
which does carry the full Bangalore and Udupi canonical hierarchies. That commit
correctly moved the gate onto an isolated ephemeral fixture, precisely to stop
the gate writing to a production-adjacent database (the "#2422 push incident"
its own comment describes).

Both halves of this issue are direct consequences of that correct change:

- **Group A** — the new fixture had no seeded identities, and the seeding lived
  only in the sibling script. Fixed in this PR.
- **Group B** — the new fixture has no canonical navigation for these nodes, and
  three specs assert against them.

The timeline matches exactly: the gate was isolated on 2026-09-02 and this issue
was filed on 2026-09-03.

`discover-real-data-smoke.spec.ts` states its own provenance in a header
comment — its node keys are "the live values returned by `GET
/api/discover/cities/udupi/navigation/{node}/counts`", and its prerequisites
name `scripts/seed-discover-listings.mjs`, a seeding script the gate has never
run. It was authored against a live shared environment, not against this
fixture.

**These three tests have therefore never passed against the isolated fixture.**
They are not a regression introduced by any product change, and no product code
is at fault.

## Remedy — this is a scope fork, flagged for the owner

Neither remedy is a bug fix; both are fixture/test authoring with real blast
radius, and they differ materially in cost and risk. Detail and a
recommendation are on the PR as an OWNER DECISION REQUIRED item.

No assertion has been weakened and nothing has been skipped or quarantined.
