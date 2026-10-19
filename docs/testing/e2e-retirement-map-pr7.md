# #2750 PR-7: final disposition map of the legacy Playwright estate (issue #2850)

> ## DISCLOSURE: one EXISTING guard unit test was edited (reviewed, deliberate)
>
> `scripts/e2e/check-e2e-estate.test.mjs`, the single case "real repo: ... home check" (base lines 524-530), was edited under
> **amendment 2** (SCOPE_CHANGE_REVIEW approved). Before: *every row whose DECISION is `RETAIN_SPECIALIST` sits under
> `e2e/specialist/` or `e2e-parity/`*. That cannot hold once the approved relabel gives 51 legacy rows decision
> `RETAIN_SPECIALIST` with status `SCHEDULED(#NNNN)` (guard change_2). After: (a) the SAME home rule, re-keyed to **STATUS**
> (every status-`RETAIN_SPECIALIST` row is under `e2e/specialist/` or `e2e-parity/`, at least 2 under `e2e-parity/`, 217 rows);
> plus (b) a NEW companion assertion: every decision-`RETAIN_SPECIALIST` row outside those homes has status matching
> `^SCHEDULED\(#[1-9][0-9]{2,4}\)$` AND a slice equal to that `#NNNN`. Terminal `RETAIN_SPECIALIST` is no looser than before;
> the only newly-permitted state is the already-approved tracked pairing. No other existing test was edited or deleted.
> Mutation proofs (each attributable to the intended assertion; companion-disabled escape shown): `.claude/handoffs/issue-2850/evidence/guard-test-amd2-mutations.txt`.
> The edit is for code-reviewer and security-reviewer weakening review (conditions c4/c5).

Base: `182d8d61`. No spec file is deleted, moved or edited. #2751 is NOT closed (FC-24 sum stays 66).

## 1. Relabel summary by follow-up issue (101 rows, applied by FILE PATH)

