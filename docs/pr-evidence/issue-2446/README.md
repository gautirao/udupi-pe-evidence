# Issue #2446 — isolated canonical-Udupi Discover smoke (owner ruling: Option 2)

Branch `issue-2446-canonical-udupi-smoke-fixture`, PR #2466.
Every run below was launched from the **worktree cwd**
`/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-2446-udupi-canonical-smoke`
via `scripts/run-e2e-local.sh` (each run boots its own disposable `pg-e2e-issue-2446-*` PostGIS
container; frontend `:5251`, backend `:8151`). The `[launcher]` header at the top of every
`*.log.txt` records cwd, branch, head and `E2E_FIXTURE_PROFILE` so the served tree is pinned, not assumed.
No run touched the shared project database, `pg-test-fixture`, or `pg-dev-issue-2420`.

## 1. Canonical profile — the new coverage

| Run | Command (worktree cwd) | Playwright project | Storage states | Exit | Result | Log |
|---|---|---|---|---|---|---|
| canonical-1 | `E2E_FIXTURE_PROFILE=udupi-canonical bash scripts/run-e2e-local.sh --project=udupi-canonical-smoke --reporter=list` | `udupi-canonical-smoke` | anon (J0-J2, J4); broker `e2e/fixtures/broker-auth.json` (J3) | 1 | J0 pass, **J1 FAIL**, J2-J4 did not run (serial) | `canonical-profile-run-1-single-direction-root.log.txt` |
| canonical-2 | same | `udupi-canonical-smoke` | same | **0** | **5 passed** (J0, J1, J2, J3, J4) — 0 skipped, 0 did-not-run | `canonical-profile-run-2.log.txt` |

Seed evidence in both logs: `[e2e] Fixture profile: udupi-canonical`, then
`udupi-canonical-smoke-fixture-seed assertions passed: 2 root DIRECTIONs (d:n -> Brahmavar, d:s -> Kaup), PROMOTED revision, 3 Brahmavar listings (1 apartment), school area_key=IN|KA|Udupi|Brahmavar`
and `[profile=udupi-canonical] Udupi PROMOTED city_launch_revision count: 1.`

J3 ran **authenticated** (broker storage state written by `global-setup.ts` with real credentials from
`.env.e2e`), not skipped — see the `✓ 4 … J3` line in `canonical-profile-run-2.log.txt`.

### What canonical-1 found, and the fix

The first cut of the seed gave Udupi a single Direction (`d:n`). With one root child the app lands
straight on `node=d:n` at zoom 18 — URL captured in the run-1 error context:
`/discover?city=udupi&node=d:n&lat=13.42760&lon=74.74490&zoom=18` — and never renders an
`area-destination-marker` at the root, so the Direction hop the ruling asks for could not be clicked
(`activateMapNode` zoomed to max and failed: "the map Zoom in control must advance the URL zoom past 18").
`canonical-profile-run-1-resolve-root.json` is the backend root payload for that state (one child).

Fix (commit `52a8c40`): attach the already-seeded Kaup area (4 LIVE listings, no school, ~23 km from
the Brahmavar school) under a second Direction `d:s` "South Udupi", giving the root two destinations like
the Bangalore fixture. The seed now asserts exactly 2 root DIRECTIONs; J0 pins `[d:n, d:s]` and J1 asserts
the root has no pre-selected `node=` before any click. J2/J3's 2 km radius and J4's Brahmavar-scoped keyword
journey are unaffected by Kaup (verified by their passes in canonical-2).

## 2. Default profile — proof the legacy-Udupi specs keep their rendering mode

Owner point 7 asks for proof of **unchanged rendering mode**, not just "still green". Three independent
pieces, all taken against the default-profile stack booted from this branch:

### 2a. Live probes while the stack was up (`default-profile-live-probes.txt`)

* `GET /api/discover/cities/udupi/navigation/resolve?node=root` → **HTTP 404**
  `{"error":"City has no active navigation hierarchy"}` (canonical profile: 200 with `d:n`, `d:s`).
