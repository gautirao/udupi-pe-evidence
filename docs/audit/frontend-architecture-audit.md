# Frontend Architecture Audit

**Repository:** `gautirao/udupi-property-explorer`
**Scope:** entire `src/` frontend (not Discover-only)
**Branch / commit audited:** `main` @ `ce1d6aa1`
**Date:** 2026-07-23 · **Revised:** 2026-07-24 (rev 2)
**Author role:** Staff Frontend Architect

All findings below are backed by measurements taken against this commit. Commands used
are recorded inline so every number is reproducible. Where a claim could not be verified
it is labelled explicitly.

> **Revision 2 note.** This revision incorporates the Discover V2 programme
> (#1955 active → #1956 planned → #1960 future) as a first-class constraint, replaces the type-error count
> ratchet with a fingerprint baseline, narrows the map-consolidation recommendation to what
> importer analysis actually supports, and corrects the `exhaustive-deps` suppression count
> from 28 to **29**. Changed sections are listed in §12.

> ### ✅ Phase 0 complete (2026-07-24, `main` @ `475785d0`)
>
> **This audit was measured at `ce1d6aa1` and remains valid as the snapshot it declares itself
> to be.** Phase 0 of the stabilisation effort — audit refresh, baseline stabilisation (merged as
> **PR #1982**), and the Phase 0B doc-correction pass this note belongs to — is now complete.
> Two things changed underneath the snapshot and are corrected inline below with dated
> **"Phase 0B correction"** notes rather than by rewriting the original measurements:
>
> 1. **#1955 is now merged.** It closed via **PR #1978** (2026-07-24), which — contrary to the
>    pre-merge branch inspection recorded in §5 — shipped **~2,500 LOC of frontend code**. Every
>    `AFTER-1955` sequencing constraint below is now **unblocked** (see §5.1, §6).
> 2. **The `ce1d6aa1` baselines have moved.** Typecheck is now **31 errors / 10 files**, vitest
>    **5 failed / 2 files (4,635 total)**, eslint **103 problems (11 err / 92 warn) / 54 files**.
>    A 12-site `DiscoverDataSourceProviderProps` `children`-required cluster introduced by
>    PR #1978 was initially miscounted as 8 errors and briefly proposed for the accepted
>    baseline — on review that was rejected as a genuine regression needing a fix, not debt;
>    it was corrected to its true count (12) and fixed by **PR #1984** before this baseline
>    was seeded.
>
> **Full itemised baseline evidence with per-error fingerprints:**
> `docs/audit/evidence/phase0-baseline-stabilisation/README.md`. Slice 1A is the next unit of
> work — recommended start: §1A.1 (enable minification), then §1A.4 (main is already green
> against the documented 5-failure baseline).

---

## 1. Executive Summary

**The architectural direction and ownership model are sound, but the Discover migration is
incomplete and current integration boundaries remain too broad.**

That sentence is the whole audit in one line, and each clause matters:

- **Direction is sound.** The target shape (`features/`, split contexts, React Query for
  server state, URL as source of truth) is modern and correct.
- **Ownership model is sound.** Server state, URL state, navigation, and global state are each
  owned by exactly one mechanism, consistently, across 85k LOC.
- **The Discover migration is incomplete.** `src/features/discover/` exists and is the right
  destination, but holds only ~40% of Discover. The rest is spread across three other homes.
- **Integration boundaries remain too broad.** This is the concrete, measurable symptom:
  a **98-prop** component interface, a **77-prop** sibling, a **1,949-line** page function, and
  a **1,106-line** URL hook. Modules communicate through very wide surfaces rather than narrow
  contracts, so changes propagate further than they should.

This is **not** a codebase that needs a rewrite.

The single most important thing to understand is that its worst-looking metric — a component
with 98 props — is not accidental sloppiness. It is a *documented, intentional* decomposition
checkpoint. `DiscoverMapCanvas.tsx:39-58` states that the JSX region was lifted "VERBATIM" out
of `MapDiscovery.tsx` with "every value the JSX reads received as a PROP — no
derived-const/handler/hook/badge-helper moves". That is the correct *first* move in a safe
extraction. Step two — narrowing those props into view models and moving state down — never
happened. **The broad boundary is the unfinished half of a deliberate plan, not a design error.**

Separately, four cheap configuration defects are costing far more than they should. They are
individually trivial and collectively they are why this audit does not score higher:

1. `build.minify: false` in production (`vite.config.ts:28`) — ships **2.77 MB of extra JS**.
2. `strict: false` + `strictNullChecks: false` (`tsconfig.app.json:19`, `tsconfig.json:14`).
3. **No `typecheck` script** — `npm run build` is transpile-only, so **42 type errors sit on
   `main` undetected**.
4. **10 unit tests are red on `main`** and nothing gates them.

### Overall Score: **6.5 / 10**

| Dimension | Score | One-line justification |
|---|---|---|
| **Architecture** | 6.5 / 10 | Correct target shape and ownership model; Discover still spans 4 homes; integration boundaries too wide. |
| **Maintainability** | 6.0 / 10 | Superb inline documentation offsets very large files; 98-prop interfaces are a real tax. |
| **Scalability** | 6.0 / 10 | Discover scales badly (adding a journey touches 4 directories); Broker/Admin scale fine. |
| **Readability** | 8.0 / 10 | Best-in-class. Comments explain *why*, cite issue numbers, and warn about traps. |
| **Performance** | 4.5 / 10 | Route-splitting is genuinely good; unminified prod build and eager `MapDiscovery` negate it. |
| **Testing** | 7.0 / 10 | 4,552 tests is a real asset; 10 red on `main`, and class-name assertions are brittle. |
| **Accessibility** | 6.5 / 10 | Strong ARIA density (722 attributes); keyboard/focus thin. **Owned by #1960** — see §2.10. |
| **Developer Experience** | 5.5 / 10 | No typecheck gate, no coverage script, two test roots, `dealer`/`broker` naming drift. |

### Direct answers to the questions posed

| Question | Answer |
|---|---|
| Is the frontend architecture good? | **Direction and ownership: yes. Execution: incomplete.** The target architecture is correct; roughly 40% of Discover has actually arrived there. |
| Is it scalable? | **Partly.** Broker/Admin/Listing scale linearly. Discover does not — see §4.1. |
| Is it maintainable? | **Yes, at above-average cost.** Documentation quality is what makes 2,000-line files survivable. That is not a durable strategy. |
| Is it easy for new developers? | **No.** A newcomer must read ~5,900 lines across 4 directories to safely change one Discover behaviour. See §8. |
| Modern React best practices? | **Mostly yes.** Server state is properly owned by React Query; contexts are correctly split to avoid re-render storms; effects are used sparingly (128 across 63 files). |
| Where is technical debt? | Concentrated, not diffuse. **5 files hold 9,631 LOC (11% of prod code)** and account for most of it. |
| What must NOT change? | The Discover context facade, the React Query data layer, `lib/api.ts`, the test corpus, `shadcn/ui`, shared map infrastructure. See §7. |
| What MUST change? | The four configuration defects above. See §6. |
| What can wait? | `strict: true`, PropertyMap file-splitting, and **all comprehensive accessibility work — which is already owned by #1960**. See §9 and the roadmap's Slice 4. |

---

## 2. Objective Metrics

### 2.1 Size

```
Command: python3 scratchpad/fe_metrics.py  (walks src/**/*.{ts,tsx})
```

| Metric | Value |
|---|---|
| Total TS/TSX files | **728** (427 production, 301 test) |
| Total LOC | **173,592** |
| Production LOC | **85,478** |
| Test LOC | **88,114** |
| Test-to-production LOC ratio | **1.03 : 1** |
| E2E spec files / tests / LOC | **125 / 686 / 43,942** |

A 1.03:1 test-to-source ratio is high and is a genuine strength.

### 2.2 Largest production files

| LOC | File |
|---|---|
| 2,078 | `src/pages/MapDiscovery.tsx` |
| 1,969 | `src/components/map/PropertyMap.tsx` |
| 1,960 | `src/components/discover/DiscoverRightPanel.tsx` |
| 1,922 | `src/components/discover/panels/SchoolJourneyPanels.tsx` |
| 1,702 | `src/hooks/useDiscoverUrlState.ts` |
| 1,151 | `src/pages/broker/editListing/steps/DescribeStep.tsx` |
| 1,115 | `src/components/discover/panels/AreaGroupsLandingPanel.tsx` |
| 1,093 | `src/components/broker/ResidentialListingForm.tsx` |
| 1,003 | `src/components/broker/CommercialListingForm.tsx` |
| 932 | `src/hooks/useBrokerListings.ts` |

**The top 5 files hold 9,631 LOC = 11.3% of all production code.** Debt here is
*concentrated*, which is good news: it means it is addressable by targeted work rather
than a sweep.

### 2.3 Longest single functions

| Lines | Function | Location |
|---|---|---|
| **1,949** | `MapDiscovery` | `src/pages/MapDiscovery.tsx:128` |
| **1,106** | `useDiscoverUrlState` | `src/hooks/useDiscoverUrlState.ts:595` |
| 685 | `BrokerDashboard` | `src/pages/broker/BrokerDashboard.tsx:135` |
| 671 | `ProcessPosts` | `src/pages/admin/ProcessPosts.tsx:49` |
| 599 | `Listings` | `src/pages/admin/Listings.tsx:94` |
| 493 | `TrustReviewQueue` | `src/pages/admin/TrustReviewQueue.tsx:102` |
| 483 | `BrokerListings` | `src/pages/broker/BrokerListings.tsx:416` |

A **1,949-line component function** and a **1,106-line hook** are the two clearest
structural outliers in the codebase.

### 2.4 Integration-boundary width

| Props | Interface | File |
|---|---|---|
| **98** | `DiscoverMapCanvasProps` | `src/features/discover/views/DiscoverMapCanvas.tsx:59` |
| **77** | `DiscoverRightPanelContainerProps` | `src/features/discover/views/DiscoverRightPanelContainer.tsx` |
| 34 | `DescribeStepProps` | `src/pages/broker/editListing/steps/DescribeStep.tsx` |
| 33 | `AreaSelectedPanelProps` | `src/components/discover/panels/AreaSelectedPanel.tsx` |
| 29 | `AreaGroupsLandingPanelProps` | `src/components/discover/panels/AreaGroupsLandingPanel.tsx` |
| 29 | `AgriGroupSelectedPanelProps` | `src/components/discover/panels/AgriGroupSelectedPanel.tsx` |

Total `*Props` interfaces: **253**. The distribution is healthy apart from the two outliers —
median is in single digits. **These two interfaces are the primary quantitative evidence for
the "integration boundaries remain too broad" claim in §1.**

### 2.5 React patterns (production only)

| Pattern | Occurrences | Files |
|---|---|---|
| `useState` | 501 | 108 |
| `useCallback` | 145 | 30 |
| `useEffect` | **128** | 63 |
| `useMemo` | 115 | 35 |
| `useRef` | 94 | 45 |
| `useQuery` | 77 | 53 |
| `useMutation` | 67 | 22 |
| `useNavigate` | 31 | 28 |
| `createContext` | 13 | 9 (4 app-level, 5 inside `ui/`) |
| `useReducer` | **1** | 1 |
| `React.memo` | **0** | 0 |
| `React.lazy` | 35 | 2 |
| `window.history` direct | **0** | 0 |

**128 effects across 85k LOC is low and is a strength** — it indicates most state is derived
or server-owned rather than effect-synchronised.

**`React.memo` = 0** is a deliberate-looking omission, and defensible: the context split in
`DiscoverContext.tsx` solves re-renders structurally rather than by memo-patching. However it
means `DiscoverMapCanvas` — which receives 98 props including inline-computed object literals
— re-renders on every parent render. `DiscoverMapCanvas.tsx:55-57` acknowledges this
explicitly ("this component is NOT React.memo'd (render-neutral per the plan's default
hypothesis)"). The hypothesis is stated but **not measured**.

Highest effect concentration:

| Effects | File |
|---|---|
| 17 | `src/components/map/PropertyMap.tsx` |
| 7 | `src/pages/MapDiscovery.tsx` |
| 5 | `src/hooks/useDiscoverPageState.ts` |
| 5 | `src/features/discover/state/useDiscoverJourneyTransitions.ts` |
| 5 | `src/features/discover/state/useDiscoverCameraOrchestration.ts` |
| 5 | `src/components/map/AreaMarkerLayer.tsx` |

Highest `useState` concentration — these are the form monoliths:

| States | File |
|---|---|
| **69** | `src/components/broker/ResidentialListingForm.tsx` |
| **47** | `src/components/broker/CommercialListingForm.tsx` |
| 43 | `src/pages/broker/editListing/useResidentialFields.ts` |
| 24 | `src/components/broker/AgriculturalListingForm.tsx` |

69 individual `useState` calls in a single component is a form-state anti-pattern. Notably
**`react-hook-form` is a dependency and is used in only 2 files** — the broker forms do not
use it.

### 2.6 Type safety

```
Command: npx tsc -p tsconfig.app.json --noEmit
Result:  42 errors in 17 files
Top codes: TS2769 (11), TS2345 (10), TS2339 (10), TS2740 (7), TS2322 (3)
```

> **Phase 0B correction (2026-07-24, `main` @ `475785d0`).** The current baseline is **31 errors
> in 10 files** (top codes TS2339 ×10, TS2345 ×10, TS2740 ×7, TS2322 ×3, TS2352 ×1). PR #1978
> introduced two regressions on top of the `ce1d6aa1` snapshot: a production `useCityLaunchNavigation.ts`
> TS2554 (fixed by **PR #1982**), and a **12-site `DiscoverDataSourceProviderProps`
> `children`-required** test-mock cluster (its `DiscoverDataSourceContext.tsx` change now
> requires a `children` prop, so mock provider call-sites across 8 hook/context test files no
> longer typecheck — the cluster was initially miscounted as 8 errors and briefly proposed for
> the accepted baseline before being corrected to its true count of 12 and fixed by **PR #1984**,
> since newly introduced regressions must be fixed before a baseline is seeded, not absorbed
> into it merely because they only affect test files). Note the 31/10 current count is not
> directly comparable to the 42/17 `ce1d6aa1` figure below by simple subtraction — the two
> snapshots were taken with different tsc/type-definition state, and the exact per-error overlap
> between them has not been re-derived line-by-line; both counts are reported as independently
> measured, dated snapshots rather than a computed delta. The
> full itemised 31-fingerprint table (and the fingerprint scheme to seed §1A.2 from) is in
> `docs/audit/evidence/phase0-baseline-stabilisation/README.md`. The 42/17 figure below is the
> `ce1d6aa1` snapshot and is retained as the historical measurement.

**These 42 errors exist on `main` right now.** They are invisible because `npm run build` is
`vite build`, which uses esbuild transpile-only and never typechecks. There is **no
`typecheck` script in `package.json`**.

Representative errors — note that these are *real* schema/type drift, not noise:

```
src/hooks/usePropertyListings.ts(504,17): Type '"agricultural_land"' is not assignable
  to type '"land" | "house" | "commercial" | "other" | "apartment"'.
src/hooks/usePropertyListings.ts(454,16): Property 'locality' does not exist on type
  'SelectQueryError<"column 'area_key' does not exist on 'property_listings'.">'.
src/lib/discoverMappers.ts(108,5): Type 'string' is not assignable to
  type '"dealer" | "broker" | "owner" | "builder"'.
src/hooks/useSimilarListings.ts(32,15): Type 'Json[]' is not assignable to type 'PropertyImage[]'.
```

The `usePropertyListings.ts:454` cluster is a **Supabase-generated-types drift**: the
generated `src/integrations/supabase/types.ts` no longer matches the query. That is a live
correctness risk, not a cosmetic complaint.

> **On gating these errors — use a fingerprint baseline, not a count.**
> A count-based ratchet ("fail if > 42") is unsound: it permits a *new* error to be introduced
> silently whenever an old one is coincidentally fixed in the same PR — a net-zero count with a
> net-new defect. The baseline must be a **set of stable per-error fingerprints**
> (`file` + `TS-code` + normalised message, deliberately **excluding line/column** so unrelated
> edits above an error do not churn it). CI then fails on any fingerprint **not present in the
> baseline**, regardless of the total. Fixing an error is always allowed and shrinks the
> baseline; introducing one always fails. Implementation is specified in roadmap §1A.2.

Suppression and escape-hatch census (production files only):

| Signal | Count | Notes |
|---|---|---|
| `@ts-ignore` | **0** | — |
| `@ts-nocheck` | **0** | — |
| `@ts-expect-error` (prod) | **0** | 3 exist in test files, each with a justifying comment |
| `as any` | **1** | `src/lib/map/areaMarkerBucketing.ts` |
| `as unknown as` | 8 | across 7 files |
| `eslint-disable` | **31** | across 18 files (29 `exhaustive-deps` + 1 `no-unused-vars` + 1 false-positive comment) |
| `TODO` | **1** | `AgriGroupListingPeek.tsx:252`, references issue #1456 |
| `FIXME` / `HACK` / `XXX` | **0** | — |
| `console.log` | **0** | — |
| `@deprecated` | 11 | across 7 files |

**This is a genuinely excellent result and deserves to be called out.** One `as any`, zero
`@ts-ignore`, zero `FIXME`, zero `console.log` across 85k LOC is far better than typical.
The team does not paper over problems — which makes the `strict: false` setting all the more
worth reversing, because the discipline to survive it is clearly there.

> **Correction from rev 1.** This audit previously reported 28 `exhaustive-deps` suppressions.
> Line-level extraction gives **29**. Rev 1 undercounted by one. The 31 `eslint-disable`
> matches decompose as 29 `exhaustive-deps` + 1 `@typescript-eslint/no-unused-vars`
> (`useDiscoverGroupResults.ts`) + 1 comment containing the literal string
> "No eslint-disable needed" (`useDiscoverUrlState.ts`), which is a false positive.

Distribution of the **29** suppressions:

| Count | File |
|---|---|
| 5 | `src/pages/MapDiscovery.tsx` |
| 4 | `src/features/discover/state/useDiscoverJourneyTransitions.ts` |
| 3 | `src/hooks/useDiscoverPageState.ts` |
| 3 | `src/pages/Trends.tsx` |
| 2 | `src/features/discover/state/useDiscoverCameraOrchestration.ts` |
| 1 each | 12 further files |

Each suppressed `exhaustive-deps` is a **potential stale closure** — but they are not
homogeneous, and treating them as one undifferentiated pile is the mistake. They fall into
five distinct behavioural categories with very different risk and very different correct
fixes; this classification is set out in §4.6 and drives roadmap §2.4.

### 2.7 Lint

```
Command: npx eslint . -f json
Result:  97 problems (11 errors, 86 warnings)
```

> **Phase 0B correction (2026-07-24, `main` @ `475785d0`).** The current baseline is **103
> problems — 11 errors, 92 warnings, across 54 files** (+6 warnings, +0 errors), all attributable
> to new files shipped by PR #1978 (`useCityLaunchNavigation.ts`, `navigationHierarchy.ts`,
> `cityLaunchPreview/*`) and #1982's test-file changes — not a regression. No lint *errors*
> changed. See `docs/audit/evidence/phase0-baseline-stabilisation/README.md` §3. The 97-problem
> figure below is the `ce1d6aa1` snapshot.

| Count | Rule |
|---|---|
| 56 | `react-refresh/only-export-components` |
| 22 | (parse errors — all in `docs/design/**` and `mockup/**`, not `src/`) |
| 11 | `@typescript-eslint/no-explicit-any` |
| 8 | `react-hooks/exhaustive-deps` |

**Lint debt is manageable, but the gate is incomplete.** 97 problems across 728 files is a low
absolute number and reflects real cleanup work already done. The gate itself, however, does not
yet establish much:

- **11 errors remain**, so the suite is not clean and `eslint .` has no `--max-warnings`
  threshold — nothing fails on regression.
- **Unused-variable checking is disabled.** `eslint.config.js:23` sets
  `"@typescript-eslint/no-unused-vars": "off"`, so dead locals and unused imports are
  *completely unmeasured*. The 97 figure is an undercount of unknown size.
- **Non-source paths produce parse errors.** 22 of the 97 problems (23%) are parse failures in
  `docs/design/**` and `mockup/**` — directories that are not application source and should be
  in `ignores`. They inflate the count and train reviewers to skim it.
- **Dependency direction is unenforced.** There are no import-boundary rules, so nothing prevents
  the inverted `features/` → `pages/` edge described in §4.1, or the next one.

So the accurate reading is: **low remediation debt, weak enforcement.** Lint is currently a
report, not a gate.

### 2.8 Bundle & build

```
Command: npx vite build                                    → dist/
Command: npx vite build --minify esbuild --outDir dist-min → dist-min/
```

| | Current (`minify: false`) | With minification | Delta |
|---|---|---|---|
| Total JS emitted | **5.42 MB** | **2.65 MB** | **−2.77 MB (−51%)** |
| Entry chunk `index-*.js` | 1,529 kB | 749 kB | −780 kB |
| Entry chunk, gzipped | 298 kB | 203 kB | **−95 kB over the wire (−32%)** |
| `vendor-recharts` | 859 kB | 411 kB | −448 kB |
| `vendor-leaflet` | 444 kB | 184 kB | −260 kB |

`vite.config.ts:28` sets `minify: false` with **no explanatory comment** — every other
non-obvious decision in this file *is* commented (see the detailed `manualChunks` rationale
at lines 32-42). Its absence suggests this was a debugging aid that was never reverted.

Route splitting itself is **well done**: 35 `React.lazy` calls produce a clean per-route chunk
map (`BrokerDashboard` 38 kB, `ProcessPosts` 40 kB, `EditListing` 139 kB, each isolated).

The problem is what stayed eager. `App.tsx:17-21` eagerly imports `MapDiscovery`,
`LandingPage`, `Auth`, `AuthCallback`, `NotFound`. `MapDiscovery` is 2,078 LOC and transitively
pulls the entire map and Discover stack into the entry chunk — which is why `index-*.js` is
1,529 kB while the largest lazy route is 197 kB.

`App.tsx:33-42` documents a related, still-open issue honestly: a `vendor-leaflet`
`modulepreload` survives in `dist/index.html` because `vite.config.ts` groups `react-leaflet`
into `vendor-react`, creating a chunk-assignment edge that no source-level change can remove.
The comment states plainly that "**AC12's primary assertion remains NOT_SATISFIED**". Recording
a failed acceptance criterion in a code comment rather than quietly closing it is exemplary.

> **Bundle size alone is not the decision metric.** Chunk bytes are an *input* to user-perceived
> performance, not a measure of it. Any decision about lazy-loading `MapDiscovery` must be made
> against **LCP, navigation latency, script parse/evaluate time, and whether the
> `vendor-leaflet` preload actually disappears** — not against kB saved. See §4.7 and roadmap
> §3.6, which gates that change on measurement rather than assuming it.

Also observed: `optimizeDeps: { force: true }` (`vite.config.ts:18-20`) disables Vite's
dependency pre-bundle cache on **every** dev start — a permanent fix for what was presumably a
transient problem, paid for on every developer's every startup.

### 2.9 Testing

```
Command: npx vitest run
Result:  1361 suites (1354 passed, 7 FAILED)
         4552 tests (4539 passed, 10 FAILED, 3 skipped)
```

> **Phase 0B correction (2026-07-24, `main` @ `475785d0`).** The current baseline is **5 failed
> tests / 2 failed files, out of 4,635 tests total** (309/311 files passing). The total test count
> grew (4,552 → 4,635) because #1978/#1982 added new test files. Of the original 10 failures, the
> two `tests/discover/panels-parity.test.tsx` class-string assertions and the four
> `CityLaunchPreview.test.tsx` tests are **fixed** by PR #1982; the remaining accepted failures are
> the pre-existing `PropertyMap.jitterDiagnostic` Leaflet-mock cluster and one
> `useCityLaunchNavigation` zod-validation test (both documented pre-existing debt). Full
> fingerprints: `docs/audit/evidence/phase0-baseline-stabilisation/README.md` §2. The
> 4,552-tests/10-failed figure below is the `ce1d6aa1` snapshot.

| Metric | Value |
|---|---|
| Test files | 301 (in `src/**/__tests__`) + a second root at `tests/` |
| `describe` / `it` blocks | 1,045 / 4,284 |
| `vi.mock` calls | **1,088** |
| `data-testid` in production code | 462 |
| `it.skip` / `.only` | 3 / 0 |
| Production files >300 LOC with no sibling test | **31** |

**10 tests are failing on `main` at `ce1d6aa1`.** Reproduced:

```
Command: npx vitest run tests/discover/panels-parity.test.tsx
Exit code: 1        Tests: 2 failed | 8 passed
```

Both failures are textbook brittleness, and they are *different* kinds:

**(a) Assertions on Tailwind class strings.**
```
tests/discover/panels-parity.test.tsx:259
  expect(band.className).toContain('bg-card');
  AssertionError: expected 'rounded-xl border border-slate-800 bg-[#0F172A] p-5 …'
                  to contain 'bg-card'
```
This broke because of the intended visual change in `6ae834cb` ("Discover V2 Schools journey
plum re-skin"). The test asserts on *styling implementation*, so a legitimate re-skin registers
as a failure. This class of test produces noise on every design change and trains the team to
ignore red. **This matters acutely right now:** #1956 re-skins every Areas panel and adds
visual baselines at two viewports. Class-string assertions will fail *en masse* against it.

**(b) Incomplete provider stacks in hand-rolled renders.**
```
Error: useAuth must be used within an AuthProvider
  ❯ Module.useAuth              src/contexts/AuthContext.tsx:222
  ❯ Module.useSavedListingIds   src/hooks/useSavedListings.ts:57
  ❯ PropertyCard                src/components/discover/PropertyCard.tsx:147
```
A deep descendant (`PropertyCard`) gained a new context dependency, and this suite renders
without the full provider tree. **`src/test/renderWithProviders.tsx` exists precisely to
prevent this** — this suite simply does not use it. That is an adoption gap, not a design gap.

Separately, the run emits repeated unhandled errors from incomplete Leaflet mocks:
```
TypeError: map.getSize is not a function
  at src/components/map/AreaMarkerLayer.tsx:486
```
The mock implements part of the Leaflet `Map` surface; production code drifted onto a method
the mock lacks.

**E2E strategy** (`playwright.config.ts`) is well-tiered — `smoke` / `journey` /
`integration-ui` / `full` projects allow proportionate gating. Three concerns:
- `retries: 0` (line 29) with no flake budget on a 686-test suite driving a real map.
- `baseURL` defaults to **`https://udupi-property-explorer.pages.dev`** (line 35) — a
  *deployed* environment. A developer who runs `npx playwright test` without the wrapper
  script tests production, not their branch.
- 99 of 125 spec files sit flat in `e2e/` root; only 26 are organised into `discover/` and
  `journey/`.

### 2.10 Accessibility

| Signal | Occurrences | Files |
|---|---|---|
| `aria-*` (all) | **722** | 136 |
| `aria-label` | 228 | 92 |
| `role=` | 115 | 51 |
| `<button>` / `<Button>` | 528 | 140 |
| `tabIndex` | 28 | 14 |
| `sr-only` | 21 | 14 |
| `onKeyDown` | **18** | 16 |
| `.focus()` | **8** | 6 |
| `onClick` on `<div>`/`<span>`/`<li>` | 12 | 12 |
| `<img>` / `alt=` | 23 / 23 | 20 / 20 |

**Semantics and ARIA are strong.** 722 ARIA attributes and 528 real `<button>` elements
indicate a11y is actively considered, and **100% of `<img>` tags carry an `alt` attribute
(23/23)**. `MapDiscovery` ships an `sr-only` live-region announcement for the result badge
(`DiscoverMapCanvas.tsx:151-152`), which is a thoughtful touch.

**Keyboard and focus management are the weak axis.** 18 `onKeyDown` handlers and 8 `.focus()`
calls across a 140-file interactive surface is thin for an application whose primary
interaction model is a map with clickable markers, popovers, and slide-over panels. There is
no evidence of focus trapping outside the Radix primitives (which handle it for dialogs), and
no evidence of focus restoration when Discover panels open and close.

There is also no automated a11y assertion anywhere — no `axe`, `jest-axe`, or
`@axe-core/playwright` in `package.json`.

> ### ⚠️ Accessibility is already owned. Do not schedule it here.
>
> **Issue #1960 owns comprehensive accessibility for this programme**, and #1956 states this
> explicitly under "MVP sequencing decision":
>
> > "Dedicated accessibility automation and comprehensive accessibility sign-off are deferred
> > to #1960, the final milestone issue. `jest-axe`, `@axe-core/playwright`, keyboard-only
> > acceptance, screen-reader acceptance, and accessibility evidence do **not** block this
> > issue." … "do not expand this PR into repository-wide accessibility infrastructure or
> > remediation."
>
> This audit therefore **records the a11y baseline as evidence for #1960 and schedules no
> accessibility work of its own before Slice 4.** Pulling axe adoption or keyboard remediation
> into an earlier slice would duplicate #1960's scope and contradict an explicit product
> sequencing decision. The one guardrail worth preserving in the interim is #1956's own
> constraint: do not knowingly introduce controls that are clipped or pointer/touch
> unreachable.

### 2.11 Duplication

380 identical 6-line blocks appear in more than one production file. Most are benign
multi-line `import { … }` statements from `shadcn/ui` barrels. Two clusters are real:

**Cluster 1 — API error handling, duplicated verbatim in 4 files:**
```ts
onError: (error: Error) => {
  const apiErr = error as ApiError;
  const body = apiErr.body as Record<string, unknown> | undefined;
  const message =
    (body?.message as string | undefined) ??
    (body?.error as string | undefined) ?? …
```
Present in `AgriculturalListingForm.tsx`, `CommercialListingForm.tsx`,
`ResidentialListingForm.tsx`, `editListing/EditListingForm.tsx`. This is business logic
(server error-shape parsing), not boilerplate, and it belongs in `lib/api.ts`.

**Cluster 2 — Review-preview tile rendering**, duplicated across
`AgriculturalReviewPreview.tsx`, `CommercialReviewPreview.tsx`, `ResidentialReviewPreview.tsx`.

### 2.12 Dead code and naming drift

Measured by **static importer count across all 427 production files.** Read this as *low current
reachability risk*, not as proof of deadness: a static production-import scan does not see test
imports, dynamic `import()`, route registration, code generation, or changes on branches that are
not merged. The removal protocol in roadmap §1B.1 checks all six.

| LOC | Finding | Evidence |
|---|---|---|
| 294 | `src/components/map/PropertyDetailModal.tsx` | **0 importers** (incl. tests). Confirmed dead. |
| 4 | `src/components/ui/use-toast.ts` | **0 importers** (all 40 consumers use `@/hooks/use-toast`). Confirmed dead. |
| 56 | `use-mobile.tsx` (1 importer) + `useMediaQuery.ts` (1 importer) | Two hooks, one responsibility, one consumer each. **Not dead** — a consolidation candidate, unaffected by the correction below. |
| **~298** | **total confirmed-dead** (`PropertyDetailModal` + `use-toast`) | |

> **⚠️ Phase 0B correction (2026-07-24) — two rev-2 entries were wrong and are withdrawn.**
> Re-verified importer analysis found **live production importers** for two entries this table
> previously listed as dead. They are removed above:
> - `src/components/discover/panels/SchoolsInAreaPanel.tsx` (710 LOC) — **NOT dead.**
>   `SchoolJourneyPanels.tsx:35` imports it live (`import { SchoolsInAreaPanel as
>   RealSchoolsInAreaPanel } from './SchoolsInAreaPanel'`). The "two components, same name, one
>   unreachable" claim was false: the panel-directory one is the reachable one.
> - `src/components/map/filters/*.tsx` (6 files, 312 LOC) — **NOT dead.** All six
>   (`BedroomFilter`, `DateRangeFilter`, `ListingStatusFilter`, `PriceRangeFilter`,
>   `PropertyTypeFilter`, `SellerTypeFilter`) are imported by `MapFilters.tsx:8-13`, which is
>   imported live by `MapDiscovery.tsx:8`.
>
> **The verified-dead total drops from 1,376 LOC to ~298 LOC** (`PropertyDetailModal` 294 +
> `use-toast` 4). The rev-2 "606 LOC of unreferenced `components/map/` code" claim is withdrawn:
> the 6 `filters/` are live, leaving only `PropertyDetailModal` (294) genuinely dead in that
> directory. **This is exactly the error the six-check importer protocol in roadmap §1B.1 exists
> to catch — a static specifier scan on `main` that missed re-export/aliased and page-level
> importers — and it validates that protocol as effective, not the deletion list.**

**Naming drift:**

| Finding | Evidence |
|---|---|
| `src/components/dealer/`, `src/hooks/useDealerListings.ts` | Project terminology is **Broker, not Dealer**. |
| `"dealer"` string — **72 occurrences across 16 production files** | Includes live React Query cache keys: `'dealer-listings'` (13), `'dealer-listings-infinite'` (13), `'dealer-listing-stats'` (13) — all inside `useBrokerListings.ts`. |

---

## 3. Ownership Analysis

| Concern | Owner | Verdict |
|---|---|---|
| **Server state** | React Query (77 `useQuery` + 67 `useMutation` across 53/22 files) | ✅ **Correct and consistent.** No competing client cache. |
| **URL state** | `useDiscoverUrlState` → `DiscoverProvider` facade | ✅ **Correctly centralised.** 0 direct `window.history` calls anywhere. ⚠️ but the owner is a single 1,106-line function — see §4.3. |
| **Navigation** | `react-router-dom` (`useNavigate` × 31) | ✅ Correct. Routes are declarative and centralised in `App.tsx`. |
| **Global client state** | 4 app contexts: `AuthContext`, `AuthModalContext`, `DiscoverContext`, `DiscoverDataSourceContext` | ✅ **Appropriately minimal.** No Redux/Zustand/Jotai sprawl. |
| **Local UI state** | `useState` × 501 | ⚠️ Fine except broker forms (69 + 47 + 24 states). |
| **Side effects** | `useEffect` × 128; camera orchestration in `useDiscoverCameraOrchestration` | ⚠️ Mostly good; 29 suppressed dep arrays cluster here. |
| **Data access** | `lib/api.ts` (66 importers) + direct Supabase (16 files) | ⚠️ **Two parallel data paths.** See §4.4. |
| **Query cache keys** | 37 distinct roots, **41 files declaring them inline** | ⚠️ `lib/listingQueryKeys.ts` exists but has only **4 importers**. Invalidation correctness rests on string literals matching across 41 files. |

### The Discover context facade — the single best piece of engineering in this repo

`src/features/discover/context/DiscoverContext.tsx` deserves specific praise because it
demonstrates exactly the judgement this codebase should be graded on:

- It splits into **four** contexts (`Actions`, `Nav`, `Viewport`, `Shell`) rather than one,
  with a documented reason: the viewport is written on every 300 ms-debounced map pan, and a
  single context "would re-render the entire Discover tree — including the right panel — on
  every pan" (lines 22-31).
- It gives actions a **permanently stable identity** via a ref-indirection proxy
  (`buildStableActions`, lines 123-130), avoiding a 37-entry dependency array.
- It enforces exhaustiveness of that proxy **at compile time** — `ACTION_KEYS` is checked with
  `satisfies`, and a type-level assert (lines 105-107) makes the build fail if a new action is
  added without registering it.
- The effect-vs-render-phase ref write is justified with a **three-point proof** (lines 141-154)
  including a verified claim about the only `useLayoutEffect` in the subtree.

This is senior-level work. It is also the strongest argument against a rewrite: a team that
writes this does not need to start over. **It is also the model for what "narrow integration
boundary" looks like** — four small, purpose-scoped contexts instead of one wide one. The
98-prop interface is what the same problem looks like when the narrowing has not yet happened.

---

## 4. Weaknesses

### 4.1 🔴 Discover logic is spread across four competing homes (highest-impact finding)

**Problem.** `src/features/discover/` exists and is the correct target, but it holds only 40%
of Discover. The rest lives in three other places, and there is no rule preventing new code
from landing in any of them.

**Evidence.**

| LOC | Files | Location |
|---|---|---|
| 15,646 | 57 | `src/components/discover/` |
| 6,040 | 29 | `src/features/discover/` ← the intended home |
| 4,771 | 20 | `src/components/map/` |
| 2,077 | 1 | `src/pages/MapDiscovery.tsx` |
| 1,701 | 1 | `src/hooks/useDiscoverUrlState.ts` |
| ~1,900 | ~14 | `src/hooks/useDiscover*.ts`, `src/lib/discover*.ts`, `src/utils/discover*.ts`, `src/constants/discover.ts` |

`src/features/discover/views/DiscoverMapCanvas.tsx:37` imports a **type from a page**:
```ts
import type { DiscoverBadgeResult } from '@/pages/MapDiscovery';
```
`MapDiscovery.tsx:104-126` maintains a **re-export shim** so that path keeps resolving. The
comment is candid: "keeps `'@/pages/MapDiscovery'` importers (5 unit test files +
`DiscoverMapCountBadge.tsx`) resolving unchanged".

The direction is inverted: `features/` (lower layer) depends on `pages/` (higher layer). It is
type-only today — so no runtime cycle, and the comment says so — but it encodes the wrong
dependency direction into the module graph, and nothing stops the next such import from being
a value import.

**Why it matters.** Adding one Discover journey today requires edits in 4+ directories. There
is no single place to look, and no lint rule to keep new code from adding a fifth.

**Risk if unaddressed.** Medium-High. Each new journey deepens the entanglement; the cost of
consolidation grows with every PR.

**⚠️ Timing constraint.** #1955 and #1956 are both actively modifying this surface. Large file
moves here must wait — see §5.

---

### 4.2 🟠 "Discover-specific" and "shared map infrastructure" are not the same thing

**Problem.** It is tempting to read §4.1 as "move `src/components/map/` into
`features/discover/`". **Importer analysis does not support that**, and doing it would create a
*new* architectural error while fixing an old one.

**Evidence.** Importer counts across all 427 production files, splitting importers into
Discover-context and non-Discover:

| Module | Discover importers | Non-Discover importers | Classification |
|---|---|---|---|
| `map/DrawControl.tsx` | 1 | **2** — incl. `components/dealer/BoundaryDrawStep.tsx` | **Shared** — used by the broker boundary-drawing flow |
| `lib/map/zoomPolicy.ts` | 2 | **2** — incl. `hooks/useZoomBand.ts` | **Shared** — generic zoom math |
| `lib/map/areaClusterSplit.ts` | 0 | 1 | **Shared** — pure geometry |
| `lib/map/areaMarkerBucketing.ts` | 0 | 1 | **Shared** — pure geometry |
| `lib/map/regionCompassLayout.ts` | 0 | 1 | **Shared** — pure layout math |
| `map/SchoolMarkerLayer.tsx` | 0 | 1 (`PropertyMap`) | **Shared** — generic Leaflet layer |
| `map/PropertyMap.tsx` | 9 | 0 | Discover-only *today*, but it is the **generic Leaflet renderer shell** and hosts `DrawControl` |
| `map/RegionGuidanceCard.tsx` | 7 | 0 | **Discover-specific** — knows about regions |
| `map/ExploreMapPanel.tsx` | 1 | 0 | **Discover-specific** |
| `map/NearSchoolSheet.tsx` | 1 | 0 | **Discover-specific** |
| `utils/discoverLayerRegistry.ts` | 6 | 0 | **Discover-specific** |
| `utils/discoverPanelState.ts` | 9 | 0 | **Discover-specific** |
| `utils/areaNameSummary.ts` | 3 | 0 | **Discover-specific** |
| `utils/discoverGroupBounds.ts` | 2 | 1 (`PropertyMap`) | **Shared** |

**A methodological caveat, stated honestly:** an importer count of "1, from `PropertyMap`"
means *map-internal*, not *shared with another feature*. The raw count cannot distinguish those.
The classification column above is therefore a **judgement informed by the data**, not a
mechanical read of it. Any move must re-verify per module at execution time.

**Why it matters.** `DrawControl` is consumed by the broker boundary-drawing flow. Moving it
under `features/discover/` would force `features/broker/` to import from `features/discover/` —
a sibling-to-sibling dependency, which is precisely the edge the proposed lint rules exist to
forbid. **We would create a boundary violation in the act of enforcing boundaries.**

**Correct rule:** move only what importer analysis proves is Discover-specific. Shared map
infrastructure — the Leaflet renderer, generic layers, and the pure geometry in `lib/map/` —
belongs in a shared location and stays there.

---

### 4.3 🟠 The URL-state owner is correct but its internal structure is not

**Problem.** `useDiscoverUrlState` is the right *owner* of URL state (§3 confirms this) but it
is a single 1,106-line function handling parsing, normalisation, defaulting, serialisation, and
all 37 actions with no internal seams.

**Evidence.** `src/hooks/useDiscoverUrlState.ts` — **1,702 LOC**; the hook function alone spans
**1,106 lines** (`:595`). **36 importers.** Exports 8 symbols. Contains 1 of the 29 `exhaustive-deps`
suppressions. The 37 action names are enumerated in `DiscoverContext.tsx:62-100` and already
cluster by domain — `changeCity`/`setCity`; `selectArea`/`deselectArea`/`clearAreaSelection`/
`clearAreaContext`; `setSchoolParams`/`clearSchoolSelection`/`enterSchoolPicking`/
`backToSchoolPicking`/`setSchoolJourney`; `clearAgriFilters`; `setFiltersLive`/
`setFiltersCommitted`; `reportViewport`.

**The domains are already latent in the action names.** They simply have no module boundary.

**Why it matters — and why the timing is now.** #1956 adds a `node=<stable-node-key>` parameter
*and* a compatibility resolver normalising legacy `groupId`, `region`, `areaKey`, and `scope`
via `history.replace`. Current footprint of those legacy params: `groupId` 239 occurrences /
27 files, `areaKey` 906 / 104, `scope` 539 / 65. Adding a whole new URL identity scheme plus a
legacy-normalisation ladder **into an undifferentiated 1,106-line function** is materially
harder and riskier than adding it into a prepared, named `compatibility` domain. This is the
strongest sequencing argument in the entire roadmap.

---

### 4.4 🟠 Unvalidated API boundary + two parallel data paths

**Problem.** `lib/api.ts` is a clean, well-written 96-line client — but its type parameter is
a pure assertion:

```ts
// src/lib/api.ts:76-78
const text = await response.text();
if (!text) return undefined as T;
return JSON.parse(text) as T;
```

`as T` is a lie the compiler cannot check. Combined with `strictNullChecks: false`, **every
backend response enters the app fully trusted and fully unchecked**. A backend field rename
produces `undefined` deep in a component, not an error at the boundary.

`zod@3.25.76` is a **production dependency used in exactly one file** —
`src/lib/schemas/auth.ts`. The tool to fix this is already installed and paid for.

> **Phase 0B correction (2026-07-24, `main` @ `475785d0`).** zod is no longer single-file. PR
> #1978 shipped `src/lib/schemas/navigationHierarchy.ts` (563 LOC of Zod schemas for the new
> navigation endpoints), consumed via `src/hooks/useCityLaunchNavigation.ts` — so zod is now used
> in **at least 3 production files** (`schemas/auth.ts`, `schemas/navigationHierarchy.ts`, and its
> consumer). The `getValidated` + zod pattern this section motivates is therefore **partially
> pre-built** for the navigation endpoints; roadmap §3.2's remaining scope shrinks accordingly.

Separately, there are **two data paths**: `lib/api.ts` (66 importers) *and* direct Supabase
client usage in **16 production files** including `usePropertyListings.ts`, `useAdminData.ts`,
`useListingImages.ts`, and 3 page components. The Supabase path is where all 10 `TS2339`
schema-drift errors live.

**Why it matters.** This is the only place in the audit where the failure mode is *silent
incorrect data* rather than a crash or a slow page. It is also directly relevant to #1955,
which introduces two new typed public endpoints
(`/navigation/{nodeKey}`, `/areas/{areaKey}/navigation-path`) whose responses carry ancestry,
`nextLevelType`, bounds, and merged dynamic counts — exactly the kind of nested contract where
an unvalidated `as T` fails silently and confusingly.

---

### 4.5 🟠 The stalled decomposition: 98- and 77-prop interfaces

**Problem.** `DiscoverMapCanvasProps` has **98 props**; `DiscoverRightPanelContainerProps` has
**77**. `MapDiscovery` remains a **1,949-line function** that computes all of them.

**Evidence.** `DiscoverMapCanvas.tsx:59-192`. The file documents the cause honestly (`:39-58`):
the JSX was lifted "VERBATIM" with "every value the JSX reads received as a PROP — no
derived-const/handler/hook/badge-helper moves". The prop list is even annotated with the
original line numbers it came from (`// ── PropertyMap (L1870-1995) ──`).

**This is the correct step one and it was executed with real rigour.** The issue is that step
two — grouping props into view models, then moving the state that produces them down into the
component — was never done. The extraction moved 300 lines of JSX out of `MapDiscovery`; it
moved zero lines of *logic*.

**Why it matters.** A 98-prop signature means every change to the map canvas is a two-file
change with a wide diff, and the type system provides little help because 98 positional
concerns cannot be reasoned about. It also blocks `React.memo`: memoising a component that
receives inline-constructed object literals (`schoolCircle`, `focusBounds`,
`schoolRadiusChrome`, per lines 52-56) would be a no-op. **This is the canonical instance of
"integration boundaries remain too broad".**

---

### 4.6 🟠 29 `exhaustive-deps` suppressions — five behavioural categories, not one pile

**Problem.** 29 suppressed dependency arrays, each a potential stale closure.

**Why the classification matters.** Rev 1 of this audit recommended fixing these "one
suppression per PR". That is the wrong unit of work. It treats a load-bearing, three-times-proven
memo dependency and an undocumented mount-only effect as the same task, and it produces 29
context-switches for what is really five decisions. **Group by behaviour, fix each category with
a shared pattern and a regression test that encodes the intended behaviour.**

Line-level extraction gives the following categories:

| # | Category | Count | Representative sites | Correct fix |
|---|---|---|---|---|
| **A** | **Mount-only initialisation** (`deps: []`) | 6 | `Trends.tsx:92` (documented: "intentional mount-only: normalizes initial URL before interaction"), `DiscoverRightPanel.tsx:1074`, `useDiscoverUrlState.ts:818`, `useResidentialLocation.ts:143`, `ListingDetailBoundaryMap.tsx:43`, `BoundaryDrawStep.tsx:57` | Replace with an explicit, named `useMountEffect` (or documented ref guard) so intent is expressed in code rather than by suppressing a rule. Lowest risk. |
| **B** | **Deliberate single-key trigger** — deps intentionally narrowed to one derived key | 8 | `DiscoverContext.tsx:183` `[searchParamsKey]` ⚠️ **load-bearing, do not touch**; `useDiscoverSearchState.ts:42` `[urlQ]`; `useDiscoverJourneyTransitions.ts:441` `[urlBoardKey]`; `useDiscoverPageState.ts:166/176/194`; `AreaGroupSelectedPanel.tsx:247`; `DrawControl.tsx:82` `[map]` | Extract the trigger key into a named derived value with a comment stating what must *not* re-fire it. Several are already correct and merely need the suppression replaced by an explicit pattern. |
| **C** | **Camera / journey orchestration reacting to URL state** | 7 | `useDiscoverCameraOrchestration.ts:307,397`; `useDiscoverJourneyTransitions.ts:494,552,636`; `useDiscoverBadgeAnnounce.ts:57`; `AreaMarkerLayer.tsx:659` | **Highest risk and highest value.** These are where a stale closure presents as an intermittent map-positioning bug. Each needs a behavioural regression test before the deps change. |
| **D** | **`useMemo` over large derived values in `MapDiscovery`** | 5 | `MapDiscovery.tsx:189, 833, 1070, 1291, 1393` | **Do not fix directly.** These dissolve as a by-product of the §4.5 view-model extraction. Fixing them in place is wasted work that will be re-done. |
| **E** | **Data-fetch / query-response effects** | 3 | `ViewingRequestPanel.tsx:207`; `Trends.tsx:116,153` | Convert to React Query derived state where possible; these are effects doing work the cache already does. |

**Category C deserves special attention** because it is co-owned with #1956, which requires
routing "all breadcrumb camera fits through the single `CameraIntent` owner" and specifies an
E2E test for exactly this failure mode: *"Camera race — breadcrumb/direct navigation must not be
overwritten by stale debounced viewport replace."* `CameraIntent` currently spans 5 files:
`AreaMarkerLayer.tsx`, `PropertyMap.tsx`, `DiscoverMapCanvas.tsx`, `useDiscoverMapData.ts`,
`MapDiscovery.tsx`.

---

### 4.7 🟡 Broker form state, error boundaries, and eager routes

- **Form state:** 69 `useState` in `ResidentialListingForm.tsx`, 47 in `CommercialListingForm.tsx`.
  `react-hook-form` is installed and used in only 2 files. The same 6-line API error handler is
  copy-pasted across all 4 listing forms.
- **Error boundaries:** exactly one, `Sentry.ErrorBoundary` at the root (`main.tsx:14`), with
  fallback `"Something went wrong. Please refresh the page."` Any render error in any route
  blanks the entire application. There are **no route-level boundaries** — a crash in an admin
  table takes down Discover.
- **Eager routes:** `App.tsx:17-21` keeps `MapDiscovery` (2,078 LOC + full map stack) eager,
  which is the direct cause of the 1,529 kB entry chunk. **Whether lazy-loading it is worthwhile
  is an open question that must be settled by measurement** (LCP, navigation latency,
  parse/evaluate time, residual Leaflet preload), not by chunk size — see roadmap §3.6.
- **Dev friction:** `optimizeDeps: { force: true }` re-optimises dependencies on every dev start.

---

## 5. In-flight work: #1955, #1956, #1960

This audit is written to be executed **as an engineering roadmap alongside a live programme**.
Treating that programme as a constraint — rather than discovering it mid-execution — is what
makes the roadmap safe.

> ### ✅ RESOLVED 2026-07-24 — #1955 is merged
>
> The entire "in-flight" framing of this section is now **historical**. **#1955 merged via
> PR #1978** (2026-07-24T06:30:15Z) — confirmed `gh issue view 1955` = CLOSED, `gh pr view 1978`
> = MERGED with body "Closes #1955". The pre-merge branch inspection recorded below (19 paths,
> 100% backend) was accurate for the *uncommitted worktree at the time*, but the **merged
> artifact shipped ~2,500 LOC of frontend code**:
> - `src/components/discover/cityLaunchPreview/NavigationDiffView.tsx` (148 LOC)
> - `src/components/discover/cityLaunchPreview/NavigationHierarchyTree.tsx` (139 LOC)
> - `src/components/discover/cityLaunchPreview/NavigationOverridesPanel.tsx` (369 LOC)
> - `src/features/discover/state/navigationTreeUtils.ts` (new — in the intended `features/discover/` home)
> - `src/features/discover/state/DiscoverDataSourceContext.tsx` (modified — now requires a
>   `children` prop, creating the new TS2769 test-mock cluster in the Phase 0 baseline)
> - `src/hooks/useCityLaunchNavigation.ts` (new hook)
> - `src/lib/schemas/navigationHierarchy.ts` (new — 563 LOC of Zod schemas for the nav endpoints)
> - `src/pages/admin/CityLaunchPreview.tsx` (modified)
>
> Re-verify with `git diff --name-only ce1d6aa1 475785d0 -- src/`. **Notably, `App.tsx` and all
> build/lint/tsconfig files were NOT touched by #1978** — which de-risks the §1A.5 "App.tsx
> overlap" caveat (that overlap did not materialise). Every **`AFTER-1955`** constraint in §5.1
> and §6 is now **unblocked**; the tags are retained as historical record of why sequencing was
> designed this way.

| Issue | State (precise) | Frontend footprint | Roadmap implication |
|---|---|---|---|
| **#1955** — recursive city navigation hierarchy: generate, preview, promote, cache | ✅ **MERGED 2026-07-24 via PR #1978** *(row below is the pre-merge snapshot).* Was: **Actively being implemented.** Separate session, branch `issue-1955-areas-navigation-hierarchy` at `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1955-areas-hierarchy-pr-a`. **Uncommitted working tree.** | **Pre-merge verified 2026-07-24: 19 changed paths, 100% backend/infra, ZERO frontend files. — Superseded: the merged PR #1978 shipped ~2,500 LOC of frontend (see RESOLVED box above).** Its City Launch Preview extension did land, reusing Discover components. | ~~Blocks Slice 2 …~~ **RESOLVED — now merged. All `AFTER-1955` items unblocked.** See §5.1. |
| **#1956** — adaptive-depth Areas journey with canonical breadcrumbs | **Planned next milestone issue; not yet started.** Verified: no branch matching `*1956*`, no worktree. Its own body states it "Depends on #1955 being merged, demonstrated through City Launch Preview, and explicitly signed off." | **Anticipated (from the issue body, not from code):** adds `node=` URL param + legacy compatibility resolver (`groupId`/`region`/`areaKey`/`scope`); **removes `macroRegionResolver.ts` and all 7 consumers**; re-skins every Areas panel; routes camera fits through a single `CameraIntent` owner; adds visual baselines at 1366×768 and 390×844. | **Will co-own URL state, camera orchestration, and panel styling.** Roadmap prepares those surfaces before it starts, then stays out of them. All footprint claims are **scope-derived, not branch-derived** — re-verify when a branch exists. |
| **#1960** — final milestone | **Future issue; not started.** | Will own `jest-axe`, `@axe-core/playwright`, keyboard-only acceptance, screen-reader acceptance, a11y evidence. | **Owns all comprehensive accessibility work.** This roadmap schedules none before Slice 4 and defers to #1960 there. |

> **On the word "in-flight".** *(Phase 0B: **#1955 is now merged** — see the RESOLVED box above;
> nothing is in flight as of 2026-07-24.)* At audit time, only **#1955** was in flight. #1956 and
> #1960 remain **planned**, and every statement this audit makes about their footprint is derived
> from their issue bodies, not from code. That distinction is load-bearing: scope-derived claims
> are exactly the kind that proved wrong about #1955 in rev 2 (see §5.1) — and, indeed, the
> pre-merge "0 frontend" branch snapshot proved wrong about the *merged* #1955 too — so they are
> labelled as such throughout and must be re-verified once branches exist.

### #1955 — verified branch state (2026-07-24)

Rev 2 of this audit inferred #1955's footprint from its issue body. It has now been inspected
directly. **The inference was directionally right but the collision claim was wrong, and this
section records the correction.**

```
Command: git -C .../issue-1955-areas-hierarchy-pr-a status --short
Result:  19 changed paths — {'backend/infra': 19, 'frontend (src/e2e/tests)': 0}
Command: git -C ... log --oneline origin/main..HEAD
Result:  (empty — zero commits ahead; all work is uncommitted in the working tree)
Branch point: ce1d6aa1 — the exact commit this audit measured
```

Changed paths are entirely `backend/src/**` plus `V121__navigation_nodes_and_sandbox.sql` and
`application.yml`. **`src/`, `e2e/`, `tests/`, `package.json`, `vite.config.ts`, and
`tsconfig.app.json` are all clean.**

**What this evidence does and does not establish.**

It establishes exactly one thing: **there is no *current textual* overlap** between #1955's
changed paths and an `src/`-only refactor. Rev 2's claim that "moving `components/discover/`
today conflicts directly" was **not correct** — it reasoned from the issue's stated scope rather
than from the branch. That claim is withdrawn.

**It does not establish that concurrent refactoring is safe**, and this audit explicitly declines
to treat it that way. Absence of textual overlap at one moment is a snapshot, not a property:

- #1955's Definition of Done requires City Launch Preview to support "tree, real journey, direct
  search, diff, validation" by reusing live Discover components. **That work is still ahead**, and
  it will also touch routing. The snapshot expires the moment it lands.
- All 19 paths are **unstaged, with zero commits on the branch**. A contributor with no commits
  has no cheap `git rebase`. Disruption lands on a working tree, not on a branch — a cost that
  path-disjointness does nothing to reduce.

### 5.1 Sequencing rule (deterministic)

> ### ✅ RESOLVED 2026-07-24 — precondition satisfied
> **#1955 is committed and merged (PR #1978).** The rule below is now **satisfied**, so Slice 2,
> mass Discover moves, and broad frontend restructuring are **unblocked**. The rule, its
> cost-asymmetry reasoning, and the "why an estimate-based rule is wrong" argument are all retained
> **unchanged** — they remain methodologically correct and are the reason sequencing was designed
> this way; only their precondition has now been met.

```text
Do not begin Slice 2, mass Discover moves, or other broad frontend
restructuring until #1955 is committed and merged.
```

**This rule is not conditional on an estimate.** It deliberately does not depend on asking the
#1955 session when its frontend work will start. Such an estimate would be a forecast from a
party who is mid-implementation, it would be unverifiable, and building a sequencing decision on
it would reintroduce exactly the scope-derived reasoning that produced the withdrawn claim above.
A rule keyed on an observable repository state — *is #1955 merged?* — is checkable by anyone at
any time, and cannot silently go stale.

**Why the cost asymmetry favours waiting.** The two options are not symmetric:

| | Cost of deferring | Cost of proceeding concurrently |
|---|---|---|
| What is paid | Some Discover code is written against the pre-consolidation layout and moved later | An active session's **uncommitted** working tree absorbs a structural change mid-implementation |
| Who pays | The roadmap, in mechanical rework | The #1955 session, in lost context and manual reconciliation |
| Recoverability | **High** — re-export shims keep old paths resolving; import rewrites are mechanical and compiler-verified; the 4,552-test suite proves correctness | **Low** — no commits to rebase onto; reconciliation is manual and error-prone |

**Temporary path churn is cheap; disrupting parallel uncommitted work is not.** Re-export shims
mean an old import path keeps resolving after a module moves, so a later consolidation is an
additive step rather than a breaking one. Rewriting imports is mechanical, and the typecheck gate
plus the full test suite make it verifiable. None of those safety properties exist for a
working tree that has no commits to fall back to. **Deferral trades a cheap, recoverable cost for
avoidance of an expensive, unrecoverable one — which is the correct trade at any estimate.**

**Collision evidence that stands independent of branch state:**

- `pages/admin/CityLaunchPreview.tsx` imports `components/discover/SimulatedPreviewRibbon.tsx` —
  the *only* import of `src/components/discover/` from outside Discover. This is a structural
  fact on `main`, and it is precisely the file #1955 will extend. It is the reason the
  forward-looking constraint in (2) above is not hypothetical.
- `utils/macroRegionResolver.ts` has **7 importers**: `DiscoverRightPanel.tsx`,
  `AreaGroupsLandingPanel.tsx`, `SchoolJourneyPanels.tsx`, `useDiscoverMapPresentation.ts`,
  `useDiscoverCameraOrchestration.ts`, `DiscoverRightPanelContainer.tsx`, `MapDiscovery.tsx`.
  **#1956's issue body states it deletes this module and all consumers** *(scope-derived — no
  branch exists to verify against)*. Any roadmap work that moves, renames, or refactors those
  7 files risks being rework, and risks re-introducing what #1956 intends to remove.
