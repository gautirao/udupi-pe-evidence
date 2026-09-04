# #2419 PR-2 — handover to lane-2419b

PR **#2452**, branch `issue-2419-draw-mode-pr2`, base `origin/main @ 1184a338`.

**Take over at the branch tip (`1209de35` or later), not `cd08d741`.** The handover was written naming `cd08d741`, but the ruling that came with it ("placement is fixed in PR-2 — mount the same entry + predicate in the single-area `AreaSelectedPanel` path, additive") is exactly what `47ba57a1` does. Starting from `cd08d741` would discard it and re-block the e2e re-point. See *Why the placement fix exists* below.

---

## 1. Environment

| | |
|---|---|
| Worktree | `/Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-2419-draw-mode-pr2` |
| Frontend port | **5197** |
| Backend port | **8117** |

Both were verified free before being claimed. Sibling lanes hold 5182/5184/5190/5196 and 8085/8092/8094/8099/8102/8110 — check `lsof -nP -iTCP -sTCP:LISTEN` before reusing anything.

```bash
bash scripts/dev-worktree-stack.sh \
  --worktree /Users/gouthamrao/projects/udupi-property-explorer-worktrees/issue-2419-draw-mode-pr2 \
  --frontend-port 5197 --backend-port 8117
```

Run it **in the background and keep the shell alive** — the servers die with their parent. Losing it mid-Playwright run produces `ERR_CONNECTION_REFUSED` failures that look like code failures; they are not. Restart and re-measure rather than reporting them.

`.env`, `.env.e2e`, `apps/web/.env` and `apps/api/.env` are already symlinked from the main clone. `apps/api/.env` is the one the stack script does *not* create for you — without it the backend exits immediately with an unhelpful message.

---

## 2. What is left

1. ~~**Re-point `e2e/issue-2016-result-scope-contract.spec.ts`.**~~ **DONE at `1209de35`.** The helper now clicks `area-set-draw-area`, asserts the `draw-mode-overlay` as its draw-mode signal, suppresses pointer events on the interfering panes, verifies each vertex through `.leaflet-editing-icon`, and closes the ring on the first vertex. **It has NOT been executed** — it needs the local stack, so running it is the first job of the evidence pass, and expect to iterate on vertex placement (trap 5).
2. **Evidence pass.** `MOCK | IMPLEMENTATION` side by side at **1366×768** and **390×844** for: NOT DRAWING, DRAWING, REVIEWING DRAFT, INVALID — NEEDS REDRAW, COMMITTED POLYGON, anonymous entry treatment. Each labelled `MATCHED` or `MISMATCH — OWNER DECISION REQUIRED`.
3. **The non-overlap browser proof**, still owed from the `a409692b` review: a committed POLYGON chip and a dirty-viewport CTA must not share a row, at both viewports.
4. **Mobile first-vertex finish**, with real touch. Ruled: no Finish control is added; the shape closes by tapping the first vertex, matching the issue's own copy. Record it as an OWNER DECISION row — it is the fiddliest interaction in the feature and the owner should see it working before accepting it.

---

## 3. File map — what PR-2 added, and why

### `apps/web/src/shared/map/DrawControl.tsx`
The **nonce-driven draw seam**: `startDrawNonce` / `cancelDrawNonce` / `undoVertexNonce` in, `onDrawVertexCountChange` / `onDrawModeExit` out. Before it, the plugin's own toolbar button was the only way to begin drawing, so no product-native entry could exist anywhere.

Nonces rather than booleans because *starting a draw is an event*: a boolean cannot express a second press after a cancel, since it never changes value. `0`/undefined means "never asked", so mounting cannot auto-arm the tool.

Also carries the **two polygon styles** from the design kit (`ExpMap.jsx:461-462`): draft is navy dashed at 0.05 fill, committed is copper solid weight 2.4 at 0.10. Production previously used one style for both, so the shopper could not tell a draft from a committed scope — the exact distinction #2419 requires.

### `apps/web/src/features/discover/components/map/DrawModeOverlay.tsx`
Instructions with touch/pointer wording, Cancel, Undo, **and** the blocked-draft surface PR-1 defined but could not mount. **No mock authority for any of its copy** — the kit has no point-placement mode at all (`Experience.jsx:264` fabricates a finished polygon) and FUNCTIONAL_AUDIT M8 records the same gap for the rejection state. Every string is issue-verbatim. Its tests deliberately pin *behaviour*, not sentences, so the wording stays free to change.

### `apps/web/src/features/discover/components/map/ActiveScopeChip.tsx`
Gains **Redraw** and a `measureRef`. Note the mock labels this "Edit boundary" (`transitions-data.js:293`) but never renders it, and its own `drawArea` action is a redraw rather than vertex editing — so Redraw is behaviourally faithful and only the wording differs.

### `apps/web/src/features/discover/state/useSearchThisAreaCtaOffset.ts`
A real **stacking chain**, one rung each: breadcrumb/chips row → scope chip → CTA → draw overlay. `scopeChipRef` is a **callback ref**, not a `RefObject` — see trap 1.

### `apps/web/src/components/discover/panels/AreaSetSelectedExtras.tsx`
`DrawSearchAreaEntry` extracted so both committed-area panel branches render one component. The eligibility call, the reveal-then-arm ordering and the title copy must not drift between copies.

### `apps/web/src/components/discover/panels/AreaSelectedPanel.tsx`
Renders that entry in the **single-area** branch too, behind `!isViewportScope`.

