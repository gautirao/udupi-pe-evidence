# Frontend Refactoring Roadmap

**Companion to:** `docs/audit/frontend-architecture-audit.md`
**Baseline:** `main` @ `ce1d6aa1`
**Date:** 2026-07-23 · **Revised:** 2026-07-24 (rev 2)

## Governing constraints

- **No rewrite.** Every item is an in-place transformation of existing code.
- **No breaking changes.** Public routes, URL contracts, and API shapes are frozen.
- **No feature regressions.** Behaviour is preserved unless a slice explicitly says otherwise.
- **Every slice is independently mergeable** and independently valuable.
- **Delete no tests to go green.** Repair assertions; never lower the bar.
- **🚧 Do not interfere with #1955.** It is **actively being implemented** in a separate session
  with an **uncommitted working tree**. #1956 is a **planned next milestone issue, not yet
  started** (verified: no branch, no worktree). #1960 is a **future issue**.
- **♿ Accessibility belongs to #1960.** No accessibility work is scheduled before Slice 4.

## Sequencing rule (deterministic)

```text
Do not begin Slice 2, mass Discover moves, or other broad frontend
restructuring until #1955 is committed and merged.
```

This rule is keyed on an **observable repository state**, not on an estimate from an active
session. It is checkable by anyone at any time and cannot silently go stale. Rationale, including
the cost asymmetry that makes deferral correct regardless of timing, is in audit §5.1.

## Coordination categories

This roadmap does **not** use the phrase "safe now". Nothing is unconditionally safe while a
parallel session holds an uncommitted working tree. Every item carries one tag:

| Tag | Meaning |
|---|---|
| **CONFIRM-FIRST** | Safe to implement **only after confirming no overlap** with active work at the time of execution |
| **AFTER-1955** | Safe after #1955 is committed and merged |
| **COORDINATE** | Independent tooling change, but it alters shared developer or CI behaviour — coordinate with active sessions |
| **DEFERRED** | Explicitly not scheduled here |

## On "no behaviour change"

Where this roadmap says a slice is behaviour-neutral, it means:

> **No intended business or visual behaviour change. Runtime, delivery or failure behaviour
> changes only as explicitly described.**

Two items in Slice 1A change something real and say so: **minification** changes production
delivery and runtime characteristics, and **route error boundaries** intentionally change crash
containment. Neither changes what the product does; both change how it is delivered or how it
fails.

## Baseline measurements (re-run these to verify each slice)

```bash
npx tsc -p tsconfig.app.json --noEmit    # baseline: 42 errors in 17 files
npx vitest run                            # baseline: 4552 tests, 10 FAILED, 7 suites
npx eslint .                              # baseline: 97 problems (11 err, 86 warn)
npx vite build                            # baseline: 5.42 MB JS, entry 1529 kB / 298 kB gz
```

## Slice map

| Slice | Theme | Business/visual behaviour change | UI change | Effort | Regression risk | Coordination |
|---|---|---|---|---|---|---|
| **1A** | Trustworthy engineering baseline | **None** *(delivery + crash-containment change explicitly — see above)* | **None** | ~4 days | **Very low** | **Mixed** — per item; two items are **AFTER-1955** |
| **1B** | Housekeeping | **None** | **None** | ~4 days | **Very low** | **Mixed** — per item |
| **2** | State / URL / navigation / side-effect ownership | None (internal) | None | ~14 days | **Low–Medium** | **AFTER-1955**, and before #1956 starts |
| **3** | Decomposition, view models, type safety, validation | None (internal) | None | ~21 days | **Medium** | **AFTER-1955**; split around #1956 |
| **4** | `strict: true`, performance, tooling | None | None | ~17 days | **Low per PR / Medium programme** | After #1956; a11y aligns with #1960 |

**Total ≈ 59 engineering days.** Slices 1A, 1B and 2 deliver most of the value; 3 and 4 are the
long tail and can be paused after any PR without leaving the codebase in a worse state.

> **Rev 2 note.** Slice 1 is now split internally into **1A (trustworthy baseline)** and
> **1B (housekeeping)**. This remains **one roadmap slice** — the count is still four — but the
> split makes execution order clear: 1A is what must exist before *anything else* is safe to
> change; 1B is valuable cleanup that can proceed in parallel or slip without consequence.

---

# SLICE 1 — Baseline and Cleanup

> **Architecture only. No intended business or visual behaviour change. No UI changes.
> Must reduce coupling. Must be mergeable independently.**

This slice exists to make every later slice *verifiable*. Nothing here touches component logic.
It is deliberately front-loaded with the highest value-to-risk ratio work in the roadmap.

> **Not a blanket clearance.** Rev 2 claimed "every item in it is safe to land while #1955 is in
> flight." **That is withdrawn.** Two items — §1A.3 (Supabase regeneration, because #1955 adds
> `V121__navigation_nodes_and_sandbox.sql`) and §1A.5 (route error boundaries, because #1955 will
> add City Launch Preview routing to `App.tsx`) — are now **AFTER-1955**. The remainder are
> **CONFIRM-FIRST** or **COORDINATE**, per item. Read the coordination tag on each.

---

## SLICE 1A — Trustworthy engineering baseline

*The question 1A answers: "can I believe the build, the types, and the tests?" Until the answer
is yes, no later slice can be verified. Nothing in 1A touches feature code.*

### 1A.1 — Enable production minification

| | |
|---|---|
| **Problem** | Production builds ship unminified JavaScript. |
| **Evidence** | `vite.config.ts:28` → `minify: false`, with no explanatory comment — in a file where every other non-obvious decision *is* commented (see `manualChunks` rationale, lines 32-42). Measured: `npx vite build` → **5.42 MB** total JS, entry `index-*.js` **1,529 kB / 298 kB gzip**. `npx vite build --minify esbuild` → **2.65 MB** total, entry **749 kB / 203 kB gzip**. |
| **Why it matters** | **−2.77 MB raw / −95 kB gzipped (−32%)** on the entry chunk. On a 4G connection in the target market this is seconds of load time, plus meaningfully reduced parse/compile cost on low-end Android. |
| **Risk** | Very low. Minification is the Vite default; this repo is the deviation. The only theoretical risk is code depending on `Function.prototype.name` or class names at runtime — grep confirms no such usage. |
| **Effort** | **15 minutes** (+ 1 hour smoke verification). |
| **Migration** | Delete the `minify: false` line. Run `npm run test:e2e:smoke` against a preview build of the minified output. |
| **Regression risk** | **Very low.** Detected immediately by the smoke E2E project if it occurs at all. |
| **Behaviour** | **No intended business or visual behaviour change.** It *does* change production **delivery and runtime characteristics**: smaller payload, different parse/evaluate profile, and minified identifiers in stack traces — which affects Sentry readability unless source maps are uploaded. Verify that alongside the smoke run. |
| **Benefit** | Largest single performance win available, at the lowest cost in the roadmap. |
| **Coordination** | **CONFIRM-FIRST.** Build config only; zero source files touched. Before executing, confirm no active session has pending changes to `vite.config.ts`. |

> ⚠️ **Do not** simultaneously change the `manualChunks` React/leaflet grouping. `vite.config.ts:32-42` documents a real `createContext` init-order crash. Minification and chunking are independent — keep them independent.

---

### 1A.2 — Typecheck gate with a **fingerprint** baseline

| | |
|---|---|
| **Problem** | Nothing typechecks this codebase. `npm run build` is `vite build`, which uses esbuild transpile-only. |
| **Evidence** | `package.json:6-25` contains no `typecheck` script. `npx tsc -p tsconfig.app.json --noEmit` → **42 errors in 17 files** on `main`. Top codes: `TS2769` (11), `TS2345` (10), `TS2339` (10), `TS2740` (7), `TS2322` (3). |
| **Why it matters** | These are not stylistic. `usePropertyListings.ts:504` shows `"agricultural_land"` is not assignable to the accepted `PropertyType` union — for a property family the product actively ships. `usePropertyListings.ts:454-458` shows Supabase generated types have drifted (`column 'area_key' does not exist on 'property_listings'`). These are live correctness risks that no gate can currently see. |
| **Risk** | Low. Adding a script changes nothing until it is wired into CI. |
| **Effort** | **1 day** for the gate; **+1 day** for the Supabase drift cluster (see 1A.3). |
| **Regression risk** | **None to runtime.** Purely additive tooling. |
| **Benefit** | Restores the single most valuable static gate. Prerequisite for Slice 4. |
| **Coordination** | **COORDINATE.** The fingerprint tooling is logically independent of #1955 — it reads types, it does not change them. But **wiring it into CI changes what merges**, and #1955 has 19 uncommitted paths that have never been typechecked. Introducing a gate that could block their merge without warning is a coordination failure, not a technical one. Agree the switch-on point with active sessions, and seed the baseline from a commit they have seen. **This audit session must not implement it.** |

#### Use a fingerprint baseline, not an error count

**A count-based ratchet ("fail if > 42") is unsound.** It permits a *newly introduced* type
error to pass silently whenever an unrelated old error is coincidentally fixed in the same PR:
the count nets to 42, CI goes green, and a new defect has entered `main`. On a 42-error baseline
with 17 affected files, that is not a theoretical edge case.

**Record a set of stable per-error fingerprints instead.** CI fails on any fingerprint **not
present in the baseline**, irrespective of the total.

```
fingerprint = sha1( relativeFilePath + " " + tsErrorCode + " " + normalisedMessage )
```

- **Include the file path** — the same error code in a different file is a different problem.
- **Include the TS error code** (`TS2339`) — cheap, stable, high signal.
- **Include a normalised message** — strip absolute paths; collapse whitespace. Keep type names,
  because `Type 'X' is not assignable to 'Y'` and `Type 'A' is not assignable to 'B'` are
  genuinely different errors.
- **Deliberately EXCLUDE line and column.** Otherwise adding an import at the top of a file
  re-fingerprints every error below it, and the baseline churns on every unrelated PR — which is
  how baselines get abandoned.

**Semantics:**

| Situation | Result |
|---|---|
| New fingerprint appears | ❌ **CI fails** — even if the total count fell |
| Baseline fingerprint disappears | ✅ Passes; **`--prune` removes it** so it can never silently return |
| Same error moves within its file | ✅ No change (line/column excluded) |
| Same error moves to a different file | ❌ Fails as new — correct; it is a new site |

