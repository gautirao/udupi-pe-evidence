# Issue #2076 — Discrepancy register (F1–F6)

Stage 1 deliverable (D5 / AC6 / AC8). This register reproduces-or-refutes the six
known findings listed in issue #2076, per the repo-owner ruling on PR #2077
(2026-08-03T17:14:36Z) and the STOP CONDITIONS in
`.claude/handoffs/issue-2076/approved-execution-handoff.toml`.

This document does not file child issues, does not freeze a Stage-4 baseline,
and does not claim rent/lease pricing parity. See `README.md` in this folder
for the full Stage-1 scope statement.

## How the hosted-observation guards were satisfied (F1/F2/F3)

Per the repo-owner ruling on PR #2077, read-only observation against the
hosted Bangalore environment (`https://udupi-property-explorer.pages.dev`) is
approved only if guards g1–g6 hold. This run satisfied them as follows:

- **g1 (no Flyway/schema migration)** — satisfied by construction. No backend
  process, Flyway runner, or migration tool was started by this run. All
  observation was performed by remote-controlling a Chrome browser
  (`mcp__claude-in-chrome__*` tools) against the already-deployed public site.
  No `mvn`, no `flyway`, no local backend process was invoked at any point in
  this session.
- **g2 (no admin/prepare/launch/promotion/activation/seed/upload/mutation
  endpoint)** — satisfied by construction. Every action taken was a page
  navigation, a click on an existing UI affordance (breadcrumb, "Tap to
  zoom", area list item, search-box autocomplete result, top-nav link), or
  browser Back/Forward. No form was submitted, no listing was created, no
  admin route (`/broker/*` write actions, `/admin/*`) was invoked. The
  broker-role navigation items visible in the screenshots ("New listing",
  "Broker dashboard") were never clicked.
- **g3 (no direct SQL session with write-capable actions)** — satisfied by
  construction; no database client, SQL console, or Supabase dashboard was
  opened in this run. Only the browser's rendered DOM was read (via
  `read_page` / `get_page_text` / `find`), never a database connection.
- **g4 (no secrets, DB rows, private data, network captures with
  credentials, or hosted-data pixel baselines committed)** — the browser
  session already carried an authenticated broker session (visible as the
  "TE" avatar / notification badge in the screenshots); this session was
  not created by this run and no password or credential was entered by this
  run. No raw network capture was recorded. No PNG in this evidence folder
  is committed as a deterministic Playwright visual-regression baseline —
  each is a one-off dated observation screenshot, named and described as
  such, consistent with the plan's `screenshot-manifest.md` deliverable
  which explicitly defers baseline capture to Stage 4.
- **g5 (record exact URL/state, viewport, steps, result)** — every
  finding below states the exact URL(s) observed (including the `node=`
  hierarchy key), the viewport, and the click/navigation sequence.
- **g6 (current-state evidence only, not a final deterministic baseline)**
  — explicitly labelled below; nothing here is claimed as a Stage-4
  baseline.

**Auth arm actually observed:** the connected browser tab already carried an
authenticated broker session (cookies pre-existing in the browser, not
established by this run — no login form was submitted and no credential was
entered). This is disclosed rather than hidden. Where the plan asks for
"anonymous, preferred," the actual arm exercised was **AUTHENTICATED
(pre-existing session)** for all F1/F2/F3 observations below. This does not
change the F1/F2/F3 verdicts, which are camera/history/badge-copy behaviours
independent of auth state, but it means these are not anonymous-arm
observations and should not be read as such.

**Viewport:** desktop 1366×768 (window resized via `resize_window` before
each city-landing baseline load; some screenshots show a wider captured
canvas due to the tool's own chrome, but the app viewport itself was sized
1366×768 for every trial below).

---

## Risk R11 re-validation (Amendment-1 Step 5, 2026-08-04)

Risk R11 (hosted data may have moved under the #2074 merge, potentially
invalidating F1/F2/F3 as written) was checked at the document level: F1, F2
and F3 below were compared against everything Amendment-1 Step 4 observed
while re-visiting hosted Bangalore extensively (the F7 reproductions, the
F8/F9 comparisons, and the 7-area rent-probe, all captured in
`evidence/issue-2076-amendment1-step4-shipped-captures/`). No browser
re-investigation was performed for this check — it is a consistency read of
already-captured evidence, per this step's scope.

**Result: no contradiction found. F1, F2 and F3 stand as written below.**
Specifically:

- **F2** (city-wide count badge rendered during an area's detail/listing
  state, instead of an area-scoped count) is directly reinforced, not
  contradicted, by Step 4's **F7**: the same "1,737 properties in Bangalore"
  city-wide badge copy was observed again at Kambipura's area-detail state
  under the Rent toggle, showing the same defect is additionally unfiltered
  by `intent`. Same root cause, two independently reproduced angles — this
  strengthens F2's confirmation rather than moving it.
- **F1** (camera does not reset to city bounds on Home breadcrumb / browser
  Back / journey switching) was not independently re-driven in Step 4 (Step
  4's scope was the AC16 mock-vs-shipped comparison and the rent-probe, not
  a re-run of the camera/history repro steps), and nothing Step 4 observed
  (heading text, panel composition, badge copy, rent-inventory emptiness)
  bears on camera-reset behaviour one way or the other. No contradiction is
  possible from evidence that never touched this code path.
- **F3** (guided-vs-searched Back divergence) is likewise untouched by
  Step 4's evidence for the same reason as F1 — Step 4 never drove a
  browser-Back repro.
- The hosted Bangalore listing inventory clearly did move in some respects
  under time/possibly the #2074 merge (Step 4 sampled different areas —
  Kambipura, Whitefield, HSR Layout — for the rent-probe than F1/F2/F3's
  original Kambipura-only repro, and found zero rent listings everywhere),
  but nothing in that movement contradicts F1/F2/F3's specific claims, which
  are about camera/history behaviour and badge-scoping logic, not about
  which listings exist.

---

## F1 — Map camera does not reset to city bounds

Claim: camera does not reset to city bounds when using the Home breadcrumb,
browser Back to root, or journey switching. Reported as **three separate
arm verdicts** per the executor brief; not collapsed into one.

Common setup for all three arms: start at
`https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first`
(full-city baseline — confirmed visually correct: Devanahalli/airport visible
top, NICE Peripheral Ring Road visible bottom-left, all 5 region bubbles
[North 228, West 135, Central 208, East 650, South 516] fully on-screen).
Evidence: `evidence/f1-f2-f3-hosted-observation/00-baseline-city-landing-1366x768.jpg`.
Drill path: click "West Bangalore" → "Tap to zoom" (`node=d%3Aw`) → click
"Kambipura" in the sidebar area list (`node=a%3AIN%7CKA%7CBengaluru%7CKambipura`,
camera zoomed to area level).

### Arm 1 — Home breadcrumb

- Steps: from the Kambipura area-detail state, click the "Home" breadcrumb
  link (`ref_57`, top of the "Home > Bangalore > West Bangalore > Kambipura"
  breadcrumb).
- URL after click: `.../discover?city=bangalore&journey=area-first&node=root`
  (no `lat`/`lon`/`zoom` params — consistent with the established fact that
  node changes delete camera params to force a re-fit).
- EXPECTED: map re-fits to full-city bounds (matching the baseline
  screenshot: Devanahalli visible top, full NICE ring visible bottom, all 5
  region bubbles on-screen).
- OBSERVED: the map remained at a locally-zoomed camera (street-level labels
  "5th Block", "6th Block", "Vinayaka Nagara", "Kumbalgodu", "Tagachaguppe"
  visible — a West-Bangalore/Kengeri-local framing), not the full-city
  bounds. The `node=root` URL param change did not trigger a visible re-fit.
- Evidence: `evidence/f1-f2-f3-hosted-observation/f1-arm1-home-breadcrumb-camera-not-reset.jpg`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)** — reproduced once,
  cleanly, with an unambiguous before/after mismatch against the established
  full-city baseline.

### Arm 2 — Browser Back to root

- Steps (repeated 3× in 3 separate clean tabs per repo policy on
  camera/history observations): from city-root baseline, click "West
  Bangalore" → "Tap to zoom" (`node=d:w`), click "Kambipura"
  (`node=a:...Kambipura`), then press browser Back twice.
- EXPECTED: after the second Back, URL and camera return to the city-root
  baseline (full-city bounds, no `node` param, no stale `lat/lon/zoom`).
- OBSERVED (3 trials, all settled — screenshots taken only after the map
  finished loading, confirmed by a second wait + re-screenshot where the
  first capture caught a mid-transition tile-loading state):
  - Trial 1: settled URL retained `lat=12.88239&lon=77.46194&zoom=14` (the
    Kambipura-level camera) even though the breadcrumb/node param was gone;
    visually a locally-zoomed West-Bangalore/Kengeri framing, not full-city
    bounds.
  - Trial 2: settled URL `lat=12.78293&lon=77.39254&zoom=10` — a
    *different* wrong camera: zoomed out too far and shifted southwest,
    showing Ramanagara/Channapattana/Kunigal (far outside Bangalore's urban
    core) and clipping the North Bangalore region bubble at the top edge.
  - Trial 3: identical settled state to Trial 2
    (`lat=12.78293&lon=77.39254&zoom=10`), same wrong framing.