- Class-string test assertions (§2.9) would fail *en masse* against the panel re-skin #1956
  describes. Fixing them **before** #1956 starts removes noise from its review; fixing them after
  means triaging real regressions inside a wall of false ones.

**The governing principle:** #1955 (active) and #1956 (planned) should **adopt** the roadmap's
guardrails — the typecheck gate, the green suite, the import-boundary lint rules — because those
make their own review easier. They should **not absorb** the roadmap. Consolidation,
decomposition, and strict TypeScript are not their job, and loading them in would put a large
feature at risk.

---

## 6. What MUST change

**Coordination categories.** This audit no longer uses the phrase "safe now". Nothing is
unconditionally safe while a parallel session holds an uncommitted working tree. Every item is
tagged with one of four evidence-based categories:

| Tag | Meaning |
|---|---|
| **CONFIRM-FIRST** | Safe to implement **only after confirming no overlap** with active work at the time of execution |
| **AFTER-1955** | Safe after #1955 is committed and merged |
| **COORDINATE** | Independent tooling change, but it alters shared developer behaviour — **coordinate with active sessions** |
| **DEFERRED** | Explicitly not scheduled here |

> ### ✅ Phase 0B update (2026-07-24) — `AFTER-1955` items are now unblocked
> **#1955 is merged (PR #1978).** Every **`AFTER-1955`** row below (items 4, 6, 7) is now
> **UNBLOCKED**; the tags are kept as historical record. Also refreshed against the current
> baseline (`475785d0`, post PR #1982 + PR #1984): item 2's typecheck baseline is now **31
> errors / 10 files** (not 42) — PR #1984 additionally removed a 12-site
> `DiscoverDataSourceProviderProps` `children`-required regression that PR #1978 introduced
> and that was briefly, incorrectly, proposed for the accepted baseline before being fixed —
> item 3's red tests are now **5 failing** (not 10 — the two panels-parity failures cited are
> fixed by PR #1982), and item 5's dead-code total is **~298 LOC** (not 1,376 — see §2.12
> correction).

