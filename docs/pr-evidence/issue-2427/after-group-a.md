# Issue #2427 — Group A fixed

## Change

`scripts/run-e2e-local.sh` — the pre-push E2E gate — started its own ephemeral
Postgres fixture but never seeded any identity into it. A restored fixture's
`public.user_roles` carries a row only for a synthetic seeded broker, never for
the live Supabase accounts the suite logs in as, so every authenticated request
to the backend it starts returned
`403 Requires broker, dealer, user, or admin role`, including
`e2e/global-setup.ts`'s fixture-listing POST.

The seeding that fixes this already existed, inline, in
`scripts/dev/local-fixture-backend.sh` (Step F for admin, Step F2 from #2221 for
broker and smoke-user). The two scripts shared no code, so the gate path was
never given it.

It is now one canonical helper, `scripts/dev/lib/e2e-identity-seed.sh`, called by
both scripts. `local-fixture-backend.sh` keeps its exact prior semantics: admin
required (the script exits if it cannot be seeded), broker and smoke-user
best-effort. `run-e2e-local.sh` seeds all three best-effort, so a `.env.e2e`
holding placeholder credentials still degrades into auth-dependent tests
skipping themselves rather than the gate refusing to start.

## Command

```
npm run test:e2e:local
```

Exit code: **1** (the three remaining Group B failures — see `group-b-root-cause.md`)

Raw output: `after-groupA-smoke.log.txt`

## Playwright projects that ran

`smoke`, and only `smoke` — same as the baseline. All three storage states were
written for real, and this time the whole global-setup chain completed:

```
[e2e] Seeding fixture identities (admin / broker / smoke-user)...
>>> Local admin identity seeded (auth.users + user_roles 'admin').
>>> Local broker identity seeded (auth.users + user_roles 'broker').
>>> Local smoke-user identity seeded (auth.users + user_roles 'user').
...
[global-setup] Created DRAFT listing: e35d4345-6766-4b0a-99d2-da8e5e5aeb69
[global-setup] Set addressConfirmed=true
[global-setup] Registered 3/3 stub images
[global-setup] Submitted listing for review (PENDING_REVIEW)
[global-setup] Listing e35d4345-6766-4b0a-99d2-da8e5e5aeb69 approved — status: LIVE
```

The approve step is what proves the admin seed as well as the broker seed: it is
an admin-role-gated endpoint, and `global-setup` treats an approve failure as a
hard throw when admin credentials are present.

## Result

| | Baseline (main) | With Group A fix |
| --- | --- | --- |
| failed | 10 | 3 |
| passed | 17 | 24 |
| skipped | 1 | 1 |
| did not run | 3 | 3 |

All seven Group A tests now pass:

| Test | Baseline | Now |
| --- | --- | --- |
| BD1 — broker sees 5 summary cards | fail | pass |
| BD2 — "Start here today" / "Broker workspaces" | fail | pass |
| BD3 — no live anchor; "Details coming soon" | fail | pass |
| LQ2 — summary cards render | fail | pass |
| LQ3 — fix-plan panel opens | fail | pass |
| LQ4 — fix-plan edit CTA | fail | pass |
| LQ5 — not-scored never shows "0" | fail | pass |

No previously passing test regressed. The three remaining failures are exactly
the Group B set (J1, J5, gap 2), unchanged in symptom, which is the expected
outcome: all three are anonymous journeys that never present a token, so no
amount of role seeding could have affected them.

`3 did not run` are still J2/J3/J4, suppressed by J1 under
`test.describe.configure({ mode: 'serial' })`. They stay masked until J1 passes.