* Ephemeral DB: `udupi navigation_nodes=0`, `udupi PROMOTED revisions=0`, `udupi city_regions=0`,
  `bangalore navigation_nodes=20` (Bangalore's canonical rows untouched).

### 2b. Marker-DOM probe at the Udupi root (`default-profile-marker-mode-probe.json`, script `marker-mode-probe.cjs`)

Real Chromium against `http://localhost:5251/discover?city=udupi`, no mocks:

```
legacy_area_marker: 3
canonical_area_destination_marker: 0
canonical_area_single_marker: 0
canonical_area_visual_cluster_marker: 0
navigation_resolve_responses: 4 x "404 …/cities/udupi/navigation/resolve?node=root"
url_after_load: /discover?city=udupi&scope=
```

That is the LEGACY `AreaMarkerLayer` path — the `.leaflet-marker-icon.area-marker` selector the six
legacy specs assert on — with zero canonical markers. On the canonical profile J1 asserts the inverse
(`.area-marker` count 0, then clicks `area-destination-marker[data-node-key="d:n"]`).

### 2c. The six legacy specs, branch vs merge-base, same default profile

Inputs are byte-identical to `origin/main`: `git diff origin/main -- <six specs> e2e/discover-real-data-smoke.spec.ts scripts/db/fixtures/{discover-smoke-seed,navigation-hierarchy-fixture-seed,navigation-active-revision-fixture-seed}.sql` is empty, and the
branch touches no `apps/` or `src/` code (`git diff origin/main --stat -- apps src` is empty).

| Run | Infra files in effect | Exit | Passed | Failed | Skipped | Log |
|---|---|---|---|---|---|---|
| legacy-branch | this branch (`playwright.config.ts`, `restore-test-fixture.sh`, `run-e2e-local.sh`) | 1 | 15 | 9 | 1 | `default-profile-legacy-six-specs-branch.log.txt` |
| legacy-baseline | merge-base `d36b358b` versions of those 3 files restored in the same worktree (`git checkout d36b358b -- …`, app code identical, restored to branch afterwards) | 1 | 15 | 9 | 1 | `default-profile-legacy-six-specs-mergebase-baseline.log.txt` |

Per-test status (✓/✘/-, all 25 tests, names normalised) diffed between the two runs:
`legacy-per-test-status-diff-branch-vs-baseline.txt` is **empty**; the failing-name set diff
`legacy-failure-set-diff-branch-vs-baseline.txt` is **empty**. Same 15 pass, same 9 fail, same 1 skip.

Command for both (worktree cwd, `E2E_FIXTURE_PROFILE` unset):
`bash scripts/run-e2e-local.sh --project=full --reporter=list e2e/discover-area-cards.spec.ts e2e/discover-area-nav-journey.spec.ts e2e/discover-correctness-1064.spec.ts e2e/discover-correctness-1067.spec.ts e2e/discover-viewport.spec.ts e2e/discover-opensearch-parity.spec.ts`

The branch run's log shows `[e2e] Fixture profile: default` and
`==> Fixture profile: default (Udupi LEGACY; …)`; no `[profile=udupi-canonical]` line appears, i.e. the
canonical seed was never applied.

The 9 failures are **pre-existing on the default fixture and unrelated to rendering mode**: every one is a
`toBeVisible` timeout on either a Bangalore-side legacy `.area-marker` (Bangalore is canonical in the
isolated fixture since #2423 — `discover-area-cards` "switching city replaces area markers", A2-A5) or a
Malpe / Padubidri school heading (`discover-correctness-1064/1067`; the isolated fixture seeds Manipal
schools only). The Udupi-root legacy assertions that define the rendering mode all **pass** in this run:
`discover-area-cards` "area markers appear on the map for default Udupi city", "clicking an area marker
selects the area…", `discover-area-nav-journey` J1/J2a-J2d/J3/J4, `discover-viewport` Back/Forward,
`discover-opensearch-parity` J1/J2/J4.

Honest caveat on the baseline: it is a same-worktree run with the merge-base versions of the three
infra files, not a separate clean checkout (local `main` was 15 commits behind `origin/main`, so it was
not a valid base). The empty `git diff` on app code, specs and default seeds is what makes the two runs
apples-to-apples.

## 3. Negative proof — the new spec cannot false-green on the default fixture

Command (worktree cwd, `E2E_FIXTURE_PROFILE` **unset**):
`bash scripts/run-e2e-local.sh --project=udupi-canonical-smoke --reporter=list`
→ exit 1 | project `udupi-canonical-smoke` | **J0 FAILED** (`Expected: 200 / Received: 404` on
`/api/discover/cities/udupi/navigation/resolve?node=root`), J1-J4 did not run (serial), 0 passed.
Log: `negative-proof-default-profile.log.txt` (shows `[e2e] Fixture profile: default`).
The spec's own precondition refuses the wrong fixture, so it can never report a false green on the
default profile, and the default profile provably has no canonical Udupi.

## 4. Coverage placement

`udupi-canonical-smoke` is its own Playwright project. `smoke`, `journey`, `integration-ui` are untouched;
`full` now `testIgnore`s the new spec (it would fail there by design — see §3). Nothing was added to the
default seed list; the default profile is what `scripts/run-e2e-local.sh` still runs when the variable is unset.

## Files

* `canonical-profile-run-1-single-direction-root.log.txt` — first canonical run (J1 failure that led to `d:s`)
* `canonical-profile-run-1-resolve-root.json` — backend root payload with a single Direction
* `canonical-profile-run-2.log.txt` — green canonical run, 5/5
* `default-profile-live-probes.txt`, `default-profile-resolve-root.json` — API + DB probes on the default profile
* `marker-mode-probe.cjs`, `default-profile-marker-mode-probe.json` — marker-DOM rendering-mode probe
* `default-profile-legacy-six-specs-branch.log.txt` — six legacy specs on this branch
* `default-profile-legacy-six-specs-mergebase-baseline.log.txt` — same six specs with merge-base infra files
* `legacy-per-test-status-diff-branch-vs-baseline.txt`, `legacy-failure-set-diff-branch-vs-baseline.txt` — both empty
* `negative-proof-default-profile.log.txt` — canonical spec on the default profile (J0 must fail)