| # | Change | Evidence | Effort | Coordination |
|---|---|---|---|---|
| 1 | Enable `build.minify` | `vite.config.ts:28`; −2.77 MB / −95 kB gzip measured | 15 min | **CONFIRM-FIRST** — build config only; changes production delivery/runtime characteristics, not business behaviour |
| 2 | Add `typecheck` script + **fingerprint** baseline | `npx tsc --noEmit` → 42 errors; no script in `package.json` | 1 d | **COORDINATE** — logically independent, but adding a CI gate changes what merges. **Not to be implemented by this audit session.** |
| 3 | Fix the 10 red tests; make red-on-`main` non-negotiable | `npx vitest run` → 10 failed / 7 suites | 1 d | **CONFIRM-FIRST** — test files only; verify no active session owns `tests/discover/panels-parity.test.tsx` |
| 4 | Fix the Supabase generated-types drift | 10 × `TS2339` in `usePropertyListings.ts` | 1 d | **AFTER-1955** — it adds `V121__navigation_nodes_and_sandbox.sql`; regenerating types against today's schema goes stale on merge |
| 5 | Delete **~298 LOC** of dead code *(corrected from 1,376 — §2.12; `SchoolsInAreaPanel` and `map/filters/*` have live importers)* | Static importer count = 0 across production files, **re-verified** | 0.25 d | **CONFIRM-FIRST** — low reachability risk, **not zero**; the six-check protocol in roadmap §1B.1 is what caught the two false-dead entries |
| 6 | Add route-level error boundaries | Single root boundary at `main.tsx:14` | 0.5 d | **AFTER-1955** — it will add City Launch Preview routing to `App.tsx`; overlap is plausible, not disproven. Intentionally changes crash-containment behaviour. |
| 7 | Validate API responses at the boundary | `api.ts:78` `JSON.parse(text) as T`; zod already a dependency | 4 d | **AFTER-1955** — additive, and #1955's new endpoints are the primary beneficiary |