- All three trials disagree with the full-city baseline, and Trials 1 vs.
  2/3 disagree with *each other* — the post-Back camera state is not only
  wrong but non-deterministic across otherwise-identical repro steps.
- Evidence:
  `evidence/f1-f2-f3-hosted-observation/f1-arm2-trial1-browser-back-settled-wrong.jpg`,
  `.../f1-arm2-trial2-browser-back-settled-wrong.jpg`,
  `.../f1-arm2-trial3-browser-back-settled-wrong.jpg`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)** — reproduced in 3/3
  trials; the exact wrong state varies between trials but is never the
  correct full-city bounds.

### Arm 3 — Journey switching

- Steps: from the Kambipura area-detail state (`node=a:...Kambipura`,
  `zoom=13`), click the top-nav "Schools" link (the only journey-switch
  affordance reachable from an area-detail state — no in-panel journey
  switcher exists on that page; the "Explore by area / Search near a
  school / Find agricultural land" chooser only renders at city-root
  landing). This is a hard navigation to a hardcoded href
  (`/discover?city=bangalore&lat=12.97160&lon=77.59460&zoom=11&journey=school-first`),
  not a client-side camera transition.
- EXPECTED / OBSERVED: camera correctly shows full-city bounds for the
  school-first journey (all school-zone clusters visible, matching the
  city-wide framing).
- Evidence: `evidence/f1-f2-f3-hosted-observation/f1-arm3-journey-switch-camera-correct.jpg`
- **Classification: REFUTED** for the only journey-switch path reachable in
  the shipped product today (top-nav link with a hardcoded destination
  URL). Note for Stage 2: this arm does not exercise the same
  camera-continuity code path as Arms 1–2 (it never carries forward a
  stale `lat/lon/zoom`), so it is a weak refutation — it shows the
  *hardcoded-href* path is fine, not that an in-app stateful journey
  switcher (if one exists elsewhere, e.g. mobile) is fine. No such
  in-panel switcher was found reachable from the area-detail state in this
  session.

---

## F2 — Map count badge shows city-wide total during an area's detail/listing state

- Steps: from city-root baseline, click "West Bangalore" → "Tap to zoom"
  (`node=d:w`) → click "Kambipura" in the sidebar area list. Reproduced
  independently 3 times across the session (via guided sidebar click, via
  direct URL to the same node, and via search-box selection) — badge text
  was identical every time.
- URL: `.../discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura`
- Page state: "Properties in Kambipura", "9 verified properties for sale in
  Kambipura" (area-specific count, correct).
- Map badge (bottom-right of map panel) text, read from the DOM
  (`read_page`, `generic "1,737 properties in Bangalore" [ref_52]` /
  `[ref_53]`, i.e. **two DOM nodes both carrying this text simultaneously**
  — consistent with the plan's static lead that `data-testid="discover-badge"`
  covers two different pills): **"1,737 properties in Bangalore"** — the
  city-wide total, not the 9-listing Kambipura count.
- Disambiguation per the plan's F2 lead: copy text is exactly the
  documented city-wide-pill signature ("... properties across {City}" /
  here rendered as "N properties in {City}" — the same city-wide pill),
  confirming this is the city-wide branch rendering, not a
  correctly-scoped area pill with a wrong number.
- EXPECTED: badge should read the area-scoped count (9) or otherwise make
  clear it is showing Kambipura's count, not Bangalore's.
- OBSERVED: city-wide count shown while viewing a single area's detail
  page.
- Evidence: `evidence/f1-f2-f3-hosted-observation/f2-01-kambipura-area-detail-city-badge.jpg`,
  `evidence/f1-f2-f3-hosted-observation/f2-02-badge-zoom-crop.png`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)** — reproduced
  cleanly and repeatedly; matches the plan's static-lead prediction exactly.

---

## F3 — Camera/history sync after Back differs: guided vs. searched selection

Two scenarios tested separately, as required.

### Scenario A — Guided-selection Back

- Steps: city-root → click "West Bangalore" "Tap to zoom" (`node=d:w`) →
  click "Kambipura" in the sidebar list (`node=a:...Kambipura`) → browser
  Back ×2.
- History depth to root: **2** intermediate node states
  (`d:w` → `a:...Kambipura`), i.e. 2 Back presses needed to reach root.
- Settled result (see F1 Arm 2 above, same repro): non-deterministic across
  trials — either a stale area-level `lat/lon/zoom` or a different
  zoomed-out/off-center camera, but never the full-city baseline.
- Evidence: `evidence/f1-f2-f3-hosted-observation/f3-guided-selection-back-intermediate-node-dw.jpg`
  (intermediate `node=d:w` state reached after the first Back press) plus
  the three F1-Arm-2 trial screenshots for the final settled state.

### Scenario B — Searched-selection Back

- Steps: city-root → click the "Search areas to explore" combobox → type
  "Kambipura" → select the "Kambipura" autocomplete suggestion (directly
  reaching `node=a%3AIN%7CKA%7CBengaluru%7CKambipura` — **no intermediate
  `node=d:w` step**, since search resolves straight to the leaf area) →
  browser Back ×1.
- History depth to root: **1** — the searched path never visits the
  intermediate `d:w` direction-node state that the guided path does. This
  is itself a structural difference between the two selection paths (guided
  selection always passes through a direction/cluster node; search jumps
  straight to the leaf node), independent of the camera bug.
- Settled result after 1 Back press: URL
  `.../discover?city=bangalore&journey=area-first&lat=12.88235&lon=77.46195&zoom=14`
  — the pre-Back Kambipura-level camera (`zoom=14`) is retained; visually a
  locally-zoomed West-Bangalore/Kengeri framing, not the full-city baseline
  (matches the "stale camera" failure mode seen in F1 Arm 1 / Arm 2 Trial
  1, not the "wrong zoomed-out" mode seen in Arm 2 Trials 2–3).
- Evidence: `evidence/f1-f2-f3-hosted-observation/f3-searched-selection-back-settled-wrong.jpg`
- **Comparison / verdict:** both the guided-selection Back (2 presses) and
  the searched-selection Back (1 press) fail to reset the camera to
  city-wide bounds, but they differ in (a) how many Back presses are
  needed to reach root at all, because the search path skips the
  intermediate direction-node, and (b) which wrong camera state they
  settle into (guided: non-deterministic between a stale-zoom state and a
  different zoomed-out/off-center state across trials; searched: a
  consistent stale-zoom state in the one trial run). This is consistent
  with F3's claim that the two paths' camera/history synchronization
  genuinely differs, not just "both are broken the same way."
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)** for both scenarios
  individually, and CONFIRMED that the two scenarios diverge from each
  other in mechanism (history depth + settled-state shape), not only in
  both being broken relative to the city baseline.

---

## F4 — Rental listings omit monthly pricing until PR #2074 lands

- PR #2074 (issue #2051) was **not merged as of this original Stage-1 run**
  (status has since changed — see the dated UPDATE below). Per the
  handoff's `[stop_conditions].pricing_dependency`, this run relied only on
  the approved contract text (authenticated → `monthlyRentRupees`, exact
  rupees; anonymous → `monthlyRentBand`, bands ₹0–10K / ₹10–20K / ₹20–35K /
  ₹35–50K / ₹50K+; applies to rent and lease; sale unchanged) and did not
  cherry-pick, freeze, or verify against #2074's draft code.
- No live rent/lease pricing observation was attempted against the hosted
  site for this finding (out of scope for this run per the stop
  condition, and not needed at the time — the classification followed
  directly from "PR not merged").
- **Original Stage-1 classification (superseded, preserved for history):
  BLOCKED_PENDING_2074_FINAL_HEAD** — this was expected pre-#2074 behaviour,
  not a defect to remediate in this issue.

**UPDATE (Amendment-1 Step 5, 2026-08-04) — Classification:
ENVIRONMENT_BLOCKED_2074_RENDER.** PR #2074 has since **merged** at
`bbef09b274b02f23f59426b7fa4b009fcde38977`. This F4 write-up above was never
re-run against the merged implementation — its bullets describe the
pre-merge state and are preserved as history, not silently updated.
Separately, Amendment-1 Step 4's rent-probe (see the "#2074 rent-probe
findings" section below) sampled 7 hosted Bangalore areas across 3 of
Bangalore's 5 macro-regions under the Rent toggle and found **zero rent
inventory** in all 7 — the merged contract's rendered pricing
(`monthlyRentRupees` / `monthlyRentBand`) could not be observed rendering at
all in this run. This is an environment/inventory gap, not a verified
render and not a verified defect either. The merged backend contract tests
(`CityAreaListingsControllerTest` / `CityAreaListingsIT` / etc.) prove the
CONTRACT exists; they are never cited here as evidence the RENDER is
correct — that distinction is deliberate and must not collapse. Re-run this
check once a hosted area with real rent/lease inventory is found, or a
Stage-2 fixture seeds one.

---

## F5 — Existing screenshot-capture specs provide no assertion-backed visual-regression protection

Two sub-verdicts, reported separately per the executor brief (not
collapsed).

Mechanical census re-run on this branch (script + full output committed —
see `evidence/e2e-census.sh` and `evidence/e2e-census-output.txt`):