101 = the 99 originally approved PR-7 relabels + the 2 rows re-slotted under amendment 4 (both into #2859). The 101 equals the
number of `SCHEDULED(#issue)` rows in the committed manifest; counts are verified by script (evidence `codex1-f3-counts.txt`).
Every row that was `SCHEDULED(PR-7)` is now `SCHEDULED(#issue)`; slice is the same `#issue`. No `CANONICAL_GAP_CLOSED`, no `DELETE_DUP`.
RETAIN_SPECIALIST rows carry decision `RETAIN_SPECIALIST` with a `[CODE]` browser-only reason and are NOT admitted (no coverage claim).

| Issue | Group | Rows | Decision |
|---|---|---|---|
| #2826 | existing #2826 (red-at-base specialist pilots) | 3 | RETAIN_SPECIALIST |
| #2855 | FU-ADMIT-ANON | 42 | RETAIN_SPECIALIST |
| #2856 | FU-ADMIT-AUTH | 6 | RETAIN_SPECIALIST |
| #2857 | FU-LOWER-A | 8 | MOVE_DOWN |
| #2858 | FU-LOWER-B | 7 | MOVE_DOWN |
| #2859 | FU-LOWER-C | 27 (25 + 2 amendment-4) | MOVE_DOWN |
| #2860 | FU-CANON-GAP | 5 | MOVE_DOWN |
| #2861 | FU-DELGATE | 3 | DELETE_OBSOLETE |

### #2826 existing #2826 (red-at-base specialist pilots) (3)

- `e2e/discover/active-context-chips-and-badge.spec.ts`
- `e2e/discover/issue-2083-camera-back-determinism.spec.ts`
- `e2e/discover/issue-2305-cluster-marker-skin.spec.ts`

### #2855 FU-ADMIT-ANON (42)

- `e2e/discover-1738-regression.spec.ts`
- `e2e/discover-1942-pin-price-band.spec.ts`
- `e2e/discover-2049-resize-marker-skew.spec.ts`
- `e2e/discover-area-cards.spec.ts`
- `e2e/discover-area-nav-journey.spec.ts`
- `e2e/discover-area-reskin-mobile-2159.spec.ts`
- `e2e/discover-area-selected-filters.spec.ts`
- `e2e/discover-batch-b-journeys.spec.ts`
- `e2e/discover-correctness-1064.spec.ts`
- `e2e/discover-correctness-1067.spec.ts`
- `e2e/discover-listing-detail-reskin-desktop-2159.spec.ts`
- `e2e/discover-listing-detail-reskin-mobile-2159.spec.ts`
- `e2e/discover-map-info-dock-2748.spec.ts`
- `e2e/discover-mobile-map-badge-zoom-2716.spec.ts`
- `e2e/discover-results-redesign-1547.spec.ts`
- `e2e/discover-schools-mobile-cluster-2124.spec.ts`
- `e2e/discover/control-bar-mobile-reachability-1953.spec.ts`
- `e2e/discover/desktop-control-bar-shell-1953.spec.ts`
- `e2e/discover/discover-mobile-guard.spec.ts`
- `e2e/discover/issue-1762-listing-density-clustering.spec.ts`
- `e2e/discover/issue-1823-camera-fit-policy.spec.ts`
- `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts`
- `e2e/discover/issue-1956-pr2-breadcrumb.spec.ts`
- `e2e/discover/issue-1956-pr4-listing-peek-camera-restore.spec.ts`
- `e2e/discover/issue-1956-pr4-mobile-listings-scroll.spec.ts`
- `e2e/discover/issue-1956-pr5-desktop-breadcrumb-regression.spec.ts`
- `e2e/discover/issue-1956-pr5-mobile-cluster-sheet.spec.ts`
- `e2e/discover/issue-1956-pr5-s5-mobile-listing-preview.spec.ts`
- `e2e/discover/issue-2083-home-breadcrumb-back-camera-race.spec.ts`
- `e2e/discover/issue-2089-breadcrumb-list-flex-layout.spec.ts`
- `e2e/discover/issue-2089-pan-preserves-listing-preview.spec.ts`
- `e2e/discover/issue-2149-mobile-school-first-marker-preview.spec.ts`
- `e2e/discover/issue-2330-marker-reskin-visual.spec.ts`
- `e2e/discover/issue-2419-pr1-polygon-scope.spec.ts`
- `e2e/discover/issue-2715-school-pin-vs-empty-pill.spec.ts`
- `e2e/discover/issue-2770-compact-school-context.spec.ts`
- `e2e/discover/journey-switch-overlay-cleanup-1940.spec.ts`
- `e2e/discover/mobile-landing-journey-switcher-1953.spec.ts`
- `e2e/discover/mobile-list-map-shell-1953.spec.ts`
- `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts`
- `e2e/issue-2426-search-this-area-cta-placement.spec.ts`
- `e2e/issue-2456-map-candidate-callouts.spec.ts`

### #2856 FU-ADMIT-AUTH (6)

- `e2e/discover-results-reskin-2729.spec.ts`
- `e2e/discover-viewport-truncation.spec.ts`
- `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts`
- `e2e/issue-2016-result-scope-contract.spec.ts`
- `e2e/issue-2419-mobile-invalid-polygon.spec.ts`
- `e2e/issue-2461-polygon-panel-parity.spec.ts`

### #2857 FU-LOWER-A (8)

- `e2e/broker-agri-listing.spec.ts`
- `e2e/discover-agri-journey-1375.spec.ts`
- `e2e/discover-agri-overlay-peek-journey-1431.spec.ts`
- `e2e/discover-school-first-journey.spec.ts`
- `e2e/discover-school-journey.spec.ts`
- `e2e/discover-school-selected.spec.ts`
- `e2e/discover/school-badge-suppression.spec.ts`
- `e2e/verify-agri-clusters-1372.spec.ts`

### #2858 FU-LOWER-B (7)

- `e2e/discover/area-drilldown-stale-viewport-1821.spec.ts`
- `e2e/discover/issue-1956-pr3-area-clustering.spec.ts`
- `e2e/discover/issue-2089-filter-list-map-parity.spec.ts`
- `e2e/discover/issue-2089-marker-swap-fixture.spec.ts`
- `e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts`
- `e2e/discover/issue-2711-map-filter-intent-commit.spec.ts`
- `e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts`

### #2859 FU-LOWER-C (27)

- `e2e/area-intelligence-1528.spec.ts`
- `e2e/buyer-area-route-1539.spec.ts`
- `e2e/discover-1939-listing-peek-url-restore.spec.ts`
- `e2e/discover-2193-node-invariant.spec.ts`
- `e2e/discover-anon-price-consistency-1941.spec.ts`
- `e2e/discover-area-first-drilldown-1483.spec.ts`
- `e2e/discover-area-keyword-search.spec.ts`
- `e2e/discover-badge.spec.ts`
- `e2e/discover-bounded-listing-2087.spec.ts`
- `e2e/discover-city-listings-empty-city-guard-2189.spec.ts`
- `e2e/discover-city-switch.spec.ts`
- `e2e/discover-cluster-focus-back.spec.ts`
- `e2e/discover-filter-chips.spec.ts`
- `e2e/discover-group-results-1597.spec.ts`
- `e2e/discover-map-hierarchy.spec.ts`
- `e2e/discover-telemetry-consent-1531.spec.ts`
- `e2e/discover-telemetry-consent-1576.spec.ts`
- `e2e/discover-trust-badge-1567.spec.ts`
- `e2e/discover-url-state.spec.ts`
- `e2e/discover-viewport.spec.ts`
- `e2e/issue-2015-search-this-area-viewport.spec.ts`
- `e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts`
- `e2e/issue-2454-scope-aware-relaxation-previews.spec.ts`
- `e2e/map-filters.spec.ts`
- `e2e/regression-1240-marker-lat-lon.spec.ts`
- `e2e/discover-commercial-card-summary.spec.ts` (amendment 4, A2-2: viewport-journey wiring; MOVE_DOWN; destination `page-composition harness required (see #2859)`; OUT_OF_SCOPE_COMPOSITION, no canonical id, no closure claim)
- `e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts` (amendment 4, S2-2: areaKeys request on the legacy URL; MOVE_DOWN; destination `page-composition harness required (see #2859)`; OUT_OF_SCOPE_COMPOSITION, no canonical id, no closure claim)

### #2860 FU-CANON-GAP (5)

- `e2e/discover-agri-direction-first-1448.spec.ts`
- `e2e/discover-agri-locality-marker-1468.spec.ts`
- `e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts`
- `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts`
- `e2e/issue-1065-final.spec.ts`

### #2861 FU-DELGATE (3)

- `e2e/area-overview.spec.ts`
- `e2e/discover-agri-grouped-journey-1412.spec.ts`
- `e2e/discover-opensearch-parity.spec.ts`

Mixed specs (browser rows retained, seam rows trimmed) name their FU-LOWER issue in the rationale; FU-ADMIT-AUTH rows say NOT RUNNABLE LOCALLY.
Borderline rationales kept as specialist candidates with a concrete reason (no conservative downgrade was needed): csv 67, 109, 158, 160 (see `fu-reassignments.md` in the handoff dir: none). Readiness-only rows 59, 99, 183 are MOVE_DOWN (owner default OQ3).

## 2. Deletion gate (nothing is deleted in PR-7)

| Row | Class | Spec | Reason |
|---|---|---|---|
| 44 | CANDIDATE | `e2e/discover-agri-grouped-journey-1412.spec.ts` | owner-ruled end state DELETE_OBSOLETE (pr-2814 6165724465 / 6169673070); weak-assertion spec kept for PR-7 (6099896083). A by-name owner approval is needed; carried into #2861 |
| 75 | CANDIDATE (conditional) | `e2e/discover-opensearch-parity.spec.ts` | adapter dormant behind a default-off flag; candidate ONLY if the owner rules the flag-off OpenSearch path unsupported; carried into #2861 |
| 8 | VISIBILITY ONLY | `e2e/area-overview.spec.ts` | blocked on the deferred /insights ruling (owner KEEP 6209915918); not a candidate |
| 43, 46, 129, 145, 177 | NOT candidates | agri-direction-first-1448, agri-locality-marker-1468, pr6-no-blank-panel, schoolfirst-groupid-clear, issue-1065-final | the #2822 closure claims are NOT_VERIFIED at assertion level (`transcripts/architect-triage-closure.md`); MOVE_DOWN fallback, claims no coverage, tracked in #2860 |

## 3. Runner and config disposition

| Item | Disposition |
|---|---|
| `playwright.config.ts` | KEPT (sole collector of the on-disk legacy specs). Pages.dev default removed; throws at load unless `PLAYWRIGHT_BASE_URL` and `BACKEND_BASE_URL` are set and loopback; `VITE_SUPABASE_URL`, `FRONTEND_BASE_URL`, `VITE_API_BASE_URL`, `OPENSEARCH_URL` and `SUPABASE_DB_HOST` must be loopback whenever they are set in the Playwright process env (Codex r1 F2). This is an env-var check at config load, NOT a runtime request guard: hard-coded hosts in non-editable specs and file-sourced DB settings are not enforced (#2854); see the limitations below |
| `e2e/global-setup.ts`, `e2e/global-teardown.ts` | KEPT. onrender / pages.dev fallbacks removed; the Supabase password grant refuses a non-loopback auth URL. LOOPBACK-ONLY |
| `scripts/run-e2e-local.sh`, `test:e2e:local`, `test:e2e:headed` | **DISABLED** (fail-closed, exit 3, unconditional, after the `--project` check and before any source/env read/external command). No bypass. Follow-up #2854 |
| `scripts/e2e-watch.sh`, `test:e2e:watch`, `test:e2e:watch:slow` | **DISABLED** (fail-closed, exit 3, unconditional, immediately after the LEGACY banner and before any source/env read/external command; sandboxed test + mutation proof). No bypass. Follow-up #2854 |
| `test:e2e:journey`, `test:e2e:full` | KEPT, LEGACY, fenced at config load only (frontend and backend base URLs must be loopback). Limitation, tracked in #2854: a browser login still authenticates against the Supabase the frontend was BUILT with (build-time `VITE_SUPABASE_URL`); the config fence only checks the env vars listed above when they are set in the Playwright process env, and it does not cover hard-coded hosts in spec files (for example the unreachable onrender `BACKEND_BASE_URL` defaults, a hosted Supabase origin used as a `page.route` mock target in three specs, and `backend/.env` DB settings read by `area-overview`/`trends`). This text does not claim that no hosted route exists for journey/full |
| bare `test:e2e` | KEPT: repo-wide search found 18 references (README.md:89, docs/LOCAL_BACKEND_DEV.md:259, spec headers, inventory) so it is not removed |
| `e2e/helpers.ts`, `determinism.ts` relocation | DEFERRED (49 importers incl. files edited by open PR-6 batches) |
| Estate guard `EXPECTED_CONFIGS`, C7 tightening | unchanged / deferred |

## 4. Disclosures

- Spec-level production host literals remain on disk in csv 12 `e2e/broker-agri-listing.spec.ts` and csv 75 `e2e/discover-opensearch-parity.spec.ts` (spec files are not editable in PR-7). Those literals are `?? default` fallbacks of `BACKEND_BASE_URL`, which the config requires to be set and loopback, so they are not reached through the supported path; but the fence is a config-load env check, NOT a runtime request guard, so a hard-coded host in a spec is not otherwise stopped. The full enumerated list (14 onrender defaults, 3 specs with a hosted Supabase origin as a `page.route` mock target, and file-sourced `backend/.env` DB settings in `area-overview`/`trends`) is in the handoff evidence `codex1-f2-env-enumeration.txt`. Disclosed, tracked in #2854.
- `docs/TESTING.md` and `.claude/E2E_GATE.md` (outside the allowed paths) may still describe `run-e2e-local.sh` / `test:e2e:local` as usable; listed as stale in #2854, not edited.
- `playwright.deployed.config.ts` is **hosted-capable by design** and OUTSIDE the legacy fence (it targets the deployed site). Nothing here claims hosted contact is impossible repo-wide.
- Dead code: the body of `scripts/run-e2e-local.sh` below the refusal block (incl. the `SUPABASE_PROJECT_REF` path) is intentionally unreachable and byte-identical; removing the block would re-open it, which the mutation proof covers.
- Displaced coverage: `scripts/dev/tests/port-isolation.test.sh` T3-T6 and T9 (port-override precedence, SERVER_PORT propagation, foreign-port refusal, own-process restart, never-clearing port, pre-flight guard) now assert the wrapper refusal; the original behaviour is dead code and its coverage is restored with the wrapper in #2854. All five were already red at base (no `--project` -> exit 2; evidence `t9-base-cause.txt`, `evidence-port-isolation-at-base.txt`).
- Specs needing an authenticated session (csv 78, 98, 123, 179, 181, 185) are NOT RUNNABLE LOCALLY (hosted password grant banned for kept runners): #2856.
- The offline estate guard cannot verify that a `SCHEDULED(#NNNN)` issue exists; `gh issue view` output for every issue is stored in the handoff evidence.

## 5. Owner questions (raised on the PR; defaults are lane-director planning defaults, not owner rulings)

- OQ1: kept legacy runners are loopback-only and hosted auth is banned. Confirm, or name a local-auth route (non-blocking).
- OQ2: guard allows decision `RETAIN_SPECIALIST` + `SCHEDULED(#issue)` (fail-closed). Confirm.
- OQ3: readiness-only rows csv 59, 99, 183 are MOVE_DOWN + FU-LOWER-C. csv 99 and 183 name a browser property in their evidence but the analysis says only a readiness row is uncovered: owner may name a browser-only property instead.
- OQ5: the 29 `SCHEDULED(PR-6)` rows not covered by open batches stay with PR-6; #2750 cannot close until they are disposed.
- OQ-R43 / R46 / R129 / R145 / R177: extend canonical coverage or rule the uncovered assertions obsolete (#2860). csv 129 / 177: whether a `CANONICAL_GAP_OPEN` token is wanted.
- csv 149: the retained test runs anonymously on a URL-restored polygon; the anon polygon may be unserved (admission risk, #2855).