---

## 7. What MUST NOT change

| Do not touch | Reason |
|---|---|
| `features/discover/context/DiscoverContext.tsx` | The four-way split, the stable-actions proxy, and the compile-time exhaustiveness check are load-bearing. Collapsing to one context reintroduces the pan-time re-render storm the file was written to eliminate. Its `[searchParamsKey]` suppression is proven and documented — **category B, do not "fix"**. |
| React Query as the server-state owner | 77 `useQuery` + 67 `useMutation` across 75 files. Correct and consistent. Do not introduce a second cache. |
| `lib/api.ts` structure | 96 lines, 66 importers, clean auth-header injection, proper `ApiError`. **Add validation inside it; do not replace it.** |
| `shadcn/ui` in `src/components/ui/` | 50 components, uniform adoption. Do not swap component libraries. |
| URL-as-source-of-truth | Zero `window.history` usage. Do not move Discover state into a store. |
| The 4,552-test corpus | Repair brittle assertions in place. **Do not delete tests to go green.** |
| **Shared map infrastructure** | `DrawControl` (used by broker), `lib/map/*` geometry, generic Leaflet layers. Moving these under `features/discover/` creates a sibling-feature dependency — see §4.2. |
| **`utils/macroRegionResolver.ts` and its 7 consumers** | **#1956 deletes this.** Any refactor here is wasted work and creates rebase conflict. |
| `vite.config.ts` `manualChunks` React/leaflet grouping | Lines 32-42 document a real `createContext` init-order crash. Do not split `react-leaflet` out of `vendor-react` without first reproducing that crash. |
| The comment density | It is the reason 2,000-line files are currently survivable. Preserve comments through every refactor. |