```
command: bash docs/audit/issue-2076/evidence/e2e-census.sh
exit_code: 0
git_head: e28ba570dbbf4dda6ec7bd20675b39a7f8dd2d53 (branch issue-2076-parity-planning)
total_specs (e2e/**/*.spec.ts): 146
zero_expect_spec_count (whole e2e/ suite): 0
tohavescreenshot_spec_count: 0
snapshot_baseline_dir_count (*-snapshots/, excluding node_modules): 0
capture-bangalore-1745-evidence.spec.ts: expect_count=31
capture-discover-agri-first-polish-1771.spec.ts: expect_count=30
capture-discover-city-landing-polish.spec.ts: expect_count=23
capture-school-first-polish-1770.spec.ts: expect_count=52
```

These numbers exactly match the orchestrator's prior mechanical census
(146 total specs; 0 zero-expect specs; the same 4 capture-* files with the
same 4 expect() counts; 0 toHaveScreenshot; 0 committed snapshot baseline
directories) — reproduced independently on this branch base.

### F5(a) — "capture-* specs are assertion-free"

- Claim (as stated in the issue and repeated in
  `docs/new-discover-v2/04-testing-quality-gates.md` §3): the capture-*
  spec family contains "zero expect() calls."
- OBSERVED: all 4 capture-*.spec.ts files contain `expect()` calls (31,
  30, 23, and 52 respectively — 136 total). None has zero.
- **Classification: REFUTED** — this specific claim is mechanically false
  on this base. `docs/new-discover-v2/04-testing-quality-gates.md` is
  listed in the plan's `allowed_file_globs` for a later Stage-1 specialist
  to correct; this register does not edit that file, only records the
  correction.

### F5(b) — "no assertion-backed visual-regression protection exists"

- Claim: the repo has no assertion-backed *visual-regression* protection
  (as distinct from functional/DOM assertions).
- OBSERVED: 0 of 146 e2e specs use Playwright's `toHaveScreenshot`
  visual-comparison assertion; 0 committed `*-snapshots/` baseline
  directories exist anywhere in the repo (excluding `node_modules`). The
  capture-* specs' 136 `expect()` calls are functional/DOM assertions
  (element visibility, text content, counts, etc.), not pixel-diff visual
  assertions — having `expect()` calls does not contradict "no visual-
  regression protection."
- **Classification: CONFIRMED** — no visual-regression harness exists in
  this repo today. This is the gap the Stage-1
  `playwright.parity.config.ts` / `e2e-parity/` skeleton being authored
  elsewhere in this same PR is intended to eventually fill (Stage 2+, not
  this register).

F5(a) and F5(b) are not in tension: the capture-* specs are functionally
assertion-rich (refuting the "zero expect()" claim) while simultaneously
providing zero pixel-level visual-regression coverage (confirming the
"no visual-regression protection" claim) — they are different kinds of
assertion entirely.

---

## F6 — Existing Udupi-targeted tests may be structurally incompatible with a Bangalore-only local fixture

- The issue text states this polarity backwards. Established fact
  (verified again by this run's census, `evidence/e2e-census.sh` /
  `evidence/e2e-census-output.txt`, "local fixture seed file city
  coverage" section): `scripts/db/fixtures/discover-smoke-seed.sql`
  contains only Udupi-area names — 32 hits for "Kaup", 32 for "Malpe", 15
  for lowercase "manipal", 52 for "Manipal" — and **zero** hits for
  "bangalore" or "bengaluru". The local fixture backend
  (`scripts/dev/local-fixture-backend.sh` + this seed file) is
  **Udupi-only** (Manipal/Malpe/Kaup), not Bangalore-only.
- The multi-level Bangalore hierarchy (the region → area → listing
  structure exercised in F1/F2/F3 above, e.g. `d:w` → `a:...Kambipura`)
  exists only in the hosted Supabase DB, not in the local fixture.
- Census signal on e2e/ itself: 132 of 146 spec files reference
  Udupi-area terms (udupi/manipal/malpe/kaup) and 35 reference
  Bangalore/Bengaluru terms (many files reference both, since several
  specs parametrize by city or use Bangalore only for specific
  Discover-V2 states not covered by the Udupi fixture — see the full file
  lists in `evidence/e2e-census-output.txt`).
- Practical implication: any Bangalore-only-authored spec (e.g. a future
  `e2e-parity/*` spec built against the hosted-observed states in this
  register) **cannot** run against `local-fixture-backend.sh` as-is,
  because that fixture never seeds Bangalore's region/area hierarchy —
  it would need either a Bangalore-shaped fixture seed or to run against
  a differently-seeded environment. Conversely, any *existing* Udupi-only
  spec is compatible with the current local fixture; the incompatibility
  runs the other direction from how #2076 describes it.
- **Classification: CONFIRMED, with the polarity correction recorded** —
  the underlying structural-incompatibility risk between "tests written
  against one city's hierarchy" and "a fixture seeded for a different
  city" is real and reproducible from the fixture file's contents, but
  the issue's framing of *which* tests are at risk ("Udupi-targeted tests
  ... incompatible with a Bangalore-only local fixture") is inverted: the
  local fixture is Udupi-only, so it is *Bangalore*-targeted tests/specs
  that are incompatible with it, not the other way around.

---

## Summary table

| Finding | Sub-item | Classification |
|---|---|---|
| F1 | Arm 1 — Home breadcrumb | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F1 | Arm 2 — Browser Back to root | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F1 | Arm 3 — Journey switching (top-nav path) | REFUTED (weak — only path reachable; see note) |
| F2 | City badge during area detail | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F3 | Scenario A — guided-selection Back | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F3 | Scenario B — searched-selection Back | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F3 | Cross-scenario divergence | CONFIRMED (different mechanism, not just "both broken") |
| F4 | Rent/lease monthly pricing | ENVIRONMENT_BLOCKED_2074_RENDER (dependency merged @bbef09b2; Stage 1 not re-verified against merged head; rendered pricing unobservable — 7 areas sampled, zero rent inventory; see "#2074 rent-probe findings" below) |
| F5 | (a) capture-* specs assertion-free | REFUTED |
| F5 | (b) no visual-regression protection | CONFIRMED |
| F6 | Udupi/Bangalore fixture polarity | CONFIRMED (issue's polarity is backwards) |
| F7 | Region/area count badges unfiltered by intent (Buy vs Rent) | MUST_HAVE_FUNCTIONAL (CONFIRMED) |
| F8 | City-root heading pattern diverges from frozen mock | MUST_HAVE_VISUAL (CONFIRMED) |
| F9 | Direction-level panel never renders a Local-Destination cluster list | MUST_HAVE_FUNCTIONAL (CONFIRMED, with caveat) |
| F10 | Shell shows map-LEFT/panel-RIGHT in the mock vs. panel-LEFT/map-RIGHT shipped | MUST_HAVE_VISUAL (CONFIRMED, desktop-only) |
| F11 | "Panel doesn't follow map selection" (region-card + map-marker click) | REFUTED as stated; a related but different map-cluster-click defect (heading text drop) CONFIRMED separately |
| F12 | In-panel journey-switcher (Areas/Schools/Agricultural card block) absent for the canonical Areas journey (`journey=area-first`) at every sampled state — `DiscoverRightPanelContainer` routes that journey to a sibling panel that never mounts it | MUST_HAVE_VISUAL (CONFIRMED, desktop, DOM-verified) |
| F13 | Section eyebrow labels, divider rules and per-item descriptive taglines are systematically omitted from the shipped panel | MUST_HAVE_VISUAL (CONFIRMED, desktop, pattern across 3 states) |
| F14 | Top-tier (Direction) destination list is a single-column row-list in the mock vs. a 2-column card grid in shipped | MINOR_POLISH (CONFIRMED, desktop, A01 only — AREA-tier below already converges to grid on both sides) |
| F15 | Shipped heading typography is substantially larger/heavier than the mock's across every sampled state | MINOR_POLISH (CONFIRMED, desktop, distinct from F8's text-content finding) |
| F16 | Within-area panel element order and school-shortcut CTA prominence diverge from the mock | MUST_HAVE_VISUAL (CONFIRMED, desktop, pattern across A08/A12) |
| F17 | Card border/elevation treatment: shipped uses a visible 1px border + hover fill, mock uses a borderless/shadow-based card | MINOR_POLISH (CONFIRMED, desktop) |

---

## F7 — Region/area listing-count badges are unfiltered by intent (Buy vs. Rent)

Amendment-1 AC19 candidate, carried forward from the amendment's feasibility check and
deliberately reproduced (not left as an aside) per the amendment's explicit instruction. Same
defect family as F2 (a count-scope bug), but a different scope axis: F2 is about area-vs-city
scope; F7 is about intent (Buy/Rent) filtering.

**Auth arm:** authenticated (pre-existing session), same disclosure as F1-F3. **Viewport:**
desktop 1366×768.

### Reproduction 1 — Direction level (West Bangalore)

- Steps: navigate to `.../discover?city=bangalore&journey=area-first&node=d%3Aw` (West Bangalore
  Direction, Buy selected) → click the "Rent" toggle in the "Looking to" control.
- URL before: `...&node=d%3Aw` (intent defaults to buy). URL after:
  `...&node=d%3Aw&intent=rent`.
- EXPECTED: area/listing counts in the sidebar list (both the Direction-level header "34 areas
  with matches / 135 listings" and each individual area row's own count, e.g. "2 listings",
  "1 listing") should reflect RENTAL inventory once Rent is selected, or the UI should otherwise
  make clear the counts are still Buy-scoped.
- OBSERVED: every count is **byte-identical** between the Buy and Rent screenshots — "34 areas
  with matches / 135 listings" unchanged, and every individual area row's listing count (checked
  against the full visible list) unchanged. No visual indication anywhere that these counts remain
  sale-only.
