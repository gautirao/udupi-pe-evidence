# #1956 / PR-B — Delivery plan (revision 4.2)

**Status: PROPOSED — awaiting user approval.** Terminal state: `USER_RECONCILED_PLAN_APPROVAL_REQUIRED`.

**Structure: Phase 0 → PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6. Count LOCKED at six. Order fixed. No parallel PRs. No seventh #1956 PR without explicit user approval.**

| | |
|---|---|
| Author | orchestrator-8 (mode3-orchestrator) |
| Revision | 4.2, 2026-07-27 — **consolidated**. Revisions 4 and 4.1 were layered as superseding preambles over stale text; this revision physically rewrites the operative sections so there is exactly one source of truth. There is no "§00 supersedes the body" pattern anywhere in this document. |
| Companion | `final-mock-reconciliation.md` — evidence trail for the final design prototype. `team-lead-plan-pr-b.toml` — machine-checkable mirror, `plan_version = 7`. |
| Actions taken | **none.** No production code, no design-prototype edits, no branch, no commit, no push, no PR, no `/mode3-run`, no PLAN_REVIEW submission. |

---

## 1. The eight invariants

Restated verbatim in **every** PR description and checked by `code-reviewer` on every PR.

1. **No third public CLUSTER level.** Valid shapes are only `City → Direction → AREA` and `City → Direction → Local Destination → AREA`.
2. **Legacy remains the default until PR 6.**
3. **Visual AREA clusters never change `node=`, breadcrumb or history.**
4. **Map and panel share identities, members and totals.**
5. **Filters never reshape Direction or Local-Destination geography.** Counts may change; identity, position, parentage and names may not.
6. **Only the final AREA browse presentation excludes zero-content areas.**
7. **#2015 and #2016-#2021 remain out of scope**, along with #2012, #1960, Agricultural, the full Schools journey, card/detail redesign, graph DB and a second live city.
8. **The #1956 AREA surface must NOT render or implement AREA_SET / result-scope chip rows, `Edit areas`, `Clear selected areas`, `Add nearby areas`, `Draw search area`, `Search this area`, or `Create alert`.** The #1956 AREA panel owns only: the selected single canonical AREA · listing results · existing filters · listing markers and cards · listing peek/detail · the existing Schools shortcut. It does not own the future general result-scope framework.

---

## 2. Locked contracts

### 2.1 Engineering preview gate (dual)

```text
deployment preview capability ENABLED  AND  areasPreview=1   →  mount the new Areas journey
anything else                                                →  the complete legacy Areas journey
PR 6                                                         →  gate removed, new journey becomes default
```

The gate controls **journey mounting only** and is **independent of `node=`** — direct search and canonical deep links legitimately produce a `node=` while the journey is incomplete, so a `node=`-sensitive mount gate would expose partial work to shoppers. In normal production the capability is disabled, so `areasPreview=1` alone has no effect. The parameter must survive preview navigation and refresh, must never be written by an ordinary production interaction, must never appear in a canonical share URL, and is deleted in PR 6. Phase 0 records the exact config key and the single owning parser module.

### 2.2 Names and count copy, by level

| | Direction / Local Destination (structural) | Visual AREA cluster (presentational) |
|---|---|---|
| Names | **Stable canonical** representative names. Do **not** change with filters. | Chosen **only from visible members**, by a deterministic ranking. |
| Identity / position / parentage | Filter-invariant. | Ephemeral — not expected to survive zoom, viewport, filter or membership changes. |
| Count copy | **`N areas with matches`** | `hiddenCount > 0` → **`+N areas with matches`**; `hiddenCount == 0` → **`N areas with matches`** |
| `+N` form | **Never used.** A `+N` implies the displayed names are themselves matching members, which stable canonical labels do not guarantee. | Used when, and only when, members exceed displayed representatives. |
| Zero-match copy | **`No matches with current filters`** — locked literal. | n/a |

**Arithmetic, locked:** `hiddenCount = visibleMemberCount − displayedRepresentativeCount`. **Never emit `+0`.** Required examples, both tested: visible 5 / displayed 2 → `+3 areas with matches`; visible 2 / displayed 2 → `2 areas with matches`.

> **Correction of an earlier error in this plan.** Revision 4.1 withdrew the literal `No matches with current filters` on the strength of a browser observation. That observation (`"No matching listings in your 3 selected areas"` / *"Your search is kept exactly as it is…"*) was made on the storyboard's **Zero results** tab, which is the **multi-area / AREA_SET recovery state owned by #2018** — the walk explicitly could not reach a structural Direction/Local-Destination zero-match, because filters exist only at the area/listings level. Conflating the two states was the error. The originally approved structural literal is **restored and locked**.

### 2.3 Zero-match and zero-content, by level

| Level | Behaviour |
|---|---|
| Direction / Local Destination | Remains **visible, in canonical position, with stable parentage and stable names**. Renders `No matches with current filters`. **Never hidden, removed or re-parented.** |
| Final AREA browse presentation | Areas journey includes members with `eligibleListingCount > 0`; Schools presentation includes members with `eligibleSchoolCount > 0`. Zero-content members are excluded from browse clusters and from `+N`. |
| Zero-content AREA reached directly | Still resolvable by canonical URL or explicit search, rendering a normal empty state. |
| Zero listings after filtering inside an AREA | Existing empty state preserved. |

Zero-**result recovery** (nearby alternatives, filter relaxation, alerts) is **#2018**, not #1956.

### 2.4 Count-filter parity — DECIDED

**Locked: all counts displayed as "matches" use every currently active applicable property filter.**

Rationale for the preferred option over the labelling alternative: `DiscoverListingPredicateBuilder` already supports the wider filter surface for cards and markers, so the predicate logic exists; `AreaCountQuery` simply carries a narrower field set, and extending it is a modest, well-bounded backend change rather than new machinery. The alternative — labelling hierarchy counts as purpose/property-type-only — would mean a count captioned "matches" that does not reflect the shopper's active filters, which is exactly the kind of quietly-wrong number this plan exists to prevent.

**Consequence, written into PR 1's ACs and the count-endpoint contract:** `AreaCountQuery` is extended to carry the same normalised filter model that cards and markers use, for the applicable subset. A count labelled "matches" must never overstate relative to the results it advertises. Where a filter is not applicable at a level it is simply absent from that level's query — never silently ignored while still claiming "matches".

### 2.5 School-count contract

> **`schoolCount` = the number of distinct schools physically located inside the represented canonical area, or inside the represented member areas.**

- Deduplicate using **stable school identity**; aggregate **distinct** schools across member areas.
- **"Serving an area" is NOT "located inside an area"** and is not adopted. **No** radius, catchment, travel-time, admission or quality semantics.
- **No** school board/level filters on the #1956 navigation-count endpoint unless Phase 0 finds an existing in-scope consumer that already requires them.
- School counts are **secondary metadata**. The full Schools-first radius journey is **outside #1956** (owned by #1954 — §18).
- **Levels that receive school counts, exhaustive:** Direction · Local Destination · visual AREA cluster · individual AREA · the selected shared-marker variants of those. Nowhere else.