---

## 8. New-developer onboarding assessment

**Verdict: hard.** To safely change one Discover behaviour a newcomer must read:

| File | LOC |
|---|---|
| `MapDiscovery.tsx` | 2,078 |
| `useDiscoverUrlState.ts` | 1,702 |
| `DiscoverContext.tsx` | 235 |
| `DiscoverMapCanvas.tsx` (98-prop interface) | 628 |
| `DiscoverRightPanel.tsx` | 1,960 |

≈ **5,900 LOC minimum**, spread across `pages/`, `hooks/`, `features/`, `components/`.

Mitigating factors: exceptional inline documentation; `AGENTS.md`, `CLAUDE.md`,
`PROJECT_CONTEXT.md`, and `docs/FRONTEND_GUIDE.md` exist; 161 well-named custom hooks give
good vocabulary.

Aggravating factors: two components named `SchoolsInAreaPanel` (**Phase 0B correction:** both are
live — the panel-directory one is imported by `SchoolJourneyPanels.tsx:35`; the name collision is
still a navigation hazard, but neither is dead); `dealer` and `broker` used interchangeably
including in live cache keys; two test roots; **~298 LOC of confirmed dead code** (corrected down
from 1,376 — see §2.12); `features/` existing but not authoritative — a newcomer cannot infer
where new code belongs.