- Evidence: `evidence/issue-2076-amendment1-step4-shipped-captures/F7-region-buy-west-bangalore.jpg`,
  `evidence/issue-2076-amendment1-step4-shipped-captures/F7-region-rent-west-bangalore-identical-counts.jpg`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)**.

### Reproduction 2 — Area level (Kambipura), combined with the empty-inventory result

- Steps: navigate to
  `.../discover?city=bangalore&journey=area-first&node=a%3AIN%7CKA%7CBengaluru%7CKambipura` (Buy)
  → click "Rent" → scroll to the listing panel.
- URL after: `...&node=a%3A...Kambipura&intent=rent`.
- EXPECTED: if Kambipura genuinely has zero rent listings, the map badge should either read a
  scoped "0 rentals in Kambipura" or otherwise avoid implying city-wide inventory is relevant to
  this state.
- OBSERVED: the listing panel correctly shows "No listings here yet" (a genuine empty state, not
  a bug in itself — see the #2074 rent-probe section below). Simultaneously, the map badge
  (bottom-right of the map panel) reads **"1,737 properties in Bangalore"** — the exact same
  city-wide total shown at Buy, on the city root, and everywhere else in this run. The badge
  provides no scoping to Kambipura, to the Rent intent, or to the fact that the visible panel is
  showing zero results.
- Evidence:
  `evidence/issue-2076-amendment1-step4-shipped-captures/F7-A09-desktop-rent-empty-badge-unfiltered-kambipura.jpg`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED)** — this is the same underlying defect as F2
  (the map badge's city-wide branch renders regardless of scope), now shown to be additionally
  unfiltered by `intent`, not just unscoped by area. A single root-cause fix in the badge's count
  source may resolve both F2 and F7 together; recorded separately here because they were
  independently reproduced and the amendment explicitly required F7 to carry its own register
  entry.

---

## F8 — City-root heading pattern diverges from the frozen mock

Surfaced during Amendment-1 Step 4's AC16 comparison (parity-matrix.md row 1). Not one of the
issue's original 6 known findings; a new comparison-driven finding.

- Frozen reference: mock state `areas-city-default`
  (`docs/audit/issue-2076/mock-audit/index.md`), heading text verified live as **"Where do you
  want to explore?"** — an invitational question.
- Steps: navigate to `.../discover?city=bangalore&journey=area-first` (desktop, authenticated
  arm) and separately via `mobile-capture-script.mjs` (mobile 390×844, anonymous arm).
- URL: `https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first`
  (both viewports).
- EXPECTED (per the frozen mock composition): the primary city-root heading reads as an
  invitational question, "Where do you want to explore?".
- OBSERVED: the shipped page's primary heading is **"Bangalore" / "1737 listings"** — a
  location-plus-count statement. Confirmed via `get_page_text` full-page text extraction (no
  occurrence of "Where do you want to explore" anywhere on the rendered page) as well as visually
  in both desktop and mobile screenshots. This is a TEXT-FORM difference (comparable per AC16's
  explicit rule that copy/typography pattern is comparable, count VALUES are not) — it is not an
  artefact of live vs. fixture data.
- Evidence: `evidence/issue-2076-amendment1-step4-shipped-captures/A01-desktop-city-default.jpg`,
  `evidence/issue-2076-amendment1-step4-shipped-captures/A01-mobile-city-default.png`
- **Classification: MUST_HAVE_VISUAL (CONFIRMED)** at both viewports — reproduced identically at
  desktop and mobile, so this is a single finding with two viewport instances, not two findings.
  Judgment call: classified VISUAL rather than FUNCTIONAL because the page is fully navigable and
  functional either way; the divergence is in tone/composition of the entry-point heading, not in
  behavior.

---

## F9 — Shipped Direction-level panel never renders a Local-Destination cluster-selection list

Surfaced during Amendment-1 Step 4's AC16 comparison (parity-matrix.md row 3). Not one of the
issue's original 6 known findings; a new comparison-driven finding.

- Frozen reference: mock state `areas-region-clusters`
  (`docs/audit/issue-2076/mock-audit/index.md`), heading verified live as "Inside North
  Bangalore", with the panel populated by **cluster cards** (e.g. "Devanahalli & Doddaballapur",
  "Hennur & Kalyan Nagar") that the user selects to drill into a Local Destination — a
  compositionally distinct state from `areas-region-areas` (which lists individual AREA cards
  directly).
- Steps (sample 1): navigate to
  `.../discover?city=bangalore&journey=area-first&node=d%3Aw` (West Bangalore Direction, Buy,
  desktop, authenticated arm).
- Steps (sample 2): navigate to
  `.../discover?city=bangalore&journey=area-first&node=d%3An` (North Bangalore Direction, same
  arm).
- URLs: `.../discover?city=bangalore&journey=area-first&node=d%3Aw` and
  `.../discover?city=bangalore&journey=area-first&node=d%3An`.
- EXPECTED (per the frozen mock): at least one Direction should render the cluster-selection
  panel composition matching `areas-region-clusters`, distinct from the direct-area-list
  composition (`areas-region-areas`) already confirmed present (F-none, this is a MATCH — see
  parity-matrix row 2).
- OBSERVED: both sampled Directions render the identical composition — a heading plus individual
  AREA cards (West: "Annapurneshwari Nagar", "Badamanavarathekaval", ...; North: "Abbigere",
  "Agrahara Layout", ...). Neither panel ever shows cluster-selection cards. The map DOES show
  cluster bubbles at this zoom level (e.g. "Yelahanka +55 areas within, Tap to zoom" for North),
  but clicking a cluster bubble's "Tap to zoom" only re-zooms the Leaflet camera further into that
  cluster's geographic area — the `node=` URL parameter and the sidebar panel content do not
  change; repeated clicks on successively-appearing bubbles produce only further camera zoom, not
  a change to `d:n`'s panel-level composition. This was tested interactively (multiple click
  attempts on the Yelahanka bubble, and its sub-bubbles after zooming) and is described in more
  detail in `state-mapping.md`'s live-probing notes for this step.
- Evidence:
  `evidence/issue-2076-amendment1-step4-shipped-captures/A02-A04-desktop-west-region-areas.jpg`,
  `evidence/issue-2076-amendment1-step4-shipped-captures/A03-A05-desktop-north-direction-flat-area-list.jpg`
