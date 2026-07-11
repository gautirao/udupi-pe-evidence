# Root-cause clusters — issue #1825

Baseline: `ddb946d7`. 123 assertion failures across 10 files + 1 un-runnable (OOM) file. Four clusters (A dominant, B/C/D independent), plus the full-suite OOM as an environmental constraint.

---

## Cluster A — Missing test providers for PropertyCard (AuthProvider et al.) — 119 failures, 6 files
**Symptom (identical across all 6 files):** `Error: useAuth must be used within an AuthProvider` thrown from `useSavedListingIds` (useSavedListings.ts:57) via `PropertyCard` (PropertyCard.tsx:117).
**Members:**
- AreaSelectedPanel.test.tsx (41)
- SchoolSelectedPanel.test.tsx (40)
- AreaSchoolCombinedPanel.test.tsx (25)
- SchoolJourneyPanels.test.tsx (8)
- DiscoverRightPanel.test.tsx (3)
- DiscoverRightPanel.routing.test.tsx (2)

**Root-cause hypothesis (high confidence):** Issue #1566 (saved homes, merged 2026-07-06) made PropertyCard depend on `AuthProvider` (+ `QueryClientProvider`, `AuthModalProvider`). These panel tests render PropertyCard without those providers. **Classification: stale test-harness / fixture drift — NOT a product regression.** The feature is intentional and gate-passed.
**Fix boundary:** shared test render helper — wrap the rendered tree in the required providers (AuthProvider + QueryClient + AuthModal), ideally via one shared test-utils change reused by all 6 files. To confirm during execution: whether the 6 files share a render helper or each inline `render()` (dictates whether the fix is one file or six). No product code should change.
**Independence:** fully independent, single cohesive PR. Highest value (fixes 119/123).

---

## Cluster B — EditListing.guard.test.tsx OOM (test-infra memory defect) — 1 file, un-runnable
**Symptom:** Exhausts 4GB+ V8 heap and crashes (`ERR_IPC_CHANNEL_CLOSED`) after ~658s even when run **completely alone**. Never emits results.
**Root-cause hypothesis:** genuine memory leak / runaway render loop / unbounded state accumulation within this single test file (or a component it exercises). Also a primary contributor to the full-suite OOM.
**Classification:** test-infra defect requiring hands-on investigation — **NOT fixable by smaller batching / per-file isolation** (already proven: OOMs alone).
**Independence:** independent PR. Needs actual investigation of what the test/component does (fake timers not advanced, infinite effect loop, retained DOM, etc.).

---

## Cluster C — Independent product/config singletons — 4 failures, 4 files (1 each)
Each is a distinct value-assertion failure needing its own regression-vs-stale classification during execution. Do NOT weaken assertions; fix the real side (product or test) at smallest scope.

- **C1 · src/lib/listingFieldConfig.test.ts** — agricultural_land field config now yields an unexpected extra field `facing` (`expected ['facing'] to deeply equal []`). Classify: did agri config legitimately gain `facing` (→ update test) or is `facing` wrongly included for agri land (→ fix config)?
- **C2 · src/lib/routeAccess.test.ts** — regression guard "`/broker/listings/new` access unchanged after the commercial deep-link fix" fails (`expected true to be false`). Named a "regression" guard → likely a genuine route-access predicate regression from a commercial deep-link change; fix product predicate, keep the guard.
- **C3 · src/lib/map/areaMarkerBucketing.test.ts** — quadrant-guarantee test expects ≥10 representatives, algorithm now yields 8 (`expected 8 to be >= 10`). Relates to the known #1815 quadrant-vs-overlap tension. Classify: intended bucketing change (→ update expectation with justification) vs regression (→ fix algorithm).
- **C4 · src/pages/__tests__/LandingPage.test.tsx** — `Found multiple elements with role "link" and name /Saved/i` for signed-in consumers: a second "Saved" link now renders. Classify: intended (two Saved entry points → tighten query) vs duplicate-nav regression (→ fix UI).

**Independence:** the 4 are mutually independent; may be one small "misc test-truth reconciliation" PR or split if any turns into a non-trivial product fix (esp. C2).

---

## Environmental constraint — full-suite OOM
The suite cannot be run as a single process on this machine (documented by `all: false`). All baseline/validation runs — including the final 2-consecutive-clean-run determinism gate — must use the batched runner (`baseline/run-batches.sh` + `run-subsplit.sh` + `run-broker-perfile.sh`) and aggregate. This is a harness constraint to preserve, not a failure to fix (though Cluster B's leak likely worsens it).

## Suggested phasing (see team-lead-plan.toml)
1. **Slice 1 (this evidence + 2-run determinism):** freeze baseline, confirm determinism via a second batched run, finalize inventory/clusters. Evidence-only.
2. **Slice 2 (Cluster A):** shared test-provider harness fix — 119 failures, test-only, independent, highest value.
3. **Slice 3 (Cluster B):** investigate + fix EditListing.guard OOM.
4. **Slice 4 (Cluster C):** classify + fix the 4 singletons at smallest scope (split C2 if it's a real product regression).
5. **Closeout:** two consecutive clean batched full-suite runs on the final SHA + tsc/lint/build.
