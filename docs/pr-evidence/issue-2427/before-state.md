# Issue #2427 — Before state (clean, uncontended baseline on current main)

This is the "what's needed" item 1 from the issue: a clean baseline run of the
pre-push E2E gate against current `main`, not a feature branch.

## Environment

| Item | Value |
| --- | --- |
| Worktree | `udupi-property-explorer-worktrees/issue-2427-e2e-fixture-reliability` |
| Base commit | `ac2094d5c3447bc1061e4f47624b4534d68c8c74` (origin/main) |
| Repo changes at run time | none (clean tree) |
| Frontend | `http://localhost:5188` |
| Backend | `http://localhost:8098` |
| DB fixture | `pg-e2e-issue-2427-e2e-fixture-reliability--2140` on port 36686 (own ephemeral container) |
| Concurrency | other lanes were on 5182/5184/8085/8092/8094 and containers `pg-test-fixture`, `pg-dev-issue-2420`; no port or container shared |
| Date | 2026-09-04 |

## Command

```
npm run test:e2e:local
```

This is byte-for-byte the pre-push gate: `.githooks/pre-push` invokes
`npm run test:e2e:local`, which is `bash scripts/run-e2e-local.sh`, which
defaults to `--project=smoke`.

Exit code: **1**

Raw output: `before-smoke-main-ac2094d5.log.txt`

## Playwright projects that actually ran

One project, `smoke`. `playwright.config.ts` scopes it to exactly seven spec
files, so the run is complete for the gate's purposes and nothing was silently
dropped for want of credentials — `31 tests` were collected and the
credential-gated broker/admin/user storage states were all written for real
(`[global-setup] Saved storageState for broker/admin/user`).

## Result

```
10 failed
 1 skipped
 3 did not run
17 passed (1.4m)
```

### Failures

| # | Test | Group |
| --- | --- | --- |
| 1 | `broker-dashboard-v2.spec.ts` BD1 — broker sees 5 summary cards | A |
| 2 | `broker-dashboard-v2.spec.ts` BD2 — "Start here today" / "Broker workspaces" | A |
| 3 | `broker-dashboard-v2.spec.ts` BD3 — no live anchor; "Details coming soon" | A |
| 4 | `broker-listing-quality.spec.ts` LQ2 — summary cards render | A |
| 5 | `broker-listing-quality.spec.ts` LQ3 — fix-plan panel opens | A |
| 6 | `broker-listing-quality.spec.ts` LQ4 — fix-plan edit CTA | A |
| 7 | `broker-listing-quality.spec.ts` LQ5 — not-scored never shows "0" | A |
| 8 | `discover-real-data-smoke.spec.ts` J1 — area-first anon | B |
| 9 | `discover-schools-canonical-2124.spec.ts` J5 — school-first navigation | B |
| 10 | `discover-schools-canonical-2124.spec.ts` gap 2 — zero-school AREA stays visible | B |

`3 did not run` are J2, J3 and J4 in `discover-real-data-smoke.spec.ts`. That
file calls `test.describe.configure({ mode: 'serial' })`, so J1's failure
suppresses the three tests after it. Their true state is unknown until J1 passes.

This confirms the issue's central open question: these specs are **broken on
current main**, not flaky-only, and not caused by #2017 or #2420.

The baseline also found two failures the issue did not list — BD3 and LQ2 — so
the real Group A blast radius is 7 tests, not 5.

## Group A root cause (proven)

`global-setup` never gets past step 2:

```
[global-setup] POST /api/listings failed (403): {"error":"Requires broker, dealer, user, or admin role"}
```

The chain:

1. `scripts/run-e2e-local.sh` starts its **own** ephemeral Postgres fixture
   (`pg-e2e-<worktree>-<pid>`) and points the backend at it. It deliberately
   does not reuse `local-fixture-backend.sh`'s machine-wide `pg-test-fixture`.
2. A freshly restored fixture's `public.user_roles` holds exactly **one row, and
   it is the wrong one**: a synthetic fixture broker pinned to the literal UUID
   `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (`e2e-broker@example.com`), seeded at
   `scripts/db/fixtures/discover-smoke-seed.sql:90`. There is no row for any
   account the suite authenticates as — those UUIDs are minted by the live
   Supabase auth provider and are unknowable to a static seed file. Nothing
   fills the gap at login either: the same seed drops V0.1's
   `on_auth_user_created` trigger, so not even the default `user` role is
   auto-assigned.
3. `DbRoleJwtAuthenticationConverter` derives every `ROLE_*` authority from that
   one table, keyed on the JWT's own subject, and `CallerInfoResolver` fails closed
   (`apps/api/src/main/java/com/example/realestate/security/CallerInfoResolver.java:83`)
   with exactly this message when no role authority is present.
4. So a hosted-Supabase JWT is perfectly valid and still useless here: every
   role-gated request 403s, including global-setup's fixture-listing POST.
5. No listing is created, `e2e/.test-listing-id` is never written, and every
   broker spec that needs a listing to render fails.

The seeding that fixes this already exists — but only inside
`scripts/dev/local-fixture-backend.sh` (Step F for admin, Step F2 from #2221 for
broker and smoke-user). `scripts/run-e2e-local.sh` has no equivalent, and the
two scripts share no code. The gate path was simply never given the seed.

## Group B — reproduced, cause not yet proven

Three distinct anonymous-journey failures, none of which touch auth:

**J1** — `discover-real-data-smoke.spec.ts:273`. The Discover map mounts (the
Leaflet zoom control is visible) but the camera-sync never writes a zoom into
the URL:

```
Error: J1: city-root camera-sync must settle a zoom into the URL
expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 1
Received:    0
```

**J5** — `discover-schools-canonical-2124.spec.ts:92`. The canonical schools
panel shell renders, but its Central Bangalore direction child never appears:

```
Locator: getByTestId('discover-schools-journey-panel-shell')
           .getByTestId('navigation-child-card-d:central')
Error: element(s) not found
```

**gap 2** — `discover-schools-canonical-2124.spec.ts:284`. Same shape, different
node:

```
Locator: getByTestId('discover-schools-journey-panel-shell')
           .getByTestId('navigation-child-card-a:IN|KA|Bengaluru|BTM Layout')
Error: element(s) not found
```

J5 and gap 2 share one symptom: the panel shell mounts and its canonical
children do not. That points at the navigation-hierarchy data the fixture serves
rather than at either spec. J1 is a different symptom (camera-sync) in a
different city (Udupi), so it is not yet safe to assume one cause covers all
three. Diagnosis continues against a live stack.
