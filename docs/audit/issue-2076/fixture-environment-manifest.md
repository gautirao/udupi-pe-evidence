# Issue #2076 — Fixture and environment manifest (Stage 1)

Stage-1 deliverable (AC2). Specifies the full deterministic contract the
parity harness must hold today (Stage 1's own `e2e-parity/` skeleton) and
what remains for Stage 2 (the seeded parity fixture) to complete.

## 1. City + navigation-revision identity

- **Target city for the parity programme:** Bangalore. Its multi-level
  hierarchy (~5 Directions, ~323 AREA nodes) is what F1/F2/F3 were
  reproduced against and what the frozen design mock depicts.
- **Navigation revision:** not pinned in Stage 1. A citable, stable revision
  id requires the Stage-2 seed (see `parity-fixture-spec.md`) — pinning one
  against the hosted/shared database would tie Stage-1 evidence to a
  revision that can be regenerated or promoted over independently of this
  branch, which is exactly the drift risk the plan's architecture decision
  (Option 1, synthetic fixture city) exists to avoid.
- **The polarity correction (F6):** the LOCAL fixture
  (`scripts/dev/local-fixture-backend.sh` +
  `scripts/db/fixtures/discover-smoke-seed.sql`) seeds **Udupi only** — 3
  areas (Manipal, Malpe, Kaup), confirmed by the mechanical census
  (`evidence/e2e-census.sh`: 32 hits for "Kaup", 32 for "Malpe", 52 for
  "Manipal", **zero** for "bangalore"/"bengaluru"). It has no Local
  Destination level and no dense visual-cluster set — structurally cannot
  produce A03/A04 or A05/A06/A07. The multi-level Bangalore hierarchy exists
  **only** in the hosted/shared Supabase database. Issue #2076's own text
  states this polarity backwards ("Udupi-targeted tests... incompatible with
  a Bangalore-only local fixture" — inverted; see `discrepancy-register.md`
  F6 for the full correction).

## 2. Canonical hierarchy provenance

The real generator path, in order (per the plan's
`evidence.fixture_environment.real_generator_path`):

```
canonical geography (areas + city_regions + memberships + city_region_policy)
  -> POST /api/admin/city-launch/cities/{cityId}/prepare
  -> NavigationTreeGenerationService / NavigationTreeGenerator (GEOMETRIC_BISECTION)
  -> NavigationTreeValidationService
  -> sandbox_navigation_nodes
  -> POST .../revisions/{revisionId}/launch
  -> navigation_nodes
```

Stage 2's seed must go through this REAL path against a local throwaway
PostGIS, not a fixture-only hierarchy shortcut — per the plan's rejected
alternative "rejected_split_datasets" and the issue's own "no fixture-only
hierarchy shortcut where the real generator and preparation path can be
used." See `parity-fixture-spec.md` for the seed specification itself
(deferred to Stage 2, no SQL authored here).

## 3. Listing / area / school / count data

- **Stage 1:** no fixture rows are seeded by this branch. The parity matrix
  (`parity-matrix.md`) records each state's *required* fixture rows in ROLE
  terms so Stage 2's seed spec can be checked against real consumers before
  it is written.
- **Stage 2 (deferred):** listing inventory mix (sale/rent/lease), school
  rows (needed for A20's count-bearing assertions), and count determinism
  are specified in `parity-fixture-spec.md`.
- **Deterministic sorting:** any list a parity spec asserts an *order*
  against (destination lists, listing lists) must have its sort key proven
  stable in the Stage-2 seed (e.g. no two rows sharing a sort key that
  collapses to implementation-defined tie-breaking). Not yet exercised in
  Stage 1 since no seed exists.

## 4. Anonymous and authenticated scenarios

- `e2e-parity/parity-global-setup.ts` mints `storageState` per configured
  role (`PARITY_BROKER_EMAIL/PASSWORD`, `PARITY_ADMIN_EMAIL/PASSWORD`,
  `PARITY_USER_EMAIL/PASSWORD` — intentionally NOT the same env var names as
  `e2e/global-setup.ts`'s `BROKER_EMAIL`/`ADMIN_EMAIL`/etc., so the two
  harnesses' credentials can be configured independently without collision).
- A role with **no credentials configured** is simply not exercised this
  run (anon-only). A role **with credentials that fails to authenticate**
  is a hard failure — the whole run aborts. See
  `e2e-parity/parity-global-setup.ts`'s module docstring for the full
  rationale; this is the fix for the "EMPTY-STORAGESTATE TRAP" identified in
  the executor handoff (`e2e/global-setup.ts` writes an empty storageState
  on auth failure and continues, which would file an anonymous render as an
  authenticated baseline).
- The anon arm never carries any storageState file — Playwright's default
  (`storageState: undefined`) is used, not an empty-but-present file, to
  keep "no fixture written" and "empty fixture written" visibly distinct in
  the fixtures directory.

## 5. Browser engine + version

- Chromium only, via `devices['Desktop Chrome']` in
  `playwright.parity.config.ts` (matches the existing `playwright.config.ts`
  convention — this harness does not add cross-browser coverage in Stage 1).
- Exact Chromium build version is whatever `@playwright/test`'s pinned
  `package.json` dependency resolves to at install time — not independently
  re-pinned by this harness. A future Stage-2/4 hardening pass could pin it
  explicitly if browser-version drift is observed to perturb baselines; not
  needed until real baselines exist to be perturbed.

## 6. Viewport + deviceScaleFactor

- Desktop: `1366×768`. Mobile: `390×844`. Both required per the issue body.
- `deviceScaleFactor: 1` for both — pinned in `playwright.parity.config.ts`'s
  `use` block. A non-1 device scale factor would change rasterized pixel
  dimensions of any future screenshot baseline for reasons unrelated to the
  actual UI, so it is fixed regardless of what a real device would report.

## 7. Fonts + `document.fonts.ready`

- `e2e-parity/support/determinism.ts::waitForFontsReady()` polls
  `document.fonts.status === 'ready'` before any settled-state assertion
  runs. This closes a determinism gap the plan's Stage-A evidence
  explicitly flagged as absent anywhere in the existing `e2e/` suite ("No
  `document.fonts.ready` wait anywhere in e2e/").

## 8. Locale / timezone / fixed clock

- `locale: 'en-IN'`, `timezoneId: 'Asia/Kolkata'` — pinned in
  `playwright.parity.config.ts`'s `use` block.
- **Fixed clock:** NOT yet implemented in Stage 1. No parity state in the
  current matrix depends on wall-clock-rendered content (no "posted N days
  ago" relative-time state is in the A01–A24 list), so this is recorded as a
  documented gap rather than implemented speculatively — see "Known gaps"
  below. If Stage 2 adds a state that renders relative time, clock pinning
  (e.g. `page.clock.install()`) must be added before that state's baseline
  is captured.

## 9. Disabled animations / transitions / caret

- `e2e-parity/support/determinism.ts::installDeterminismInitScript()` injects
  a `<style>` tag via `page.addInitScript` on every navigation, forcing
  `animation-duration`, `transition-duration` and `scroll-behavior` to
  effectively zero and hiding `caret-color`. Closes another Stage-A-flagged
  gap ("No animation/transition/caret disabling" anywhere in `e2e/`).
- `reducedMotion: 'reduce'` is also set at the Playwright `use`-block level
  as a second, independent layer (some CSS `prefers-reduced-motion` media
  queries respond to this even where the injected override style does not
  apply, e.g. Leaflet's own internal transition classes).

## 10. Deterministic map rendering

- **Marker rendering technology is unverified as of Stage 1** — the plan
  recorded this as risk R5 ("Unverified assumption: whether Discover markers
  are DOM or canvas/WebGL"), and this run did not resolve it (no source
  read of the Leaflet marker-layer internals was performed against a
  rendering-technology question specifically). This decides whether visual
  parity can cover marker *rendering* at all or only marker *geometry*
  (bounding box, count) — carried forward as a Known gap.
- **No live third-party tile variability in committed baselines**: Stage 1
  commits no baselines at all, so this requirement is not yet exercised.
  The open licence/redistribution question for an offline map tile pack is
  recorded, not resolved — see §14.
- Full-map-frame states (A21, A22, A24 per the parity matrix, and any other
  state where the map is the dominant visible content) are **permanently**
  masked for pixel comparison, with numeric assertions (marker count,
  cluster count, camera bounding box) carrying the actual proof weight —
  this is a documented, permanent design choice (GPU/canvas rendering is
  inherently non-reproducible pixel-for-pixel across machines), not a
  temporary block pending more engineering.

## 11. Explicit waits for CameraIntent / map-fit / markers / images / panel data

- `e2e-parity/support/determinism.ts::waitForMapSettled()` combines: no
  visible "Loading..." text, best-effort `networkidle`, and a fixed 1.5s
  settle window for CameraIntent → Leaflet `flyTo`/`fitBounds` animation and
  marker `<img>` decode.
- **Known gap:** this is a fixed-timeout wait, not an event-driven
  quiescence signal. `src/features/discover/state/useDiscoverCameraOrchestration.ts`
  (the plan's identified single CameraIntent owner) does not currently
  expose a test hook (e.g. a `data-camera-settled` attribute or a custom
  DOM event) that a Playwright wait could key off deterministically. Adding
  one is out of scope for Stage 1 (it would be a `src/**` change, forbidden
  by this stage's boundary) and is recorded here as a candidate Stage-2/3
  follow-up if fixed-timeout waits prove flaky in practice.

## 12. Ports and boot order

- **Frontend dev port:** must be `5173`, `5174`, or `3000` — the backend
  only allowlists those for CORS. A dev server on any other port makes the
  app silently look like it has no seeded data (see the CORS section of the
  handoff and the `discover-dev-cors-port-5220-vs-5174` memory of a prior
  identical misdiagnosis).
- **Local fixture boot order** (when running against the local Udupi
  fixture rather than hosted): `scripts/dev/local-fixture-backend.sh` boots
  local PostGIS (port 5434) with Flyway migrations, then the backend on
  port 8085 (`SPRING_FLYWAY_ENABLED=false` on this path — migrations already
  applied by the script), using hosted Supabase for AUTH ONLY. Then the
  frontend dev server on 5173/5174/3000, then Playwright.
- **Hosted-observation boot order** (Stage 1's actual F1/F2/F3 evidence
  path): none — no local process was started; observation was performed by
  remote-controlling a browser against the already-deployed
  `https://udupi-property-explorer.pages.dev`. See
  `discrepancy-register.md`'s guard-satisfaction section for the full
  read-only justification.

## 12a. `PARITY_CITY` requirement (no default)

- Specs must never hardcode a city — `e2e-parity/pilot-a01-city-root.spec.ts`
  reads the city under test from `PARITY_CITY` and derives both the
  navigation URL and the city-wide badge assertion from that one value, so
  the two cannot drift apart.
- **Required, with no default.** The spec throws at module-load time if
  `PARITY_CITY` is unset — it does not fall back to `'bangalore'` or any
  other value. A silent default is how a run ends up testing a different
  city than the operator believes, the same false-provenance failure mode
  called out throughout this manifest (§1, §13).
- Per §1: the local fixture (`scripts/db/fixtures/discover-smoke-seed.sql`)
  seeds **Udupi only** — set `PARITY_CITY=udupi` for local runs. The hosted
  environment has the multi-level **Bangalore** hierarchy — set
  `PARITY_CITY=bangalore` for hosted-observation runs. There is no
  environment where both are simultaneously valid.

## 13. `PLAYWRIGHT_BASE_URL` requirement and the pages.dev default trap

- `playwright.config.ts` (the EXISTING config, untouched by this harness)
  defaults `baseURL` to `https://udupi-property-explorer.pages.dev` when
  `PLAYWRIGHT_BASE_URL` is unset — a spec run without that variable silently
  targets the deployed site with hosted Bangalore data, not whatever local
  environment the operator believed they were testing.
- `playwright.parity.config.ts` does **NOT** replicate that default. It
  throws at config-load time (before any test is scheduled) if
  `PLAYWRIGHT_BASE_URL` is absent. `e2e-parity/parity-global-setup.ts`
  additionally logs the resolved frontend AND backend URLs before any test
  runs, so a wrong-environment run is visible in the very first lines of
  the test log, not discovered after the fact from unexpected results.

## 14. Every mask, with a written per-mask justification

| Mask | Applies to | Justification |
|---|---|---|
| Full map-canvas region | A21, A22, A24, and any state where the map dominates the frame | GPU/canvas rendering (tile compositing, WebGL if markers turn out to be canvas-based per §10's open question) is not reproducible pixel-for-pixel across machines/GPUs. Permanent, not temporary — numeric assertions (marker count, cluster count, camera bbox) substitute for the masked region. |
| Third-party map tile imagery | Any state showing the basemap, even partially | Live tile-provider imagery can change (styling updates, seasonal imagery, provider-side experiments) independent of any code change in this repo. See §10 and §14's open licence question — an offline tile pack is the eventual fix, deferred to Stage 4. |
| Caret / text-cursor blink phase | Any state with a focused text input (search combobox, filter fields) | Blink phase is a non-deterministic animation-frame-timing artifact; `caret-color: transparent` is force-injected by `determinism.ts` rather than merely masked, but is listed here too since a screenshot taken before the injected style attaches would still need this mask as a fallback. |

No other masks are defined in Stage 1 — no baseline exists yet for any
state, so no additional nondeterministic region has been empirically
observed. Stage 2/4 must add a row here (with justification) for any new
mask discovered while capturing real baselines, per the issue's "masking
only for genuinely nondeterministic content, with every mask documented."

## Known gaps (Stage-1-honest list — none of these are silently assumed solved)

1. Fixed clock is not installed (§8) — no current state needs it, but the
   gap is real and will bite the first relative-time state Stage 2 adds.
2. `waitForMapSettled()` is a fixed timeout, not an event-driven quiescence
   signal (§11) — a `src/**` test-hook addition is the real fix, out of
   Stage-1 scope.
3. Marker rendering technology (DOM vs. canvas/WebGL) is unresolved (§10,
   plan risk R5) — decides how much of the visual acceptance contract on
   markers is achievable at all.
4. Offline map tile pack licence/redistribution is an open question, ruled
   DEFERRED TO STAGE 4 by the repo owner (§14) — Stage 1 records the
   requirement only, commits no unverified third-party tile pack.
5. No navigation revision is pinned (§1) — depends on the Stage-2 seed
   existing.
6. `installNoApiMockGuard`/`assertBackendTrafficWasReal`
   (`e2e-parity/support/determinism.ts`) are a spot-check, not a
   route-precedence-proof no-mock detector. Playwright runs multiple
   matching `page.route()` handlers in the order OPPOSITE to their
   registration (last registered runs first), and a handler that calls
   `continue()` or `fulfill()` ends the chain — no earlier-registered
   handler is invoked for that request at all. So a spec that registers its
   own `/api/**` mock AFTER calling `installNoApiMockGuard` can have that
   mock silently `fulfill()` requests before the guard's handler ever runs,
   and the guard's count-based assertion would still pass as long as some
   other request got through for real. This matters because it is the ONE
   mechanism this whole harness relies on to prove a parity spec is
   observing the real backend rather than a stub — a gap here undermines
   every "MATCH" verdict that specs will produce off of it. Stage 2 needs a
   genuinely precedence-proof detector (e.g. asserting on registration
   order/last-registered position, or verifying via `page.on('response')`
   / `page.on('requestfinished')` that a real network round-trip occurred,
   independent of route-handler ordering).
7. `waitForMapSettled()` (§11 above) has no event-driven readiness signal
   for marker-layer attachment, marker `<img>` decode, or panel-data
   population — it is a "Loading..." check plus a best-effort network-idle
   wait plus a fixed ~1.5s sleep, and nothing more. This matters because a
   fixed sleep can either under-wait (flaky failures/false regressions on a
   slow CI run) or over-wait (slower suite, and it still provides no actual
   evidence the map was ready when the assertion or screenshot ran) — a real
   quiescence signal (e.g. a `data-camera-settled` attribute or DOM event
   exposed by `useDiscoverCameraOrchestration.ts`) is needed before Stage 2
   captures baselines that depend on marker state being correct at capture
   time.
8. **(Added 2026-08-04, Amendment-1 methodology gap)** AC16's visual
   comparison was scoped to individual COMPONENTS (headings, badges, cards),
   anchored through the AC13 mock-component-to-shipped-testid mapping. That
   scoping was well motivated, not an oversight: the frozen mock and the
   shipped app share no common DOM attribute to diff against, and each
   renders its own independent Leaflet instance over fixture vs. hosted
   data, so a naive full-page pixel diff would have been unreliable noise.
   But component-scoped comparison is structurally blind to overall
   page-shell composition — pane order/side, split ratio, control-bar
   placement, and anything that is a property of the ARRANGEMENT of
   components rather than of any one component. That blindness bit for
   real: **F10** (`discrepancy-register.md`) records that the frozen
   desktop mock's shell is map-LEFT / panel-RIGHT while the shipped desktop
   app is panel-LEFT / map-RIGHT — inverted, consistently, across all six
   desktop Areas states sampled — and it was found by a human looking at
   two screenshots side by side, not by the 12-cell AC16 audit, which
   walked straight past the single most visually obvious discrepancy
   available. No AC16 gate or specialist was at fault; every comparison did
   exactly what AC16 asked of it. The gap is that component-level
   comparison alone is not a full parity audit: Stage 2 needs a SECOND,
   shell-level comparison pass in addition to (not instead of) the
   component-level one — pane order and side, split ratio/proportions,
   control-bar placement, and overall page structure, i.e. the items
   #2076's own visual acceptance contract lists under "page shell and
   overall proportions" and "desktop map/panel split and panel width".
   Component granularity buys precision at the cost of peripheral vision;
   neither level substitutes for the other.
