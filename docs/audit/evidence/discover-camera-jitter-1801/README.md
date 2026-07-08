# Issue #1801 — Discover map marker-click camera jitter: evidence

## Root cause (confirmed)

A single region/zone/area marker click fired 2-3 uncoordinated Leaflet camera
calls on the same `useMap()` instance:

1. **Call #1 (imperative, sync, outside React)** — `AreaMarkerLayer.tsx`
   `marker.on('click', ...)` called `map.fitBounds(area.bbox, {padding:[40,40],
   maxZoom: isOverviewGroupOrRegion ? 12 : 16})` or `map.flyTo(center, ...)`
   the instant the marker was clicked. This code was **duplicated** in two
   places: the legacy per-area loop (~L317-332) and the PR-B
   degraded-representatives loop (~L419-434).
2. **Call #2 (chained, zone/area only)** — `map.once('zoomend', () => {
   if (map.getZoom() <= 12) map.setZoom(13, {animate:true}) })`, registered
   right after call #1, in both of the same two places.
3. **Call #3 (delayed, React, post-fetch)** — `PropertyMap.tsx`
   `MapController`'s `focusBounds` `useEffect` fired
   `map.fitBounds(focusBounds, {padding:[50,50]})` once the new area's
   listings/markers finished fetching over the network. `focusBounds` is fed
   by `useDiscoverMapData.activeFocusBounds =
   computeFocusBounds(filteredMarkers, filters.localities)` — the tighter
   *actual-markers* bbox, a different target than call #1's static area bbox.
   This is the visible "goes somewhere, then pulled back" snap-back.

   **Correction (rework, code-review finding):** `activeFocusBounds` is fed
   from `filters.localities`, and `useDiscoverPageState.handleAreaClick` /
   `handleAreaSelect` unconditionally **clear** `filters.localities` on every
   area click (`useDiscoverPageState.ts` — area selection subsumes locality;
   the old `LocalityChipsBar` UI that used to repopulate it was removed in
   #969 and nothing live repopulates it). `computeFocusBounds` returns `null`
   when `localities` is empty. So for the common area-first leaf-click path,
   `activeFocusBounds` is **effectively always `null`** post-click — Call #3
   as originally described does **not** actually recur live for that path
   today. The `focusBounds` prop passed to `MapController` is
   `agriGroupFocusBounds ?? activeFocusBounds` (`MapDiscovery.tsx`); the live
   value of the strict-fit-once suppression is therefore mainly the
   **agri-first `agriGroupFocusBounds` path** — a leaf click inside the
   agri-first journey drives an optimistic `CameraIntent` immediately, and
   separately, once `useAgriMapListings` resolves, an effect recomputes
   `agriGroupFocusBounds` from the real listing coordinates and republishes
   it through the same `focusBounds` prop, which is the refit this
   suppression is built to swallow exactly once. Any future producer of a
   non-null `activeFocusBounds` (e.g. if locality-driven refits are
   reintroduced) would also be covered by the same one-shot mechanism.

## Chosen camera-ownership strategy

**Single React-owned camera owner + optimistic intent; strict fit-once.**

- `AreaMarkerLayer.tsx`'s two full-pin click handlers (legacy + degraded
  representatives) no longer touch the map camera at all. Both now collapse
  to `marker.on('click', () => { onAreaClick?.(area); onAreaCameraIntent?.(area); })`.
  The dots handler (`onAreaClick` only) and the cluster handler
  (`map.fitBounds(unionBounds(...))` + `onAreaClusterClick` — the
  cluster-SPLIT path) are **unchanged**.
- `useDiscoverMapData.ts` owns a new `CameraIntent` state (`{ seq, bounds,
  center, framing }`) alongside the existing `fitTick`/`activeFocusBounds`.
  `publishCameraIntent(area)` is called **synchronously**, in the same React
  click tick, by `AreaMarkerLayer`'s `onAreaCameraIntent` — never from a
  delayed effect or a post-fetch callback. `seq` is a strictly monotonic ref
  counter; `framing` is `'overview'` for macro-region/group pins, `'leaf'`
  for a real area.
- `cameraIntent` is threaded `useDiscoverMapData` → `MapDiscovery.tsx` →
  `PropertyMap.tsx` (`cameraIntent` prop) → `MapController`.
  `onAreaCameraIntent` (the publisher) is threaded the other direction:
  `MapDiscovery.tsx` → `PropertyMap.tsx` → `AreaMarkerLayer.tsx`.
- `MapController` (`PropertyMap.tsx`) is now the **sole camera owner** for
  area navigation:
  - a new `useEffect` keyed on `cameraIntent` fires exactly once per unseen
    `seq` (`lastHandledSeqRef` guard):
    - `framing: 'overview'` → `map.fitBounds(bounds, {padding:[40,40],
      maxZoom:12})`, or `map.flyTo(center, 12)` if `bounds` is null.
    - `framing: 'leaf'` → computes the natural fit zoom via
      `map.getBoundsZoom(bounds, false, L.point(40,40))`, clamps it to
      `[13,16]`, and calls `map.setView(centerOfBounds, clampedZoom,
      {animate:true})` — or `map.flyTo(center, 13)` if `bounds` is null. This
      **replaces** the deleted `map.once('zoomend', ...) → setZoom(13)`
      correction: the target zoom is computed and clamped up-front instead
      of fit-then-correct-after-settling.
  - the existing `focusBounds` effect gained a **seq-correlated, time-bounded,
    one-shot** suppression (`suppressForSeqRef` + `suppressArmedAtRef`;
    replaces an earlier bare-boolean draft that a code-review pass flagged as
    unsafe — see "Rework" below): handling a new `'leaf'`-framed intent arms
    `suppressForSeqRef.current = seq` with a timestamp; the very next
    `focusBounds` effect run always consumes (clears) it, and skips its fit
    only if it fires within `CAMERA_SUPPRESS_TTL_MS` (8s) of arming — a
    stale suppression that never gets a correlated refit self-expires rather
    than swallowing something unrelated. `'overview'`-framed intents never
    arm suppression at all (overview clicks never cross the
    `AREA_LAYER_MAX_ZOOM` threshold, so no correlated refit can ever follow
    one). This is NOT a blanket `if (cameraIntent) return;` — a
    `fitTick`/`filters.localities`/URL-driven refit with no pending
    suppression still fires normally (see AC6/qa-fast R1 tests below).
  - `resetMapTick` (area deselect/back) and a `cityCenter` change both clear
    the pending suppression, so a stale intent from an abandoned navigation
    cannot swallow a later, unrelated refit (qa-fast R6).
  - `lastHandledSeqRef`'s strict `seq > lastHandledSeqRef.current` guard
    means a stale/re-delivered `cameraIntent` object (e.g. from a
    forward-history restore) never re-fires the camera.

### Rework — code-review BLOCKING finding (cycle 2)

A `code-reviewer` pass on the first implementation found the
`suppressNextFocusFitRef` bare boolean was armed **unconditionally** on
every `cameraIntent` (including `'overview'`) with no correlation to the
specific click that armed it, and was consumed only by whatever
`focusBounds` effect run happened to come next — with no guarantee that run
was actually the correlated refit. Two concrete leak paths were proved:

1. **Overview clicks** never produce a correlated `focusBounds` change
   (zoom stays `<= AREA_LAYER_MAX_ZOOM`, `markersEnabled` never flips true),
   so the flag armed by an overview click was **never consumed** and stayed
   armed indefinitely.
2. **Leaf clicks** clear `filters.localities` (see the Call #3 correction
   above), so `activeFocusBounds` stays `null` and the flag can likewise
   never be consumed through that path.

Either way, a stale armed flag would silently swallow a **later, unrelated**
legitimate refit (e.g. the agri-first `agriGroupFocusBounds` sync for a
different navigation, or any future `activeFocusBounds` producer) — the
qa-fast R1 "legitimate non-click refit swallowed" failure mode, structurally
present despite the R1 test passing (that test only exercised the
*immediate* next refit, not a *later* one after a leak-inducing intent).

Fix: `suppressForSeqRef`/`suppressArmedAtRef` (seq-tagged, `'leaf'`-only
arming, 8s TTL) described above. See
`PropertyMap.cameraIntent.test.tsx`'s new regression test (below) for the
reproduction.

This is **strict fit-once** per the brief — no gated reconciliation was
implemented (documented as a follow-up only, not built here).

## Before / after behaviour (call counts)

| Scenario | Before | After |
|---|---|---|
| Area-pin click (leaf) | 3 calls: `fitBounds`(area bbox) → `zoomend`→`setZoom(13)` (if landed ≤12) → later `fitBounds`(markers bbox) | **1 call**: `setView(center, clamp([13,16]))` |
| Macro-region / group pin click (overview) | 2 calls: `fitBounds`(bbox, maxZoom 12) → later `fitBounds`(markers bbox) | **1 call**: `fitBounds`(bbox, maxZoom 12) |
| Cluster-split chip click | 1 call: `fitBounds`(union bounds) — unchanged | **unchanged** (preserved exactly) |
| Dot click | 0 camera calls — unchanged | **unchanged** (no camera calls) |
| "Fit to selected areas" / locality-filter refit with no open click-intent | 1 call | **unchanged** — still fires |

## Tests run

All commands executed from the worktree root
(`/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-1801-camera-jitter`)
via `npx vitest run --root <worktree>` (the `--root` override was required —
this environment's Bash tool resets `cwd` between calls, and a bare `cd &&`
is disallowed by tooling policy; `--root` pins Vite/Vitest module resolution
to the worktree regardless of process cwd).

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit -p <worktree>` | 0 | `TypeScript: No errors found` |
| `npx vitest run --root <worktree> src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx` | 0 | 4/4 passed |
| `npx vitest run --root <worktree> src/components/map/__tests__/PropertyMap.cameraIntent.test.tsx` | 0 | **13/13 passed** (rework: added 1 negative/regression test) |
| `npx vitest run --root <worktree> src/components/map/__tests__/AreaMarkerLayer.test.tsx` | 0 | 32/32 passed |
| `npx vitest run --root <worktree> src/components/map/__tests__/PropertyMap.areaPanner.test.tsx` | 0 | 13/13 passed (unchanged, green — cluster-split / AreaPanner / SchoolFocusPanner behaviour untouched) |
| `npx vitest run --root <worktree> src/components/map/__tests__/` (full map unit dir) | 0 | **196/196 passed** |