- **Classification: MUST_HAVE_FUNCTIONAL (CONFIRMED), with an explicit caveat**: only 2 of
  Bangalore's 5 Directions (Central, North, East, South, West — per the A01 city-root capture's "5
  region cards present" observation) were sampled — **West and North** (see "Steps (sample 1)" /
  "Steps (sample 2)" above and their evidence). South, Central, and East were not individually
  re-checked this step.

  **CORRECTION (Amendment-1, 2026-08-04):** this caveat previously read "only 2 of 5 Directions
  were sampled (West, South, Central, East were not individually re-checked this step beyond
  South's earlier A02 confirmation)." That was wrong two ways: it named **West** as unsampled even
  though West is one of the two Directions this very finding samples (`A02-A04-desktop-west-region-areas.jpg`,
  cited above), and it listed four unsampled Directions against a "2 of 5 sampled" premise, which
  arithmetically leaves only three unsampled, not four. There was also no "South" A02 capture —
  `A02-A04-desktop-west-region-areas.jpg` is the West-region capture. Corrected to name the two
  Directions actually sampled (West, North) and the three actually not (South, Central, East),
  matching `parity-matrix.md` row 3 and `README.md`'s Step 4 summary, which already stated this
  correctly.

  It is possible a different, not-yet-sampled Direction (South, Central, or East)
  does render a cluster-selection panel and North/West are simply Directions whose hierarchy
  happens to flatten straight to areas. However, since North's map bubble ("Yelahanka +55 areas
  within") explicitly signals an intermediate cluster boundary exists geographically, and the
  panel still shows a flat area list rather than surfacing that cluster as a navigable panel item,
  the more likely read is that the shipped panel-side hierarchy structurally never surfaces a
  Local-Destination tier as its own selectable list — it only ever shows City → Direction → Area,
  using the map (not the panel) to represent any finer geographic clustering. This is architecture
  divergence from the mock's explicit 4-tier design (which the mock treats as different enough to
  warrant its own manifest state), not a rendering bug in a single component — classified
  FUNCTIONAL because it changes how a user can browse the hierarchy (no click path from a
  cluster's map bubble reaches a cluster-scoped panel list), not merely how it looks.

---

## F10 — Shell layout is mirrored: mock is map-LEFT/panel-RIGHT, shipped is panel-LEFT/map-RIGHT

Candidate finding from a fresh amendment step (not one of F1-F9). Verified against the mock
capture set (`mock-audit/captures/`) and both the existing Amendment-1 Step 4 shipped captures and
fresh live captures taken for this step, per the instruction not to accept this on the strength of
two screenshots alone.

### a. Mock arrangement (confirmed from source captures)

- `mock-audit/captures/areas-city-default.png` (state `areas-city-default`, the frozen city-root
  reference cited by F8): the Leaflet map occupies the LEFT ~52% of the viewport (visible
  "Thanisandra · Hennur", "Malleshwaram · Rajajinagar", "Whitefield · Marathahalli" region-cluster
  pins, zoom controls bottom-right of the map pane); the "DISCOVER BANGALORE / Where do you want to
  explore?" panel with the directional-region list occupies the RIGHT ~48%.
- `mock-audit/captures/areas-region-areas.png` and `areas-region-clusters.png` (not individually
  re-opened this step beyond the city-default state, but the manifest's consistent two-pane
  1366x768 desktop layout convention, and F8/F9's own citations of these same captures, give no
  indication the map/panel sides ever swap between mock states) — treated as consistent with the
  city-default arrangement based on the existing register's own prior citations, not re-verified
  pixel-by-pixel this step.
- **Mock: map LEFT, panel RIGHT.**

### b. Shipped arrangement (confirmed across four desktop Areas states, existing + fresh captures)

| Shipped state | Evidence | Map side | Panel side |
|---|---|---|---|
| City root (A01) | `evidence/issue-2076-amendment1-step4-shipped-captures/A01-desktop-city-default.jpg`; re-confirmed live this step, `evidence/f10-f11-verification-2026-08-04/f11-01-city-root-desktop.jpg` | RIGHT | LEFT |
| West Bangalore region-areas (A02/A04) | `evidence/issue-2076-amendment1-step4-shipped-captures/A02-A04-desktop-west-region-areas.jpg` | RIGHT | LEFT |
| North Bangalore direction (A03/A05) | `evidence/issue-2076-amendment1-step4-shipped-captures/A03-A05-desktop-north-direction-flat-area-list.jpg` | RIGHT | LEFT |
| Kambipura area-detail (A08/A20) | `evidence/issue-2076-amendment1-step4-shipped-captures/A08-A20-desktop-area-listings-kambipura.jpg` | RIGHT | LEFT |
| East Bangalore region (fresh, this step) | `evidence/f10-f11-verification-2026-08-04/f11-02-east-region-card-click-panel-updated.jpg` | RIGHT | LEFT |
| South Bangalore region (fresh, this step) | `evidence/f10-f11-verification-2026-08-04/f11-04-south-region-card-click-panel-updated.jpg` | RIGHT | LEFT |

Six independently-sampled desktop Areas states — city root, two Direction-level states, one
Area-detail state, and two additional Direction-level states captured fresh for this step — all
show the identical panel-LEFT/map-RIGHT arrangement. **The inversion is consistent, not
intermittent, across every desktop Areas state sampled.**

### c. Mobile — explicitly checked separately, finding does NOT apply

- `mock-audit/captures/areas-city-default-mobile.png`: stacked layout — map fills the top ~35% of
  the viewport (no side-by-side panel), the "Bangalore" chip and "223 properties" pill overlay the
  map, and the "Looking for" / directional-region panel content is stacked BELOW the map, full
  width.
- `evidence/issue-2076-amendment1-step4-shipped-captures/A01-mobile-city-default.png` and
  `A08-A21-A23-mobile-area-listings.png`: also stacked — a map-mode toggle button (circular map
  icon, top-right of the search bar) is present instead of a persistent side-by-side map pane;
  panel content (search bar, Buy/Rent toggle, breadcrumb, area cards / filters) occupies the full
  width, stacked vertically.
- Both mock and shipped mobile captures use the same stacked (not side-by-side) composition. There
  is no "left" or "right" pane at 390x844 in either the mock or the shipped product — the concept
  of a left/right inversion is **not applicable** at mobile viewport.
- **Determination: this is a desktop-only finding.** Asserting it citywide/both-viewport would
  repeat the F9 sampling error already corrected in this register (see F9's caveat-correction
  above). No mobile mirroring claim is made or implied.

### d. Classification

- **MUST_HAVE_VISUAL (CONFIRMED), desktop-only.** The mock's map-LEFT/panel-RIGHT composition is
  fully inverted to panel-LEFT/map-RIGHT in every one of six independently sampled shipped desktop
  Areas states, with no exception found. This is a structural/compositional divergence, not
  content-level (all text, counts, and interactive affordances are otherwise consistent with their
  respective states per F1-F9's existing findings) — classified VISUAL per the same convention F8
  used for a tone/composition divergence that does not block navigation or function.
- **Severity note (asked for explicitly):** this is arguably more consequential than F8's
  heading-text divergence. F8 is a single string on one state; F10 affects the reading order and
  primary visual hierarchy of every desktop Areas state a user encounters, and reverses the mock's
  explicit "map as primary spatial anchor on the dominant (left, in LTR reading order) side"
  intent described in the mock's own "EXPLORE BY DIRECTION" callout copy ("Each region sits in its
  true direction from the city... tap one, or a card on the right, to zoom in" — the mock's own
  text describes the map as the primary object and the cards as secondary/"on the right"; the
  shipped copy has no equivalent callout, but the shipped DOM order and visual weighting put the
  panel first). This is a judgment call, not a mechanical severity score — recorded as the
  evaluator's honest read of the evidence, not asserted as an objective ranking against F1-F9's
  functional bugs.

---

## F11 — "Panel does not follow map selection" (region-card + map-marker click) — REFUTED as stated; a narrower map-cluster-click defect found instead

Candidate finding from the same amendment step. Reported steps: land on Discover city root → click
a directional region card in the panel (e.g. East Bangalore) → map zooms correctly but the panel
allegedly stays on the city-root list → clicking a map marker directly allegedly clears/empties the
panel. Reproduced precisely, twice (two different regions), against hosted Bangalore.

**Auth arm:** authenticated (pre-existing session), same disclosure as F1-F10. **Viewport:** desktop
1366x768.

### Reproduction 1 — East Bangalore

1. Land on `.../discover?city=bangalore&journey=area-first` (city root). Screenshot:
   `evidence/f10-f11-verification-2026-08-04/f11-01-city-root-desktop.jpg`.
2. Click the "East Bangalore" region card in the LEFT panel (see F10 — panel is on the left in the
   shipped shell, not the right as the report's "RIGHT panel" phrasing assumed; the report's
   left/right framing itself reflects the F10 inversion, not a second bug). URL after:
   `.../discover?city=bangalore&journey=area-first&node=d%3Ae&lat=13.07741&lon=77.78103&zoom=10`.
3. Observed (i) MAP: zoomed/re-centered correctly to East Bangalore's cluster-bubble view — YES,
   correct. (ii) PANEL: updated to "East Bangalore / 81 areas with matches / 650 listings" with
   East Bangalore's own area-card list (Aavalahalli, Amani Byrathikhane, Anagalapura, Balagere,
   ...) — **the panel DID update**, contradicting the reported "stays on the city-root region
   list." Screenshot:
   `evidence/f10-f11-verification-2026-08-04/f11-02-east-region-card-click-panel-updated.jpg`.
4. Clicked a cluster-bubble map marker directly ("Whitefield ... +73 areas within, Tap to zoom").
   URL after: unchanged `node=d%3Ae`, only `lat/lon/zoom` changed (`...&lat=12.99846&lon=77.73241&zoom=11`).
5. Observed the panel: **not empty**. It still lists East Bangalore-scoped area cards (Aavalahalli,
   Amani Byrathikhane, Anagalapura, Balagere, Battarahalli, ...), but two things changed: (a) the
   "areas with matches" count dropped from 81 to 75 (the count appears to re-derive from the
   current map viewport bounds rather than staying pinned to the East Bangalore node's fixed
   count), and (b) the "East Bangalore" heading line and the "650 listings" subtitle line
   **disappeared entirely** from the panel, leaving only the bare "75 areas with matches" line
   above the area cards. Screenshot:
   `evidence/f10-f11-verification-2026-08-04/f11-03-east-map-cluster-click-heading-dropped-not-empty.jpg`.

### Reproduction 2 — South Bangalore (independent second sample)

1. Fresh navigation to city root, clicked "South Bangalore" region card. URL after:
   `.../discover?city=bangalore&journey=area-first&node=d%3As&lat=12.83088&lon=77.67025&zoom=11`.
2. PANEL updated correctly to "South Bangalore / 83 areas with matches / 516 listings" with South
   Bangalore's own area list (Adigara Kallahalli, Agrahara, Akshayanagar, Anekal, ...). Same
   correct-update result as East Bangalore. Screenshot:
   `evidence/f10-f11-verification-2026-08-04/f11-04-south-region-card-click-panel-updated.jpg`.
3. Clicked a cluster-bubble map marker ("Sarjapur ... +27 areas within, Tap to zoom"). URL after:
   unchanged `node=d%3As`, only camera params changed
   (`...&lat=12.89063&lon=77.62716&zoom=12`).
4. Panel again **not empty**: still lists South Bangalore-scoped area cards (Akshayanagar, Arakere,
   Basapura, Begur, Bellandur, ...), count dropped 83→29, and the "South Bangalore" heading /
   "516 listings" subtitle again disappeared, identical pattern to Reproduction 1. Screenshot:
   `evidence/f10-f11-verification-2026-08-04/f11-05-south-map-cluster-click-heading-dropped-not-empty.jpg`.

### What the report got right vs. wrong