---

## 9. Recommended target architecture

**Evolution, not replacement.** The target below is what the codebase is *already aiming at*;
the recommendation is to finish the journey and then lock it with lint rules.

```
src/
  app/              # App.tsx, main.tsx, providers, router  (currently at src/ root — fine)
  features/
    discover/       # ← Discover-SPECIFIC code only
      api/          # queries, mutations, query-key factory, zod response schemas
      state/        # url state (by capability domain), journey transitions, camera
      presentation/ # view-model builders (badge, counts, filters)
      views/        # DiscoverMapCanvas, RightPanelContainer, OverlaySheets
      components/   # panels/, chips, legends       ← from src/components/discover/
      map/          # Discover-specific map layers  ← ONLY the proven-specific subset
    broker/
    admin/
    listing/
  shared/
    ui/             # shadcn/ui — unchanged
    map/            # ← Leaflet renderer, DrawControl, generic layers, lib/map geometry
    lib/            # api client (+ validation), formatters, geo
    hooks/          # genuinely cross-feature hooks only
```

Note `shared/map/` — this is the §4.2 correction made structural. Map code splits **by
Discover-specificity**, not wholesale.

**Enforced by lint, not convention** — this is the part that makes it durable:

```js
// eslint.config.js — no-restricted-imports
'features/*'  may NOT import from 'pages/*'        // kills the DiscoverMapCanvas→MapDiscovery edge
'features/A'  may NOT import from 'features/B'     // features are siblings, not a graph
'shared/*'    may NOT import from 'features/*'     // shared stays shared
```