### `apps/api/.../DiscoverSummaryResponse.java` + `DiscoverSummaryService.java`
`polygonSearchAvailable`, an `EXISTS` against the **same** `canonical_boundary_geometry` row `PolygonGeographicSafetyPolicy` reads, so the client's "can I offer this" and the server's "will I accept this" cannot drift. A boolean, not the geometry or status enum: the client's only question is whether a polygon could be accepted at all, and more would invite the frontend to re-derive a policy #2420 owns.

### `context/types.ts`, `DiscoverContext.tsx`, `useDiscoverMapDataController.ts`
`startDrawSearchArea` joins the shell's registered AREA_SET actions — see trap 2.

### `apps/web/src/index.css`
`.discover-hide-leaflet-draw-toolbar` hides `.leaflet-draw` and `.leaflet-draw-tooltip`. The control stays mounted because it owns the handler machinery; only its UI goes.

### Deleted
`MapStatsBar` (component **and** mount). It was a second owner of the committed-POLYGON state, saying "Area search" against the chip's "Drawn area", and its mount gated it on `isAuthenticated` by accident of ownership rather than policy — so anonymous shoppers saw no indicator while signed-in ones saw two. `MarkersTruncationNotice` shares that file only by history and stays.

---

## 4. Traps

**1. The scope chip mounts late.** `useSearchThisAreaCtaOffset`'s layout effect runs once, but the chip mounts on the ordinary AREA_SET → POLYGON transition, *after* it. A container `ResizeObserver` does not help: the chip is absolutely positioned, so mounting it never changes the container's box. Hence the callback ref. **Do not "simplify" it back to a `RefObject`** — that is precisely the bug the `1ac34643` review caught, and it fails on the normal path, not an edge case.

**2. `registerAreaSetCameraActions` stores ONE object.** A second registrant silently replaces the first and the two fight over which actions the panel sees. `startDrawSearchArea` is therefore passed *into* `useDiscoverMapDataController` (the single registrant) from the page-state controller, which the composition already calls first. Anyone adding a shell action later will hit this.

**3. Mobile: reveal the map before arming the draw tool.** Below `lg` the map canvas is not mounted until the shopper opens the Map view, so arming without revealing puts them in draw mode on a surface they cannot see. The test asserts the *order*, not just that both fired.

**4. leaflet-draw's cursor tooltip intercepts clicks.** It follows the pointer and grows as the shape progresses, so by the fourth vertex it can sit over the next click point and absorb it. It is in the hidden set for that reason as much as for its wording. This cost several runs in PR-1 before it was diagnosed.

**5. Finishing depends on the first vertex.** Hiding the plugin chrome also hides its Finish action — same container. That matches the issue's "click the first point to finish" copy, but it makes the closing click pixel-accurate. In PR-1's e2e the reliable recipe was: suppress `pointer-events` on the marker/overlay/tooltip panes, then move → settle → click per vertex, verifying each vertex registered via `.leaflet-editing-icon` before moving on. A **three-vertex triangle** is used deliberately: the fourth click failed on every run, and the app only needs `>= 3` vertices.

**6. Typecheck baseline is 105 on this base, not 0.** `npm run typecheck:baseline` fails with 105 pre-existing fingerprints at `1184a338`. **Measure it by stashing** rather than assuming: `git stash push -u`, run, `git stash pop`. Every fingerprint this PR briefly added was caught that way and fixed.

**7. Two `DiscoverPanelSurface` tests fail and are not this lane's.** `AreaZeroResultRecovery` needs an `AreaSetDraftProvider` in that fixture. Verified identical on clean base — that file belongs to lane-2018. **Already fixed on #2453 at `0c22a3cf`; they disappear on rebase.** Do not chase them.

---

## 5. Evidence conventions

- **Images**: the repo is private, so `raw.githubusercontent` 404s. Embed as `https://github.com/gautirao/udupi-property-explorer/blob/<head-sha>/docs/pr-evidence/issue-2419/pr2/<file>.png?raw=1`, and verify one resolves with `gh api` before trusting the rest.
- **Every e2e arm declares its auth state.** Signed-in arms need `test.use({ storageState: 'e2e/fixtures/user-auth.json' })` *and* the run must pass `PLAYWRIGHT_BASE_URL` so global setup can mint it. Anonymous arms use an explicitly empty storage state **and assert the Sign in control is visible**. Without this the whole suite runs anonymous while claiming otherwise — it did, silently, for several PR-1 heads.
- **Keep the probe-count guard.** Every negative assertion ("nothing was committed") must be preceded by positive proof the flow actually ran — a counted polygon-carrying request. Two separate false greens on this lane were caught only by that guard.
- **Start from the real entry path.** Navigate to a committed area and click the product entry; do not seed a URL where a chip already exists. It is also the only way the non-overlap proof means anything, since the chip must mount *late* for the measured stack to be under test.

### The standing lesson

Three times on this lane a test proved something *adjacent* to its claim: a draw that never completed, a suite silently running anonymous, and a chip measured only when it already existed at setup. Each time the fixture was built around a mental model of the bug rather than the sequence the product performs. Before trusting a new test, ask whether it **starts from the same state the user does** — and confirm it fails against the unfixed code.

---

## 6. Open decisions to carry onto the PR

- **Anonymous treatment = HIDE** (ruled). Keep the one-line reversal note in the body; the owner may flip it.
- **No Finish control** (ruled) — record as an OWNER DECISION row with the mobile first-vertex evidence.
- **Rejection copy and draw-mode copy have no mock authority** — issue-verbatim, labelled MISMATCH.
- **Scope-bar placement** stays split (chip on the map, actions in the panel) where the mock has one panel scope bar. Converging is lane-wide and was deliberately not settled here.