No pre-existing failures were observed in the full map unit directory run.

**Rework verification (negative test):** the new regression test in
`PropertyMap.cameraIntent.test.tsx` ("REGRESSION (rework) — an OVERVIEW
intent never arms suppression...") was verified to FAIL against the pre-fix
bare-boolean implementation and PASS against the fix, by temporarily
reverting only the `MapController` suppression block (the
`suppressForSeqRef`/`suppressArmedAtRef` mechanism and its two clear-sites)
to the old unconditional `suppressNextFocusFitRef` boolean in place, with
the rest of the #1801 implementation untouched, then re-running
`PropertyMap.cameraIntent.test.tsx`:
- Pre-fix (bare boolean): **12 PASS / 1 FAIL** — only the new regression
  test failed (`expected "spy" to be called 1 times, but got 0 times`),
  confirming it reproduces the leak.
- Post-fix (seq-correlated + TTL): **13/13 PASS**.
The suppression block was then restored to the fixed version verbatim.

### `PropertyMap.jitterDiagnostic.test.tsx` — rewritten (fixed-behaviour assertions)

Now asserts the FIXED behaviour instead of diagnosing the bug:
- a single legacy area-marker click produces **exactly one** area-navigation
  camera call (leaf framing → `setView`);
- `map.once('zoomend', ...)` / `setZoom(13)` is **never** registered on click
  (qa-fast R5);
- a macro-region pin click uses `fitBounds` with `maxZoom: 12` (overview
  framing), never `setView`;
- a later network-driven `focusBounds` change following the **same** click
  does **not** add a second camera call (strict fit-once).

Degraded-representatives-handler coverage (qa-fast R4) lives in
`AreaMarkerLayer.test.tsx` instead of this file — precisely targeting a
*representative* marker (vs. a dot or cluster chip) among many rendered
markers requires the captured-markers-by-index pattern already established
there, which this file's single-marker-per-render diagnostic harness does
not have.

### `PropertyMap.cameraIntent.test.tsx` — new

Covers the `cameraIntent` → `MapController` contract directly (bypassing
`AreaMarkerLayer`):
- a published intent fires exactly one fit synchronously, independent of
  `focusBounds`;
- a subsequent `focusBounds` rerender for the **same** handled `seq` does
  **not** add an extra fit (suppression);
- a `focusBounds` change with **no** `cameraIntent` ever published still
  fires (AC6 / qa-fast R1 — suppression is not a blanket block);
- leaf framing clamps a computed zoom above/below/inside `[13,16]`
  (qa-fast R5);
- leaf/overview framing with `bounds: null` falls back to `flyTo`;
- overview framing always uses `maxZoom: 12`;
- rapid, strictly-increasing `seq` values each fire exactly once (qa-fast
  R7);
- a re-delivered intent object with the **same** `seq` does not re-fire
  (idempotent guard);
- a `resetMapTick` bump clears a pending suppression so a later, unrelated
  `focusBounds` change still fires (qa-fast R6);
- **(rework regression test)** an `'overview'` intent never arms suppression
  at all, so a later, unrelated `focusBounds` change still fires even with
  no `resetMapTick` bump and no `cityCenter` change — fails against the
  pre-rework bare-boolean implementation, passes after the seq-correlated
  fix.

### `AreaMarkerLayer.test.tsx` — updated

New `describe('AreaMarkerLayer — Issue #1801 camera-intent click contract')`
block:
- legacy full-pin click fires `onAreaClick` + `onAreaCameraIntent` and makes
  **no** direct `fitBounds`/`flyTo`/`setZoom`/`once` call;
- `onAreaCameraIntent` is optional — a missing prop does not throw;
- degraded-representatives click has the **same** contract as the legacy
  handler (qa-fast R4);
- the dots handler is **unchanged**: `onAreaClick` only, never
  `onAreaCameraIntent`, never a camera call;
- the cluster handler is **preserved exactly**: still calls `map.fitBounds`
  directly and fires `onAreaClusterClick`, never `onAreaClick` /
  `onAreaCameraIntent` (qa-fast R3).

## Scope confirmation (no scope creep)

Only files within the approved `allowed_file_globs` were touched:

- `src/components/map/AreaMarkerLayer.tsx` — removed the two duplicated
  imperative camera blocks; added the `onAreaCameraIntent` prop.
- `src/components/map/PropertyMap.tsx` — added `cameraIntent` /
  `onAreaCameraIntent` props; `MapController` gained the intent-consuming
  effect and the seq-keyed `focusBounds` suppression.
- `src/hooks/useDiscoverMapData.ts` — added the `CameraIntent` type,
  `cameraIntent` state, and `publishCameraIntent`.
- `src/hooks/useDiscoverPageState.ts` — read only; no functional change was
  needed here (`handleAreaClick`'s existing "do NOT set panToArea" guard for
  marker clicks was already correct and is preserved verbatim).
- `src/pages/MapDiscovery.tsx` — wired `cameraIntent` /
  `onAreaCameraIntent` through to `PropertyMap`.
- `src/components/map/__tests__/PropertyMap.jitterDiagnostic.test.tsx` —
  rewritten per the brief.
- `src/components/map/__tests__/AreaMarkerLayer.test.tsx` — updated per the
  brief.
- `src/components/map/__tests__/PropertyMap.cameraIntent.test.tsx` — new,
  per the brief.
- `docs/audit/evidence/discover-camera-jitter-1801/README.md` — this file.

**Not touched**: `backend/**`, `supabase/**`, any `.env*`/`secrets/**`,
`AreaPanner*` (verified green, unedited), `_ds_bundle.js`, marker visual
styling (`makeAreaCard`/`makeDotIcon`/`makeClusterIcon` HTML), the
cluster-split `fitBounds` handler (preserved and tested), the #1738 popup
gate, PR-A school-search scoping, or the listing-detail page.

## Deviation from the brief

None encountered that required stopping. One judgment call, documented
above: qa-fast R4's degraded-representatives-handler coverage was placed in
`AreaMarkerLayer.test.tsx` rather than
`PropertyMap.jitterDiagnostic.test.tsx`, because that file's existing
single-marker harness can't reliably target a *representative* marker (vs. a
dot/cluster) among many rendered markers sharing the same mocked
`marker.on('click', ...)` capture mechanism — `AreaMarkerLayer.test.tsx`
already has the captured-markers-by-index infrastructure for exactly this.