**Four rules to carry forward:**
1. **Narrow the integration boundary.** A view component takes ~5-10 cohesive objects, not 98 scalars.
2. **Validate at the boundary.** `lib/api.ts` returns validated data or throws. `as T` disappears.
3. **One home per feature — but shared stays shared.** "Discover-specific" is decided by importer
   analysis, not by directory name.
4. **Capability domains over monoliths.** URL state splits by capability (city, area, school,
   agricultural, filters, viewport, compatibility) behind one public facade.

---

## 10. Verdict

1. **Does the frontend require a rewrite?** **No — emphatically.** The evidence points the
   other way. One `as any` in 85k LOC, a compile-time-verified context facade, 4,552 tests,
   and comments that record their own failed acceptance criteria are the signatures of a team
   that can finish what it started. A rewrite would discard 88k LOC of tests and the hardest-won
   asset in the repo: the documented reasoning about *why* things are the way they are.

2. **Is the current architecture fundamentally sound?** **The direction and ownership model are
   sound; the Discover migration is incomplete and integration boundaries remain too broad.**
   Server state, URL state, navigation, and global state are each owned by exactly one correct
   mechanism. The problems are *unfinished migration*, *over-wide module contracts*, and
   *un-reverted configuration* — not wrong design.

3. **Top five priorities:**
   1. Enable `minify` — 15 minutes for −95 kB gzipped on the entry chunk.
   2. Add a `typecheck` gate with a **fingerprint** baseline; fix the Supabase drift first.
   3. Get `main` green and keep it green — **before** #1956 starts, so its re-skin does not
      land on top of already-red class-string assertions.
   4. Narrow the URL-state boundary into capability domains — **after #1955 merges, before
      #1956 starts** — so the `node=` param and legacy compatibility resolver land on a prepared
      seam rather than inside a 1,106-line function.
   5. Consolidate *proven* Discover-specific code into `features/discover/` and lock the
      boundary with lint rules — **after #1955 is committed and merged** (§5.1).

   Priority order is unchanged from rev 2; only the *timing* of items 3-5 is now expressed
   against an observable repository state rather than an estimate.