**Migration.**
1. Add `"typecheck": "tsc -p tsconfig.app.json --noEmit"`.
2. Add `scripts/typecheck-baseline.mjs` producing/comparing `typecheck-baseline.json`
   (42 fingerprints), supporting `--update` (explicit, reviewable) and `--prune` (auto-drop fixed).
3. CI runs the comparator, not a bare count. **A baseline addition requires a reviewer to
   approve a diff in a committed JSON file** — which is the point: adding debt becomes visible.
4. Publish the remaining-fingerprint count as a build annotation so the trend is visible.

The same fingerprint mechanism is reused verbatim for the `strict: true` migration in §4.1 —
build it once here.

---

### 1A.3 — Fix the Supabase generated-types drift

| | |
|---|---|
| **Problem** | Generated Supabase types no longer match the queries written against them. |
| **Evidence** | 10 × `TS2339` in `src/hooks/usePropertyListings.ts:454-458`, all of the form `Property 'locality' does not exist on type 'SelectQueryError<"column 'area_key' does not exist on 'property_listings'.">'`. Plus `TS2345` at `:504` — `"agricultural_land"` not assignable to the `PropertyType` union. |
| **Why it matters** | This is the largest single cluster in the 42-error baseline (**~26%**) and the one with genuine runtime consequences: the query and the schema disagree. |
| **Risk** | **Medium — higher than rev 2 stated.** Two distinct risks, which must not be conflated (see below). |
| **Effort** | **1 day** for regeneration; **+1 day** for the `PropertyType` union and its regression tests. |
| **Regression risk** | **Low** for regeneration. **Medium** for the union change — it is potentially behaviour-affecting. |
| **Benefit** | Removes the highest-signal cluster of real drift. |
| **Coordination** | 🚧 **AFTER-1955.** |

### Why this must wait for #1955

**#1955 adds database migrations.** Its working tree contains
`backend/src/main/resources/db/migration/V121__navigation_nodes_and_sandbox.sql`, plus a whole
`discover/navigation/` package and changes to `CityLaunchPromotionService`. **Regenerating
Supabase types against today's schema produces types that go stale the moment V121 lands.** Doing
this work now means doing it twice, and the second run happens after the fingerprint baseline has
already been frozen against the first — which corrupts the baseline rather than shrinking it.

This also means **the fingerprint baseline should be seeded after #1955 merges**, not before. Rev
2's claim that clearing this cluster first "means the baseline starts smaller and more honest" is
withdrawn: a baseline frozen against a schema that is about to change is neither.

### Split the two changes — they carry different risk

**(a) Regenerating `src/integrations/supabase/types.ts` — type-only, low risk.**
Mechanical. Clears the 10 × `TS2339`. The 4,552-test suite verifies runtime behaviour is
unchanged. Do this first, alone.

**(b) Changing the `PropertyType` union — potentially behaviour-affecting, medium risk.**
`usePropertyListings.ts:504` shows `"agricultural_land"` is not assignable to
`"land" | "house" | "commercial" | "other" | "apartment"`. **This is not a type-only fix.** That
union is a runtime value domain, and widening it can change:

- **filter predicates** — code that switches or filters on property type may currently have no
  `agricultural_land` branch, and adding the member can change which listings pass a filter;
- **query construction** — the value is sent to the backend and to OpenSearch;
- **mapping/derivation** — `discoverMappers.ts:108` shows a related union (`seller_type`)
  already failing the same way, so this pattern is not isolated;
- **exhaustiveness** — any `switch` that is currently exhaustive over 5 members stops being
  exhaustive over 6, and a `default` branch may silently absorb the new case.

**Required before merging (b):** focused regression tests covering **mapping, filtering, and
query construction** for `agricultural_land` specifically — proving that an agricultural listing
is included, excluded, and rendered exactly as it is today. Do not rely on the general suite;
these paths are precisely where "the types now allow it" quietly becomes "the behaviour now
differs".

---

### 1A.4 — Get `main` green and keep it green

| | |
|---|---|
| **Problem** | 10 unit tests fail on `main`, in 7 suites. |
| **Evidence** | `npx vitest run` → 4552 tests, **10 failed**, 7 suites. Reproduced: `npx vitest run tests/discover/panels-parity.test.tsx` → **exit 1**, 2 failed / 8 passed. Two distinct causes:<br>**(a)** `tests/discover/panels-parity.test.tsx:259` — `expect(band.className).toContain('bg-card')` fails against actual `'rounded-xl border border-slate-800 bg-[#0F172A] …'`, broken by the intended re-skin in `6ae834cb`.<br>**(b)** `Error: useAuth must be used within an AuthProvider` via `PropertyCard.tsx:147 → useSavedListings.ts:57 → AuthContext.tsx:222` — the suite hand-rolls a render instead of using `src/test/renderWithProviders.tsx`.<br>Plus unhandled `TypeError: map.getSize is not a function` at `AreaMarkerLayer.tsx:486` from an incomplete Leaflet mock. |
| **Why it matters** | Red-on-`main` is the most corrosive state a suite can be in. Once red is normal, 4,552 tests stop being a gate no matter how many there are. |
| **Risk** | Low — but there is a real temptation to delete the failing assertions. Do not. |
| **Effort** | **1 day.** |
| **Migration** | (a) Replace class-string assertions with semantic assertions — assert the `data-testid` renders and, where visual state genuinely matters, assert a `data-variant` attribute rather than a Tailwind class. (b) Migrate the suite to `renderWithProviders`. (c) Extend the Leaflet mock with `getSize()`. |
| **Regression risk** | **Low.** Test-only changes. Guard against weakening by requiring each repaired test to fail when its production code is deliberately broken. |
| **Benefit** | Restores the test suite as a gate — the precondition for every later slice. |
| **Coordination** | **CONFIRM-FIRST.** Test files only; #1955's working tree shows `tests/` clean. Confirm that still holds at execution time. **Valuable before #1956 starts:** its issue body describes re-skinning every Areas panel and adding visual baselines at 1366×768 and 390×844, which would fail every class-string assertion. Fixing them first means #1956's reviewers see only real regressions. *(That footprint is scope-derived — no #1956 branch exists.)* |

---

### 1A.5 — Route-level error boundaries

| | |
|---|---|
| **Problem** | One error boundary for the entire application. |
| **Evidence** | `src/main.tsx:14` — a single `Sentry.ErrorBoundary` wrapping `<App />`, fallback `"Something went wrong. Please refresh the page."` `componentDidCatch` appears **0 times** in production code. `<Suspense>` exists in only 2 files. |
| **Why it matters** | A render error anywhere — an admin table, a broker form — blanks the whole application including Discover. There is no recovery path short of a full reload, and no per-feature diagnostic signal in Sentry. |
| **Risk** | Low. Boundaries only activate on an error that already breaks the app worse. |
| **Effort** | **0.5 day.** |
| **Migration** | Add a shared `<RouteErrorBoundary>` and wrap the four route groups in `App.tsx` (public / broker / admin / discover). Keep the root Sentry boundary as the outermost net. |
| **Regression risk** | **Very low.** |
| **Behaviour** | **No intended business or visual behaviour change** in the success path. It **intentionally changes failure behaviour**: a render error that today blanks the whole application will instead be contained to one route group and surfaced with route attribution in Sentry. That is the point of the change, and it must be described as a change rather than as neutral. |
| **Benefit** | A crash in Admin no longer takes down Discover. **#1955's City Launch Preview is a natural beneficiary** — a preview-rendering failure against sandbox rows stops blanking the admin app. |
| **Coordination** | 🚧 **AFTER-1955** — unless the final #1955 diff proves no overlap. |

> **Why this is not "certainly disjoint".** Rev 2 called this additive and safe. That was
> asserted, not verified. **`App.tsx` is a plausible overlap point:** #1955's Definition of Done
> requires City Launch Preview to support "tree, real journey, direct search, diff, validation",
> and the existing route
> `/admin/city-launch/:cityId/preview/:revisionId` (`App.tsx:381-388`) is where that lands.
> Extending it may well add or restructure routes in the same file this item wraps.
>
> Today's working tree shows `src/` clean, so there is **no current** overlap — but that is a
> snapshot of work that has not reached its frontend phase. **Schedule after #1955, or after
> inspecting its final diff and confirming `App.tsx` is untouched.**

**Slice 1A total: ~5 days** (Supabase item now split into regeneration + union work).
**Business/visual behaviour change: none.** Delivery/runtime characteristics change in §1A.1 and
failure containment changes in §1A.5, both as explicitly described.

**Coordination summary:** §1A.1 CONFIRM-FIRST · §1A.2 COORDINATE (not this session) ·
§1A.3 **AFTER-1955** · §1A.4 CONFIRM-FIRST · §1A.5 **AFTER-1955**.

**Exit criteria:** `npx vitest run` exits 0 · fingerprint baseline seeded **after #1955 merges**
and enforced in CI · entry chunk ≤ 210 kB gzipped · route error boundaries in place ·
`agricultural_land` mapping/filter/query regression tests green.

---

## SLICE 1B — Housekeeping

*Valuable, low-risk cleanup. Independent of 1A, and may slip without blocking anything.*

### 1B.1 — Delete verified-dead code (1,376 LOC)

| | |
|---|---|
| **Problem** | Dead and duplicated modules, including two live components sharing one name. |
| **Evidence** | Importer counts across all 427 production files:<br>• `components/discover/panels/SchoolsInAreaPanel.tsx` — **710 LOC, 0 importers**. Superseded by `SchoolJourneyPanels.tsx`, which exports an identically-named `SchoolsInAreaPanel`.<br>• `components/map/PropertyDetailModal.tsx` — **294 LOC, 0 importers**.<br>• `components/map/filters/*.tsx` — **6 files, 312 LOC, 0 importers each**.<br>• `components/ui/use-toast.ts` — **0 importers** (all 40 consumers use `@/hooks/use-toast`).<br>• `hooks/use-mobile.tsx` (1 importer) vs `hooks/useMediaQuery.ts` (1 importer) — one responsibility, two hooks. |
| **Why it matters** | Two live components named `SchoolsInAreaPanel` is an active navigation hazard: a developer can spend an afternoon editing the unreachable one. The 7 dead files under `components/map/` sit **directly in the directory #1956 will be working in** — removing them shrinks its search space. |
| **Risk** | **Low, not zero.** See the accuracy note below. |
| **Effort** | **1 day.** |
| **Regression risk** | **Low.** A wrong deletion usually fails typecheck immediately — but not in the dynamic-import or route-registration cases, which is why the protocol below exists. |
| **Benefit** | −1,376 LOC. Removes the most confusing thing a newcomer will hit. |
| **Coordination** | **CONFIRM-FIRST** — the six-check protocol below **includes** checking active #1955 changes. |