This is **strict fit-once**, as instructed — gated reconciliation was
intentionally NOT implemented (documented follow-up only).

## Phase 7A/7B browser verification + a pre-emptively-caught secondary bug

The originally-reported bug — marker-click camera jitter — is **fixed and
verified in a real browser (Phase 7A product-verification: PASS)**. On a live
worktree stack (frontend :5197, backend :8097, real Supabase-backed data),
region-group, individual-area (Thanisandra, in the dense Thanisandra-Hennur
belt), and Hebbal deep-link pin clicks each produced **one clean camera
transition with no snap-back**; the leaf-zoom clamp kept listings visible;
scrolling the panel did not move the camera; no console errors.

### Deferred / unconfirmed: browser-Back stale camera refit (NOT fixed in this PR)

A Phase-7B exploratory sweep reported a candidate regression: after a browser
**Back** from a filtered area to group level, the camera/URL appeared to jump
back ~2-5s later to the abandoned area's `zoom=15`. This was investigated
across **three** diagnostic rounds and is being **deferred as unconfirmed**,
NOT fixed here:

- A first fix hypothesis (a `focusBounds` deselect-guard with a TTL) passed
  unit tests + code-review but **failed** an in-browser re-check — so it was
  **reverted** (it targeted the wrong path).
- A read-only code trace then hypothesised a stale `activeFocusBounds`, which
  was **refuted**: `activeFocusBounds` is effectively always `null` post-click
  (see the Call #3 correction above), so it cannot be the trigger.
- A cameraIntent-replay-on-remount hypothesis was **not observed**:
  `MapController`/`PropertyMap` do **not** remount on browser Back (the
  `MapDiscovery` page stays mounted; `<PropertyMap>` has no `key` prop), and
  the `cameraIntent` effect never re-fired.
- A **final controlled repro** (single clean browser tab — eliminating the
  console-pooling cross-contamination from stale background tabs that tainted
  earlier evidence — network throttled to add 400-900ms latency, HAR/console
  captured, repeated **3×**) did **NOT reproduce** the camera snap in any
  attempt: the URL held at `zoom=12` for the full idle window each time, and
  no `map.fitBounds`/`flyTo`/`setView` fired for the abandoned area. The
  base suppression logic (`suppressForSeqRef`/`resetMapTick`/8s TTL) held up
  even under artificial latency.

Conclusion: the camera-snap symptom is **not reproducible** under controlled
conditions; the earlier apparent reproductions are partly attributable to a
browser-tooling artifact (the console-read tool pools by domain, not tab).
It is filed as a follow-up to be reproduced under controlled conditions
(single tab, network throttling, real-user timing / HAR) **before** any fix.

## Follow-up candidates (NOT fixed in this PR — file as separate issues)

1. **Browser-Back stale camera refit** (this section) — unconfirmed under
   controlled repro; reproduce first. Related: `resetMapTick` is bumped by the
   in-app Back **button** (`useDiscoverPageState.handleAreaBack`) but **not**
   by the browser-Back `urlAreaKey` effect (`useDiscoverPageState.ts` ~161-174)
   — a real asymmetry worth addressing in that follow-up.
2. **Filter chip / filter state persists after browser Back** (CONFIRMED 3/3
   in the controlled session): the property-type filter chip (e.g.
   "Apartment") and its underlying `filters` state survive a browser Back even
   though the URL's `type=` param is correctly stripped, and a stray listings
   request fires at the reverted viewport still carrying the stale filter. This
   does **not** move the camera or rewrite `zoom`/`lat`/`lon` — it is a
   **separate** bug from the camera issue (likely `filters` state not reset on
   `popstate`, in `useDiscoverPageState.ts`/`MapDiscovery.tsx`). Not caused by
   this PR.
3. **Filter-click camera zoom-in** (needs product decision): clicking a
   property-type filter while an area is selected causes a large camera
   zoom-in (area overview → street-level) — possibly the intended
   "fit to filtered results" behaviour. Not caused by this PR.
4. **Deep-link camera at group zoom** (P3): a direct deep-link to an
   area-selected discover URL loads the correct area panel but leaves the
   camera at the group-level zoom instead of fitting to the area. Not caused
   by this PR.
