# EditListing.guard.test.tsx memory investigation — issue #1825 Slice 3 (Cluster B)

Base: branch `main` @ f5216bc3 (post-Slice-4). Measurement-first; no assumption of cause.

## TL;DR — ROOT CAUSE (measurement-backed)
An **unbounded infinite render/effect loop**, triggered by a **non-memoized test mock**. Classification: **(8) combination — (1) test-harness issue + (4) effect loop**; with **(7) monolithic architecture** as a cost *amplifier* (not the cause).

Smallest correct fix: **test-harness only** — make the `useGetListing` mock return a stable (module-level, hoisted) object. Proven to take the file from **4GB+/10-min hang → 70 MB / 149 ms / 5 tests pass**. No product change required.

## The file
`src/pages/broker/__tests__/EditListing.guard.test.tsx` — 94 lines, 5 trivial role-guard tests. Each calls `renderEditListing()` which renders the REAL `<EditListing/>` (src/pages/broker/EditListing.tsx, 2281 lines). Mocked: AuthContext, useBrokerListings, useListingImages, AppLayout (passthrough), StepIndicator (null). Everything else renders real (incl. AddressPicker→Leaflet, ImageUploader).

## The mechanism (static, file:line — from performance-analyst)
1. `EditListing.guard.test.tsx:21-26` — the `useGetListing` mock is a plain arrow returning a **fresh object literal every call**: `data: { id:'123', status:'DRAFT', propertyType:'land' }` (NOT `vi.fn().mockReturnValue(stable)` / not hoisted).
2. `EditListing.tsx:265` — `const { data: listing } = useGetListing(id ?? '')` is called every render → `listing` has a **new identity every render**.
3. `EditListing.tsx:403-500` — the file's SOLE `useEffect` is keyed on `[listing]` (object identity). New identity each render → effect fires after **every** commit.
4. `EditListing.tsx:497-499` — inside that effect: `setAmenities(listing.amenities ?? [])`, `setSpecialLocationViews(... ?? [])`, `setPreferredTenants(... ?? [])`. The mock omits these fields → `?? []` allocates a **new array literal every run** → `Object.is(newArr, prevArr) === false` → React schedules a re-render → **loop, never converges**.
5. Amplifier: `EditListing.tsx:1889-1890, 1955-1971` — `ImageUploader` and `AddressPicker` (real `leaflet`/`react-leaflet` `MapContainer`, AddressPicker.tsx:1-27) are **unconditionally mounted** (CSS display-toggle wizard, gated on `isSubmittable` not `currentStep`), so each loop iteration re-renders a live Leaflet fiber tree → heap-heavy per iteration.

Why production is NOT affected: under real TanStack Query, `useGetListing().data` is a **stable/cached reference** between renders while the query key is unchanged, so the `[listing]` effect fires once. The mock defeats that stability guarantee. The `?? []` pattern (497-499) is a latent footgun, not a live product bug.

## Measurements

### M1 — single test alone hangs (per-render loop, NOT cumulative)
`node node_modules/.bin/vitest run EditListing.guard.test.tsx -t "allows modern broker role..." --logHeapUsage --testTimeout=20000 --pool=forks --singleFork` → **never completes**; no per-test heap line ever printed (the single render never finishes). Confirms a single render entry triggers unbounded re-renders (not growth accumulated across the 5 tests). Evidence: measure-single.txt (started 22:40:58, still hung at 22:47+).

### M2 — BEFORE heap-growth curve (live worker RSS, unstable mock)
Sampled the live vitest worker every 2s (before-rss-growth.txt): sustained **1741–3281 MB RSS** oscillating for the full 40s window, ~6+ minutes into a SINGLE test with no completion. The oscillation = V8 GC repeatedly reclaiming then the loop re-allocating (an allocation storm), i.e. the process is pinned at multi-GB doing nothing but churning garbage. Left to run it climbs to the ~4GB default heap ceiling and OOM-crashes (`ERR_IPC_CHANNEL_CLOSED` / V8 heap-limit), consistent with the documented 4GB+/658s.

### M3 — AFTER (stable mock) — the decisive before/after
Throwaway probe `EditListing.guard.probe.test.tsx` = the same file with ONLY the mock changed to a stable hoisted object (`const stableListing = vi.hoisted(() => ({...})); data: stableListing`). Result (probe-run.txt):
```
✓ EditListing.guard.probe.test.tsx (5 tests) 149ms 70 MB heap used
Test Files 1 passed (1) | Tests 5 passed (5) | Duration 1.51s | EXIT 0
```
**4GB+/10-min-hang → 70 MB / 149 ms / 5 pass.** All 5 role-guard assertions still pass (the guard behaviour is unchanged). Probe generator kept (make-probe.mjs); probe file deleted after run.

## Classification (1 of 8, evidence-backed)
- PRIMARY / actionable: **(1) test-harness issue** — the non-memoized mock is what makes `listing` churn. Fixing it alone resolves the OOM (M3). 
- MECHANISM: **(4) effect loop** — the `[listing]`-keyed effect + `?? []` new-array state writes are the loop body (static + M1/M2/M3).
- AMPLIFIER (not cause): **(7) monolithic architecture** — 2281-line component with always-mounted heavy Leaflet/uploader children makes each iteration expensive; it does NOT create the loop and its decomposition is out of scope for this issue.
- RULED OUT by evidence: (5) React Query lifecycle (hooks fully mocked, retry:false), (6) huge eager imports (one-time Leaflet module cost only, not per-render), (2) cleanup/resource leak (no un-cleaned timers/observers found; AFTER converges to 70MB).

## Recommended fix (smallest correct surface — TEST-ONLY)
Change the `useGetListing` mock in EditListing.guard.test.tsx so `data` is a **stable module-level (hoisted) object** (mirroring real Query's stable cached reference), e.g.:
```ts
const stableListing = vi.hoisted(() => ({ id: '123', status: 'DRAFT', propertyType: 'land' }));
vi.mock('@/hooks/useBrokerListings', () => ({
  useGetListing: () => ({ data: stableListing, isLoading: false, isError: false }),
  ...
}));
```
No product/source change. No `.skip`/deletion/weakening — all 5 guard assertions remain and pass. No `max-old-space-size` bump.

## Recommended follow-ups (do NOT implement here)
1. **Product hardening (small, separate)**: EditListing.tsx:403-500 could copy `listing` fields into state more defensively (e.g. hydrate-once guard, or stable empty-array constants for the `?? []` fallbacks) so the component is robust even if a future data source returns an unstable reference. Latent footgun, not a live bug — a small follow-up, not this slice.
2. **Architecture (separate GitHub issue, per assignment)**: EditListing.tsx is a 2281-line monolith with always-mounted heavy children (Leaflet map + uploader) regardless of wizard step. This amplified the loop into a 4GB event and makes the component expensive to test/maintain. Recommend a dedicated decomposition issue (module boundaries, extraction order, Sonar targets, testing strategy, migration strategy). NOT to be implemented in #1825.