- **Wrong:** "clicking a directional region card leaves the panel on the city-root list." Both
  independent reproductions show the panel correctly transitioning to the clicked region's own
  area-card list, with the URL `node` param updating to match (`d%3Ae`, `d%3As`). This part of the
  report does not reproduce and is REFUTED.
- **Wrong (as literally stated):** "clicking the map marker directly clears/empties the panel's
  cards." In both reproductions the panel never went empty — it remained populated with the
  correct region's area cards throughout every map-marker click attempted (cluster-bubble markers
  were the only markers this step could get to register a click; direct clicks on individual
  "Tap to view homes" leaf pins and on OSM base-layer icons did not produce any node/URL change at
  all in several attempts, consistent with F9's finding that map interactions below the
  direction-cluster level don't drive `node` state).
- **Real, but different, defect found instead:** clicking a map cluster-bubble marker re-zooms the
  camera without changing `node`, and this re-zoom causes the panel's own "N areas with matches"
  count to silently recompute against the new (narrower) map viewport bounds, while the panel's
  region-name heading and listing-count subtitle disappear entirely. The area CARDS themselves stay
  correct and populated (not empty), but the panel's own header context is lost and its match count
  becomes viewport-derived rather than node-derived — a real map/panel state-consistency bug,
  reproduced identically in 2/2 independent region samples, but a materially different failure
  mode than "the panel clears."

### Classification

- **REFUTED** for the report's specific claim "panel does not update after a region-card click" —
  cleanly contradicted in both samples.
- **REFUTED as literally stated, but a related defect CONFIRMED** for the map-marker-click half:
  the panel does not "empty," but it does silently drop its heading/count context and substitute a
  viewport-scoped match count when a map cluster marker is clicked, in 2/2 samples (East, South).
  This is a real divergence from the #2014 map/panel-identity contract's spirit (map and panel
  should stay mutually consistent), but it is materially different from "empties the panel's
  cards" and should not be filed under that description. Recorded as
  MUST_HAVE_FUNCTIONAL — the area list itself remains usable and correct; only the
  heading/count summary above it is affected.
- **What could not be determined:** whether a genuine leaf-area map marker (not a cluster bubble)
  ever navigates the panel into that specific area when clicked directly on the map (as opposed to
  via the sidebar list). Every marker this step could get to register a click was a cluster-level
  "Tap to zoom" bubble; individual "Tap to view homes" leaf-pin clicks and OSM base-map icon clicks
  did not produce any observable state change in the several attempts made, which is itself
  consistent with — not contradicting — F9's existing finding that map-side interactions do not
  drive the `node` URL parameter below the direction level. This step did not exhaustively search
  for a working leaf-marker-to-panel-navigation path; if one exists, it was not found.

---

## F12–F17 — Shell-level desktop pass (2026-08-04)

Triggered by a user report: "the discover page does not represent the mock at all... desktop
experience needs matching" (mobile explicitly excluded from the complaint). This pass is the
direct remedy for the methodology gap already recorded at the end of the AC16 section above
("Methodology gap: component scope vs. page-shell scope") — AC16's 12-cell comparison was scoped
to individual components anchored via testids and was structurally blind to page-level
composition, which is exactly how F10 escaped it. This pass looks at shell/composition only:
spacing rhythm, section structure, control-bar composition, borders/elevation, typography
weight/sizing, density, split ratios, vertical ordering, and above/below-the-fold content —
explicitly not re-litigating component-level findings already in F1–F11.