**Display ordering — locked by product-owner ruling ([#1956 comment 5094909370](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094909370)):**

| Journey | Ordering |
|---|---|
| **Areas-first** | **Listing count is primary; `schoolCount` is optional secondary metadata.** |
| **Schools-first** | **Preserve the already-delivered #1954 behaviour and the current #2014 marker contract. #1956 does not redesign field ordering there.** |

The final mock's school-count-**primary** marker ordering (school count primary, listings secondary, caption "View schools") is **explicitly not adopted by #1956**. It is recorded as a **non-blocking Schools design follow-up, not owned by #1956** — see §18.

### 2.6 Authoritative result identity, by level

| Level | One identity owns |
|---|---|
| Hierarchy / navigation | **One count-response identity** owns map destination counts and panel destination counts. |
| AREA listing | **One listing-query result identity** owns cards, listing markers and the total. |

Do not redesign the listing-results API in PR 1, and do not drift into #2016.

### 2.7 Stale-response protection

A request fingerprint over `(node, filters, request parameters)` causes stale count responses to be ignored or cancelled. Required cases: a filter-A response arriving after filter B was applied is ignored; navigation changing before an earlier response returns discards it; map and panel update **atomically from the same response**.

### 2.8 Cache consistency tolerance — DEFINED

| Question | Locked answer |
|---|---|
| Accepted maximum discrepancy window | **60 s worst case** — 30 s application count cache plus 30 s shared HTTP cache, additive. `PROVISIONAL_MVP_BUDGET_REQUIRES_USER_APPROVAL` |
| Does navigating to an AREA force a fresh count? | **No** — and it does not need to. The AREA listing view's total is owned by the **listing-query result identity** (§2.6), never by the hierarchy count cache. The two numbers are never displayed side by side for the same scope, so the inconsistency is removed structurally rather than by cache-busting. |
| Must count and listing cache freshness be compatible? | **Yes, and the rule is directional: count freshness ≤ listing freshness**, so a count is never staler than the results it advertises. Already satisfied — counts `max-age=30`, public listings `max-age=60` per #1248. Any future change must preserve the inequality. |
| What if a listing total differs from a displayed count? | Cannot arise for one scope by construction (row 2). If it ever does, the **listing-query total wins** and the count is not re-displayed in that view. |
| Do Gate 3 tests run warm and cold? | **Yes, both**, explicitly, in PR 6 (AC6.15). |

### 2.9 Performance budgets never change shopper semantics — RULE

> **A breached performance budget causes optimisation, a budget review, or a blocking verdict. It never authorises truncation or altered shopper semantics.**

A breach must **never** justify: truncating canonical children · dropping AREA markers · omitting counts · replacing real destinations with a "top N" · changing the hierarchy to fit a payload size · delaying or hiding a feature to hit a request-count budget. If a budget cannot be met without changing what the shopper sees, the budget is wrong or the implementation needs optimising — the product contract does not bend.

### 2.10 Legacy-default equivalence wording

Wherever the legacy default must be shown unchanged, the criterion is all six of: functionally equivalent · visually equivalent at 1366×768 and 390×844 · identical routing outcome · same selectable destinations · same filters and listing behaviour · no material visual regression. Byte or binary equality is **not** an acceptance criterion.

---

## 3. Repository state (VERIFIED)

| Fact | Evidence |
|---|---|
| `main` = `c13dc017` "Chore/design update v3 (#2022)" | `git log` |
| That commit is **33 files, 100% under `docs/design/`** — zero production, zero backend | enumerated; non-design count = 0 |
| Baseline therefore **not stale**: tsc 20 errors on branch vs 21 pre-existing on clean main (no net-new); targeted Vitest 1187 passed / 0 failed / 3 skipped; `vite build` succeeds | the design commit cannot affect application code |
| Salvage branch `issue-1956-pr-b-frontend-areas-journey` — ahead 3, behind 1 (the design commit only); checkpoint D's 44 tracked + 12 untracked changes intact | `git status`; nothing reset, cleaned or rebased |
| **On `main`, `DiscoverRightPanelContainer.tsx` is 484 lines with no `DiscoverAreasJourneyPanel`, no `area-groups-landing` case and no area-first gate** | `git grep` (exit 1 on all three) |
| **On `main`, `DiscoverRightPanel.tsx` has four live `<AreaGroupsLandingPanel>` render sites (1406, 1442, 1484, 1516) and `macroRegionResolver` is a live import at line 616** | `git grep -n` |

**Consequences.** PR 1 **introduces** a journey that does not exist on `main` rather than narrowing an existing gate — which is why the dual preview gate is required. No legacy deletion may occur before PR 6, because `macroRegionResolver` is a live typed import on `main`. And PR 1's "restoration" of `AreaGroup*Panel` is, against `main`, simply *not deleting*.

### 3.1 The backend read boundary already exists

| Artefact | Status |
|---|---|
| `AreaCountProvider` (interface) | **SHIPPED** by #1955 PR A slice 2e AC12 |
| `PostgresAreaCountProvider` | **SHIPPED** — one `GROUP BY area_key` per (city, filter context) |
| `OpenSearchAreaCountProvider` | **SHIPPED as a deliberate loud-failing stub** — throws `UnsupportedOperationException` so a flag flip fails loudly rather than reading as "every area has zero listings" (verified by direct read) |
| `AreaCountRollupService` count cache | **SHIPPED** — Caffeine, key `(citySlug, revisionId, normalizedFilterHash)`, TTL 30 s, max size 500 |
| Port/adapter convention | **ESTABLISHED** by #1317 (`DiscoverListingsPort`, `DiscoverMarkersPort`) and #1745 P5 (`DiscoverSummaryPort`) |
| Toggle | `discover.opensearch.enabled`, default `false` repo-wide |

**#1956 must not invent a read abstraction.** What is genuinely missing and belongs to PR 1: exposing the per-area map in `NavigationCountsResponse` (today `{nodeKey, count, children[], revisionId}`), per-area **school** counts, the §2.4 filter extension, and input-validation hardening.

### 3.2 Legacy URL parameter ownership

Only **`node`** is Areas-exclusive. `region` is agricultural-only; `scope` serves the residential axis and `resolveScope`; `groupId` is consumed by school-first level 2; `areaKey` is consumed by school-first hybrid **and** by three area-guide producers. **PR 6 deletes Areas-exclusive code only.** Verified producers at risk if unmigrated: `AreaCtaBlock.tsx:19`, `AreaGuide.tsx:96`, `AreaGuideHero.tsx:87` — each would render a blank panel.

### 3.3 Canonical `node=` source for legacy producers

A supported source **already exists**: `GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path` (`NavigationController` ~122-145) returns the canonical node key plus full ancestry, built server-side via `NavigationKeys.areaNodeKey(areaKey)`. The frontend already wraps it (`useDiscoverAreaNavigationPath.ts`), and `useAreaSearchConvergence.ts` already converges direct search onto a server-resolved nodeKey.

**Binding rule: the frontend must not construct node keys itself.** The formula happens to be `"a:" + areaKey` — hardcoding that client-side is the guessed-template antipattern that produced the `macroRegionResolver` problem. Producers resolve through the endpoint.

| Producer | Current input | nodeKey source | New URL | Cold load | Stale node | Test |
|---|---|---|---|---|---|---|
| `AreaCtaBlock.tsx:19` | `areaKey` prop | `navigation-path` endpoint | `/discover?city=…&node=…` | ancestry from the same response | nearest-valid-ancestor → city root + notice | unit: emits `node=`, never `areaKey=`; E2E lands at the correct AREA |
| `AreaGuide.tsx:96` | `areaKey` prop | same | same | same | same | same |
| `AreaGuideHero.tsx:87` | `areaKey` prop | same | same | same | same | same |
| Direct area search | search selection | `useAreaSearchConvergence` | same | already converges | same | existing convergence tests extended |
| E2E deep links | hardcoded `areaKey` | fixture-mapped nodeKey | same | n/a | n/a | specs migrated |

Producer migration → **PR 2**. E2E deep-link migration → **PR 6**. No new backend work, so no PR-count change. A compatibility shim is **not** recommended: the product is pre-launch and #1956 s18 requires no legacy URL compatibility period.

---

## 4. Contract state (VERIFIED)

No comment on #1956, #2014, #2015, #2016, #2017, #2018, #2019, #2020, #2021 or #2012 is dated 2026-07-27 or later; the newest is `2026-07-26T21:42:45Z`. **Nothing has moved into or out of #1956.** #2015 now depends on #2016 and must use its `VIEWPORT` state. #2016-#2019 gained #2020 design gates. #2020's comment states the new design/research track *"does not reopen or pause the already-locked #1956 implementation contract"*. #2012 remains explicitly not a dependency.

---

## 5. Phase 0 — validation gate (no PR)

**Not a PR.** No branch, no code change, no merge. Produces written verdicts and evidence only.

**Deliverables**

1. Promoted-hierarchy conformance for the real promoted Bangalore revision.
2. Maximum city-root breadth (≤ 5) and Local-Destination breadth per Direction (≤ 6); one-child clusters flagged.
3. Proof that no public path contains a third CLUSTER level.
4. Maximum direct AREA child count under any valid final parent.
5. The exact public typed request/response contract for the count boundary, **including the §2.4 filter extension**.
6. **Existing listing-count capability exercised** against the promoted revision (runtime-checkable — `PostgresAreaCountProvider` is already shipped).
7. **Existing school data source and school-to-area identity relationship identified** — which table/column, and whether 1:1, 1:N or N:M.
8. **A representative school-count query / query-plan feasibility check.**
9. **The exact proposed typed school-count response contract.**
10. **Proof that stable school IDs and canonical area keys exist** for deduplication.
11. **Confirmation the proposed school-count query can be implemented without N+1.**
12. Index / query-plan evidence for the per-area filtered count.
13. The complete legacy URL producer/consumer ledger for `areaKey`, `groupId`, `scope`, `region`, `node`.
14. The exact preview config key and the owning parser module.
15. Baseline (typecheck, batched Vitest, build) and the salvage ledger.
16. Provenance of the two carried defects (absent anon leaf markers; failing `listing=` peek) — do they reproduce on `main`?
17. Resolution of node `c:blr-metro:in-ka-bengaluru-kudlu-gate-in-ka-bengaluru-singasandra` as CONFORMANT or INVALID.
18. ~~Obtain product rulings F-1 and F-5.~~ **Already resolved before Phase 0 begins** — both rulings are locked in §17 and carry their #1956 comment URLs. Phase 0 **consumes** them; it does not wait on them.

> **Phase 0 must not require runtime evidence for production code PR 1 has not built yet.** Items 7-11 are **feasibility** checks; PR 1 owns the implementation of school counts and all of its runtime evidence.

**Outcomes — exactly one**

| Outcome | When | Effect |
|---|---|---|
| `READY_FOR_IMPLEMENTATION` | items 1, 2, 3, 4, 6 and 12 positively evidenced **against a running backend** | PR 1 may start |
| `BLOCKED_BY_INVALID_PROMOTED_HIERARCHY` | the tree violates the contract | **Stop.** Remedy is upstream and is a user scope decision; frontend flattening is forbidden so no in-scope workaround exists |
| `BLOCKED_BY_MISSING_RUNTIME_EVIDENCE` | any of those six could not be exercised | **Stop.** Do not return READY with a caveat; obtain a running backend (`./scripts/dev/local-fixture-backend.sh`) and re-run |

**Routing:** `qa-fast` → `explorer-planner` → `backend-engineer` (read-only, count contract + query plan) → **`performance-analyst`** (read-only review; outputs the current-path diagram, cache inventory, query-plan baseline, response-size baseline, provisional budgets, OpenSearch seam assessment, and an `APPROVE` / `APPROVE_WITH_LIMITS` / `REQUEST_CHANGES` verdict) → `architect` **only** if the tree is invalid or the count boundary cannot meet §2.4. No implementation specialist writes production code in Phase 0.

---

## 6. PR 1 — Safe preview seam and canonical Areas foundation

1. **Position:** 1 of 6.
2. **Title:** `feat(discover/areas): preview-gated canonical Areas foundation with per-area counts and journey-aware visibility`
3. **Shopper outcome:** **None.** Every ordinary entry point still reaches the complete legacy journey. Behind the dual preview gate the canonical `node=` state, the typed destination model and all count/visibility arithmetic exist and are testable. No net-new UI.
4. **Slices:** Slice 1 (validators + typed model, minus Phase-0 investigation) + Slice 2 part A + the shared arithmetic substrate + the backend count-boundary gaps.
5. **Bounded source areas.**
   *Backend:* `NavigationController.java` (expose the per-area map; plumb school counts; **extend filter handling per §2.4**; tighten validation ~584-598), `NavigationCountsResponse.java` (per-area map + optional school counts), `AreaCountRollupService.java` (surface what it already computes), `AreaCountQuery.java` (**§2.4 filter extension**, plus the school-count dimension **or** a separate school-count query type — see field 12), a new school-count provider alongside `PostgresAreaCountProvider.java`, a new Testcontainers IT in the existing navigation IT package, and a narrow extension to `scripts/run_explain_harness.py` (one `QueryDef`, QP-6).
   *Frontend seam:* `DiscoverRightPanelContainer.tsx` (build the dual gate; **retain** the legacy branches), `DiscoverRightPanel.tsx` (**retain** the two legacy `panelContent` branches), the new preview-capability parser module (single owner).
   *Frontend state/model:* `state/url/navigation.ts`, `area.ts`, `city.ts`; `useDiscoverUrlState.ts`; `useDiscoverJourneyTransitions.ts`; `useDiscoverCameraOrchestration.ts`; `navigation/types.ts`, `navigationModel.ts`, `nodeLevelKind.ts`; `useDiscoverNavigationCounts.ts` (per-area map + §2.7 fingerprint); new `navigation/areasDestination.ts`, `navigation/journeyVisibility.ts`, `navigation/nearbyAreaArithmetic.ts`; `useDiscoverMapPresentation.ts` + `useDiscoverMapData.ts` (one shared visible-member set); extend `staticSweep.test.ts`.
6. **KEEP / REWORK / REMOVE / MOVE_TO_FOLLOW_UP / NEW.**
   **KEEP** `normalize.ts`, `useAreaSearchConvergence.ts`, `useDiscoverNavigationNode.ts` (incl. the 404-no-retry fix), `useDiscoverAreaNavigationPath.ts`, `staticSweep.test.ts`, the sole-`node=` point, the `rawNodeParam` mount gate, the `area.ts` double-push guard, `NavigationResolutionNotice.tsx`.
   **KEEP+ADD** `types.ts`, `navigationModel.ts`, `nodeLevelKind.ts` (detect-and-report layer for an invalid tree; keep depth-generic dispatch), `useDiscoverNavigationCounts.ts`, `useDiscoverMapPresentation.ts`, `useDiscoverMapData.ts`.
   **REWORK** `navigationModel.test.ts`, `nodeLevelKind.test.ts` (retire the depth-5/8 "valid capability" cases), `DiscoverRightPanelContainer.tsx`.
   **RETAIN — do not delete** the three `AreaGroup*Panel` files, their four tests, `DiscoverRightPanel.tsx`'s legacy branches, `macroRegionResolver.ts` **and its behaviour coverage**, and `groupRegionLabel.ts` in place. `macroRegionResolverDeleted.test.ts` is **not active** in PR 1 (it asserts a file PR 1 deliberately keeps); `staticSweep` assertions are audited individually rather than the file being disabled wholesale. All of this moves to PR 6.
   **NEW** the dual preview gate, the parser module, the three arithmetic modules, the backend school-count provider, the QP-6 harness extension.
   **REMOVE** nothing. **MOVE_TO_FOLLOW_UP** nothing.
7. **Backend/frontend contract changes.** `NavigationCountsResponse` gains a per-area map and optional per-area school counts. `AreaCountQuery` gains the §2.4 applicable-filter fields. No new provider interface, no new cache, no new port (§3.1).
8. **Dependencies / base:** Phase 0 returns `READY_FOR_IMPLEMENTATION`. Branch from freshly merged `main`. The salvage worktree stays read-only as the salvage source.
9. **Acceptance criteria.**
   - **AC1.1** With the preview capability disabled, each entry point renders the legacy journey per §2.10, asserted individually: plain `?city=X&journey=area-first`; direct area search; `?areaKey=` deep links from the three producers; journey-less `?groupId=`; **and `node=` present**.
   - **AC1.2** The new journey mounts **only** when the capability is enabled **and** `areasPreview=1`; with the capability disabled the parameter alone has no effect.
   - **AC1.3** `areasPreview=1` survives preview navigation and refresh; is never written by an ordinary interaction; never appears in a canonical share URL.
   - **AC1.4** `node=` is the sole Areas hierarchy identity inside preview; no Areas path reads or writes `groupId`/`region`/`areaKey`/`scope` as hierarchy identity.
   - **AC1.5** Stale-node ladder (nearest-valid-ancestor → city root) fires with a non-blocking notice.
   - **AC1.6** An invalid third-CLUSTER tree is **reported**, never silently flattened.
   - **AC1.7** **Visual AREA clusters only:** names are selected from **visible** members by a deterministic ranking; `hiddenCount = visibleMemberCount − displayedRepresentativeCount`; `hiddenCount > 0` renders `+N areas with matches`; `hiddenCount == 0` renders `N areas with matches`; **`+0` is never emitted**. Both worked examples pass.
   - **AC1.8** **Direction and Local Destination:** names are **stable canonical** and do not change with filters; identity, parentage and position are provably filter-invariant; the count renders `N areas with matches`, or `No matches with current filters` when zero; **no `+N` form is used at these levels**.
   - **AC1.9** Journey-aware visibility applies to **final AREA presentation only**: Areas uses `eligibleListingCount > 0`, Schools uses `eligibleSchoolCount > 0`.
   - **AC1.10** Dedup: areas by `area_key`, listings by canonical listing identity, schools by stable school identity. Totals are **server-computed**. Distinct schools are aggregated across a cluster's member areas.
   - **AC1.11** **One HTTP request per view** for counts, asserted by request count; server-internal deterministic batching permitted; no N+1.
   - **AC1.12** One **count-response identity** owns both map and panel destination counts (§2.6). The listing identity is seamed but not redesigned.
   - **AC1.13** The §2.7 fingerprint causes stale count responses to be ignored or cancelled; all three cases pass; map and panel update atomically from the same response.
   - **AC1.14** No net-new UI.
   - **AC1.15 (security — node/filter/cache review).** The endpoint is keyed by **city (path) + canonical nodeKey (path) + normalised filter query params and accepts no submitted area-key list.** Verified: the `nodeKey` belongs to the path city · stale/unknown node behaviour is defined and leaks nothing · filter values are allowlisted (`listingPurpose` already is; **`propertyType` must be allowlisted and case-normalised**) · filter length and value bounds are enforced · response size is bounded · **cache-key cardinality is bounded and equivalent filter forms are normalised before key construction** · query-cost abuse is bounded by the cached single aggregate · the **existing** rate-limit posture is inspected and recorded (no global public-API rate-limit policy exists today, so any limiter here would be new work and must be an explicit decision, not an assumption) · public/private exposure is unchanged · the precise-vs-coarsened count policy for anonymous callers is stated · malformed canonical identity is rejected cleanly · cache poisoning via unnormalised filter variants is prevented.
   - **AC1.16 (§2.4).** Every count displayed as "matches" reflects all currently active applicable property filters. A "matches" count never overstates relative to the results it advertises.
   - **AC1.17 (§2.8).** Count cache freshness ≤ listing cache freshness is asserted; the accepted discrepancy window is documented in the PR evidence.
10. **Tests.** *Unit:* visibility predicates; `+N` property tests (`visible − displayed`, never negative, **never `+0`**); structural levels never render a `+N`; structural zero renders `No matches with current filters`; deterministic representative ranking; three dedup identities; **distinct-school aggregation across a cluster's member areas**; stale-response fingerprint (all three cases); validators (max-5, max-6, third-CLUSTER, one-child); stale-node ladder; **preview dual-gate truth table across all five entry points × capability on/off**. *Integration (Testcontainers):* per-area map correctness; school-count `DISTINCT` aggregation over the locked *located-inside* model; **§2.4 filter parity between counts and the cards/markers predicate**; one-query/no-N+1; cache-key normalisation. *E2E:* legacy default unchanged at every entry point; preview-enabled mount. *Visual:* legacy baselines at both locked viewports.
11. **Real-browser evidence.** Legacy default before/after at each entry point (equivalent per §2.10); one preview-enabled capture; a network capture proving one count request per view; an `EXPLAIN`/query-plan capture via the **existing** `scripts/run_explain_harness.py` (QP-6 extension).
12. **Routing.** `qa-fast` → `architect` (confirm §2.4's extension shape and decide **whether school counts extend `AreaCountQuery` or get a separate school-count query type** — a separate type is likely cleaner because `AreaCountQuery` is deliberately narrow) → **`backend-engineer`** → `frontend-engineer` → `code-reviewer` → **`security-reviewer`** (AC1.15) → **`performance-analyst`** (count-query plan, count cache, response size, request count, stale-response protection, school-count aggregation, cache-key cardinality, index migration if any) → `qa`.
13. **Risk: High** — largest PR, spans backend and frontend, owns the arithmetic everything downstream trusts.
14. **Risk mitigation.** The arithmetic lands as **pure functions with property-based tests and a real-data reconciliation before any pixel consumes it**. AC1.1 is a hard per-entry-point regression gate. The backend change is **additive to an existing endpoint**, not a new stack.
15. **Rollback boundary.** The preview gate plus additive modules and additive response fields; the legacy path is retained and default, so revert is safe in both directions.
16. **Forbidden scope.** No net-new UI · **no legacy-Areas deletion** · no clustering geometry · no breadcrumb/Back/history work · **no `?areaKeys=` transport redesign (owned by #2016)** · no #2015 · no #2012 cache redesign · **invariant 8**.
17. **Follow-up seams.** The OpenSearch counts seam already exists (§3.1) — record against it, add nothing. Two #1251 ADR amendments recorded in §14.8.
18. **Definition of ready for PR 2.** AC1.1 green at every entry point; the dual-gate truth table green; all arithmetic, dedup, filter-parity and stale-response tests green; the one-request assertion and query plan attached; count reconciliation attached; the convergence comparison harness in place so PR 6's AC6.1 has a data series.

---

## 7. PR 2 — Complete desktop shallow navigation

1. **Position:** 2 of 6.
2. **Title:** `feat(discover/areas): complete desktop shallow Direction navigation with breadcrumb, hierarchy Back and history`
3. **Shopper outcome:** Behind preview — city root shows 3-5 Direction destinations with **stable canonical** names; a Direction shows at most six Local Destinations or goes straight to AREA children; breadcrumb, one-parent-at-a-time hierarchy Back and correct browser history all work.
4. **Slices:** 3 and 5.
5. **Bounded source areas.** `NavigationChildCard.tsx`; `NavigationLevelPanel.tsx`; `DiscoverAreasJourneyPanel.tsx`; `useAreasNavigationJourney.ts`; the map destination-card renderer; `DiscoverMapBreadcrumb.tsx`, `DiscoverMapContextOverlay.tsx`, `AreasBreadcrumbTrail.tsx` and their tests; the new visible hierarchy Back control; `useDiscoverUrlState.ac8HistoryDepth.test.ts`; **the three legacy producers plus direct-search convergence (§3.3)**.
6. **KEEP / REWORK / REMOVE / NEW.** **REWORK** the five navigation/panel files and the three breadcrumb/overlay files with their tests; **rework the three producers to emit `node=` via the existing `navigation-path` endpoint**. **REMOVE** `useCollapsedBreadcrumbTrail.ts` and `DiscoverMapBreadcrumb.ellipsisShrinkFloor.test.tsx` — dead by construction at the 4-item cap (`headCount` 2-or-3, `COMPACT_TAIL_COUNT` 2, so `hiddenCount` is always 0 and the ellipsis can never render). Both currently **pass**; they go because the apparatus is unreachable, not because they fail. **KEEP** the routing seam, `NavigationChildList.tsx`, `useDiscoverCameraOrchestration.ts`, `MapDiscovery.tsx` (preserve the PR #2011 ownership foundation), `useAreaSearchConvergence.ts`, the double-push guard, `NavigationResolutionNotice.tsx`. **KEEP+ADD** `ac8HistoryDepth.test.ts` (cold-deep-link REPLACE case; no-history-for-camera/pan/Map-List cases; close the same-tick batching gap). **No legacy deletion.**
7. **Contract changes.** None backend. Frontend: producers switch from `areaKey=` to `node=`.
8. **Dependencies / base:** after PR 1, from freshly merged `main`. No parallel work.
9. **Acceptance criteria.** City root renders 3-5 Directions with **no** whole-city intermediate marker · primary labels are one or two **stable canonical** area names · position conveys direction · panel headings name the direction and share the map's `node_key` and counts · max six Local Destinations · no `North of North` wording · no third CLUSTER · sparse paths do not fabricate a Local Destination · map click and panel click dispatch the same action · **a zero-match Direction renders `No matches with current filters`, keeps its canonical position and parentage, keeps its stable names, and is never hidden or re-parented** · **no `+N` form renders at structural levels** · breadcrumb max is `City › Direction › Local Destination › Area` and visual clusters are never crumbs · every ancestor restores its direct children and authoritative bounds with exactly **one** CameraIntent fit · hierarchy Back moves exactly one canonical parent, works on cold deep links, is hidden/disabled at city root, and is never `history.back()`/`navigate(-1)` · browser Back/Forward restores committed states without loops or duplicate entries · camera fits, pan/zoom and Map/List switches create no history entries · direct-search convergence agrees with guided ancestry · **the three producers emit `node=` and never `areaKey=`, and never construct a node key client-side** · the complete breadcrumb renders at 390×844 without clipping and with every crumb reachable.
10. **Tests.** *Unit:* root direct children with no city-total marker; stable-canonical-name rendering and directional position; max-5/max-6 guards; **structural zero-match copy and position stability**; **a static assertion that no `+N` string is produced at structural levels**; shared selection action; complete breadcrumb and ancestor actions; canonical-parent Back incl. cold load; push/replace/loop prevention; CameraIntent one-fit and stale-debounce race; **producer URL emission**. *Integration:* map/panel identity by `node_key`; atomic map/panel/breadcrumb/URL update with no stale child state. *E2E:* both valid path shapes; all four Back-control scenarios; refresh/Back/Forward at every committed depth; direct search converges with guided; **each producer's deep link lands at the correct AREA**. *Visual:* 1366×768 city root and Direction-selected; breadcrumb with long labels at both viewports.
11. **Real-browser evidence.** Desktop 1366×768 captures; side-by-side against the frozen mock for card composition; a captured pair showing map and panel sharing `node_key` and counts; hierarchy-Back and browser-Back/Forward traces; a cold-deep-link Back reaching the canonical parent with no prior history; **a mandatory cheap 390×844 smoke check**. Component tests are not sufficient for composition, position or geometry claims. **The mock's in-memory history and its hardcoded-reset-to-city-root Back defect are not the target behaviour and must not be replicated** — state this explicitly in the evidence so a reviewer cannot mistake mock parity for correctness.
12. **Routing.** `qa-fast` → `frontend-engineer` → `code-reviewer` → `ui-designer` (composition vs frozen mock) → `qa` (e2e-authoring) → `qa` (verification).
13. **Risk: High.** Table in §8.
14. **Mitigation.** §8.
15. **Rollback boundary.** Navigation UI plus breadcrumb/Back/history; reverting restores PR 1's state; the legacy default is untouched either way.
16. **Forbidden scope.** No visual AREA clustering (PR 3) · **no legacy deletion** · no mobile polish · no #2015 · no invented corridor labels · do not resurrect the collapse apparatus or the depth-8 spec · **invariant 8**.
17. **Follow-up seams.** None new.
18. **Definition of ready for PR 3.** Both valid shapes navigable in a real browser; breadth guards and structural zero-match copy green; all four Back scenarios green with exact push/replace counts; producers emitting `node=`; map/panel identity evidence attached; 390×844 smoke clean.

---

## 8. PR 2 risk table

| # | Risk | Mitigation | Detection gate |
|---|---|---|---|
| 2.1 | Incorrect Direction / Local-Destination identity | identity only from stable `node_key`; extend `staticSweep.test.ts` to forbid label-to-slug derivation | static sweep + reviewer brief |
| 2.2 | Map / panel divergence | one shared direct-child collection and one shared selection action, both from PR 1's model instance and its single count-response identity | integration test asserting identical `node_key` and counts; captured browser pair |
| 2.3 | Excessive root or child breadth | budgets asserted as guards that **report**; over-budget data surfaces as a Phase 0 / validator error, not a crowded map | max-5/max-6 tests; Phase 0 breadth histogram |
| 2.4 | Mechanical or invented labels | primary label is one or two **stable canonical** area names; compass words only as secondary metadata | label-composition test + `ui-designer` review |
| 2.5 | Incorrect authoritative bounds | always fit to the node's own bounds; never derive from child centroids; null-bounds root must not throw | one-fit CameraIntent test + null-bounds case |
| 2.6 | Camera races | single CameraIntent owner; exactly one direct fit per selection; retain the D-1 WeakSet fix | one-fit-per-node test with repeated re-renders; live check, one clean throttled tab, three repeats |
| 2.7 | Regression of direct area search | keep `useAreaSearchConvergence` unchanged; assert guided and direct-search ancestry agree | convergence unit tests + E2E |
| 2.8 | Incomplete promoted hierarchy | `FlatAreaFallbackPanel` covers the no-hierarchy city honestly; a zero-match Direction renders `No matches with current filters`, keeps position, and is never a dead card | structural zero-match copy + position-stability test |
| 2.9 | History loops / Back regressing to `history.back()` | push/replace instrumentation extended to cold-deep-link REPLACE and camera/pan/Map-List no-entry cases; static sweep forbidding `history.back()`/`navigate(-1)` in Areas code; close the same-tick gap | exact push/replace counts; all four Back-control E2E scenarios |
| 2.10 | Breadcrumb clipping at 390×844 | per-crumb truncation rather than trail collapse | 390×844 capture with genuinely long canonical names |
| 2.11 | A producer constructs a node key client-side | binding rule §3.3; producers resolve through the existing endpoint | static sweep forbidding an `"a:"`-prefix template in frontend code |

---

## 9. PR 3 — Visual AREA clustering and single-AREA selection

1. **Position:** 3 of 6.
2. **Title:** `feat(discover/areas): zoom-aware visual AREA clustering and single-AREA selection`
3. **Shopper outcome:** Behind preview — crowded AREA markers group visually with representative names drawn from visible members, the §2.2 count copy, listing and optional school counts and `Tap to zoom`; tapping zooms and focuses the panel subset with an explanation, without touching hierarchy state; `Show all areas` restores everything; at comfortable zoom a single AREA marker simplifies.
4. **Slices:** 4.
5. **Bounded source areas.** New visual clustering module (zoom-aware / screen-space grouping over the parent's direct AREA children); new `Show all areas` / `Reset area view` control; `NavigationChildCard.tsx` (multi-area vs single-AREA variants); `DiscoverAreasJourneyPanel.tsx` (focused panel subset, explanation, stale-focus reconciliation); `useDiscoverMapData.ts` / `useDiscoverMapPresentation.ts` (consume PR 1's shared visible set); area-cluster styling distinct from listing clusters. **Also: scope the marker feed at Direction / Local Destination to direct children / journey-visible members rather than aggregated `descendantAreaKeys`** — a correctness change, not a transport change.
6. **KEEP / REWORK / REMOVE / NEW.** **KEEP** `resolveMarkerListings.ts` + `resolveMarkerPopover.ts` (the `isNavigationAreaLeaf` double-gate), `PropertyMap.tsx` (D-1 camera mount-race fix). **KEEP+ADD** the two presentation hooks. **REWORK** `DiscoverAreasJourneyPanel.tsx`, `NavigationChildCard.tsx`. **NEW** clustering module, reset control, panel-subset explanation. **REMOVE** nothing. **No legacy deletion.**
7. **Contract changes.** None backend.
8. **Dependencies / base:** after PR 2, from freshly merged `main`. No parallel work.
9. **Acceptance criteria.** Membership only from the parent's direct AREA children · **filtering before clustering** · explicit stable `area_key` membership with no label parsing · **deterministic output for identical input/viewport/zoom** · zoom-aware / screen-space grouping (or a documented justified alternative) · **deterministic representative-name ranking** · **cluster identity is presentation-only and ephemeral — explicitly not expected to survive zoom, viewport, filter or membership changes** · **no `node=` / breadcrumb / history mutation** · **count copy per §2.2: `hiddenCount > 0` → `+N areas with matches`; `hiddenCount == 0` → `N areas with matches`; never `+0`** · multi-area markers render names, the count line, listing count and `Tap to zoom` · Schools mode adds a deduplicated school count under §2.5 · a single-AREA marker shows name and counts with **no** nearby-area line · selecting a single AREA from map or panel produces the same canonical `node=` · the focused panel subset explains itself and `Show all areas` restores the full list and parent bounds · area clusters are visually distinguishable from listing clusters · map and panel expose identical visible keys and totals · a filter change recomputes membership and counts without changing `node=`, breadcrumb or history · **stale cluster focus is cleared or reconciled when filters change membership** · **the marker feed at a structural level is scoped to direct children / journey-visible members, never aggregated descendants**.
10. **Tests.** *Unit:* membership from direct children only, using keys that deliberately disagree with labels; filter-before-cluster ordering; determinism across repeated runs; representative-ranking tie-break; single-AREA omits the nearby line; **both count-copy branches and the never-`+0` rule**. *Integration:* identical visible keys/totals across map and panel; filter change leaves hierarchy untouched; **stale-focus reconciliation**; **marker feed scoped to direct children**. *E2E:* cluster tap changes map/panel focus but not URL/breadcrumb/history (all three asserted); `Show all areas` restores parent bounds and the complete list. *Visual:* 1366×768 crowded clusters, single-AREA markers, Schools-mode clusters with both counts, area-vs-listing distinguishability.
11. **Real-browser evidence.** The highest bar of any PR — overlap and cluster-vs-listing distinguishability are geometry claims only a real browser settles: one clean tab, network throttled, three repeats, at the densest real final parent Phase 0 identified. Plus the mandatory **390×844 smoke check**.
12. **Routing.** `qa-fast` → `frontend-engineer` → `code-reviewer` → `ui-designer` (styling distinctness + overlap) → `qa`.
13. **Risk: High.** Table in §10.
14. **Mitigation.** §10. PR 1 already de-risked the arithmetic, so residual risk is geometry and determinism, both directly testable.
15. **Rollback boundary.** Additive modules; reverting returns the map to unclustered direct-child markers with hierarchy state untouched.
16. **Forbidden scope.** No hierarchy depth to solve overlap · no visual cluster in `node=` or the breadcrumb · no canonical-area deletion for a visual budget · **no legacy deletion** · no #2015 · no automatic request after every pan · **invariant 8**.
17. **Follow-up seams.** Whether to adopt the sibling kit's hollow dashed magnifier-chip cluster grammar — a design nicety, not a blocker.
18. **Definition of ready for PR 4.** Determinism proven across repeated runs; stale-focus reconciliation green; cluster interaction proven not to touch `node=`, breadcrumb or history; overlap and distinguishability signed off on real dense data; 390×844 smoke clean.

---

## 10. PR 3 risk table

| # | Risk | Mitigation | Detection gate |
|---|---|---|---|
| 3.1 | Visual clusters becoming hierarchy state | a cluster tap dispatches zoom/focus only; every interaction wrapped in an invariant assertion on `node=`, breadcrumb and history length | per-interaction invariant test; E2E asserting all three untouched |
| 3.2 | Incorrect member area keys | explicit stable `area_key` membership from PR 1's model; static sweep forbids label parsing | membership test using keys that deliberately disagree with labels |
| 3.3 | Wrong count-copy branch | the conditional rule is implemented once in PR 1 with property tests: `hiddenCount = visible − displayed`; `>0` → `+N areas with matches`; `==0` → `N areas with matches`; never `+0`; and **no `+N` at structural levels** | PR 1 property tests, re-asserted end-to-end here; a test asserting no `+N` renders at Direction/Local-Destination |
| 3.4 | School-count double counting across a cluster's member areas | §2.5: **distinct schools physically located inside** the member areas, deduped by stable school identity. No radius or "serving" semantics are used anywhere. | Testcontainers fixture: a cluster whose member areas each contain schools, asserting the cluster total equals the count of **distinct** schools located inside them |
| 3.5 | Filter-driven map instability | recompute membership and counts but never regenerate or re-parent the hierarchy; cluster identity is ephemeral and stale focus is cleared or reconciled | filter-change test asserting counts change but `node=`/breadcrumb/ancestry do not; stale-focus reconciliation test |
| 3.6 | Map / panel visible-area mismatch | both consume the **same** visible-set instance from PR 1 — one derivation, two renderers, one count-response identity | integration test asserting identical visible `area_key` sets and totals |
| 3.7 | Marker overlap | first-class AC with real-browser geometry evidence at the densest real parent; never solved with hierarchy depth; lineage attributed or closed in PR 6 | `ui-designer` overlap review on real dense data; #1943 retest at PR 6 |
| 3.8 | Confusion with hierarchy or listing clusters | deliberately distinct area-cluster treatment; the multi-line composition differs from the single-AREA composition | side-by-side visual baselines; `ui-designer` distinguishability sign-off |
| 3.9 | Poor performance or N+1 count fetching | settled in PR 1: `areaCountsForCity` already returns a whole-city per-area map in one cached query, so counts need no key list; request-count assertion enforces one HTTP request per view | request-count assertion; live network capture; query-plan capture |
| 3.10 | Incorrect behaviour on mobile | PR 5 owns mobile clustering, but PR 3 captures the mandatory 390×844 smoke so a mobile-breaking decision is caught here | 390×844 smoke in PR 3; full mobile flow in PR 5 |
| 3.11 | Non-deterministic clustering or representative names | deterministic output for identical input/viewport/zoom and a specified representative tie-break | repeated-run determinism test; explicit tie-break unit test |

---

## 11. PR 4 — AREA listings, preview sheet and restoration parity

1. **Position:** 4 of 6.
2. **Title:** `fix(discover/areas): AREA listing surface, listing preview contract, anonymous exposure and result restoration`
3. **Shopper outcome:** Behind preview — selecting a real AREA switches to listing markers and results with all filters, cards, favourites, trust badges and Browse All intact; anonymous shoppers see leaf markers; the `listing=<uuid>` peek round trip and detail `Back to results` work; the Schools **shortcut only** is preserved.
4. **Slices:** 7.
5. **Bounded source areas.** `AreaSelectedPanel.tsx`; `resolveMarkerListings.ts` / `resolveMarkerPopover.ts`; `useDiscoverPageState.ts`; `DiscoverRightPanel.tsx` (must-not-break surface); `SchoolJourneyPanels.tsx`; **the reusable selected-listing preview data contract**; re-anchored E2E.
6. **KEEP / REWORK / REMOVE / NEW.** **KEEP** all of the above. **NEW** the preview data contract. **REWORK** `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts` — re-anchor J7a (filters), J7b (search), J7c (map/panel sync), J7d (anon save → sign-in modal) and J7f (`listing=` peek) onto a contract-valid AREA. **Keep J7e excluded** with its clean-base citation (a pre-existing Leaflet/bfcache crash reproducing on the untouched `e2e/discover-1939-listing-peek-url-restore.spec.ts`). **No legacy deletion.**
7. **Contract changes.** Frontend only: the selected-listing preview data contract. **No backend transport change** — see field 16.
8. **Dependencies / base:** after PR 3, from freshly merged `main`. No parallel work.
9. **Acceptance criteria.**
   - **AC4.1** AREA selection switches to listing markers/results.
   - **AC4.2** Filters, within-area search, cards, favourites, trust badges, anonymous price coarsening and Browse All are unchanged.
   - **AC4.3** Anonymous users see leaf markers.
   - **AC4.4** The `listing=<uuid>` peek deep link and round trip work.
   - **AC4.5** Detail `Back to results` restores the prior result context and does **not** navigate to the hierarchy parent.
   - **AC4.6** The Schools shortcut from a selected AREA is preserved with school identity, radius and homes-near semantics unchanged.
   - **AC4.7** A zero-listing canonical AREA renders a normal empty state; loading/error/retry behave.
   - **AC4.8** A node AREA leaf never receives an unscoped city-wide listing set — **confirmed live for both anonymous and authenticated**, with the exact request URL captured.
   - **AC4.9** One **listing-query result identity** owns cards, listing markers and the total (§2.6).
   - **AC4.10 (preview sheet — data and restoration contract).** A reusable selected-listing preview data contract exists, carrying **anonymous-safe fields only**: image · public-safe price · property type · bedrooms · canonical area label · listing identity · a `View details` action. It defines selected-listing identity and its relationship to the existing `listing=<uuid>` peek/detail flow. **Close** and **Back** semantics are defined. Closing a preview **restores the prior listing-query result identity and the same canonical AREA, filters and map camera**, and **never navigates to the hierarchy parent**. No listing-card or detail redesign.
   - **AC4.11 (Buy/Rent proven by behaviour, not presence).** For one canonical AREA: **Buy** shows sale inventory with sale prices; switching to **Rent** shows rental inventory with monthly prices; **the result count changes where the fixtures differ**; and the **geography and `node=` are unchanged** across the switch. "Preserved" is not satisfied by the toggle merely remaining visible.
   - **AC4.12** Invariant 8 holds on this surface: no result-scope chip row, `Edit areas`, `Clear selected areas`, `Add nearby areas`, `Draw search area`, `Search this area` or `Create alert` is rendered or implemented.
10. **Tests.** *Unit:* zero-listing empty state; loading/error/retry; **the preview data contract and its anonymous-safe field set**. *Integration:* leaf marker scoping for anon and authenticated with the exact request URL captured; **preview close restores the prior result identity, AREA, filters and camera**; **Buy/Rent inventory switch (AC4.11)**. *E2E:* the #1956 s16 items 9 and 10; **open preview → close → same AREA/filters/camera/result count**; **open preview → `View details` → Back → same result context**; **Buy → Rent → verify inventory, prices, count change, unchanged geography**. *Static guard:* a sweep asserting none of invariant 8's control labels or test-ids appear in the Areas panel tree, plus a component test asserting the AREA panel renders no scope-chip row.
11. **Real-browser evidence.** Required in **both** auth states, capturing the exact request URL rather than only a screenshot. Preview open/close/detail-return captures. Buy/Rent switch captures showing different inventory and prices at the same AREA. Plus the mandatory **390×844 smoke check**.
12. **Routing.** `qa-fast` → `frontend-engineer` → `code-reviewer` → **`security-reviewer`** (Gate F: anonymous vs authenticated exposure, price coarsening, **anonymous-safe preview fields**) → **`performance-analyst`** (listing/marker query paths, cards/markers/total consistency, anonymous/public cache behaviour, future OpenSearch provider boundary) → `qa`.
13. **Risk: Medium.**
14. **Mitigation.** Phase 0 deliverable 16 settles the two carried defects' provenance, and their routing is fixed in advance so no new PR can appear: **branch-introduced and Gate-3-required → PR 4; pre-existing but Gate-3-required → PR 4; unrelated and non-blocking → an existing external issue, never a new #1956 PR.** Gate F is mandatory because anon exposure is in scope.
15. **Rollback boundary.** The leaf listing surface; hierarchy navigation unaffected.
16. **Forbidden scope.** No full Schools journey redesign (owned by #1954 — §18) · no listing-card or detail redesign · **no JWT or authz broadening to make anon markers work** (use the public teaser path) · no #2015 result-scope restoration · **no drift into #2016** · **no `?areaKeys=` transport redesign of any kind** — an AREA leaf sends exactly one key, and multi-key transport belongs to #2016 · no legacy deletion · **invariant 8**.
17. **Follow-up seams.** The `?areaKeys=` transport question is recorded against **#2016**.
18. **Definition of ready for PR 5.** Anon and authenticated leaf markers live-confirmed with captured URLs; `listing=` peek round trip green; **preview open/close/detail-return restoration green**; **AC4.11 Buy/Rent behaviour proven**; `security-reviewer` clean; invariant-8 static guard green; 390×844 smoke clean.

---

## 12. PR 5 — Mobile list-first journey

1. **Position:** 5 of 6.
2. **Title:** `feat(discover/areas): mobile list-first Areas journey at 390x844`
3. **Shopper outcome:** Behind preview on mobile — a list navigation stack from city destinations to listings; a Back control naming the canonical parent; a full-screen Map/List toggle changing neither `node=` nor history; mobile visual clusters with bottom-sheet member sync and `Show all areas`; the listing preview sheet in Map mode; listing and restoration parity.
4. **Slices:** 6.
5. **Bounded source areas.** Mobile shell and `JourneySwitcher` integration for the node journey; bottom-sheet member-list sync with visual clusters; the named canonical-parent Back at mobile width; **the mobile Map-mode listing preview sheet**; mobile listing/restoration parity.
6. **KEEP / REWORK / NEW.** **KEEP** the existing mobile List-first Map/List shell. **REWORK** the shell integration and bottom-sheet sync. **NEW** the Map-mode preview sheet presentation. **REMOVE** nothing. **No legacy deletion.**
7. **Contract changes.** None — consumes PR 4's preview data contract.
8. **Dependencies / base:** after PR 4, from freshly merged `main`. No parallel work.
9. **Acceptance criteria.** List mode shows the current node's direct children · the top-left control **names** and returns to the canonical parent · AREA selection provides search plus the complete area list · selecting a row is identical to selecting the matching marker · `View map` opens a full-screen map for the same canonical state and `List` returns to it and is **not** hierarchy Back · Map/List changes modify neither `node=` nor history · mobile visual clusters use the same content contract, with the same ephemeral identity and stale-focus reconciliation as PR 3 · `Show all areas` clears focus · selecting a real AREA advances canonical state · listing and restoration parity holds · **primary controls are visible, unobscured and pointer/touch reachable at a true 390×844** · the complete breadcrumb renders un-clipped at 390×844 · **invariant 8 holds on the mobile AREA surface**.
   - **AC5.10 (preview sheet — mobile Map-mode presentation).** Tapping a **listing marker in mobile Map mode opens the preview sheet**; the sheet is **visible without switching to List mode**; `View details` opens the **existing** full listing detail; **`Close` returns to the same mobile Map state**; **browser Back from detail returns to the same preview/result context** where supported; **camera, active filters, result count and Map mode are unchanged**; controls are pointer/touch reachable at a true 390×844.
10. **Tests.** *Unit:* mobile List/Map state preservation. *Integration:* Map/List switch creates no history entry and preserves canonical state; mobile stale-focus reconciliation; **preview sheet opens from a marker tap without a mode switch, and Close restores the same Map state**. *E2E:* the full #2014 s16 mobile flow; **the explicit sequence marker tap → preview sheet → `View details` → detail → Back → same preview/result context, with camera, filters, result count and Map mode unchanged**. *Visual:* 390×844 List, full-screen Map, and the preview sheet.
11. **Real-browser evidence.** A genuine 390×844 viewport, including **reachability** of primary controls, not merely DOM presence. **This PR may not cite the mock as evidence of responsive reflow** — a real resize to 390×844 produced no reflow at all in the prototype; its mobile layout is a staged storyboard scene. Real media-query behaviour must be built and verified.
12. **Routing.** `qa-fast` → `frontend-engineer` → `code-reviewer` → `ui-designer` (390×844 reachability) → `qa`.
13. **Risk: Medium-High** — the prototype demonstrates a staged mobile design but does not prove real responsive reflow at a true 390×844 viewport.
14. **Mitigation.** The mandatory 390×844 smoke check in PRs 2, 3 and 4 is the early-warning system that makes deferring mobile safe rather than merely cheaper.
15. **Rollback boundary.** Mobile shell wiring only; desktop unaffected.
16. **Forbidden scope.** No #1960 a11y automation · Map/List must never become hierarchy Back · no legacy deletion · **invariant 8**.
17. **Follow-up seams.** Tablet widths 391-1365 px are unrepresented in the design; #1956 locks 1366×768 and 390×844 and records the gap.
18. **Definition of ready for PR 6.** Mobile flow green at a true 390×844; no history entries from Map/List; preview-sheet sequence green; every prior PR's evidence still reproducible on current `main`.

---

## 13. PR 6 — Final cutover and Gate 3

1. **Position:** 6 of 6.
2. **Title:** `feat(discover/areas)!: cut Areas journey over to canonical node= and remove Areas-exclusive legacy code`
3. **Shopper outcome:** **The only merge that changes the default shopper experience.** The new Areas journey becomes the sole path; the preview gate is removed; Areas-exclusive legacy code is deleted; Gate 3 evidence is assembled.
4. **Slices:** Slice 2 part B + Slice 8.
5. **Bounded source areas.** `DiscoverRightPanelContainer.tsx` (remove the dual gate); the preview-capability parser module (**deleted**); `DiscoverRightPanel.tsx` (collapse the two legacy branches); **delete** the three `AreaGroup*Panel` files + four tests, `macroRegionResolver.ts` + its behaviour tests, and Areas-exclusive route helpers; **then restore** `macroRegionResolverDeleted.test.ts` as the deletion-permanence guard and any `staticSweep` assertions deferred in PR 1; **re-audit `groupRegionLabel.ts` and relocate it School-side only if School is then the sole consumer**; migrate legacy-param E2E deep links; re-home `e2e/discover-map-hierarchy.spec.ts`'s residual coverage; add the visual-regression harness.
   **Deletion scope is Areas-exclusive only.** Only `node` is Areas-exclusive; `region`, `scope`, `groupId` and `areaKey` all have live non-Areas consumers that must keep working (§3.2).
6. **KEEP-DELETION / REMOVE / KEEP.** **KEEP-DELETION** (now executed) the three panels + four tests, `macroRegionResolver.ts` + tests, and `e2e/capture-area-first-screenshots.spec.ts` (assertion-free capture with zero `expect` — it could never fail, so no guard is lost). **REMOVE** `e2e/discover/issue-1956-ac11-depth8-and-marker-scope.spec.ts` — it encodes a six-cluster-level path as the valid production case, which the contract forbids. **DELETION-CONDITIONAL** `e2e/discover-map-hierarchy.spec.ts` — prove its residual non-Areas map-layer coverage and #1738 gating pointer exist elsewhere or re-home them first. **KEEP** `area-groups-focus.spec.ts` until its subject is gone.
7. **Contract changes.** None new; removals only.
8. **Dependencies / base:** last, after PR 5, from freshly merged `main`. Requires the legacy producer ledger fully discharged.
9. **Acceptance criteria.** **AC6.1** old/new count and ancestry convergence passes **before** the flip, as a data series not a snapshot · **AC6.2** the new journey is default, the gate and its parser are gone, and `areasPreview=1` has no effect anywhere · **AC6.3** every Areas-exclusive legacy file is deleted with importer/runtime ownership **proven**, and permanence guards prevent silent resurrection · **AC6.4** every legacy-param producer has migrated or been intentionally retired with tests; `AreaCtaBlock`, `AreaGuide`, `AreaGuideHero` and direct area search must not go blank or land at the wrong level · **AC6.5** `region`, `scope`, `groupId` and `areaKey` still work for their non-Areas consumers · **AC6.6** residual test coverage from retired specs is re-homed or proven present elsewhere · **AC6.7** the complete existing Discover E2E suite is green or every failure carries a clean-base pre-existing citation · **AC6.8** visual baselines at 1366×768 and 390×844 across all named states · **AC6.9** the #1943 overlap/fit reproduction is explicitly retested · **AC6.10** the promoted hierarchy passes blocking depth/breadth/membership validation · **AC6.11** #1956 consumes only typed public navigation APIs · **AC6.12** no screenshot-only proof — every PASS states the command and actual exit code · **AC6.13** the full #2014 s17 sign-off package · **AC6.14** the revert rehearsal (field 14) has been performed and attached · **AC6.15 (§2.8)** Gate 3 tests are run with caches both **warm and cold** · **AC6.16** the PR stops at `USER_MERGE_APPROVAL_REQUIRED`.
10. **Tests.** The complete #1956 s16 E2E list (14 scenarios) and the complete #2014 s16 desktop/Schools/mobile flows against real backend data with **no route mocks**; the full existing Discover E2E suite; batched Vitest across all subsystems; visual baselines at both viewports; **non-Areas parameter regression tests** for `region`/`scope`/`groupId`/`areaKey`; **warm-cache and cold-cache runs**.
11. **Real-browser evidence.** The full #2014 s17 package, the #1943 retest, and the revert-rehearsal output.
12. **Routing.** `qa` (e2e-authoring) → `qa` (verification, terminal) → `code-reviewer` → `security-reviewer` → **`performance-analyst`** (bounded MVP performance-regression verification **only** — may block cutover solely for a material regression caused by #1956, an unbounded query, N+1 behaviour, unsafe cache behaviour, unacceptable response growth, or a counts/cards/markers correctness inconsistency; **must not block #1956 because future 500-city / 100 M-listing certification is unfinished**) → Main Agent WORKDONE_REVIEW → PR_REVIEW → **user merge approval**.
13. **Risk: High** — the only shopper-visible flip and the only irreversible cleanup.
14. **Risk mitigation — the revert rehearsal, executable.** This repository squash-merges, so internal commits are review organisation only and are **not** the rollback boundary. Before requesting merge approval: create a **temp branch from post-PR5 `main`** → **merge/squash the PR 6 branch into one synthetic commit** → run the **final-cutover verification** suite → **revert that synthetic squash commit** → **rerun legacy-default routing verification** → verify **legacy panels, helpers and tests restored** → verify the **preview gate returns** → verify **old producers and compatibility paths work again**. Record the exact commands, the **synthetic squash SHA**, the **synthetic revert SHA**, test results, the exact files restored, and the resulting config state.
    **Deployment-capability rule:** the preview capability must remain **available but disabled** throughout the cutover observation and rollback window. **Do not delete or decommission the external capability configuration until the user explicitly closes the rollback window** — a git revert cannot restore removed external deployment config.
15. **Rollback boundary.** **Revert the PR 6 squash-merge SHA.** That single revert restores the legacy default while leaving PRs 1-5's work present but unreachable behind a returned preview gate. Field 14's rehearsal makes this a verified property rather than an assumption.
16. **Forbidden scope.** **No `gh pr merge` without an explicit user message approving that specific action** — a gate verdict of `APPROVED_TO_MERGE` is not user approval. No `--no-verify` push without documented user approval. No deletion of a non-Areas-exclusive helper. **Invariant 8.**
17. **Follow-up seams.** Two #1251 ADR amendments (§14.8); the tablet-width gap; the visual-regression baseline harness #1954 deferred.
18. **Definition of ready.** Closes #1956 and Gate 3 on product-owner sign-off.

---

## 14. Performance Analyst view — MVP baseline and future OpenSearch seam

This does not turn #1956 into #2012 or into an OpenSearch implementation.

### 14.1 Two read planes (VERIFIED separate)

| Plane | Serves | Today | Future |
|---|---|---|---|
| **Structural navigation** | canonical node, direct children, ancestry, canonical parent, bounds, descendant area identities, promoted revision | `NavigationController.getNode` / `getAreaPath` / `resolve` reading an **immutable `NavigationGraph`** from `NavigationGraphCache`; **never touches a DB at read time**; controllers use only typed accessors | **OpenSearch does not replace this plane** unless a later measured decision says so |
| **Listing / search / count** | listing results, marker results, totals, filter-aware per-area counts, Buy/Rent, visibility predicates, property filters | `AreaCountProvider` → `PostgresAreaCountProvider`; `DiscoverListingsService` / `DiscoverMarkersService` | expected replaceable by an OpenSearch-backed read provider |

No graph traversal is embedded inside listing/search querying. The node/child rollup is pure in-memory arithmetic over one already-fetched map — no N+1.

### 14.2 The read boundary (already exists — §3.1)

**Do not invent an interface name.** `AreaCountProvider` is the counts seam; `DiscoverListingsPort` / `DiscoverMarkersPort` / `DiscoverSummaryPort` are the established convention.

| Coupling | Owner |
|---|---|
| `PostgresAreaCountProvider` uses `DiscoverListingPredicateBuilder` | **Out of scope** — correct pattern; SQL specifics belong inside the Postgres implementation |
| No provider interface for `DiscoverListingsService` / `DiscoverMarkersService` equivalent to `AreaCountProvider` | **Pre-existing and broader** — the #1317 Ports cover the routing case; #1956 must not make it worse |
| `AreaCountQuery` and `DiscoverListingPredicateBuilder.Filters` are different filter models | **In scope for PR 1 via §2.4** — the locked decision extends `AreaCountQuery` so counts and cards share the applicable filter surface |
| `propertyType` cache-key case-sensitivity vs case-insensitive DB comparison | **Fix inside #1956** — one line, in a file PR 1 edits |

### 14.3 Cross-source consistency

**Already exposed — do not add a new version field.** `revisionId` is present on `NavigationNodeResponse`, `NavigationPathResponse`, `NavigationCountsResponse` and `NavigationResolveResponse`.

There is no listing/marker generation watermark, so counts and cards share no consistency token; divergence is bounded by the 30 s count-cache TTL and is resolved structurally by §2.8 (the AREA view's total is owned by the listing query, not the count cache). PR 1 states this explicitly in its evidence.

**Documented future requirement:** *"Counts, cards and markers for one committed view must use compatible query semantics and a compatible source generation."*

### 14.4 Cache inventory

| Cache | Owner | Key | TTL | Invalidation | Bound | Stampede | Metrics | Exposure |
|---|---|---|---|---|---|---|---|---|
| Navigation graph (production) | `NavigationGraphCache` | `(citySlug, revisionId)` | `expireAfterAccess` 3600 s | promotion listener + 45 s poller | 200 | yes | UNKNOWN | structural only — safe |
| Navigation graph (preview) | same | `(previewKey, revisionId)` | `expireAfterWrite` 900 s | TTL | 50 | likely | UNKNOWN | isolated from production pointers |
| **Area-count rollup** | `AreaCountRollupService` | `(citySlug, revisionId, normalizedFilterHash)` | `expireAfterWrite` **30 s** | TTL | 500 | yes | UNKNOWN | city ✅ revision ✅ filters ✅ exposure ✅ — **but see case-normalisation** |
| HTTP structural | `NavigationController` | — | `max-age 300, public` + ETag | ETag | — | — | — | public, structural |
| HTTP counts | `getCounts` | — | `max-age 30, public`, no ETag | max-age | — | — | — | ≤30 s stale count possible in a shared cache |
| `resolve` route | `resolve` | — | `max-age=0, must-revalidate` | ETag | — | — | — | deliberately non-cacheable (unbounded client-supplied `node`) |
| Client query cache | React Query | UNKNOWN | UNKNOWN | — | — | — | — | review in PR 2/3 |
| CDN / browser | — | — | governed by the headers above | — | — | — | — | UNKNOWN topology |
| Redis | **not present** | — | — | — | — | — | — | — |

**Findings and rules.** Equivalent filter forms are **not** normalised before key construction — `"Villa"` and `"villa"` create two entries for one logical query while the DB compares `LOWER(property_type)`. **Fix in PR 1.** Cache metrics are absent across all three Caffeine caches — post-MVP. Do not add Redis, another cache layer or longer TTLs merely because caching "may help": **measure first, and never use caching to hide an unindexed or unbounded query.** **Inherit #1248's policy** (`docs/perf/discover-cache-control.md`) rather than creating a competing one.

### 14.5 Query-plan evidence — reuse the existing harness

**`scripts/run_explain_harness.py` exists** (#1246, delivered via PRs #1294/#1296), invoked as `python3 scripts/run_explain_harness.py --volume=10k [--query=QP-x] [--db-url=… | $PERF_DB_URL]`, running `EXPLAIN (ANALYZE, BUFFERS)` read-only and writing to `docs/audit/evidence/explain/live/<volume>/<QP-id>.txt`. **Do not build a competing harness.**

It has no `GROUP BY area_key` path yet, but `PostgresAreaCountProvider`'s SQL is deliberately a **named constant** whose javadoc says it exists so a later EXPLAIN pass can run that exact shape. **The extension is one `QueryDef` (QP-6) plus a params branch — PR 1's work.**

**PR 1 captures:** count query path · representative data size · warm/cold execution time · plan shape · indexes used · rows scanned · result cardinality · response bytes · cache hit/miss · one-request-per-view evidence.
**PR 4 captures:** canonical AREA listing query · marker query · Buy and Rent · representative filter combinations · anonymous and authenticated public-safe paths · warm/cold time · response bytes.
Framing: **Postgres MVP baseline → future OpenSearch parity and improvement baseline.**

**Index reality.** `idx_property_listings_area_key` (V13), `idx_listing_area_key_status_created` (V74) and `idx_property_listings_not_archived` already exist. Open empirical question: the query applies `LOWER(pl.property_type) = LOWER(?)`, and a plain B-tree on `property_type` cannot serve a `LOWER()`-wrapped predicate. **No missing index is asserted — measure first.**
**If an index migration is ever needed:** `CREATE INDEX CONCURRENTLY` is **not usable** — `V13__add_hot_query_indexes.sql` records that Supabase's pgBouncer transaction-pooling mode is incompatible with it. Any new index needs a brief exclusive-lock `CREATE INDEX` or a session-mode workaround, plus locking/concurrency analysis, estimated build time, deployment ordering, rollback treatment and post-deploy plan verification. **Current recommendation: no index migration in PR 1** unless the harness run shows a sequential scan at representative size.

### 14.6 MVP performance guardrails

**Approved rules already exist and forbid invented SLOs.** `docs/new-discover-v2/06-target-architecture-and-pr-plan.md` (Correction 6, approved): *"Final numerical targets stay repository- and environment-based — no invented SLO numbers — but the process is now enforceable"* — capture a baseline with representative datasets, record the agreed budgets in the PR, and **fail acceptance if exceeded**. Existing reference points: adoption triggers (P95 FTS > 200 ms; ST_DWithin > 300 ms; > 500 K LIVE listings) and measured baselines in `docs/audit/query-baseline-report.md`.

New numbers for #1956's specific paths, **all tagged `PROVISIONAL_MVP_BUDGET_REQUIRES_USER_APPROVAL`**, and **split by state** because one request-count across three different state types is ambiguous:

| State | Max HTTP requests per committed view |
|---|---|
| Hierarchy navigation view (city root / Direction / Local Destination) | **≤ 2** (one structural resolve, one counts) |
| AREA listing view | **≤ 3** (structural + counts + listing query) |
| Mobile preview / detail transition | **≤ 1 additional** beyond the current view |

Other provisional budgets: count response ≤ 8 KB · direct-child payload ≤ 16 KB · warm count ≤ 150 ms · cold count ≤ 600 ms · warm AREA listing ≤ 300 ms · cold AREA listing ≤ 1200 ms · frontend parse/render for the largest valid direct-child response ≤ 50 ms. Non-numeric guardrails: no N+1 · no unbounded cache-key growth · no stale-response race · no material regression vs the pre-PR baseline.

**These are MVP regression guardrails, not the hundred-city / hundred-million-listing operating envelope**, which stays #2012. **§2.9 governs every one of them: a breach causes optimisation, budget review or a blocking verdict — never truncation or altered shopper semantics.**

### 14.7 Performance-analyst routing

Phase 0 (read-only review + verdict) · PR 1 (count query, cache, response size, request count, stale-response, school aggregation, cache-key cardinality, index if any) · PR 4 (listing/marker paths, cards/markers/total consistency, anonymous/public cache behaviour, provider boundary) · PR 6 (bounded MVP regression verification only). Draft Phase 0 verdict: **`APPROVE_WITH_LIMITS`** — the counts read boundary is already well-designed and genuinely swap-ready; limits are (1) capture PR 1 EXPLAIN evidence via the existing harness before merge, (2) fix the `propertyType` cache-key normalisation, (3) implement §2.4 rather than leaving the filter surface implicit.

### 14.8 OpenSearch readiness appendix

Starting point is the **existing** #1251 ADR (`docs/architecture/discover-opensearch-search-architecture.md`); the implementation track that followed it is largely already built (#1309-#1945 closed; #1352 and #1513 open). **#1956 implements none of it.**

> **OpenSearch and caching must never change what the shopper sees — only how quickly it is produced.** Before an OpenSearch-backed provider goes live, parity tests must guarantee **identical** AREA membership, Buy/Rent semantics, filter semantics, counts, markers, public exposure and sorting versus the Postgres path. A faster path that returns a different set is a correctness regression, not an optimisation.

| #1956 requirement | Postgres source | OpenSearch need | Parity risk | Owner |
|---|---|---|---|---|
| city · `area_key` · listing id · status/visibility · Buy/Rent · bedrooms · price · trust fields · coordinates | existing columns | mapped in the ADR | low | #1251 §4.1/§4.3 |
| property type | `LOWER(property_type)` comparison | `property_type` keyword | **medium — case-insensitivity must be replicated exactly** | #1251 |
| **per-area counts** | `GROUP BY area_key` | **no `terms` agg on `area_key` defined in the ADR** | **HIGH — exactly the gap `OpenSearchAreaCountProvider` throws on** | **follow-up amendment to #1251** |
| **hierarchy / node identity** | `NavigationGraph` | **no `node_key`/ancestry field in the ADR** | **HIGH — but the structural plane is not expected to move** | record only |
| marker aggregation · stale-index fallback | services | agg + fallback semantics | medium | #1251 §15 |

The ADR explicitly places `GET /api/discover/cities/{city}/listings` **out of** OpenSearch scope. **Do not implement:** cluster deployment · index creation · CDC · Kafka · outbox · reindexing · dual reads · OpenSearch query caching.

### 14.9 Ownership classification

**Fix inside #1956:** `propertyType` cache-key case-normalisation · capture PR 1 EXPLAIN evidence via the existing harness · implement §2.4's filter parity · confirm empirically whether the property-type index serves the `LOWER()` predicate.

**Record against post-MVP (#2012 / OpenSearch roadmap):** building the real `OpenSearchAreaCountProvider` · unifying one filter model across counts/cards/markers beyond §2.4's applicable subset · a counts↔cards↔markers generation watermark · provider interfaces for listing/marker read paths beyond the existing Ports · cache metrics/observability · CDN/Redis design · multi-city cache capacity · load testing · final p95/p99 envelope. **No new performance issue is proposed** — existing issues own every item.

---

## 15. Dependency diagram

```text
        Phase 0  VALIDATION GATE (no PR, no branch, no merge)
                 conformance · breadth · no 3rd CLUSTER · max direct AREA children
                 typed count contract incl. §2.4 filter extension · real count capability
                 school data source + cardinality + feasibility (NOT runtime evidence)
                 query plan · legacy URL ledger · preview config key · baseline
                 defect provenance · 156-node verdict · F-1 and F-5 rulings
                 performance-analyst review + verdict
                                   │
        ┌──────────────────────────┼──────────────────────────┐
   READY_FOR_          BLOCKED_BY_INVALID_        BLOCKED_BY_MISSING_
   IMPLEMENTATION      PROMOTED_HIERARCHY         RUNTIME_EVIDENCE
        │                    STOP                       STOP
        ▼
   PR 1  Preview seam + canonical Areas foundation
         dual gate · legacy RETAINED and default
         BACKEND: per-area map · school counts (located-inside) · §2.4 filters · validation
         FRONTEND: typed model · validators · visibility · count copy · dedup
                   stale-response fingerprint · shared count-response identity
         (no net-new UI)                    [backend-engineer · security · performance]
        │
        ▼
   PR 2  Complete desktop shallow navigation
         Direction + Local Destination UI (STABLE canonical names,
         "N areas with matches" / "No matches with current filters", NO +N)
         breadcrumb · canonical-parent Back · browser history · CameraIntent
         legacy producers migrated to node= via the existing endpoint  [390x844 smoke]
        │
        ▼
   PR 3  Visual AREA clustering + single-AREA selection
         zoom-aware · EPHEMERAL cluster identity · stale-focus reconciliation
         "+N areas with matches" / "N areas with matches", never "+0"
         marker feed scoped to DIRECT CHILDREN, not descendants     [390x844 smoke]
        │
        ▼
   PR 4  AREA listings, preview sheet and restoration parity
         listing markers · filters/cards/Browse All · Schools shortcut only
         anon exposure · listing peek · Back to results
         PREVIEW DATA + RESTORATION CONTRACT · Buy/Rent proven by behaviour
         NO areaKeys transport work (owned by #2016)   [Gate F · performance · 390x844]
        │
        ▼
   PR 5  Mobile list-first journey
         nav stack · named parent Back · full-screen Map/List
         mobile clusters + bottom sheet · MAP-MODE PREVIEW SHEET PRESENTATION
         real media queries verified at a TRUE 390x844 (mock is not evidence)
        │
        ▼
   PR 6  FINAL CUTOVER + GATE 3
         convergence evidence · new journey default · gate + parser DELETED
         AREAS-EXCLUSIVE legacy code deleted (region/scope/groupId/areaKey SURVIVE)
         permanence guards restored · groupRegionLabel re-audited
         REVERT REHEARSAL on a temp branch · warm AND cold cache runs
         full Discover E2E · visual baselines · #1943 retest
         stops at USER_MERGE_APPROVAL_REQUIRED
        │
        ▼
   #1956 closed · Gate 3 signed off

PR COUNT LOCKED AT 6. NO PARALLEL PRs. Each PR starts from newly merged main.
Default shopper journey: LEGACY through PR 5 · NEW from PR 6.
```

---

## 16. Delivery ledger

**Two surfaces, both mandatory after every merge.**

**(a) Append-only TOML** at `.claude/handoffs/issue-1956/delivery-ledger.toml`:

```toml
[[entry]]
pr = 1
title = ""
squash_sha = ""                     # the squash-merge SHA — the rollback boundary
merged_at = ""
acs_completed = []                  # AC ids with evidence paths
acs_deferred = []                   # AC id -> owning PR
default_shopper_path = "legacy"     # "legacy" until PR 6, then "new"
default_path_entry_points_verified = []
preview_capability_key = ""
preview_status = ""                 # "present" until PR 6, then "removed"
remaining_legacy_code = []          # shrinks only in PR 6
legacy_producers_migrated = []
open_risks = []
deviations = []
next_pr_scope = ""
invariants_reasserted = [1,2,3,4,5,6,7,8]
```

**(b) A GitHub comment on #1956 after every merge** containing: PR number and **squash SHA** · ACs completed · default shopper path · preview status · remaining legacy code · open risks and deviations · the exact next-PR scope.

**Rules.** Append-only. A PR may not open until the previous entry exists with a real `squash_sha` **and** the #1956 comment is posted. `preview_status` may only become `removed` in PR 6's entry. `remaining_legacy_code` may only shrink in PR 6's entry.

---

## 17. Product rulings — both RESOLVED

Both items are **decided**. Nothing in this plan is blocked on a pending ruling.

### 17.1 F-1 — design authority order (RESOLVED)

Product-owner ruling: **[#1956 comment 5094908480](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094908480)**.

**Locked authority order:**

| Source | Controls |
|---|---|
| **PR #2022 / `c13dc017` `new_discover` prototype** | **visual composition and in-scope interaction presentation** |
| **#2014 and #1956** | **hierarchy depth · canonical identity · `node=` URL behaviour · breadcrumb and Back semantics · browser history · issue scope · non-regression** |

Also locked:

- `experience.html` is authoritative **only for states already owned by #1956**. It does **not** pull AREA_SET, polygon, viewport search, alerts or any other follow-up functionality into #1956.
- `discover-scopes/` remains the design reference for **#2015-#2019**, **not** an #1956 implementation contract.
- Any older "frozen file" wording in #2014 or #1956 refers to the **latest approved contents** of those paths **after** PR #2022 — not the pre-#2022 contents.

### 17.2 F-5 — school-count semantics and display ordering (RESOLVED)

Product-owner ruling: **[#1956 comment 5094909370](https://github.com/gautirao/udupi-property-explorer/issues/1956#issuecomment-5094909370)**. The semantic definition is §2.5 and is unchanged. The **display ordering** is the newly clarified piece, now locked in §2.5: Areas-first shows the listing count primary with `schoolCount` as optional secondary metadata; Schools-first preserves #1954's delivered behaviour and the current #2014 marker contract, and **#1956 does not redesign field ordering there**. The mock's school-count-primary ordering is explicitly **not adopted**.

---

## 18. Forward ownership of adjacent work

Checked against existing issues rather than assumed.

| Work | Owner | Action for #1956 |
|---|---|---|
| **Complete Schools visual/interaction redesign** (radius chips, homes-near-school, school-primary markers, distance chips, distance sorting, "Choose another school") | **#1954 — CLOSED, delivered.** Forward gaps are open follow-ups: **#1974** (distance sorting), **#1975** (marker trust badge), **#1565** ("Change school" control). | **Do not file a new issue.** #1956 preserves and cites #1954 + the three follow-ups. |
| **Complete Agricultural redesign** (origin/direction/distance-band/town/parcel, sector wedge, cumulative arcs, town rows, parcel cards) | **#1957 → #1958, both OPEN** (Gate 4 PRs A and B). The *Buy/Rent hidden in Agri mode* rule is now **owned by #1958** — [#1958 comment 5094910326](https://github.com/gautirao/udupi-property-explorer/issues/1958#issuecomment-5094910326). | **Do not file.** #1956 preserves and cites them. No unowned Agricultural rule remains. |
| **Expanded property filters (budget, ready-to-move chips)** | **[#2023](https://github.com/gautirao/udupi-property-explorer/issues/2023) — FILED, and explicitly non-blocking for #1956.** #1167 is a hard-gated spike about a *different* problem (top-level pre-area filtering) and is **not** the owner. | **Filed; nothing further required.** #1956 **preserves** today's filter set and does not expand it. |
| Discover V2 epic / roadmap | **NO ISSUE FOUND** — the programme lives in `docs/new-discover-v2/`, not GitHub. | Record only. |
| School-count-**primary** marker ordering with a "View schools" caption | **NOT OWNED BY #1956.** A **non-blocking Schools design follow-up**. #2014 currently specifies the **opposite** ordering (listings primary, school count additive). **Verified by direct issue read that neither existing follow-up covers it:** **#1974** is *sort-only* ("sort the homes-near list ascending by the already-computed distance" — list ordering, not marker field ordering) and **#1975** is a *missing backend field* (expose the public `trustBadge` on `/api/discover/markers` so the popover can show it — a field, not field primacy). | **Do not assign to #1974 or #1975** — their scope genuinely does not cover marker field ordering. Record as a non-blocking Schools design follow-up with no current owner. #1956 implements §2.5's Areas-first ordering only. |

---

## USER_RECONCILED_PLAN_APPROVAL_REQUIRED

Nothing proceeds without user approval. On approval the Main Agent resubmits to PLAN_REVIEW, and no implementation begins before that gate approves.