4. **Is the roadmap safe to execute incrementally?** **Yes** — see
   `docs/audit/frontend-refactoring-roadmap.md`. Slice 1A/1B and Slice 2 are behaviour-neutral
   and protected by the existing 4,552-test suite. Slice 3 carries real regression risk and is
   scoped one component at a time behind that suite. Slice 4 is low-risk per PR but carries
   medium *programme* risk, because strict nullability surfaces semantic decisions rather than
   mechanical ones. Sequencing against #1955/#1956/#1960 is specified in the roadmap's
   "Roadmap sequencing" section.

---

## 11. Reproducing this audit

```bash
# Numbers below are the ce1d6aa1 snapshot. Post-#1978/#1982/#1984 baseline (475785d0) in
# docs/audit/evidence/phase0-baseline-stabilisation/README.md:
#   tsc  → 31 errors / 10 files · vitest → 5 FAILED / 2 files (4,635 total) · eslint → 103 (11/92) / 54 files
npx tsc -p tsconfig.app.json --noEmit    # 42 errors in 17 files
npx vitest run                            # 4552 tests, 10 FAILED, 7 suites
npx eslint . -f json                      # 97 problems (11 err, 86 warn)
npx vite build                            # 5.42 MB JS, entry 1529 kB / 298 kB gz
npx vite build --minify esbuild           # 2.65 MB JS, entry  749 kB / 203 kB gz
```

Analysis scripts (metrics, importer ownership, suppression classification) were run from the
session scratchpad and are not committed; every number they produced is stated inline above
with the file and line it came from, so each is independently checkable.

---

## 12. Revision history

| Rev | Date | Change |
|---|---|---|
| 1 | 2026-07-23 | Initial audit. |
| **4** | **2026-07-24** | **§5.1 deterministic sequencing rule** replaces the scheduling question — no roadmap decision now depends on an estimate from an active session; deferral justified by cost asymmetry (shims + mechanical import rewrites are cheap and recoverable; disrupting an uncommitted tree is not). Disjoint path sets retained as evidence of *no current textual overlap only*, explicitly not as licence for concurrent refactoring. **§5 issue statuses made precise** — #1955 *actively being implemented*, #1956 *planned, not yet started* (**verified**: no `*1956*` branch, no worktree), #1960 *future*; all #1956 footprint claims relabelled **scope-derived, not branch-derived**. **§2.7 lint verdict softened** from "in good shape" to "manageable debt, incomplete gate", itemising the 11 errors, disabled `no-unused-vars`, 22 non-source parse errors, and unenforced dependency direction. **§2.12 dead-code claim softened** to *low current reachability risk*, not proof. **§6 replaced "safe now" with four coordination categories**; Supabase regeneration and route error boundaries moved to **AFTER-1955**; typecheck tooling marked **COORDINATE** and explicitly not for this session. §10 priorities unchanged; timing re-expressed against observable state. |
| **3** | **2026-07-24** | §5 rewritten against the **verified** #1955 branch state (19 changed paths, 100% backend, 0 frontend, 0 commits ahead, branched from the audited commit `ce1d6aa1`). Rev 2's claim that "moving `components/discover/` today conflicts directly" is **withdrawn as incorrect** — the path sets are disjoint. Constraint re-grounded as forward-looking (City Launch Preview has not started) plus uncommitted-tree fragility. The genuine counter-argument — consolidate *now*, while the window is open — is recorded rather than buried, with the decision escalated to whoever knows #1955's frontend start date. |
| **2** | **2026-07-24** | §1 executive summary reworded to "direction and ownership sound, Discover migration incomplete, integration boundaries too broad". §2.6 replaced count ratchet with fingerprint baseline; corrected suppression count 28 → **29**. §2.8 added the "bundle size is not the decision metric" qualifier. §2.10 accessibility explicitly deferred to **#1960**. §2.12 added **606 LOC of newly-found dead code** in `src/components/map/`. **§4.2 new** — shared vs Discover-specific map ownership, with importer evidence. §4.3 reframed around #1956's `node=`/compatibility resolver. **§4.6 rewritten** — 29 suppressions classified into five behavioural categories. **§5 new** — #1955/#1956/#1960 in-flight constraints with concrete collision evidence. §7 added shared map infrastructure and `macroRegionResolver` to the do-not-touch list. §9 added `shared/map/` and a fourth carry-forward rule. §10 verdict aligned to the new summary wording. §11 new. |