**Scope:** the ~9 desktop states that have a real frozen-mock reference per `state-mapping.md`
(A01; A02/A04 sharing one reference; A03/A05 sharing one reference; A08 incl. A20; A11; A12; A13;
A19) plus A14, which has a mock reference but no reachable shipped capture (see "What I could not
determine" below). No new live browser captures were taken for the review itself — every
screenshot cited below is one of the two existing capture sets (`mock-audit/captures/`,
`evidence/issue-2076-amendment1-step4-shipped-captures/`) that Amendment-1 Step 4 already
produced, **except F12**, which required one live DOM query against the hosted deployment to
settle definitively (a screenshot alone cannot prove an element is absent from the DOM rather than
merely off-screen or mis-styled).

**Headline assessment:** the desktop-wide impression is **not** mostly explained by F10 + F8
alone. It is genuinely more extensive. The single largest additional cause is F12 (the entire
in-panel journey-choice card block is absent from the shipped DOM at every state sampled — all of
which carry `journey=area-first`, the canonical Areas journey; the component itself is intact and
does render for school-first/agri-first/journey-less states, see F12's corrected source-level
section below) — by itself this removes roughly a third of the mock panel's vertical
content and its primary secondary-navigation affordance for the journey this register is scoped
to. Layered on top of that is a consistent,
repeated pattern (F13, F16) of the shipped panel stripping out section eyebrow labels, divider
rules, descriptive taglines, and CTA prominence at every state sampled — not a one-off omission at
a single screen. F14/F15/F17 are real but smaller (composition/typography/border) differences.
Taken together with F8 (heading text) and F10 (mirrored shell), a user's "doesn't look like the
mock at all" reaction is well-supported by the evidence, not merely a strongly-worded overstatement
of two known issues.

### F12 — In-panel journey-switcher (Areas/Schools/Agricultural card block) absent for the canonical Areas journey

- Frozen reference: every mock capture used in this register (`areas-city-default.png`,
  `areas-region-areas.png`, `areas-area-listings.png`, `areas-listings-filters-active.png`, and
  others) shows a persistent "LOOKING FOR — or explore by direction" block directly under the
  control bar: three cards (Areas — marked `REC`/"Recommended", Schools, Agricultural), each with
  an icon tile, title, one-line description, and (for the selected Areas card, per source read of
  `JourneySwitcher.tsx`) chips + a CTA button — followed by a metrics strip ("42 areas · 223
  properties · Locality insights"). This block is present and visually identical **at every mock
  state examined**, including deep states like the AREA-detail view (`areas-area-listings.png`) —
  it is a persistent element, not landing-only, in the mock.
- **Source-level check — corrected 2026-08-04.** The original version of this bullet read only
  `JourneySwitcher.tsx` and `DiscoverRightPanel.tsx` and concluded (via
  `compact={panelContent !== 'guided-entry'}`) only that full cards vs. compact tab-strip was
  gated by `panelContent`, without ever explaining why NEITHER density mounts at the sampled
  states. That framing was incomplete — code review traced the actual mechanism one file
  further up the render tree and it is superseded here, not deleted, per this register's
  supersede-don't-overwrite convention:
  - `DiscoverRightPanelContainer.tsx:370-412` is the real gate. It branches on
    `showAreasNavigationJourney = urlState.journey === 'area-first'` and, when true, returns
    `<DiscoverAreasJourneyPanel>` directly — a sibling component that never imports or renders
    `JourneySwitcher` at all (confirmed: zero references to `JourneySwitcher` anywhere in
    `DiscoverAreasJourneyPanel.tsx`). Only the `else` branch renders `<DiscoverRightPanel>`, the
    ONLY mount point for `<JourneySwitcher>` in the tree
    (`DiscoverRightPanel.tsx:1724`, mounted unconditionally per that file's own comment at line
    ~1700 — "PERSISTENT JourneySwitcher mount (below, not just at guided-entry)" — with no early
    return preceding it).
  - So `JourneySwitcher` is not conditionally suppressed by `compact`/`panelContent` at these
    states — it is architecturally unreachable for `journey=area-first`, because that journey
    never mounts the panel it lives in. The `compact` prop only decides which of
    `JourneySwitcher`'s own two densities renders for the panels that DO mount it (school-first,
    agri-first, journey-less deep links) — it plays no role in F12's absence.
  - This also means the component is not unfinished or dead code: it is fully built, unit-tested
    (`JourneySwitcher.test.tsx`; `DiscoverRightPanel.test.tsx:229` asserts "Recommended" renders
    for `panelContent="guided-entry"`), and does render correctly for every journey other than
    the canonical Areas one. Since `journey=area-first` became the canonical default
    (`def43294`, "cut Areas journey over to canonical default"), every state this register
    samples routes through `DiscoverAreasJourneyPanel`, which is why the switcher is absent at
    all of them.
- Live DOM check (hosted, this step): navigated to
  `https://udupi-property-explorer.pages.dev/discover?city=bangalore&journey=area-first` (the same
  URL A01's capture used) and ran
  `document.querySelector('[data-testid="journey-switcher-section"]')` in the page's own JS
  context via `javascript_tool`. **Result: `null` — not found anywhere in the DOM**, not merely
  off-screen or styled to zero height. This is consistent with the corrected mechanism above:
  `DiscoverAreasJourneyPanel` never imports `JourneySwitcher`, so neither of its densities can
  mount regardless of `panelContent`. Re-confirmed visually with a fresh
  screenshot at the same URL after a hard reload — evidence:
  `evidence/f12-f17-shell-desktop-2026-08-04/f12-a01-journeyswitcher-absent-fresh-reload.jpg`. The
  earlier `A08-A20-desktop-area-listings-kambipura.jpg` capture (Kambipura AREA-detail) likewise
  shows no such block anywhere in the panel.
- **Auth arm:** authenticated (pre-existing session, same disclosure as F1–F11 — "TE" avatar/99+
  notifications visible in the fresh screenshot). **Viewport:** desktop 1366×768 (screenshot
  captured slightly cropped by tool chrome at 1366×591 visible height; full page height not
  affected since the query targeted the DOM directly, not a scrolled screenshot region).
  **Classification:** `HOSTED_CURRENT_STATE` for the live DOM check and fresh screenshot; the
  static captures cited above are Amendment-1 Step 4 evidence, already disclosed there.
- What this is NOT: this is not simply "the top-nav Discover/Schools/Agricultural land links are a
  reasonable alternate implementation of the same idea" — that's a legitimate architecture choice
  the repo owner may well prefer, and the top-nav links do exist and are functional (confirmed via
  `find` on the same page: `ref_11/12/13`, hrefs to `journey=school-first`/`agri-first`). It is
  also not that `JourneySwitcher` is broken, unfinished, or absent from the app generally — it
  renders correctly wherever `DiscoverRightPanel` mounts (school-first, agri-first, journey-less
  deep links). The finding is narrower and more concrete: for the canonical Areas journey
  (`journey=area-first`) specifically, the frozen mock's specific composition (icon tile +
  headline + description + chips + CTA, in-panel, persistent across states, occupying a
  significant fraction of panel height) has **zero** rendered counterpart anywhere in the shipped
  DOM at the states sampled — every one of which is an `area-first` state — not a smaller version,
  not a relocated version, not a compact version. Whether the top-nav links are an acceptable
  INTENTIONAL_DIFFERENCE substitute is a product call this register does not make; per the
  source-of-truth precedence at the top of `parity-matrix.md`, an intentional difference from the
  frozen design needs an explicit product ruling recorded on the PR, which does not exist for this
  specific substitution.
- **Classification: MUST_HAVE_VISUAL (CONFIRMED)** — desktop only (mobile was out of scope for
  this pass per the user's own report, which explicitly excludes mobile); scoped to the canonical
  Areas journey (`journey=area-first`), which is every state this register samples, so the
  classification/severity is unchanged. Not classified as absent from the app as a whole — see
  the corrected source-level check above.

### F13 — Section eyebrow labels, divider rules and per-item descriptive taglines are systematically omitted

Distinct from F8 (which is specifically about the A01 primary heading's TEXT — "Where do you want
to explore?" vs. "Bangalore / 1737 listings"). This finding is about a repeated STRUCTURAL pattern
across multiple sections and multiple states, not one string.

- **A01** (`areas-city-default.png` vs. `A01-desktop-city-default.jpg`): mock has a
  "DISCOVER BANGALORE" eyebrow above the main heading, then "DIRECTIONAL REGIONS" as a small-caps
  section label paired with a "5 regions" count directly above the region list, and a horizontal
  divider rule separating the journey-card block from the region list. Shipped has none of these —
  the Direction card grid follows directly from the "Bangalore / 1737 listings" heading with no
  intervening eyebrow, count label, or rule.
- **A02/A04** (`areas-region-areas.png` vs. `A02-A04-desktop-west-region-areas.jpg`): mock has a
  "REGION" eyebrow above "Areas in South Bangalore", a one-line description ("Pick an area to open
  its listings."), and an "AREAS" section label + "2 areas" count directly above the area-card
  grid. Shipped shows only "West Bangalore / 34 areas with matches / 135 listings" — no eyebrow, no
  descriptive sentence, no "AREAS" sub-label repeating the count a second time.
- **A08/A12** (`areas-area-listings.png` / `areas-listings-filters-active.png` vs.
  `A08-A20-desktop-area-listings-kambipura.jpg` / `A12-desktop-filters-active-3bhk-whitefield.jpg`):
  mock has a "SELECTED AREA" eyebrow above "Properties in Hebbal", followed by a UNIQUE one-line
  per-area tagline ("Lake-side connectivity hub at the foot of the flyover — metro, ORR and airport
  road meet here."). Shipped's equivalent line ("Explore verified listings around Kambipura, with
  map context and area-first filters.") is generic boilerplate — the same sentence shape regardless
  of area (confirmed by source read: `search_text` for `areaDescription`/`tagline` in
  `AreaSelectedPanel.tsx` returned zero hits — there is no per-area copy field being fed into this
  line at all, not just a copy difference). Shipped also adds a caption line the mock does not have
  ("Showing sale prices in ₹ for Kambipura.").
- **Masked as artefact, not counted as part of this finding:** the exact numbers in every count
  (223 vs 1737, 42 vs 34, etc.) are fixture-vs-live data, per the standing masking convention (c).
- **Classification: MUST_HAVE_VISUAL (CONFIRMED)** — same pattern reproduces at 3 independently
  sampled states (A01, A02/A04, A08/A12), so this is recorded as one structural finding with
  multiple instances, not three separate findings (same convention F8 used for its two-viewport
  instance).

### F14 — Top-tier (Direction) destination list: row-list in the mock vs. card-grid in shipped

- Frozen reference: `areas-city-default.png` — the 5 Directional Regions (North/South/East/
  West/Central) render as a single-column list of full-width ROWS, each with an icon, name,
  member-area names inline, a right-aligned count, and a chevron.
- Shipped: `A01-desktop-city-default.jpg` — the same 5 Directions render as a 2-COLUMN CARD GRID
  (bordered boxes, 3 stat lines each: areas/listings/schools), not a row-list.
- **Scoped correction, not overclaimed:** at the NEXT tier down (AREA-level, A02/A04:
  `areas-region-areas.png` vs. `A02-A04-desktop-west-region-areas.jpg`), both mock and shipped
  already use a 2-column card grid — that tier is a genuine MATCH (consistent with the existing
  AC16 row-2 verdict, unchanged here). This finding applies specifically to the outermost/Direction
  tier, where the mock uniquely diverges into a row-list format and shipped does not follow it.
- **Classification: MINOR_POLISH (CONFIRMED)** — a real composition difference, but narrow in
  scope (one tier, one state) and does not affect navigability or information content (both
  formats convey the same name/count/chevron-affordance).

### F15 — Shipped heading typography is substantially larger/heavier than the mock's

Distinct from F8: F8 says the STRING differs at A01; this says the RENDERED SIZE/WEIGHT class of
headings differs, independent of which string is shown, and reproduces beyond A01.

- **A01:** mock's "Where do you want to explore?" (`areas-city-default.png`) is set at a moderate
  bold weight, comparable in scale to the "223 properties" figure beside it. Shipped's "Bangalore"
  (`A01-desktop-city-default.jpg`) is set dramatically larger and heavier, closer in visual weight
  to a page-title/display style than the mock's section-heading style.
- **A08:** mock's "Properties in Hebbal" (`areas-area-listings.png`) reads at roughly the same
  scale as A01's heading. Shipped's "Properties in Kambipura"
  (`A08-A20-desktop-area-listings-kambipura.jpg`) is visibly larger again — occupies noticeably
  more vertical space than its mock counterpart, consistent with the same divergence seen at A01,
  not a one-off.
- Excluded as artefact: the actual area/city NAME strings differ (Hebbal/Kambipura,
  Bangalore-heading-form — that's F8's territory), and exact pixel measurements were not taken
  (no font-size/line-height diff tooling was run) — this is a visual-inspection judgement call
  across two independently sampled states, not a measured typographic-scale audit.
- **Classification: MINOR_POLISH (CONFIRMED)** — real and repeated, but a type-scale/weight choice
  that doesn't block any function; recorded because the task explicitly asked for typography
  weight/sizing to be checked as its own axis, separate from F8's text-content finding.

### F16 — Within-area panel element order and school-shortcut CTA prominence diverge from the mock

- **Mock order** (`areas-area-listings.png`, `areas-listings-filters-active.png`, top to bottom):
  heading block → **school-shortcut CTA** (a full-width, tinted, rounded card with icon, two-line
  copy "Find homes near a school / Explore schools in {Area} — keeps this area", and a trailing
  arrow) → **search-within-area input** (with a filled "Search" button) → TYPE filter row → BEDS
  filter row (with a "Verified only" toggle at the far right) → "HOMES FOR SALE · N shown"/"N of M
  · Reset" section label → listing cards.
- **Shipped order** (`A08-A20-desktop-area-listings-kambipura.jpg`,
  `A12-desktop-filters-active-3bhk-whitefield.jpg`, top to bottom): breadcrumb → heading →
  generic description line → caption line → divider → a bordered "PROPERTY TYPE" + "BEDROOMS"
  filter box, **inside which** a small "+ Add a school in this area" text-button sits at the
  bottom-right corner → search-within-area input (`Search properties in Whitefield`) → result-count
  caption → listing cards.
- Two concrete divergences, both reproduced at 2 independently sampled states (Kambipura, filters
  view of Whitefield): (1) **order** — the search-within-input sits ABOVE the filters in the mock
  and BELOW the filters in shipped; (2) **prominence** — the school-shortcut affordance is a
  large, illustrated, two-line CTA card near the top of the panel in the mock, but a small inline
  text-button embedded inside the filter widget in shipped. AC16's earlier desktop row 4 verdict
  ("School-shortcut CTA present and copy-compatible", MATCH) checked presence and copy only, at
  component granularity — it did not check placement or visual weight, which is exactly the kind
  of divergence this shell-level pass exists to catch. This finding does not contradict that
  MATCH verdict (the CTA genuinely is present, and copy-compatible at the string level); it adds a
  composition-level observation the earlier pass was not scoped to make.
- Also noted, not double-counted: the mock's "Verified only" filter toggle has no confirmed shipped
  counterpart (already flagged in `state-mapping.md`'s AC13 table as a PARTIAL/unconfirmed gap) —
  cited here only as supporting context for the filter-box comparison, not as a new finding.
- **Classification: MUST_HAVE_VISUAL (CONFIRMED)** — a real, repeated composition/ordering
  divergence; not classified FUNCTIONAL because every affordance (search, filters, school CTA)
  remains reachable and operable in shipped, only its position and visual weight differ.

### F17 — Card border/elevation treatment differs

- Mock cards (Direction rows in `areas-city-default.png`, AREA cards in `areas-region-areas.png`)
  read as borderless, resting on a shadow/subtle-background separation from the page — no visible
  1px outline.
- Shipped cards (`A01-desktop-city-default.jpg`, `A02-A04-desktop-west-region-areas.jpg`) carry a
  visible 1px border on every card, and the hovered card in the West-Bangalore area-grid capture
  shows an additional grey hover-fill background — a distinct elevation/interaction language from
  the mock's.
- **Classification: MINOR_POLISH (CONFIRMED)** — a design-token-level (border/shadow) difference,
  consistent across the two states sampled; does not affect function or content legibility.

### What I consciously looked at and did NOT report as a finding

- **The entire top masthead/global navigation bar** (mock: "Bangalore Property Tracker" logo +
  "V2 · Directional IA" / "Interactive experience" / "Storyboard" links + chat icon + "Sign in";
  shipped: "ReTrends" logo + "Discover / Schools / Agricultural land / Trends / Broker dashboard /
  New listing / Notifications / Broker workspace" + avatar) — classified as **(d) capture-process
  artefact**, not a design discrepancy. The mock's masthead is the design-tool "kit" wrapper chrome
  (its own "Interactive experience"/"Storyboard" links are unambiguously prototype-authoring
  navigation, not part of the frozen Discover page design), not a rendering of the real app's
  intended top nav. Comparing it to the shipped app's actual global nav would be comparing two
  different systems that were never meant to match.
- **Map tiles, marker/pin exact styling, pin colors and positions, and price-pill exact values** on
  both sides — classified as **(c) data artefact** (mock fixture vs. live hosted data) per the
  standing masking convention already established earlier in this document, and additionally
  **(d)** because the map surface itself has no stable DOM anchor on either side
  (`state-mapping.md`'s AC13 table already established `map-surface` and marker pins as
  NO/not-anchorable). Not re-opened here.
- **Exact count/price VALUES** everywhere (223 vs 1737 properties, 42 vs 34 areas, ₹3.85 Cr vs
  ₹1.33 Cr, etc.) — classified as **(c) data artefact**, per the standing convention.
- **Minor sub-pixel spacing/padding deltas** within otherwise-matching sections (e.g. the exact
  gap between filter chips, or between a card's icon and its text) — visually inspected across all
  cited capture pairs and judged as **(b) acceptable variation/noise**, not a rhythm-level
  discrepancy worth a separate finding; the padding/spacing items that DID rise to a reportable
  level are captured in F13 (missing dividers) and F16 (reordering), not itemized further.
- **The Buy/Rent toggle's visual treatment** (mock: black pill segmented control; shipped: bordered
  rectangular toggle) — visually different but judged **(b) minor/not separately worth reporting**;
  it is a small control-bar sub-element already implicitly covered by F17's border/elevation
  observation rather than a distinct finding, and the toggle's FUNCTIONAL behaviour is already
  covered by F7.

### What I could not determine

- **A14 (Browse All)** — has a mock reference (`areas-browse-all.png`) but no shipped capture
  exists, and the AC16 pass already recorded this as UNDETERMINED (no reachable entry point found
  from city root, search not exhaustive). This shell-level pass did not attempt a new live search
  for it either, consistent with the instruction to take new captures only where useful and to stay
  bounded — chasing an unconfirmed entry point was judged lower value than covering the 8 states
  that do have both-sides evidence already in hand. If Browse All is found reachable in a future
  step, it should get its own shell-level comparison pass, not be retrofitted into this one.
- **A03/A05 exhaustiveness** — this pass, like F9 before it, did not re-sample Central/South/East
  Direction panels for the shell-level items (only reused the existing West/North captures already
  in evidence). The list-vs-grid (F14) and eyebrow/divider (F13) patterns are reproduced
  consistently enough across the states that were sampled that a different unsampled Direction
  changing shape seems unlikely, but this is not proven for all 5 Directions.
- **Whether F12's missing journey-switcher is a deliberate, ruled product decision** — the top-nav
  substitute clearly works and is intentional in the sense that someone built it. Two sub-questions
  were originally bundled here; one is now resolved, one remains open:
  - *"Was the in-panel version simply never finished for non-landing states?"* — **Resolved
    2026-08-04**, from source, not evidence guesswork: no. `JourneySwitcher` is fully built and
    unit-tested and does render for every journey except the canonical Areas one; it is absent
    there because `DiscoverRightPanelContainer.tsx:370-412` routes `journey=area-first` to
    `DiscoverAreasJourneyPanel`, a sibling component that never mounts it — not because the
    in-panel switcher was left half-built. See the corrected source-level check above.
  - *"Was routing `area-first` to a sibling panel that drops the in-panel switcher a knowing,
    ruled INTENTIONAL_DIFFERENCE from the mock's in-panel card design (vs. the top-nav links
    filling that role instead), or an unreviewed side effect of the #1956 canonical cutover?"* —
    still open. This is a product-ruling question, not a code-reading one, and is not answered by
    the mechanism trace above.

---

## #2074 rent-probe findings (feeds Amendment-1 Step 5)

Amendment-1's rent-probe requirement, sampling several high-count areas under the Rent toggle on
hosted Bangalore to determine whether PR #2074's merged rent/lease pricing contract is
RENDER-observable (as distinct from its already-merged CONTRACT, which is proven by backend
tests and is never cited here as rendered evidence).

**Auth arm:** authenticated (pre-existing session). **Viewport:** desktop 1366×768.

| Area | Macro-region | Sale listing count (Buy) | Rent result |
|---|---|---|---|
| Kambipura | West Bangalore | 1-2 listings | "No listings here yet" |
| Whitefield | East Bangalore | 49+ listings (dense priced map pins under Buy) | "No listings here yet"; zero map pins |
| HSR Layout | South Bangalore | (not counted; area exists with a resolvable node) | "No listings here yet"; zero map pins |

Combined with 4 areas already sampled during the amendment's feasibility check (state-mapping
step, prior to this step), this is **7 sampled areas across 3 of Bangalore's 5 macro-regions, all
showing zero rent listings** under the Rent toggle. Not exhaustive across ~312 areas — this
remains a strong signal, not a proven citywide zero.

- Evidence:
  `evidence/issue-2076-amendment1-step4-shipped-captures/rent-probe-whitefield-header.jpg`,
  `.../rent-probe-whitefield-empty.jpg`,
  `.../rent-probe-hsr-layout-empty.jpg`,
  `.../F7-A09-desktop-rent-empty-badge-unfiltered-kambipura.jpg`
- **Classification: ENVIRONMENT_BLOCKED** for A09/A10's rendered-behaviour verification. The
  merged #2074 contract (`monthlyRentRupees`/`monthlyRentBand`, backend + frontend types,
  `CityAreaListingsControllerTest`/`CityAreaListingsIT`/etc.) is proven at the CONTRACT level by
  the already-merged tests, but this run could not find any hosted Bangalore area with actual rent
  inventory to render that contract against. No verdict is forced either way on whether the
  rendered pricing display itself is correct — there is simply nothing to render. This is
  identical in kind to the amendment's own prediction
  (`approved-plan-amendment-1.toml [evidence.pr_2074].rendered_behaviour_risk`), now confirmed
  with 3 additional sampled areas rather than merely predicted.

---

## Annotation (2026-08-04) — Implementation-handoff synthesis appended, no findings above altered

`docs/audit/issue-2076/implementation-handoff.md` has been written as the Part-4/synthesis
deliverable over F1–F17. It does not change, merge, or reclassify any finding recorded above; it is
a downstream planning document. Two things worth cross-referencing from here, so a reader of this
register (not just the handoff) sees them:

- **F13 and F16 were deliberately kept as two distinct findings in the handoff**, per this
  register's own existing framing (F13 = presence/absence of eyebrows/dividers/taglines; F16 =
  ordering/prominence of elements that ARE present) — not re-merged.
- **The handoff explicitly labels the "F2/F7/F11 count-scope family" as a HYPOTHESIS, not an
  established pattern**, matching `workdone-candidate.toml`'s own
  `[amendment_2.stage_2_input].count_scope_family` calibration: F2 and F7 share a CONFIRMED root
  (the badge's selected-area branch reading from legacy `useAreaGroups` props instead of node
  identity); F11's cluster-click defect (the CONFIRMED half of F11, not the REFUTED
  region-card-click claim) reproduces a similar-looking symptom but its root cause was never traced.
  The handoff treats tracing F11 as a prerequisite for folding it into the same fix as F2/F7, and
  flags a post-fix re-verification step rather than assuming success. See
  `implementation-handoff.md`'s "Major root causes" §2 and "Recommended implementation order" item 2.

No F1–F17 entry's text, classification, or evidence citation was rewritten or deleted to produce
this annotation.