> **Accuracy correction.** Rev 2 claimed "zero importers means zero conflict surface by
> definition." **That is wrong and is withdrawn.** A static scan of production `from '...'`
> specifiers establishes **low current reachability risk**, not deadness. It does not see test
> imports, dynamic `import()`, route registration, code generation, reflection, or — critically —
> **code on an unmerged branch**. #1955's uncommitted tree is exactly the case a static scan of
> `main` cannot observe.

### Required six-check protocol, per module, before deletion

| # | Check | How |
|---|---|---|
| 1 | **Production imports** | Static specifier scan across all 427 production files → must be 0 |
| 2 | **Test imports** | Same scan across all 301 test files **and** the second root at `tests/` → must be 0 |
| 3 | **Dynamic imports** | Search for `import(`, `require(`, and template-literal specifiers referencing the module name |
| 4 | **Route registration** | Confirm the symbol appears in no `<Route element={…}>` and no `lazy(() => import(…))` in `App.tsx` |
| 5 | **Active #1955 changes** | `git -C <1955-worktree> status --short` and `git diff` — confirm the module is not referenced by in-flight work |
| 6 | **Codegen / reflection** | Confirm no barrel re-export, no glob import (`import.meta.glob`), and no string-keyed component registry resolves it |

Then: delete → `npm run typecheck` → `npx vitest run` → **one commit per module** for clean revert.

**Highest-attention candidates.** `components/map/filters/*` (6 files) are named like a registry
group and are exactly the shape that a glob or string-keyed lookup would resolve — check 6
matters most there. `PropertyDetailModal.tsx` is the shape that a lazy route would reference —
check 4 matters most there.

---

### 1B.2 — Enforce dependency direction with lint rules (as warnings)

| | |
|---|---|
| **Problem** | Nothing prevents new code from landing in the wrong layer, and the layering is already inverted in one place. |
| **Evidence** | `features/discover/views/DiscoverMapCanvas.tsx:37` → `import type { DiscoverBadgeResult } from '@/pages/MapDiscovery'` — a lower layer importing an upper one. `MapDiscovery.tsx:104-126` maintains a re-export shim so it keeps resolving. Type-only today (so no runtime cycle, and the code says so), but the direction is wrong and nothing stops the next one being a value import. `eslint.config.js` has **no import-boundary rules at all**. |
| **Why it matters** | Slices 2 and 3 consolidate Discover. Without an enforced boundary the consolidation decays within a quarter. This rule is what makes the rest of the roadmap durable. |
| **Risk** | Low — introduced at `warn`, so nothing breaks. |
| **Effort** | **1 day.** |
| **Migration** | Add `no-restricted-imports` zones: `features/*` ✗→ `pages/*`; `features/A` ✗→ `features/B`; `shared/*` ✗→ `features/*`. **Ship at `warn` only.** Promotion to `error` happens in Slice 2 after the existing violations are cleared. |
| **Regression risk** | **None.** Lint-only, warning-level. |
| **Benefit** | Converts an architectural intention into a visible signal. **This is the guardrail #1955 and #1956 should adopt** — it tells them where new code belongs without asking them to move anything. |
| **Coordination** | **COORDINATE at `warn`** — it changes lint output for every active session, so announce it rather than landing it silently. ❌ Do **not** promote to `error` while #1955 is unmerged or #1956 is in progress: that would fail their builds for pre-existing violations they did not create. Promotion happens in Slice 2 step 7. |

---

### 1B.3 — Tooling and configuration hygiene

| Item | Evidence | Effort | Coordination |
|---|---|---|---|
| Add `ignores` for `docs/design/**` and `mockup/**` | 22 of 97 lint problems (23%) are parse errors in non-source paths | 0.25 d | **CONFIRM-FIRST** — config only |
| Re-enable `@typescript-eslint/no-unused-vars` (as `warn`) | `eslint.config.js:23` sets it `"off"` — dead locals entirely unmeasured | 0.5 d | **COORDINATE** — changes lint output for active sessions |
| Remove `optimizeDeps: { force: true }` | `vite.config.ts:18-20` — re-optimises deps on **every** dev start; a permanent fix for a transient problem | 0.5 d | **COORDINATE** — changes dev-server startup behaviour for anyone running it |
| Add `"test:coverage"` script | `@vitest/coverage-v8` is a devDependency with no script invoking it | 0.25 d | **CONFIRM-FIRST** — purely additive script |
| Point Playwright `baseURL` at localhost by default | `playwright.config.ts:35` defaults to `https://udupi-property-explorer.pages.dev` — a bare `npx playwright test` tests **production**, not the branch | 0.25 d | **COORDINATE or AFTER-1955** — see note below |
| Add `retries: 1` for E2E | `playwright.config.ts:29` → `retries: 0` on a 686-test suite driving a real map | 0.25 d | **COORDINATE** — changes E2E timing and pass/fail semantics mid-run |
| Consolidate `tests/` into `src/**/__tests__/` | Two test roots; the failing parity suite lives in the minority one | 1 d | **AFTER-1955** — moves test files; defer while any session may add tests |
| Update `browserslist` data | Build warns: "caniuse-lite is 13 months old" | 0.25 d | **CONFIRM-FIRST** |

> **On the Playwright `baseURL` change.** Rev 2 marked this "safe". It is not purely safe:
> **it silently changes what `npx playwright test` does for every developer**, including the
> #1955 session. Someone who currently runs a bare `npx playwright test` expecting the deployed
> environment would, after this change, hit `localhost` — and get confusing failures if no dev
> server is running. The change is *correct* (testing production by default is the actual defect)
> but it is a **shared behaviour change, not a private one**. Either announce it to active
> sessions before landing, or defer it until #1955 merges. The same reasoning applies to
> `retries: 1`, which changes pass/fail semantics for anyone mid-investigation of a flake.

**Slice 1B total: ~4 days. Business/visual behaviour change: none. UI change: none.**
Several items change **developer-facing tooling behaviour** — flagged individually above.

**Exit criteria:** dead code removed **with the six-check protocol evidenced per module** ·
import-boundary rules active as warnings · non-source paths ignored by ESLint · coverage script
exists · Playwright default announced or deferred.

---

# SLICE 2 — State, Navigation, URL, and Side-Effect Ownership

> **Depends on Slice 1A** (green suite + typecheck gate are the safety net for everything here).
> **🚧 Starts only after #1955 merges. Completes before #1956 starts.**

Behaviour-neutral internally: no route, URL parameter, or user-visible state transition changes.

**Why this window.** #1955 reads live Discover components through City Launch Preview, so moves
must wait for it. #1956 then *builds on* everything in this slice — a `node=` parameter, a legacy
compatibility resolver, and a single `CameraIntent` owner. Landing Slice 2 in between means #1956
extends prepared seams instead of cutting new ones through a 1,106-line function.

---

## 2.1 — Consolidate **proven Discover-specific** code into `features/discover/`

| | |
|---|---|
| **Problem** | Discover code lives in four competing homes; `features/discover/` holds only ~40% of it. |
| **Evidence** | `src/components/discover/` **15,646 LOC / 57 files**; `src/features/discover/` **6,040 / 29**; `src/components/map/` **4,771 / 20**; `src/pages/MapDiscovery.tsx` **2,077 / 1**; `src/hooks/useDiscoverUrlState.ts` **1,701 / 1**; plus ~1,900 LOC across `hooks/useDiscover*`, `lib/discover*`, `utils/discover*`, `constants/discover.ts`. |
| **Why it matters** | Adding one journey today requires edits in 4+ directories with no rule about where new code belongs. This is the root cause of the onboarding difficulty in audit §8. |
| **Risk** | **Low-Medium** — reduced from rev 2 by replacing six move-heavy PRs with dependency-direction fixes, enforced boundaries, and opportunistic relocation. See the revised strategy below. |
| **Effort** | **3 days** (was 5 — path-only churn largely eliminated). |
| **Regression risk** | **Low.** Typecheck + 4,552 tests catch any broken path immediately. |
| **Benefit** | Correct dependency direction, **enforced**. One home per feature achieved incrementally rather than by mass relocation. |
| **Coordination** | 🚧 **AFTER-1955.** See the deterministic rule below. |

### Why this waits for #1955 — deterministic rule, not an estimate

```text
Do not begin Slice 2, mass Discover moves, or other broad frontend
restructuring until #1955 is committed and merged.
```

> **⚠️ Correction carried from rev 3.** Rev 2 justified this deferral primarily on **merge
> conflicts**. Direct inspection showed that reason does not hold:
> ```
> git -C .../issue-1955-areas-hierarchy-pr-a status --short
>   -> 19 changed paths: backend/infra 19, frontend (src/e2e/tests) 0
> git -C ... log --oneline origin/main..HEAD
>   -> (empty - zero commits ahead; all work uncommitted)
> ```
> **The merge-conflict argument is withdrawn.** The disjoint path sets are retained here as
> evidence of exactly one thing — **there is no current textual overlap** — and explicitly **not**
> as a reason to begin concurrent refactoring. Absence of overlap in a snapshot is not a property
> of the work; #1955 has not reached its frontend phase.

**The rule is deliberately not conditional on an estimate.** Rev 3 asked the #1955 session when
its City Launch Preview frontend work would start and branched the recommendation on the answer.
**That question has been removed.** Roadmap sequencing must not depend on a forecast from a party
who is mid-implementation: it is unverifiable, it goes stale silently, and building on it repeats
the scope-derived reasoning that produced the withdrawn claim above. A rule keyed on an observable
repository state — *is #1955 merged?* — is checkable by anyone, at any time.

### Why deferral is correct at any timing — the cost asymmetry

The two options are not symmetric, so no estimate is needed to choose between them:

| | Cost of deferring | Cost of proceeding concurrently |
|---|---|---|
| What is paid | Some Discover code is written against the pre-consolidation layout and moved later | An active session's **uncommitted** working tree absorbs a structural change mid-implementation |
| Who pays | The roadmap, in mechanical rework | The #1955 session, in lost context and manual reconciliation |
| Recoverability | **High** — re-export shims keep old paths resolving; import rewrites are mechanical and compiler-verified; 4,552 tests prove correctness | **Low** — no commits to rebase onto; reconciliation is manual and error-prone |

**Temporary path churn is cheap. Disrupting parallel uncommitted work is not.** A re-export shim
means an old import path keeps resolving after a module moves, so a later consolidation is
*additive* rather than breaking. Rewriting imports is mechanical and compiler-verified. **None of
those safety properties exist for a working tree with no commits to fall back to.** Deferral
trades a cheap, recoverable cost for avoidance of an expensive, unrecoverable one.

### The two remaining substantive reasons

1. **Churn.** #1956's issue body states it deletes `utils/macroRegionResolver.ts` and all 7
   consumers (`DiscoverRightPanel.tsx`, `AreaGroupsLandingPanel.tsx`, `SchoolJourneyPanels.tsx`,
   `useDiscoverMapPresentation.ts`, `useDiscoverCameraOrchestration.ts`,
   `DiscoverRightPanelContainer.tsx`, `MapDiscovery.tsx`). Moving files that are about to be
   deleted or heavily rewritten is work performed twice. *(Scope-derived — no #1956 branch
   exists.)*
2. **Forward-looking overlap.** #1955's Definition of Done requires City Launch Preview to
   support "tree, real journey, direct search, diff, validation" by reusing live Discover
   components, and will touch admin routing. `pages/admin/CityLaunchPreview.tsx` already imports
   `components/discover/SimulatedPreviewRibbon.tsx` — the only import of `src/components/discover/`
   from outside Discover.

### Scope boundary: what moves and what does **not**

Moves are decided by **importer analysis**, not directory name.

**✅ Move — proven Discover-specific (0 non-Discover importers):**

| Module | Discover importers | Destination |
|---|---|---|
| `components/discover/**` (56 files, minus `SimulatedPreviewRibbon`) | internal | `features/discover/components/` |
| `utils/discoverPanelState.ts` | 9 | `features/discover/state/` |
| `utils/discoverLayerRegistry.ts` | 6 | `features/discover/presentation/` |
| `utils/areaNameSummary.ts` | 3 | `features/discover/presentation/` |
| `map/RegionGuidanceCard.tsx` | 7 | `features/discover/map/` |
| `map/ExploreMapPanel.tsx`, `map/NearSchoolSheet.tsx` | 1 each | `features/discover/map/` |
| `hooks/useDiscover*.ts` | — | `features/discover/api/` and `/state/` |

**❌ Do NOT move — shared map infrastructure:**

| Module | Why it stays shared |
|---|---|
| `map/DrawControl.tsx` | Imported by `components/dealer/BoundaryDrawStep.tsx` — a **broker** flow. Moving it forces `features/broker/` → `features/discover/`, a sibling dependency the 1B.2 rules forbid. **We would create a boundary violation while enforcing boundaries.** |
| `lib/map/zoomPolicy.ts` | Imported by `hooks/useZoomBand.ts` as well as Discover. Generic zoom math. |
| `lib/map/areaClusterSplit.ts`, `areaMarkerBucketing.ts`, `regionCompassLayout.ts` | Pure geometry/layout. No Discover concepts. |
| `map/PropertyMap.tsx` | Discover-only *by current importers*, but it is the generic Leaflet renderer shell and hosts `DrawControl`. Keep in `shared/map/`; move only Discover-semantic layers. |
| `map/SchoolMarkerLayer.tsx`, `SectorOverlay.tsx`, `SchoolZoneLabelLayer.tsx`, `PopularSchool*` | Generic Leaflet layers consumed by `PropertyMap`. |
| `utils/discoverGroupBounds.ts` | Imported by `PropertyMap.tsx` despite the name. |
| **`utils/macroRegionResolver.ts`** | **#1956 deletes it.** Leave it exactly where it is. |

Destination for the "do not move" set: `shared/map/` (audit §9).

> **Methodological honesty.** An importer count of "1, from `PropertyMap`" means *map-internal*,
> not *shared with another feature*; the raw count cannot distinguish those. The table above is a
> judgement informed by the data. **Re-verify per module at execution time**, and when a module is
> genuinely ambiguous, leave it shared — a wrongly-shared module is a cosmetic problem, a wrongly
> moved one is a boundary violation.

### Migration — consolidation by invariant, not directory uniformity

> **Strategy revised.** Rev 2 made this **six move-heavy PRs** relocating ~86 files. That is the
> wrong centre of gravity. Path-only moves produce very large diffs, destroy `git blame`
> ergonomics for a quarter, generate rebase pain for every parallel branch, and — critically —
> **buy no architectural guarantee on their own**. A file in a different directory with the same
> inverted import is no better than before. **The goal is architectural consolidation, not
> directory uniformity for its own sake.**

**Ordered by value, not by directory:**

**Step 1 — Fix inverted dependencies (highest value, smallest diff).**
The concrete defect is `features/discover/views/DiscoverMapCanvas.tsx:37` importing
`DiscoverBadgeResult` from `@/pages/MapDiscovery`, propped up by the re-export shim at
`MapDiscovery.tsx:104-126`. **Fix the direction without moving anything**: the badge types
already live in `features/discover/presentation/discoverBadge.ts` — point the import there and
retire the shim. This removes the single architectural violation in the codebase in a diff of a
few lines. *No file moves required.*

**Step 2 — Establish ownership and boundary rules.**
Write down which modules are Discover-specific and which are shared map infrastructure (the table
above), then encode it. Promote the §1B.2 `no-restricted-imports` rules from `warn` to `error`
once step 1 has cleared the only existing violation. **From this point, new code cannot land in
the wrong layer** — which captures most of the durable benefit of consolidation before a single
file has moved.

**Step 3 — Move opportunistically, when a module is being changed anyway.**
When §2.2 splits the URL state into capability domains, the resulting modules are *written* into
`features/discover/state/` — not moved there later. When §3.1 extracts view models, the builders
are *created* in `features/discover/presentation/`. **Relocation rides along with work that
already touches the file**, so the move costs nothing extra and the diff is reviewed as one
coherent change.

**Step 4 — Pure path-only moves, only where they unlock a stated invariant.**
A move with no accompanying change is justified only when it makes a boundary rule *enforceable*
that otherwise cannot be. Two qualify:

| Move | Invariant it unlocks |
|---|---|
| Establish `shared/map/` and relocate `DrawControl` + `lib/map/*` geometry into it | Lets `features/broker/` depend on `shared/map/` instead of `features/discover/`, making the "no sibling-feature imports" rule satisfiable. **Without this move the rule cannot be turned on.** |
| Relocate `utils/discoverPanelState.ts`, `discoverLayerRegistry.ts`, `areaNameSummary.ts` (9/6/3 Discover-only importers) into `features/discover/` | Lets `utils/` be declared shared-only, so `shared/* ✗→ features/*` becomes enforceable |

Everything else — notably the 57 files in `components/discover/`, which are already
Discover-internal and violate no rule — **moves under step 3 or not at all this slice.** They are
in the wrong directory, but being in the wrong directory is a *readability* cost, not an
architectural one, and it does not justify an 86-file diff across a live programme.

### Every shim gets a deletion acceptance criterion

Re-export shims are what make the whole strategy cheap and reversible — and they are also how
"temporary" compatibility layers become permanent. **No shim may be introduced without a written
deletion AC in the same PR.** Record them in a single tracked table:

| Shim (old path) | Introduced by | Deletion AC | Owner |
|---|---|---|---|
| `pages/MapDiscovery.tsx` badge/count re-exports (`:104-126`) | pre-existing (#1824 S9a) | **Delete when** its 5 unit-test importers + `DiscoverMapCountBadge.tsx` import from `features/discover/presentation/discoverBadge.ts` directly. **Verify:** `grep` for `from '@/pages/MapDiscovery'` returns 0 | Step 1 |
| *(each new shim)* | *(PR #)* | **Delete when** `grep` for the old specifier returns 0 across `src/`, `tests/`, and `e2e/` | *(that PR)* |

A shim whose AC is met and which is still present is **debt, and fails the slice exit criteria.**
A shim with no AC must not be merged.

---

## 2.2 — Split `useDiscoverUrlState` into **capability domains** behind one facade

| | |
|---|---|
| **Problem** | A single 1,106-line function owns parsing, normalisation, defaulting, serialisation, and all 37 actions. |
| **Evidence** | `src/hooks/useDiscoverUrlState.ts` — **1,702 LOC**; the hook function spans **1,106 lines** (`:595`). **36 importers.** Exports 8 symbols. Contains 1 of the 29 `exhaustive-deps` suppressions. The 37 action names are enumerated in `DiscoverContext.tsx:62-100`. |
| **Why it matters** | It is the second-largest function in the codebase and the load-bearing centre of the entire Discover URL contract. Every journey change routes through it. |
| **Risk** | **Medium-High** — the highest-risk item in Slice 2. Mitigated by the strongest test asset in the repo: `src/hooks/__tests__/useDiscoverUrlState.test.ts` is **3,703 LOC**, the largest test file present. |
| **Effort** | **5 days.** |
| **Regression risk** | **Medium** — mitigated by an exceptional existing test. Do not change the exported signature; `DiscoverContext.tsx`'s compile-time `ACTION_KEYS` exhaustiveness check will fail the build if the action surface drifts. |
| **Benefit** | The 1,106-line function drops to ~150 lines of composition. Each domain becomes independently testable. **Gives #1956 a prepared seam instead of a monolith.** |
| **Coordination** | 🚧 **AFTER-1955**, and before #1956 starts. This is the highest-value sequencing decision in the roadmap. |

### Capability domains, not one `urlActions.ts`

Rev 1 recommended extracting a single `urlActions.ts`. **That is wrong** — it would move 37
actions from one large file into another large file, preserving the coupling and achieving only
a smaller line count in the original. The 37 actions already **cluster by capability**; the
domains are latent in their names and merely lack a module boundary.

| Domain | Actions it owns | URL params |
|---|---|---|
| **`city`** | `changeCity`, `setCity` | `city` |
| **`area`** | `selectArea`, `deselectArea`, `clearAreaSelection`, `clearAreaContext`, `selectGroup`, `selectRegionalGroup`, `enterGroupResults`, `clearGroupResults`, `setRegion`, `setScope`, `setLocality`, `clearLocality` | `areaKey`, `groupId`, `region`, `scope`, `locality` |
| **`school`** | `setSchoolParams`, `clearSchoolSelection`, `clearSchoolContext`, `enterSchoolPicking`, `clearSchoolPicking`, `backToSchoolPicking`, `setSchoolJourney` | `schoolId`, `radiusKm`, `schoolJourney` |
| **`agricultural`** | `clearAgriFilters`, `setBoardFilters`, `setCategoryFilters`, `setMaxKm`, `setRegionWithMaxKm`, `clearRegionAndMaxKm` | `board`, `category`, `maxKm` |
| **`filters`** | `setFiltersLive`, `setFiltersCommitted`, `setSearchQuery`, `clearAllFiltersAndSearch`, `setIntent` | `q`, `intent`, filter params |
| **`viewport`** | `reportViewport` | `lat`, `lon`, `zoom` |
| **`compatibility`** | legacy-param normalisation and the stale-link resolution ladder | reads legacy, writes canonical |

Each domain exposes `parse` / `serialize` / `actions` over **only its own params**. A single
public facade composes them and preserves the current `[state, actions]` signature byte-identically.

### Why the `compatibility` domain is the key to #1956

#1956 must:

- add one additive `node=<stable-node-key>` parameter;
- add a resolver normalising legacy `groupId`, `region`, `areaKey`, and `scope` to `node=` via
  `history.replace`, "while preserving old deep links";
- implement a stale-link ladder: *existing node key → canonical area key → nearest valid
  ancestor → city root*.

Current legacy-param footprint: **`groupId` 239 occurrences / 27 files · `areaKey` 906 / 104 ·
`scope` 539 / 65.**

Adding a new URL identity scheme *and* a legacy-normalisation ladder into an undifferentiated
1,106-line function is materially harder and riskier than adding it into a named `compatibility`
domain with a defined input (legacy params) and output (canonical params). **Slice 2.2 exists in
large part to hand #1956 that module.** #1956 then adds `node=` to the `area` domain and its
resolver to `compatibility` — an additive change to prepared seams.

### Migration

One PR per domain, in ascending coupling order — `viewport`, `city`, `agricultural`, `school`,
`filters`, `area`, `compatibility` — each keeping the public signature identical and **running
the 3,703-line test file after every step**. `compatibility` lands last and, at that point,
contains only the extracted legacy handling; #1956 extends it.

---

## 2.3 — Make `DiscoverProvider` the sole URL-state owner (finish the job)

| | |
|---|---|
| **Problem** | `MapDiscovery` reconstructs `urlState`/`urlActions` from the facade purely so ~100 existing `urlState.x` references keep compiling. |
| **Evidence** | `MapDiscovery.tsx:132-135`: "MapDiscovery is no longer a production caller of `useDiscoverUrlState()`… `urlState`/`urlActions` are reconstructed here purely so the ~100 existing `urlState.x` … references" continue to work. `DiscoverContext.tsx:33-38` confirms the provider is now the sole caller. |
| **Why it matters** | The shim keeps `MapDiscovery` reading state as one flat object, which is exactly what forces the 98-prop pass-through in §3.1. Removing it is the prerequisite for that work. |
| **Risk** | Low-Medium. Mechanical but touches ~100 references. |
| **Effort** | **2 days.** |
| **Migration** | Replace `urlState.x` with the appropriate `useDiscoverNav()` / `useDiscoverViewport()` / `useDiscoverShell()` accessor, in batches of ~20 references per PR. Delete the reconstruction shim last. |
| **Regression risk** | **Low.** Typecheck catches every miss; the four-context split means a wrong accessor fails to compile. |
| **Benefit** | Completes the facade migration. Unblocks §3.1. |
| **Coordination** | 🚧 **AFTER-1955**, and before #1956 starts — it touches `MapDiscovery.tsx`, which #1956's stated scope edits heavily. |

---

## 2.4 — Retire the 29 `exhaustive-deps` suppressions **by behavioural category**

| | |
|---|---|
| **Problem** | 29 suppressed dependency arrays — each a potential stale closure. |
| **Evidence** | 31 `eslint-disable` in production = **29 `exhaustive-deps`** + 1 `no-unused-vars` + 1 false-positive comment. (Rev 1 reported 28; line-level extraction gives 29.) Concentrated in `MapDiscovery.tsx` (5), `useDiscoverJourneyTransitions.ts` (4), `useDiscoverPageState.ts` (3), `Trends.tsx` (3), `useDiscoverCameraOrchestration.ts` (2). |
| **Why it matters** | A stale closure in camera orchestration presents as an intermittent, unreproducible map-positioning bug — the hardest class of defect to diagnose. |
| **Risk** | **Varies by category** — which is the entire point of classifying first. |
| **Effort** | **2 days.** |
| **Coordination** | 🚧 **AFTER-1955.** Category C will be **co-owned with #1956** — see below. |

### Fix by category, with a regression test per category

Rev 1 prescribed "one suppression per PR". **That is the wrong unit of work.** It treats a
load-bearing, three-times-proven memo dependency and an undocumented mount-only effect as
identical tasks, producing 29 context-switches for what is really five decisions — and it gives
no guidance on which are dangerous.

**Classify by behaviour, then fix each category with a shared pattern and a regression test that
encodes the intended behaviour.** The test is what makes the change safe: a corrected dependency
array without a test proving *why* the narrow list was correct just re-litigates the same
question at the next edit.

| Cat. | Behaviour | Count | Fix pattern | Regression test to write first | Risk |
|---|---|---|---|---|---|
| **A** | **Mount-only initialisation** (`deps: []`) | 6 | Replace with a named `useMountEffect` (or documented ref guard) so intent lives in code, not in a suppression | "runs exactly once across N re-renders with changed inputs" | **Low** |
| **B** | **Deliberate single-key trigger** | 8 | Extract the trigger key as a named derived value; comment what must *not* re-fire it | "re-fires when the key changes; does **not** re-fire when the excluded inputs change" | **Low-Med** |
| **C** | **Camera / journey orchestration** | 7 | Behavioural test **first**, then correct the deps | "camera issues exactly one intent per navigation; a stale debounced viewport does not override it" | **High** |
| **D** | **`useMemo` in `MapDiscovery`** | 5 | **Do not fix.** Dissolves via §3.1 view-model extraction | — (deferred) | **N/A** |
| **E** | **Data-fetch effects** | 3 | Convert to React Query derived state where the cache already does the work | "no refetch on unrelated re-render" | **Low** |

**Category A sites:** `Trends.tsx:92` (already documented "intentional mount-only: normalizes
initial URL before interaction"), `DiscoverRightPanel.tsx:1074`, `useDiscoverUrlState.ts:818`,
`useResidentialLocation.ts:143`, `ListingDetailBoundaryMap.tsx:43`, `BoundaryDrawStep.tsx:57`.

**Category B sites:** `DiscoverContext.tsx:183` `[searchParamsKey]` — ⚠️ **load-bearing and
proven; leave the behaviour untouched**, at most convert the suppression into an explicit named
pattern · `useDiscoverSearchState.ts:42` · `useDiscoverJourneyTransitions.ts:441` ·
`useDiscoverPageState.ts:166/176/194` · `AreaGroupSelectedPanel.tsx:247` · `DrawControl.tsx:82`.

**Category C sites:** `useDiscoverCameraOrchestration.ts:307,397` ·
`useDiscoverJourneyTransitions.ts:494,552,636` · `useDiscoverBadgeAnnounce.ts:57` ·
`AreaMarkerLayer.tsx:659`.

> ### ⚠️ Category C is co-owned with #1956
> #1956 requires routing "all breadcrumb camera fits through the single `CameraIntent` owner"
> and specifies an E2E test for precisely this failure mode: *"Camera race — breadcrumb/direct
> navigation must not be overwritten by stale debounced viewport replace."* `CameraIntent`
> currently spans 5 files (`AreaMarkerLayer.tsx`, `PropertyMap.tsx`, `DiscoverMapCanvas.tsx`,
> `useDiscoverMapData.ts`, `MapDiscovery.tsx`).
>
> **Recommendation: in Slice 2, write the category-C regression tests but change no camera
> dependencies.** The tests are pure additions that encode current intended behaviour, and they
> become #1956's safety net for the consolidation it must perform anyway. Correcting the
> dependencies *and* consolidating the `CameraIntent` owner in two separate efforts risks two
> teams solving the same problem differently. **Let #1956 own the camera change; give it the tests.**

Categories A, B, and E — 17 suppressions — are fully in scope for Slice 2. Category D defers to
§3.1. Category C contributes tests only.

**Slice 2 total: ~12 days** (was 14 — §2.1 reduced from 5 to 3 days by eliminating path-only churn). **Business/visual behaviour change: none (internal only).**

**Exit criteria:** the `features/` → `pages/` inverted dependency removed and its shim deleted ·
import-boundary rules at `error` · `shared/map/` established so the sibling-feature rule is
satisfiable · `useDiscoverUrlState` composed from 7 capability domains, facade ≤ 200 lines ·
categories A/B/E cleared · category C regression tests written and passing · **every shim
introduced in this slice has a recorded deletion AC, and every met AC has been actioned.**

Note the exit criteria are stated as **invariants achieved**, not as directories emptied. Files
remaining in `components/discover/` is not a failure of this slice provided no boundary rule is
violated; they relocate opportunistically under step 3 as later work touches them.

---

# SLICE 3 — Decomposition, View Models, Type Safety

> **Depends on Slice 2** (§3.1 requires §2.3 complete).
> **🚧 Split around #1956** — §3.2 and §3.4 are *foundations* that land before it; the rest waits.

The highest-value, highest-risk slice. Every item is scoped to one component at a time.

---

## 3.1 — Narrow the 98- and 77-prop integration boundaries into view models

| | |
|---|---|
| **Problem** | `DiscoverMapCanvasProps` has **98 props**; `DiscoverRightPanelContainerProps` has **77**. `MapDiscovery` is a **1,949-line function** computing all of them. |
| **Evidence** | `DiscoverMapCanvas.tsx:59-192`. The file documents the cause honestly (`:39-58`): the JSX was lifted "VERBATIM" with "every value the JSX reads received as a PROP — no derived-const/handler/hook/badge-helper moves". `:55-57` notes the component "is NOT `React.memo`'d (render-neutral per the plan's default hypothesis)" — a hypothesis **stated but not measured**. |
| **Why it matters** | A *correct step one that was never followed by step two*. Step one moved 300 lines of JSX and zero lines of logic. Today every map-canvas change is a wide two-file diff, and `React.memo` is impossible because inline-constructed object literals (`schoolCircle`, `focusBounds`, `schoolRadiusChrome`) defeat referential equality. |
| **Risk** | **Medium-High** — the highest-risk item in the roadmap. Discover is the product's core surface. |
| **Effort** | **6 days.** |
| **Migration** | **Do not move state in the same PR as changing the signature.** Per PR: (1) group ~10 related props into one cohesive view-model object (`MapCameraVM`, `MapMarkersVM`, `SchoolOverlayVM`, `BadgeVM`, `MapChromeVM`…), built by a **pure** `build*VM()` function in `features/discover/presentation/`; (2) unit-test the builder directly; (3) only once all groups exist, move each builder's inputs down out of `MapDiscovery`. Target ~8 view-model props. Then measure re-renders with the React Profiler **before** adding `React.memo` — do not memo on faith. |
| **Regression risk** | **Medium.** Covered by `src/pages/__tests__/MapDiscovery.*` plus the `journey` E2E project. Run `npm run test:e2e:journey` on every PR in this item. |
| **Benefit** | `MapDiscovery` drops from ~1,949 to an estimated ~600 lines. Map-canvas changes become single-file. View-model builders become independently testable pure functions. Unblocks meaningful memoisation. |
| **Coordination** | **DEFERRED until #1956 completes.** It rewrites `MapDiscovery.tsx` and both view containers — the files #1956's stated scope changes most. |

---

## 3.2 — Validate API responses at the boundary ⭐ *foundation — before #1956*

| | |
|---|---|
| **Problem** | Every backend response is trusted and unchecked. |
| **Evidence** | `src/lib/api.ts:76-78`: `const text = await response.text(); if (!text) return undefined as T; return JSON.parse(text) as T;` — `as T` is an unverifiable assertion. Combined with `strictNullChecks: false`, nothing checks any response shape. `zod@3.25.76` is a **production dependency used in exactly one file**: `src/lib/schemas/auth.ts`. |
| **Why it matters** | The only finding whose failure mode is **silent incorrect data** rather than a crash. A backend field rename surfaces as `undefined` deep inside a component, far from its cause. The 10 `TS2339` Supabase-drift errors are this exact class, already occurring. |
| **Risk** | Low-Medium. A schema stricter than reality turns working requests into errors — so parse permissively and log before enforcing. |
| **Effort** | **4 days** for the top ~10 endpoints. |
| **Migration** | 1. Add `api.getValidated<T>(path, schema)` alongside the existing methods — **do not change `api.get`**. 2. Roll out endpoint by endpoint, highest-traffic first (discover listings, area groups, school search, listing detail). 3. **Ship in log-only mode first**: on `safeParse` failure, report to Sentry and return the raw payload. 4. After a soak period with no unexpected reports, promote to throwing. |
| **Regression risk** | **Low**, given the log-only phase. |
| **Benefit** | Type assertions become type *guarantees* at the one place it matters. |
| **Coordination** | 🚧 **AFTER-1955**, and land before #1956 starts. ⭐ #1955 introduces two typed endpoints — `/navigation/{nodeKey}` and `/areas/{areaKey}/navigation-path` — returning nested ancestry, `nextLevelType`, bounds, and merged dynamic counts. That is exactly the nested contract where an unvalidated `as T` fails silently. #1956 consumes them. **Give #1956 `getValidated` and it can define schemas for the new endpoints as it writes them** — far cheaper than retrofitting. Purely additive; conflicts with neither issue. |

---

## 3.3 — Split `PropertyMap.tsx` (1,969 LOC, 17 effects, 17 inner components)

| | |
|---|---|
| **Problem** | The largest map component holds 17 distinct inner components in one file. |
| **Evidence** | 1,969 LOC, **17 `useEffect`**, only 1 `useState`, and 17 inner components: `MapReadySignal`, `ZoomWatcher`, `ViewportWatcher`, `BoundsWatcher`, `AreaPanner`, `SchoolFocusPanner`, `SchoolMarkerFocusPanner`, `AreaRestorePanner`, `CityRestorePanner`, `URLViewportController`, `MapController`, `MarkerClusterLayer`, `AgriMarkerClusterLayer`, `AgriPolygonLayer` + constants. |
| **Why it matters** | Note the ratio: **17 effects, 1 state**. This is *correct* design — declarative React wrappers over Leaflet's imperative API, where effects are the right tool. The problem is purely file organisation. Two engineers cannot touch two different map controllers without conflicting. |
| **Risk** | **Low** — pure file moves, no logic change. |
| **Effort** | **3 days.** |
| **Migration** | Move the 7 `*Panner`/`*Watcher`/`*Controller` components to `shared/map/controllers/` (one file each) and the 3 layer components to `shared/map/layers/`. `PropertyMap.tsx` becomes composition only (~250 lines). **Destination is `shared/map/`, not `features/discover/map/`** — per §2.1, `PropertyMap` is the generic renderer and hosts `DrawControl`. Preserve every comment verbatim. |
| **Regression risk** | **Low.** Covered by `PropertyMap.test.tsx` (893 LOC) and `AreaMarkerLayer.test.tsx` (1,449 LOC). |
| **Benefit** | Parallel work on map controllers becomes possible. |
| **Coordination** | **DEFERRED until #1956 completes** — it touches map fit, markers, and the `CameraIntent` owner, several of which live in these files. |

---

## 3.4 — De-duplicate the API error handler ⭐ *foundation — safe any time*

| | |
|---|---|
| **Problem** | Server error-shape parsing is copy-pasted verbatim across four files. |
| **Evidence** | Identical 6-line block in `AgriculturalListingForm.tsx`, `CommercialListingForm.tsx`, `ResidentialListingForm.tsx`, `editListing/EditListingForm.tsx`:<br>`const apiErr = error as ApiError; const body = apiErr.body as Record<string, unknown> \| undefined; const message = (body?.message as string \| undefined) ?? (body?.error as string \| undefined) …`<br>Review-preview tile rendering is separately duplicated across all three `*ReviewPreview.tsx` files. |
| **Why it matters** | The duplicated block is **business logic** (the server error contract), not boilerplate. Four copies means a backend error-shape change requires four correct edits — and any missed copy fails silently as a generic message. |
| **Risk** | Low. |
| **Effort** | **2 days.** |
| **Migration** | Extract `extractApiErrorMessage(error: unknown): string` into `lib/api.ts` beside `ApiError`. Replace all four call sites in one PR (identical text, mechanically verifiable). Extract `<ReviewTileGrid>` into `components/broker/_shared/`. |
| **Regression risk** | **Low.** Covered by `EditListing.agri.test.tsx` (914 LOC) and `EditListing.residential.test.tsx` (871 LOC). |
| **Benefit** | Single source of truth for the server error contract. |
| **Coordination** | **CONFIRM-FIRST.** Broker-only files; neither issue's stated scope touches them. Re-verify against the active worktree before executing. |

> **Explicitly out of scope:** migrating the 69 `useState` calls in `ResidentialListingForm.tsx`
> to `react-hook-form`. That is a rewrite of a working, tested, revenue-path form — not a
> refactor. Log it as a separate future initiative.

---

## 3.5 — Retire `dealer` terminology

| | |
|---|---|
| **Problem** | Project terminology is **Broker**; `dealer` persists in files, hooks, and live cache keys. |
| **Evidence** | `src/components/dealer/BoundaryDrawStep.tsx`, `src/hooks/useDealerListings.ts`. **72 occurrences across 16 production files.** Live React Query cache keys inside `useBrokerListings.ts`: `'dealer-listings'` (13 uses), `'dealer-listings-infinite'` (13), `'dealer-listing-stats'` (13). Also in a type union — `discoverMappers.ts:108` errors on `'"dealer" \| "broker" \| "owner" \| "builder"'`. |
| **Why it matters** | A file called `useBrokerListings.ts` whose cache keys all say `dealer` is exactly the ambiguity that makes cache-invalidation bugs hard to spot, and it directly harms onboarding. |
| **Risk** | **Low-Medium.** Cache keys are runtime strings — a partial rename splits the cache and breaks invalidation. |
| **Effort** | **2 days.** |
| **Migration** | **Separate the two renames.** PR 1: rename files/directories/symbols only, leaving cache-key strings untouched. PR 2: rename cache keys in a single atomic change (all 39 occurrences together — a partial rename is worse than none), and adopt `lib/listingQueryKeys.ts` (currently only **4 importers** despite 37 distinct query-key roots declared inline across 41 files). |
| **Regression risk** | **Medium for PR 2**, low for PR 1 — hence the split. Verify with an E2E broker journey confirming a listing edit invalidates the list view. |
| **Benefit** | Removes the most persistent naming ambiguity; begins centralising 37 scattered query-key roots. |
| **Coordination** | **DEFERRED until #1956 completes.** `BoundaryDrawStep.tsx` imports `map/DrawControl.tsx`; low collision risk, but the cache-key rename is atomic and best done on a quiet tree. |

---

## 3.6 — Lazy-load `MapDiscovery` — **only if measurement justifies it**

| | |
|---|---|
| **Problem** | The largest page in the app is eagerly imported. |
| **Evidence** | `App.tsx:17-21` eagerly imports `MapDiscovery` (2,078 LOC + the full map/Discover stack). Entry chunk **1,529 kB** while the largest lazy route is 197 kB. `App.tsx:33-42` separately documents that a `vendor-leaflet` `modulepreload` survives regardless, because `vite.config.ts` groups `react-leaflet` into `vendor-react` — an edge no source change can remove. That comment records the related AC as **NOT_SATISFIED**. |
| **Why it matters** | Users landing on `/` may be paying for the entire map stack before seeing anything — **but "may be" is the operative phrase.** Chunk bytes are an input to user-perceived performance, not a measure of it. |
| **Risk** | **Medium.** Discover is the primary surface; a lazy boundary adds a loading state on the most important route. A change that trades a smaller entry chunk for a *slower* Discover navigation is a net loss. |
| **Effort** | **1 day to measure, 2 days to implement if justified.** |
| **Regression risk** | **Medium.** `src/__tests__/App.lazyRoutes.test.ts` already exists and asserts on lazy-route composition — extend it. |
| **Coordination** | **DEFERRED until #1956 completes.** It changes how `MapDiscovery` mounts. |

### Measure first — four required metrics

**Do not implement this on the strength of chunk size.** Take a baseline and a candidate
measurement of all four, on a throttled mid-range device profile, for both a cold landing-page
visit and a landing → Discover navigation:

| Metric | Why it decides the question |
|---|---|
| **LCP** on `/` (landing) | The actual user-facing benefit being claimed. If LCP does not improve, there is no case. |
| **Navigation latency** `/` → `/discover` | The cost being incurred. A lazy boundary adds a chunk fetch on the most important transition. |
| **Script parse/evaluate time** | Where minification (§1A.1) already helps. Parse cost may already be acceptable, making this change unnecessary. |
| **Residual `vendor-leaflet` preload** | `App.tsx:33-42` says the preload survives source-level changes because of chunk assignment. **If Leaflet still preloads after lazifying, most of the theoretical win does not materialise** — this is the metric most likely to kill the change. |

**Decision rule:** proceed only if LCP on `/` improves measurably **and** navigation latency
`/` → `/discover` does not regress beyond an agreed budget. **Abandon and document otherwise.**
Sequence strictly after §1A.1 — minification may make this moot on its own.

**Slice 3 total: ~21 days. Business/visual behaviour change: none (internal only).**

**Exit criteria:** no prop interface >15 props · `MapDiscovery` ≤ 700 lines · top-10 endpoints
validated · zero duplicated error handlers · zero `dealer` in production code · lazy-load
decision made **on measured evidence** and documented either way.

---

# SLICE 4 — Strict TypeScript, Accessibility, Performance, Tooling

## Is Slice 4 genuinely required?

**Yes — for `strict: true`. The rest is either owned elsewhere (#1960) or opportunistic.**

Why it must stay a separate, final slice:

- **It cannot be done earlier.** Enabling `strictNullChecks` across 85,478 LOC with a 42-error
  baseline and no typecheck gate is not a refactor, it is an outage. Slice 1A installs the gate;
  Slices 2-3 shrink the surface (`useDiscoverUrlState` 1,702 → ~200 LOC across 7 domains,
  `MapDiscovery` 1,949 → ~600, 98 props → ~8). Attempting this first would be strictly more
  expensive and riskier.
- **It is genuinely valuable.** `strictNullChecks: false` on a domain modelling optional
  geography, optional school selection, and optional area selection is where the next production
  null-crash comes from. The `strict: false` setting is also *why* the 42 errors are as mild as
  they are — the true count under `strict: true` will be substantially higher.

---

## 4.1 — Incremental `strict: true` migration

| | |
|---|---|
| **Problem** | `strict: false`, `strictNullChecks: false`, `noImplicitAny: false`. |
| **Evidence** | `tsconfig.app.json:19-23`; `tsconfig.json:9-14`. Current baseline **42 errors** *with strictness off*. 22 non-null assertions (`x!.y`) across 8 files are unchecked by definition. `as unknown as` appears 8 times in 7 files. |
| **Why it matters** | Null-safety is the largest untapped correctness lever in this codebase, and the domain is null-heavy by nature. |
| **Effort** | **10 days** spread over many small PRs. |
| **Migration** | Directory-scoped, leaf-first: (1) `shared/lib/` and `shared/map/` — pure functions, smallest blast radius; (2) `hooks/`; (3) `features/discover/`; (4) `components/`; (5) `pages/`. Enable `noImplicitAny` first (cheapest), then `strictNullChecks` (most expensive). Use per-directory `tsconfig` include lists so each directory becomes strict independently. Reuse the §1A.2 fingerprint baseline. **Never** silence an error with `!` or `as` — fix the type or add a real guard. |
| **Coordination** | After #1956. Directory-scoped, so it may begin on `shared/` earlier if that directory is quiet. |

### Risk: low per PR, **medium at programme level**

This distinction matters and rev 1 got it wrong by calling the work "mechanical".

**Low risk per incremental PR.** Each PR is directory-scoped, type-only, reversible by a single
`tsconfig` line, and verified by 4,552 runtime tests. Nothing ships behaviourally different.

**Medium risk as a programme, because strict nullability exposes *semantic* decisions, not
mechanical ones.** When `strictNullChecks` reveals that `selectedArea: AreaPoint | null` is read
without a guard, the compiler has not found a typo — it has found an **unanswered product
question**: *what should Discover render when no area is selected but a group is focused?* The
codebase currently has an implicit, undocumented answer, and it may not be the same answer in
every one of the sites the compiler flags.

Consequences to plan for:

- **Effort is not uniform.** Pure geometry in `shared/map/` converts almost mechanically.
  `useDiscoverJourneyTransitions.ts` and `useDiscoverCameraOrchestration.ts` will surface
  genuine journey-state ambiguities requiring product input.
- **The honest fix is sometimes a behaviour change.** Where a null path is genuinely unhandled,
  the correct resolution may be to *define* the behaviour — which is out of scope for a
  "type-only" PR and must be split out and specified.
- **Discovery is front-loaded and unbounded until measured.** The true strict error count is
  unknown. **Run `tsc --strictNullChecks --noEmit` in report-only mode and record the number
  before committing to the schedule.** If it is very large, re-plan rather than push through.
- **Mitigation:** enable per directory, never globally; treat every "needs a product decision"
  site as a separate ticket rather than an inline judgement call; keep the fingerprint baseline
  so partial progress is preserved.

---

## 4.2 — Accessibility — **align with #1960, do not duplicate it**

| | |
|---|---|
| **Status** | ♿ **Owned by #1960.** This roadmap contributes evidence, not scope. |
| **Evidence recorded for #1960** | 722 `aria-*` attributes / 136 files · 228 `aria-label` · 115 `role=` · 528 `<button>` · **100% `<img>` with `alt` (23/23)** — all strong. Against: **18 `onKeyDown`** / 16 files · **8 `.focus()`** / 6 files · 12 `onClick` on non-interactive elements · no focus trapping outside Radix · no focus restoration on Discover panel open/close · **no `axe`, `jest-axe`, or `@axe-core/playwright` in `package.json`.** |
| **Why this roadmap schedules none of it** | #1956 states explicitly: *"Dedicated accessibility automation and comprehensive accessibility sign-off are deferred to #1960, the final milestone issue. `jest-axe`, `@axe-core/playwright`, keyboard-only acceptance, screen-reader acceptance, and accessibility evidence do not block this issue"* … *"do not expand this PR into repository-wide accessibility infrastructure or remediation."* Pulling axe adoption or keyboard remediation into an earlier slice would duplicate #1960's scope and contradict an explicit product sequencing decision. |
| **What this roadmap does** | (1) Hands #1960 the baseline above as its starting inventory. (2) Observes #1956's interim guardrail — *do not knowingly introduce controls that are clipped or pointer/touch unreachable*. (3) Adds **no** a11y tooling, **no** axe baselines, and **no** keyboard remediation in Slices 1-3. |
| **If #1960 slips** | Revisit here — but as a **new scoping conversation**, not by silently absorbing it into a refactoring slice. |
| **Effort** | **0 days in this roadmap.** Estimation belongs to #1960. |

---

## 4.3 — Performance verification

| | |
|---|---|
| **Problem** | Re-render behaviour is asserted but never measured. |
| **Evidence** | `React.memo` count: **0**. `DiscoverMapCanvas.tsx:55-57` states the component is "render-neutral per the plan's default hypothesis" — a hypothesis with no measurement attached. `useMemo` (115) and `useCallback` (145) are used with no data on whether they help. |
| **Why it matters** | Both over- and under-memoising are costly, and neither is currently distinguishable. |
| **Risk** | Low. |
| **Effort** | **2 days.** |
| **Migration** | Profile Discover under a realistic marker count with the React Profiler. Apply `React.memo` **only** where profiling shows a measurable win, and only after §3.1 has made props referentially stable. Add a bundle-size budget assertion to CI. Reuse the §3.6 measurement harness (LCP, navigation latency, parse/evaluate). |
| **Benefit** | Replaces a stated hypothesis with evidence; prevents silent bundle-size regression. |

---

## 4.4 — Tooling and developer experience

| Item | Evidence | Effort |
|---|---|---|
| Reorganise the 99 flat `e2e/` specs into feature folders | 99 of 125 specs sit in `e2e/` root; only 26 are in `discover/` and `journey/` | 1 d |
| Adopt `lib/listingQueryKeys.ts` across all query keys | 37 distinct roots declared inline across 41 files; the factory has **4 importers** | (folded into §3.5) |
| Promote `no-unused-vars` from `warn` to `error` | Enabled at `warn` in §1B.3 | 0.5 d |

**Slice 4 total: ~17 days** (a11y excluded — owned by #1960).

---

# Roadmap sequencing

## The order

```text
NOW
  -> finalise and commit audit documents only
  -> allow #1955 to continue without audit-session production changes
     (no slice begins; no production file is touched)

AFTER #1955 HAS A COMMITTED IMPLEMENTATION
  -> inspect the actual #1955 diff
  -> re-run affected audit measurements
       npx tsc --noEmit | npx vitest run | npx eslint . | npx vite build
  -> revise only materially changed findings
     (do NOT rewrite the audit wholesale; amend what the diff invalidates)

AFTER #1955 MERGES
  -> SLICE 1A   trustworthy engineering baseline              ~5 days
                minify - fingerprint gate - Supabase regen
                PropertyType union + regression tests
                green main - route error boundaries

  -> SLICE 1B   housekeeping, where still relevant            ~4 days
                dead code (six-check protocol) - boundary lint (warn)
                eslint ignores - tooling (coordinate shared changes)

  -> SLICE 2    foundations                                  ~12 days
                fix inverted dependency - enforce boundaries
                URL state -> 7 capability domains (incl. compatibility)
                facade sole owner - deps categories A/B/E
                category-C camera regression TESTS only

  -> SLICE 3    relevant presentation boundaries               ~6 days
                3.2 api.getValidated + zod schemas
                3.4 extractApiErrorMessage

  -> BEGIN #1956  (adaptive-depth Areas journey)
                builds on: compatibility domain, getValidated,
                           green suite, camera regression tests
                owns:      node= param, macroRegionResolver removal,
                           CameraIntent consolidation, panel re-skin

  -> SLICE 3 REMAINDER                                       ~15 days
                3.1 view models (98 -> ~8 props)
                3.3 PropertyMap split into shared/map/
                3.5 dealer -> broker
                3.6 lazy-load ONLY IF measurement justifies

  -> SLICE 4    aligned with #1960                           ~17 days
                strict TS (low per-PR / medium programme risk)
                performance verification - tooling
                accessibility -> #1960 owns it, not scheduled here
```

**"Where still relevant" is deliberate.** #1955's merged diff may resolve, alter, or invalidate
some Slice 1B items — for example, if it removes or rewrites any of the currently-dead
`components/map/` files, or touches `App.tsx` routing. Re-check the slice against the merged tree
rather than executing it from this document verbatim.

**The re-measurement step is not optional.** This audit's numbers were taken at `ce1d6aa1`.
#1955 adds a Flyway migration, a `discover/navigation/` package, and City Launch Preview frontend
work that does not yet exist. At minimum, the **42-error typecheck baseline**, the **Supabase
generated types**, the **dead-code importer counts**, and the **`App.tsx` route structure** must
be re-verified before any slice acts on them.

## Why this order

**#1955 first — by deterministic rule, not by estimate.** Its branch is verified 100% backend
today (19 changed paths, 0 frontend, 0 commits ahead), so rev 2's merge-conflict argument is
withdrawn. That evidence establishes only that there is **no current textual overlap** — not that
concurrent refactoring is safe. What governs instead is the cost asymmetry (§2.1): shims and
mechanical import rewrites make deferred consolidation cheap and recoverable, whereas disrupting
an active session's **uncommitted** tree is expensive and unrecoverable. **No sequencing decision
in this roadmap depends on forecasting when #1955's frontend work starts.**

**1A before 1B — because 1A is what makes everything else verifiable.** Until the build
typechecks and `main` is green, no later change can be *proven* safe. 1B is valuable but nothing
depends on it.

**Slice 2 before #1956 — the highest-value sequencing decision in this roadmap.** #1956 must add
a `node=` parameter, a legacy compatibility resolver for `groupId`/`region`/`areaKey`/`scope`,
and a stale-link ladder. Doing that inside an undifferentiated 1,106-line function is materially
harder than adding it to a named `compatibility` domain with a defined contract. Slice 2 exists
in large part to hand #1956 that seam.

**Slice 3 foundations before #1956, remainder after.** §3.2 (`getValidated`) and §3.4
(`extractApiErrorMessage`) are purely additive and directly useful: #1955 introduces two nested
typed endpoints that #1956 consumes, and defining schemas as those consumers are written is far
cheaper than retrofitting. §3.1, §3.3, §3.5 and §3.6 all rewrite files #1956 owns — they wait.

**Slice 4 last — because Slices 2-3 shrink its surface.** Strict nullability over
`useDiscoverUrlState` split into 7 domains is a different proposition from strict nullability
over one 1,106-line function.

## #1955 and #1956 should **adopt** guardrails, not **absorb** the roadmap

This is the most important boundary in this document.

**What the roadmap gives them — adopt these:**

| Guardrail | Slice | Why it helps them |
|---|---|---|
| Green `main` + semantic (non-class-string) test assertions | 1A.4 | #1956 re-skins every Areas panel; class-string assertions would fail *en masse* and bury real regressions |
| Fingerprint typecheck gate | 1A.2 | Both gain type feedback they do not currently have |
| Route error boundaries | 1A.5 | A City Launch Preview render failure stops blanking the admin app |
| Import-boundary lint at **`warn`** | 1B.2 | Tells them where new code belongs — without asking them to move anything (**coordinate before landing**; it changes lint output) |
| `compatibility` URL domain | 2.2 | The exact seam #1956's legacy resolver needs |
| `api.getValidated` + zod | 3.2 | Lets #1956 define schemas for #1955's new endpoints as it writes them |
| Category-C camera regression tests | 2.4 | Becomes #1956's safety net for the `CameraIntent` consolidation it must do anyway |

**What they must NOT absorb:**

- ❌ Discover consolidation, dependency-direction fixes, or file moves (§2.1) — not their job
- ❌ View-model decomposition (§3.1) — a large refactor riding on a large feature is how both fail
- ❌ Strict TypeScript (§4.1) — surfaces semantic decisions unrelated to their scope
- ❌ Accessibility infrastructure — #1956 explicitly excludes it; **#1960 owns it**
- ❌ Import-boundary rules at **`error`** — would fail their builds on pre-existing violations
  they did not create

**The test:** if a roadmap item makes #1955 (active) or #1956 (planned) *easier to review*, offer
it. If it makes their diff *larger*, it belongs in a slice, not in their PR.

## Verification gate for every PR in every slice

```bash
npm run typecheck          # no NEW fingerprints (count may fall, never grow by new IDs)
npx vitest run             # must be 0 failures
npm run test:e2e:smoke
npm run test:e2e:journey   # additionally, for any PR in Slice 3
```

## Hard dependencies

- §2.x require §1A.2 (typecheck gate) and §1A.4 (green suite).
- §2.1 requires **#1955 merged**.
- §3.1 requires §2.3 (facade shim removed) and **#1956 merged**.
- §3.6 must come after §1A.1 — minification may render it unnecessary — and is gated on the
  four measurements in §3.6, not on chunk size.
- §4.1 requires Slices 2-3 to have shrunk the surface first.
- §4.2 is gated on **#1960**, not on this roadmap.

**Stop conditions:** the roadmap can be halted after **any** PR without leaving the codebase
worse than baseline. Every item is independently revertable; no item requires a subsequent item
to be correct.

---

## Summary

| | |
|---|---|
| **Rewrite required?** | **No.** |
| **Architecture sound?** | **Direction and ownership: yes.** Discover migration incomplete; integration boundaries too broad. |
| **Total effort** | ~59 engineering days across 4 slices (a11y excluded — #1960 owns it). |
| **Highest-value single change** | Enable `minify` (15 minutes → −95 kB gzipped entry chunk). |
| **Highest-value sequencing decision** | Land Slice 2.2's `compatibility` URL domain **before** #1956 needs it. |
| **Highest-risk change** | §3.1 — narrowing the 98-prop boundary. One prop-group per PR, behind 4,552 unit tests and the `journey` E2E project. |
| **Safe to execute incrementally?** | **Yes.** Behaviour-neutral through Slices 1A/1B/2; Slice 3 is component-scoped; Slice 4 is low-risk per PR, medium at programme level. |
| **Interferes with #1955?** | **No** — by construction. A deterministic rule gates all broad restructuring on #1955 being merged, and every item carries a coordination category. |

---

## Revision history

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-07-23 | Initial roadmap. |
| **4** | **2026-07-24** | **Scheduling question removed** — replaced by the deterministic rule *"do not begin Slice 2, mass Discover moves, or other broad frontend restructuring until #1955 is committed and merged"*, justified by cost asymmetry (shims + mechanical rewrites are cheap and recoverable; disrupting an uncommitted tree is not). Disjoint path sets retained as evidence of *no current textual overlap only*. **Issue statuses made precise** — #1955 actively implemented, #1956 **planned/not started (verified: no branch, no worktree)**, #1960 future; #1956 footprint claims relabelled scope-derived. **"Safe now" removed everywhere**, replaced by four coordination categories; **§1A.3 Supabase → AFTER-1955** (V121 migration would make regenerated types stale; baseline seeding moved after merge) with the **`PropertyType` union reclassified as potentially behaviour-affecting** requiring mapping/filter/query regression tests; **§1A.5 route error boundaries → AFTER-1955** (`App.tsx` overlap plausible via City Launch Preview routing); **Playwright `baseURL` + `retries` → COORDINATE**. **§1B.1 "zero conflict surface by definition" withdrawn** — replaced by a **six-check protocol** (production, test, dynamic, route, active-#1955, codegen). **"No behaviour change" qualified** for minification (delivery/runtime) and error boundaries (crash containment). **§2.1 strategy reworked** from six move-heavy PRs to: fix inverted dependency → enforce boundaries → move opportunistically → path-only moves *only* where they unlock a stated invariant; **every shim now requires a deletion AC**. §2.1 effort 5 d → 3 d. **Sequencing section rewritten** with the now / after-committed-implementation / after-merge phases including a mandatory re-measurement step. Totals 60 → 59 days. |
| **3** | **2026-07-24** | **#1955's branch inspected directly** at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1955-areas-hierarchy-pr-a`: 19 changed paths, **100% backend, 0 frontend, 0 commits ahead**. §2.1's **merge-conflict justification withdrawn** as factually wrong; deferral re-grounded on churn (#1956 deletions), uncommitted-tree disruption, and the forward-looking City Launch Preview constraint. **Added an explicit decision point** — a narrowing window exists in which consolidating *before* #1955's frontend work starts may be cheaper; the call requires knowing that start date and is escalated rather than silently defaulted. Sequencing rationale updated to match. |
| **2** | **2026-07-24** | Slice 1 split into **1A (trustworthy baseline)** / **1B (housekeeping)** — still four slices. §1A.2 replaced the count ratchet with a **fingerprint baseline**. §1A.3 new (Supabase drift promoted to its own item). §2.1 **deferred until #1955 merges**, with three stated reasons and a **move / do-not-move table driven by importer analysis** — shared map infrastructure now explicitly stays shared. §2.2 replaced the single `urlActions.ts` with **seven capability domains** including `compatibility`, framed around #1956's needs. §2.4 replaced "one suppression per PR" with **five behavioural categories**, each with a regression test; category C contributes tests only and defers the change to #1956. §3.2 and §3.4 promoted to **pre-#1956 foundations**. §3.3 destination corrected to `shared/map/`. §3.6 gated on **four measurements** (LCP, navigation latency, parse/evaluate, residual Leaflet preload) rather than chunk size. §4.1 risk reframed as **low per PR / medium programme**. §4.2 accessibility **deferred to #1960**, 0 days scheduled here. **New "Roadmap sequencing" section** with the full order, rationale, and the adopt-vs-absorb boundary. Suppression count corrected 28 → **29**. |
