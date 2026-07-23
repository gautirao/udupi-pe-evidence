# 06 — Feature-Sliced Delivery Plan (Discover V2)

**This document replaces the earlier ~20-PR, 7-phase technical plan.** That structure fragmented
single customer journeys (e.g. Schools) across shell/frontend/backend/mobile/testing/polish
phases, which meant no phase on its own delivered something a user could actually complete and a
reviewer could sign off end to end. This rewrite is organised around **customer features**, not
technical layers. It builds directly on [01](01-frozen-design-audit.md)–[05](05-issue-roadmap-reconciliation.md)
and repeats none of their evidence — every citation below points back into those five docs.
**No audit finding was altered to fit this new structure; only the delivery sequencing changed.**

**Status: planning only.** No production code, migrations, or APIs were changed to produce this
plan, and none of the four feature gates below is authorized to start implementation without a
separate, explicit user go-ahead.

---

## SUPERSEDED — mobile shell design (as-built update, 2026-07-22)

**Every mention below of a `~42%`-height map band, a grab-handle "stacking sheet", or a hard `h-64`
mobile map container is superseded.** Issue #1953 (build steps 3–6) shipped a different mobile
shell than this plan originally scoped: a **List-first Map/List toggle**, not a proportional
stacking sheet. Where this document still describes the stacking-sheet shape (Feature 1 items 2/3/
7/11/18, Feature 2 item 11, Feature 3 PR-B item 11, Feature 4 PR-B item 11), that text is retained
**only** as a historical record of what was originally planned and is marked
`[SUPERSEDED — see this note]` inline — it does not describe shipped behaviour. The as-built
contract is:

- **List is the mobile default.** At the `isMobileShell` breakpoint, the right panel renders
  full-width; there is no permanently-visible map band underneath it.
- **The map is not mounted, and no tiles are requested, until the user opens Map.** A "Map" trigger
  switches `mobileView` to `'MAP'`; `DiscoverMapMount` (not a CSS show/hide) owns whether
  `DiscoverMapCanvas` mounts at all.
- **Returning to List real-unmounts the map** — `mobileView !== 'MAP'` renders a literal `null` for
  the map subtree, not a `display:none`/`visibility:hidden` toggle. This is deliberate: it is what
  makes "no tiles requested until Map opens" true on the way back from Map too, not just on first
  load.
- **Map/List is presentation-only UI state.** It lives in `useDiscoverShell()` (component state),
  never in the URL/history — switching Map↔List does not push or replace a history entry and is not
  restored on refresh/Back/Forward.
- **Two stacking constraints a real browser forced during build step 4** (load-bearing; a future
  change that regresses either will silently break mobile Discover for first-time visitors):
  - The mobile "Map" trigger must **not** share an anchor with `DiscoverConsentBanner` (#1576). The
    trigger was originally `fixed bottom-4 left-1/2` at `z-30`, the exact same bottom-center anchor
    the consent banner uses at `z-50` for every first-time visitor (consent undecided) — the banner
    sat on top and made the trigger unclickable. Fix: the trigger anchors to a **different** corner
    (`top-20 right-4`), so the two can never share a hit-test region regardless of z-index.
  - The full-screen mobile Map overlay must render **above** the sticky site header
    (`RoleAwareHeader`, `sticky top-0 z-50`). The overlay was originally `z-40`, which stacked below
    the header in the same stacking context — the header's own content intercepted clicks meant for
    the overlay's "List" close button. Fix: the overlay renders at `z-[60]`, a genuine
    stacking-context comparison against the header's `z-50` (both are top-level positioned elements
    with no intervening stacking context), not a `display:none` on the header.

**Known limitation:** scroll restoration is wired only to `AreaGroupsLandingPanel`'s own scroll
container. Level-2/results panels and the school/agri panels each own a separate scroll container
that is **not yet wired** to restore scroll position — do not assume "restores panel scroll
position" generalizes across every panel; today it is true only for the area-groups landing panel.

---

### Invariant: on mobile List, city identity is carried by the control bar

`AreaIndicatorOverlay` (the city/area chip) is rendered **inside `DiscoverMapCanvas`**, which
`DiscoverMapMount` unmounts entirely in mobile List. Its absence there is correct — it is a map
overlay and there is no map — but it means **the unified control bar is the only thing naming the
current city on mobile List**.

This was verified in a browser at 390x844: with the map unmounted, `area-indicator-overlay` is
absent and `control-bar-city-select` carries the city label.

**Why this is written down.** Between the lazy-mount commit and the control-bar commit, mobile List
showed *neither* — no chip and no city label. Nothing failed, because no test covers that
combination. It closed by sequence rather than by design. If a future change removes the city label
from the control bar, or moves the control bar off the mobile List view, that regression returns
silently. This line is what makes it visible.

**Known limitation of the scroll contract.** `useScrollPositionAcrossToggle` is wired only to
`AreaGroupsLandingPanel`'s scroll container. Level-2 / results panels and the school and agri panels
own separate scroll containers that are not yet wired, so a Map -> List round trip from those states
does not preserve scroll position.

## Core delivery rule

The unit of planning and sign-off is a **complete customer feature**, not a technical layer. A
feature is complete only when its frontend, backend, map behaviour, URL state, desktop layout,
mobile layout, accessibility, loading/empty/error behaviour, unit/integration tests, real-data
E2E, and visual comparison against the frozen design are **all** done and reviewed together. A
partial backend change, a shell fragment, or a re-skinned panel with no backend behind it is never
described as a shippable feature in this plan.

## Guiding principles (unchanged from the prior plan)

- **One canonical Discover implementation.** No `/discover-v2` parallel route. Every feature below
  evolves `MapDiscovery.tsx` / `useDiscoverUrlState.ts` / `DiscoverRightPanel.tsx` in place.
- **Reuse before rebuild.** Every feature starts from the ALREADY-BUILT / VISUAL-ONLY-CHANGE rows
  in [03-functional-parity-matrix.md](03-functional-parity-matrix.md) — new components are built
  only where that matrix says MISSING.
- **Preserve the URL contract.** `useDiscoverUrlState.ts`'s param vocabulary is load-bearing for
  ~60 existing E2E specs. Extend it additively; never replace it.
- **Backend work is Flyway expand/contract**, following the existing checksum/fingerprint
  versioning convention already used by the city-launch subsystem — not a new pattern.
- **No feature ships without its verification gates** from [04-testing-quality-gates.md](04-testing-quality-gates.md),
  applied to that feature's own surface, not deferred to a later "polish" pass.

---

## The four feature gates, in order

| Gate | Feature | Max PRs | Ships when |
|---|---|---|---|
| 1 | Unified Discover shell | 1 | Shell alone is fully testable and sign-offable, before any journey content is re-skinned |
| 2 | Schools journey | 1 | Full City→...→Homes-near-school journey works end to end at design parity |
| 3 | Areas journey | 2 (A: recursive hierarchy generation/preview/promotion enablement, B: full adaptive-depth UX) | The complete recursive hierarchy (any depth a city's approved model has) works end to end at design parity |
| 4 | Agricultural journey | 2 (A: Town/Destination data enablement, B: full UX) | Full origin→direction→band→town→parcel journey works end to end at design parity |

**Maximum total: 6 implementation PRs.** No documentation-only, tooling-only, cleanup-only,
E2E-prep-only, or final-polish PRs are counted or planned separately — each of those activities is
folded into the feature PR that needs it (see "What was removed" at the end of this document).

**Sequencing is strictly serial across gates.** Gate 2 does not start implementation until Gate 1
has passed its full sign-off checklist; Gate 3 does not start until Gate 2 has; Gate 4 does not
start until Gate 3 has. Planning and decision-resolution for a later gate (e.g. confirming the
Town/Destination definition for Gate 4) may happen while an earlier gate is mid-review — only
**implementation** stays single-threaded.

---

## Feature decision gates (each decision allocated to the feature it actually blocks)

Decisions are **not** all required before PR-1, as the prior plan assumed. Each is scoped to the
feature that needs it, and later features' decisions can be worked in parallel with an earlier
feature's implementation/review.

### Before Unified Shell (Gate 1) — all three decisions now RESOLVED (Correction 11, approved)

- **D-Shell-1 — RESOLVED: city-scoped, mode-aware autocomplete for this rollout.** Only one live
  city (Bangalore) exists in production today ([02](02-production-baseline-audit.md) §A.9).
  The autocomplete is built city-scoped + mode-aware (extending `ScopedSearch.tsx`'s existing
  per-city model); cross-city autocomplete becomes a follow-up after a second city is live.
- **D-Shell-2 — RESOLVED: a stale/unavailable deep link resolves to the nearest valid canonical
  ancestor.** Fallback to city root happens **only** when no lower valid ancestor can be resolved.
  A non-blocking notice is displayed — never a blank or error screen. (This same rule is the last
  rung of Areas' stale-`node_key` ladder in Feature 3 — one consistent behaviour across the
  programme.)
- **D-Shell-3 — RESOLVED: a Discover-scoped React context façade over the existing URL-derived
  state.** The URL remains the canonical source of truth — **no independent duplicate state store
  is introduced.** The context exposes the relevant state/actions (city, mode, Buy/Rent,
  breadcrumb, navigation actions) to shell and journey components, reducing `MapDiscovery.tsx`'s
  prop drilling ([02](02-production-baseline-audit.md) §A.2's flagged 100+/80+ prop surface)
  **incrementally, without requiring a full rewrite**. Features 2–4 consume the same façade.
  Feature 1's sign-off checklist (item 21) confirms the façade is workable for Features 2–4 to
  build against.
- **Shell loading/error defaults — RESOLVED and recorded:** the shell frame, controls, and map
  container remain stable while panel data loads; only the relevant panel body is skeletoned;
  panel-data failures are panel-local and retryable; a map-tile failure leaves the panel fully
  usable with an inline map-unavailable state.

### Before Areas (Gate 3)

**Product decision approved (this revision):** production must support a genuinely **recursive,
variable-depth** navigation hierarchy — `City → primary directional region → zero or more nested
local directional clusters (a cluster may contain sub-clusters, to a policy-bounded max depth) →
canonical area → listings` — generated during city preparation (never in the browser, never
per-request, never from live listing inventory), previewed/validated/approved via an extended City
Launch Preview, and promoted verbatim (no regeneration at promotion time). This supersedes the
previously-flat "one optional cluster level" framing (old D-Areas-2/D-Areas-3, retired below) and
resolves several previously-open questions with fresh investigation:

- **D-Areas-1 — Canonical region model: legacy `area_groups` or new `city_regions`?** **Resolved,
  no longer blocking.** Adopt `city_regions` as the root of the new recursive tree (region = depth
  0 of the hierarchy). [02](02-production-baseline-audit.md) §C.1 and
  [03](03-functional-parity-matrix.md) Part C item 1 still correctly frame why this was the
  historical blocker; it is now simply step one of building the recursive tree on top of
  `city_regions`, not a separate fork.
- **D-Areas-5 — Is the city-launch sandbox→production promotion pipeline actually shipped end to
  end? MAJOR CORRECTION (this revision).** A direct code investigation (not inference from the
  V118 migration header) found `CityLaunchPromotionService.launch()` **fully implemented and
  tested end to end**: a guarded `VALIDATED→PROMOTING` CAS, checksum verification, a six-table
  compare-before-write promotion in lock order, `PROMOTING→PROMOTED` CAS, and the `cities.is_active`
  flip, all in one `@Transactional` method — with a real Testcontainers IT
  (`CityLaunchPromotionServiceIT`) that drives the actual prepare→graph-write→validate→promote
  cycle, not a hand-seeded shortcut, plus an HTTP-level IT
  (`AdminCityLaunchLaunchControllerIT`) over the real admin endpoints. **The V118 migration
  header's "promotion is PR8+ concerns" comment is stale documentation, not a missing feature** —
  it was never updated after the promotion service shipped (labeled "#1911 PR5" in its own
  javadoc). **This decision is now fully unblocked**: the promotion mechanism this plan needs
  already exists, is tested, and Areas PR A can extend it (a new `sandbox_navigation_nodes` →
  `navigation_nodes` table pair following the exact same promotion pattern) rather than build
  promotion from scratch.
- **D-Areas-6 — Relationship between #1910 and #1951 — resolved by direct re-investigation, not a
  timeboxed guess.** #1910 (region-scoped presentation-group projections) is **confirmed merged and
  shipped** (PRs #1912/#1913) but is **structurally a flat, single-level, read-time projection**
  (`RegionScopedAreaGroup`, no `parentNodeId`, explicitly non-recursive by its own stated
  non-goals) — it cannot represent "cluster contains sub-cluster to arbitrary depth" as-is, and was
  never meant to. **Decision: keep #1910's endpoint live as a narrow, additive compatibility layer**
  for its original bounded use case (a group spanning two regions); it is superseded, for the
  *general* recursive-navigation case, by the new typed `navigation/{nodeKey}` endpoint below — not
  extended in place. #1951 (the design charter) is **not superseded**; its naming/threshold/display
  philosophy is depth-agnostic and stands, but its persisted-identity model (fixed
  `DIRECTIONAL_REGION`/`LOCAL_CLUSTER`/`AREA`/`LISTINGS` types, "one optional extra level") needs a
  targeted recursive amendment to a self-referential `CLUSTER` node type — this plan's recursive
  data model (below) *is* that amendment, documented here for whoever later updates #1951 itself
  (this session does not edit any issue).
- **D-Areas-7 (retired old D-Areas-2/D-Areas-3 threshold framing) — Production rule for when a
  region subdivides, and how deep.** The frozen design's own "8 areas + 2 sub-groups" is
  prototype-only ([01](01-frozen-design-audit.md) Phase 1 `undesignedStates`), and the approved
  product decision explicitly **forbids hardcoding "5 areas," "8 areas," or any single universal
  threshold** — the algorithm must be policy-driven and geography/UX-tested, not invented inside a
  PR. See "Hierarchy generation algorithm" below for the concrete parameters Areas PR A's design
  work must resolve (max direct-children before subdividing, min clusters per split, min areas per
  cluster, max safety depth, spatial-compactness/sibling-separation/outlier rules) — each is a
  policy value in `city_region_policy` (extended), not a code constant.
- **D-Areas-4 — Is #1943 (area-group marker overlap) superseded by Areas Gate 3 acceptance, or
  does it need an interim fix first?** Unchanged from the prior revision: fold #1943's closure into
  Areas PR B's acceptance criteria, graded against **#1943's own originally-reported repro
  coordinates/zoom** (density reduction alone is not sufficient evidence — see Areas PR B's
  acceptance criteria below).

### Before Agricultural (Gate 4)

- **D-Agri-1 — Town/Destination definition and grouping method.** No entity exists today
  ([02](02-production-baseline-audit.md) §C.4); a grouping algorithm must be chosen (e.g.
  administrative-boundary import vs. generated parcel-density clustering) before Agricultural PR A
  can be scoped. This needs a dedicated design pass, not an algorithm invented inside a PR.
- **D-Agri-2 — Quantify #1926/#1927 before Agricultural PR A begins implementation.** Added after
  adversarial review: the plan folds "repair #1926/#1927" into PR A's test-readiness scope, but
  neither issue's actual failure mode, flake rate, or fix effort is quantified anywhere in this
  plan — an unscoped test-infra repair bundled into a PR that also carries a brand-new entity
  design is a real risk of PR A ballooning past estimate. **Before Agricultural PR A's
  implementation starts, run the existing agri E2E suite enough times to characterise #1926/#1927's
  actual failure mode and estimate the fix effort** (a config/selector fix vs. a deeper flakiness
  root cause). If the fix is non-trivial, treat it as a distinct, explicitly-tracked sub-scope
  within PR A's own estimate — it does not get its own PR (per the user's explicit "no
  E2E-prep-only PR" instruction), but it must not be silently absorbed as an afterthought either.

### Undefined ("`NOT_DESIGNED`") states — allocated per feature, not one programme-level decision

The manifest's 7 `undesignedStates` ([01](01-frozen-design-audit.md) Phase 1) are distributed to
the feature that owns the surface they appear on, each resolved as part of that feature's own
loading/empty/error acceptance criteria — **not** carried as one deferred cross-cutting decision.
**Exception:** the deep-link-to-unavailable-data fallback is still Feature 1's surface, but per
D-Shell-2 above it requires explicit product sign-off before implementation, not just an
engineering default:

- Shell loading skeleton, deep-link-to-unavailable-data fallback (gated by **D-Shell-2**),
  map-tile-failure-while-panel-ok → **Feature 1 (Unified Shell)**.
- School loading/empty/error states, unreachable-Schools-cluster-level → **Feature 2 (Schools)**
  — the unreachable-cluster state is explicitly kept **out of scope** (no code for a state that
  cannot be reached with current data; revisit only if a future city's data makes it reachable).
- Listing/area loading/empty/error states → **Feature 3 (Areas)**.
- Town/parcel loading/empty/error states → **Feature 4 (Agricultural)**.

**Explicitly kept out of scope for all four gates, unless separately approved:**
redesigning listing/school/parcel *detail* pages (`/listing/:id` etc. — confirmed `NOT_DESIGNED`);
enabling a second live city (no code, keep "Soon" placeholders); implementing a Schools cluster
state unreachable with current data.

---

## Feature 1 — Unified Discover shell

**Max: 1 PR.**

1. **User outcome.** A user can pick a city, switch Buy/Rent, jump directly to any known area by
   name, switch between Areas/Schools/Agricultural modes, see a consistent breadcrumb for whatever
   hierarchy level they're at, and use the whole shell on both desktop and mobile with a keyboard
   or screen reader — before any journey's own content is re-skinned.
2. **Complete user journey.** Land on `/discover` → see city + Buy/Rent + mode selector + (empty)
   breadcrumb → switch city (or see "Soon" for unavailable cities) → switch Buy/Rent → type into
   the area-jump autocomplete and land on a canonical state → switch mode (Areas/Schools/Agri) and
   see the breadcrumb reset appropriately → resize/reload the browser and confirm the shell
   persists → do all of the above on a ≤820px viewport with the stacking sheet
   `[SUPERSEDED — see "SUPERSEDED — mobile shell design" note above; shipped as a List-first
   Map/List toggle, not a proportional stacking sheet]`.
3. **Included frozen-design state IDs.** `shell-city-switcher-open`, `shell-area-autocomplete-open`,
   plus the shared chrome (control bar, mode selector, breadcrumb frame, responsive shell) that
   every other state's screenshot shows but which is *this* feature's surface, not the journeys'.
   `areas-city-default-mobile` and `areas-area-listings-mobile` are included **only** for their
   shell-infrastructure aspects (the `~42%`-height map band, grab-handle sheet
   `[SUPERSEDED — see "SUPERSEDED — mobile shell design" note above; shipped as a List-first
   Map/List toggle]`, `<560px` grid
   collapse mechanism) — the Areas-specific *content* inside that shell is Feature 3's job, and
   Feature 3 re-verifies its own mobile acceptance using this infrastructure. **Acknowledged
   boundary leak (after adversarial review):** because no `≤820px` breakpoint exists in production
   today ([02](02-production-baseline-audit.md) §A.16), Feature 1 is not restyling an existing
   mobile container — it is defining the stacking sheet's real layout contract (padding, scroll
   ownership, grid-collapse rules) for the first time. If Feature 2/3/4 content doesn't fit that
   contract once built against it, the required adjustment is a small, named contract-compliance
   fix credited to whichever feature discovers the gap — it is **not** treated as a Feature 1
   regression, and it does not reopen Feature 1's sign-off.
4. **Existing production functionality being retained.** `CitySelect.tsx` (city switch),
   Buy/Rent toggle (already in URL state per [03](03-functional-parity-matrix.md) Part B),
   `JourneySwitcher.tsx` (mode switch), `useDiscoverUrlState.ts`'s full param vocabulary and
   push/replace discipline (unchanged), `derivePanelContent()`'s URL-derived panel switch
   ([02](02-production-baseline-audit.md) §A.6), the ReTrends HSL design-token system
   ([02](02-production-baseline-audit.md) §A.18).
5. **Missing functionality being introduced.** A single global, mode-aware, city-scoped area-jump
   autocomplete replacing the disconnected `ScopedSearch`/`CitySelect` pair
   ([03](03-functional-parity-matrix.md) row 9, Part C item 5) per decision D-Shell-1; the `≤820px`
   proportional stacking-sheet shell ([03](03-functional-parity-matrix.md) rows 19–20, Part C item
   6) `[SUPERSEDED — see "SUPERSEDED — mobile shell design" note above; shipped as a List-first
   Map/List toggle, not a proportional stacking sheet]`; `role="tablist"`/`role="tab"` semantics + visible focus rings for the mode selector
   ([01](01-frozen-design-audit.md) Phase 2/3 a11y intent).
6. **Backend/data changes.** None. This feature is entirely frontend/shell — no endpoint, schema,
   or migration work. (Confirms [03](03-functional-parity-matrix.md)'s classification of the
   control-bar/mode-selector/breadcrumb-frame capabilities as VISUAL-ONLY-CHANGE or
   MISSING-FRONTEND, never MISSING-BACKEND.)
7. **Frontend changes.** Per **D-Shell-3 (resolved)**: implement the Discover-scoped React context
   façade over the existing URL-derived state — the URL stays the canonical source of truth, no
   duplicate state store; the façade exposes shell state/actions to shell and journey components,
   reducing `MapDiscovery.tsx`'s prop drilling ([02](02-production-baseline-audit.md) §A.2)
   incrementally without a full rewrite. Features 2–4 all consume this façade. Then:
   new unified control-bar component (city + Buy/Rent + area-jump) replacing the current separate
   widget composition; new global autocomplete component (`role="listbox"`/`option`, city-scoped,
   mode-aware action label per [01](01-frozen-design-audit.md) Phase 2's confirmed "Hebbal · North ·
   Bangalore · View schools →" pattern); breadcrumb restyle to the pill+chevron pattern, rendering
   only hierarchy levels that exist **today** (no cluster crumb — that's Feature 3's job once the
   cluster tier exists); mode-selector restyle to `tablist`/`tab` cards with the check-badge
   selection pattern; the `≤820px` stacking-sheet shell replacing the hard `h-64` mobile band
   `[SUPERSEDED — see "SUPERSEDED — mobile shell design" note above; shipped as a List-first
   Map/List toggle with real map unmount on List, not a proportional stacking sheet]`.
8. **Map/geospatial changes.** None beyond what the stacking sheet requires (the map pane resizes
   to `~42%` height on mobile; no new map logic, camera behaviour, or marker layer changes).
9. **URL and restoration behaviour.** No new params and no changes to push/replace discipline —
   this feature must prove the *existing* `useDiscoverUrlState.ts` contract survives untouched:
   city/Buy-Rent/mode switches still push, viewport still debounce-replaces, refresh/Back/Forward
   still rehydrate the shell exactly as before the re-skin.
10. **Desktop acceptance.** Visually matches `shell-city-switcher-open` / `shell-area-autocomplete-open`
    at 1366×768; control bar, mode selector, and breadcrumb render and behave identically across
    all three modes; autocomplete resolves to the correct canonical URL per mode.
11. **Mobile acceptance.** At 390×844: `~42%`-height map band with grab-handle sheet
    `[SUPERSEDED — see "SUPERSEDED — mobile shell design" note above; shipped as a List-first
    Map/List full-screen-overlay toggle]`, single-column
    layout below 560px, all shell controls (city/mode/autocomplete/breadcrumb) usable via touch
    with no horizontal scroll or clipped controls.
12. **Accessibility acceptance.** Mode selector exposes `role="tablist"`/`role="tab"` +
    `aria-selected`; autocomplete exposes `role="listbox"`/`role="option"` with full keyboard
    navigation (arrow keys, Enter, Escape); visible focus ring on every interactive shell element;
    `jest-axe` (Vitest) + `@axe-core/playwright` (E2E) smoke tests pass with zero violations on the
    shell — this is the first time either tool exists in the repo ([04](04-testing-quality-gates.md)
    finding 5), stood up here because every later feature reuses it.
13. **Loading, empty and error handling.** Per the resolved shell defaults (Correction 11): the
    shell frame, controls, and map container remain stable while panel data loads — only the
    relevant panel body is skeletoned (per `DESIGN_INTENT.md`'s explicit guidance); panel-data
    failures are panel-local and retryable; per **D-Shell-2 (resolved)**, a deep-link to
    unavailable data resolves to the nearest valid canonical ancestor (city root only when no
    lower ancestor resolves) with a non-blocking notice, never a blank or error screen; a map-tile
    failure leaves the panel fully usable with an inline "map unavailable" state.
14. **Security considerations.** None beyond existing — no new data exposure surface; the
    autocomplete only searches already-public area names within the active city.
15. **Unit/component tests.** New Vitest specs for the unified control bar, the autocomplete
    (keyboard nav, mode-aware label, resolution to canonical URL), the restyled mode selector
    (`tablist`/`tab` semantics), and the stacking-sheet shell's breakpoint behaviour.
16. **Backend integration tests.** None (no backend change in this feature).
17. **Real-data E2E journey (Correction 10 — the earlier "switch city" step overclaimed, since
    only one city is live and second-city enablement is out of scope).** One end-to-end spec
    against a live backend covering: open `/discover` → open the city selector → **confirm
    Bangalore is selected** → **confirm unavailable cities display as disabled/"Soon"** →
    **attempt interaction with a disabled city and confirm URL and application state do not
    change** → switch Buy/Rent → use the area autocomplete → select a real area → land on
    canonical URL → switch mode → confirm breadcrumb reset → verify refresh/Back/Forward → repeat
    the core interactions on mobile. The spec does **not** claim real cross-city switching is
    tested while only one city is live. Extends the existing `discover-real-data-smoke.spec.ts`
    model (real `expect()`s, no `page.route()` mocks, asserts on absence of 401/403).
18. **Visual comparison states and viewports.** `shell-city-switcher-open`,
    `shell-area-autocomplete-open` at 1366×768 and 390×844 — these become the first Playwright
    `toHaveScreenshot` baselines this repo has ever had ([04](04-testing-quality-gates.md) gate #6),
    since no visual-regression tooling exists yet.
19. **Rollout/rollback.** Pure frontend change behind no flag (URL contract unchanged, so no
    coordinated rollback risk); revert is a plain single-PR revert if the re-skin regresses
    existing shell behaviour. **Caveat (still true under the resolved D-Shell-3):** once Features
    2–4 build against the new context façade, a revert of Feature 1 is no longer trivial for
    whichever later feature has already landed — Feature 1's sign-off (item 21) records this
    trade-off explicitly rather than assuming it away. (The façade being a thin layer over the
    unchanged URL contract keeps this risk bounded: reverting it restores prop-drilling, not a
    different state model.)
20. **Explicit non-goals.** No journey content (Areas/Schools/Agricultural panels) is re-skinned in
    this feature (see item 3's acknowledged boundary-leak note for the one exception); no cluster
    breadcrumb level (doesn't exist yet); no cross-city autocomplete (per D-Shell-1); no backend
    change of any kind.
21. **Sign-off checklist.** Unit + a11y + E2E all green; visual match confirmed at both viewports
    against the frozen design; URL/Back/Forward/refresh confirmed unchanged via E2E; **D-Shell-3's
    state-access decision documented and confirmed workable for Features 2–4 to build against; both
    new testing-tool categories (a11y, visual-regression) confirmed actually working — not just
    "installed" — via their own passing smoke tests, graded as a distinct checklist line from shell
    functionality itself**; existing
    production shell capabilities (city switch, mode switch, Buy/Rent, breadcrumb-for-existing-levels)
    confirmed preserved; explicit user sign-off given before Feature 2 implementation starts.

---

## Feature 2 — Schools journey

**Max: 1 PR.** This is the safest first *journey* to fully re-skin — [03-functional-parity-matrix.md](03-functional-parity-matrix.md)
Part D confirms Schools has zero backend gaps and zero structural refactor needs across its entire
stack.

1. **User outcome.** A user can go from picking a city, through a direction and area, to searching
   and filtering schools, selecting one, choosing a search radius, and seeing homes near that
   school — entirely at Discover V2 visual parity, on desktop and mobile.
2. **Complete user journey.** City → Direction → Area → Search/filter schools → Select school →
   Select radius (3/5/10 km) → View homes near school. Matches the user's required journey
   description verbatim.
3. **Included frozen-design state IDs.** `schools-city-default`, `schools-region-areas`,
   `schools-area-schools`, `schools-school-search`, `schools-homes-near`.
4. **Existing production functionality being retained.** The entire Schools stack, confirmed
   fully built end to end in [02](02-production-baseline-audit.md) §A.10, §B.9, §C.3:
   `JourneySwitcher` entry, `SchoolBrowsePanel` → `SchoolGroupAreasPanel` → `SchoolsInAreaPanel` →
   `SchoolSelectedPanel` drill-down, `useSchoolListings.ts` (anon → public radius endpoint, authed
   → filtered), `SchoolMarkerLayer` + `SchoolRadiusMapOverlay` + `SchoolCircle` panner components,
   the `radiusKm` URL param, board/level filter chips, haversine distance-sorted "homes near
   school" grid, and `SchoolController`'s full public API (`/search`, `/nearby`, `/popular`,
   `/by-area`, `/{id}`). **Explicitly confirmed retained (shared components, named here rather than
   assumed inherited from Feature 3):** `PropertyCard`'s listing-card rendering, anon price-band
   coarsening, and favourites (`useSavedListings.ts`) inside the "homes near school" grid; map/panel
   bidirectional hover/select sync for school markers.
5. **Missing functionality being introduced.** Purely visual: `role="tablist"` compass-in-Schools
   styling, plum accent application, plum dashed radius-circle overlay styling, compact
   board/level filter-chip presentation, school-row and homes-grid restyle. **One real functional
   gap to close, not purely cosmetic:** `useSchoolListings.ts:97-104` currently hard-codes
   `trustBadge: null` for authenticated school-first cards, and `MarkerPopoverCard.tsx` renders no
   trust badge at all ([02](02-production-baseline-audit.md) §A.12) — wire the same trust-badge
   logic `PropertyCard.tsx` already uses correctly, rather than re-skinning over a known-broken
   badge.
6. **Backend/data changes.** None. Confirmed zero backend gap for Schools
   ([02](02-production-baseline-audit.md) §C.3, [03](03-functional-parity-matrix.md) Part D).
7. **Frontend changes.** Re-skin of `SchoolBrowsePanel`, `SchoolGroupAreasPanel`,
   `SchoolsInAreaPanel`, `SchoolSelectedPanel`/`AreaSchoolCombinedPanel`; fix the `trustBadge: null`
   gap in `useSchoolListings.ts`; add a trust badge to `MarkerPopoverCard.tsx`. No hook, URL-param,
   or data-fetching logic changes otherwise.
8. **Map/geospatial changes.** Visual only: plum dashed-circle styling for the radius overlay.
   `SchoolMarkerLayer`/`SchoolZoneLabelLayer`/`SchoolFocusPanner` logic is unchanged
   ([02](02-production-baseline-audit.md) §B.9).
9. **URL and restoration behaviour.** No new params; `radiusKm`, `schoolId`, `journey=school-first`,
   `areaKey`/`region` continue to drive restoration exactly as today. E2E must confirm refresh/Back
   restores the exact selected-school + radius + area state.
10. **Desktop acceptance.** Matches all 5 Schools states at 1366×768, including the plum
    dashed-circle radius overlay and distance-sorted homes grid.
11. **Mobile acceptance.** All 5 Schools states re-verified inside Feature 1's mobile shell
    `[SUPERSEDED wording — see "SUPERSEDED — mobile shell design" note above; the shell is a
    List-first Map/List toggle, not a "stacking sheet"]`
    at 390×844 — this is where Feature 2 proves the shell infrastructure actually works for real
    journey content, not just the empty shell.
12. **Accessibility acceptance.** Board/level filter chips and radius-selector chips are keyboard
    operable with visible focus; school rows and homes-grid cards meet the same a11y bar
    established in Feature 1 (reusing its `jest-axe`/`@axe-core/playwright` setup, not standing up
    new tooling).
13. **Loading, empty and error handling.** School-search-no-results, area-with-no-schools, and
    radius-with-no-homes-nearby states get an explicit empty-state treatment (reusing the existing
    `emptyStateCopy.ts` pattern per [02](02-production-baseline-audit.md) §A.15); a school-fetch
    error gets panel-local error+retry.
14. **Security considerations.** None new — the anon public radius endpoint's existing
    anon/authed split is unchanged; the trust-badge fix must confirm it still only ever surfaces
    the public `verified`/`trusted`/`listed` words, never the internal A–D grade
    ([02](02-production-baseline-audit.md) §A.12).
15. **Unit/component tests.** New/updated Vitest specs for each re-skinned panel and the
    trust-badge fix in `useSchoolListings.ts` and `MarkerPopoverCard.tsx`.
16. **Backend integration tests.** None required (no backend change).
17. **Real-data E2E journey.** One full-journey spec against a live backend: City → Direction →
    Area → school search/filter → select school → change radius 3→5→10 km → confirm homes-near-school
    grid updates → refresh → confirm full state restores. Extends the existing ~11 Schools E2E
    specs' DOM assertions rather than replacing them.
18. **Visual comparison states and viewports.** All 5 Schools state IDs at 1366×768 and 390×844,
    added to the `toHaveScreenshot` baseline set from Feature 1.
19. **Rollout/rollback.** Pure frontend re-skin + one small hook fix; single-PR revert if regressed.
20. **Explicit non-goals.** No Areas or Agricultural content; no backend change; no new URL params;
    no Schools cluster-level state (kept out of scope per the decision-gates section above — not
    reachable with current data).
21. **Sign-off checklist.** Unit + a11y + E2E green; visual match at both viewports; URL/Back/Forward/
    refresh confirmed; trust-badge fix verified to only ever expose public grade words; existing
    Schools capabilities confirmed preserved; explicit user sign-off before Feature 3 starts.

---

## Feature 3 — Areas journey

**Max: 2 PRs**, because a backend/data-enablement boundary is unavoidable: the recursive hierarchy
cannot honestly render anything until it is generated, validated, and promoted server-side. **Both
PRs are one feature — PR A is not independently signed off as a completed Areas experience; only PR
B's end-to-end proof closes this gate.**

### Approved hierarchy model (this revision)

`City → primary directional region → zero or more nested local directional clusters (a cluster may
contain sub-clusters, up to a policy-bounded max depth) → canonical area → listings`. Depth is
**adaptive per city**, never hardcoded: Hubli might be `City → North → Vidya Nagar → Listings`
(zero cluster levels); Bangalore's densest region might be `City → North → Thanisandra & R.K. Hegde
Nagar → Hebbal & Nagawara → Hebbal → Listings` (two cluster levels); Mumbai/Delhi may need a third.
**The frontend never hardcodes depth by city — the backend-generated model declares it via an
explicit `nextLevelType` on every navigation response** (see the typed API below).

### Why the split is unavoidable

The recursive tree is 100% net-new — no table, no generator, and (confirmed by direct
investigation) **no existing tree/hierarchy pattern anywhere in this codebase** to extend (the only
self-referential FK in the entire schema is `city_launch_revision.superseded_by`, a linear
supersession chain, not a navigation tree). A frontend re-skin cannot honestly proceed against a
tree that doesn't exist yet, or against a generation algorithm whose thresholds aren't yet
policy-defined. The data/hierarchy enablement — generation, validation, City Launch Preview
extension, and promotion — has to land, be previewed, and be approved first, as its own PR, before
the visual/UX work is built against a stable, approved contract.

**What PR A enables:** a single, versioned, queryable recursive navigation tree, previewable and
approvable through an extended City Launch Preview, that PR B's frontend can render against without
the ground shifting later. **Why it is not an independent product sign-off:** PR A ships no visible
change to end users — it is invisible outside the admin-only City Launch Preview and the raw API.
A shopper cannot "use" PR A. **How PR B proves the complete feature:** PR B is the only PR where a
real user can walk City → Region → (zero or more clusters) → Area → Listings end to end, at any
depth, and see it at design parity; it is graded against the full 21-item structure below, and
Areas is not considered done until PR B passes every item.

### Areas PR A — Recursive hierarchy: generation, validation, preview, promotion

**1. User outcome (of this PR alone).** None directly visible to a shopper — this PR exists so PR
B can be honest. An **admin**, however, gets a real outcome: the extended City Launch Preview lets
them see, navigate, search, and approve a city's full recursive hierarchy before it ever reaches
production.

**2. Complete user journey enabled (not yet exposed to shoppers).** For any prepared city revision,
the backend can answer: the complete tree from region down through every cluster level to canonical
areas; for any area, its complete active ancestry; for any node, its direct children, structural
descendant-area count, and bounds — all generated once at preparation time, never recomputed per
request. (Live listing counts come separately from the count service, per Correction 1 — never
from the hierarchy itself.)

**3. Included frozen-design state IDs prepared for (not rendered yet).** `areas-region-clusters` —
now generalized from "one flat cluster level" to "however many recursive cluster levels this city's
approved policy actually produces."

**4. Existing production functionality being retained.** The legacy `area_groups` read path and the
existing flat `city_regions`/`city_region_memberships` (region-only, non-recursive) stay live and
untouched until PR B cuts over — no regression risk to current production Discover during PR A.
The existing City Launch Preview's prepare→validate→promote lifecycle, admin API surface, and
sandbox-mirror/checksum pattern are extended, not replaced (see item 6).

**5. Missing functionality being introduced.**
- **Confirmed unblocked (direct investigation, this revision) — no longer a risk to scope around:**
  the sandbox→production promotion mechanism this PR needs already exists and is tested end to end
  (`CityLaunchPromotionService.launch()`, `CityLaunchPromotionServiceIT`,
  `AdminCityLaunchLaunchControllerIT`) — PR A extends this proven pattern with one new table pair,
  it does not build promotion from scratch. The V118 migration header's "promotion is PR8+" comment
  is confirmed stale documentation, not a gap.
- Per **D-Areas-6**: #1910 stays live as a narrow compatibility layer for its original bounded use
  case; the new typed navigation API below is the general recursive-traversal contract, not an
  extension of #1910's flat DTO.
- Per **D-Areas-7**: a deterministic, policy-driven recursive generation algorithm (not a
  hardcoded threshold) — see "Hierarchy generation algorithm" below.
- A real recursive data model (see "Recursive data model" below), replacing the previously-proposed
  flat `city_region_clusters` table with a genuinely self-referential tree.
- A typed navigation API and an ancestry-resolver endpoint (see "Typed navigation API and ancestry
  resolution" below).
- An extended City Launch Preview with a hierarchy-tree view, a real-Discover-UI preview journey
  against sandbox data, direct-search ancestry validation, a revision diff, a validation report, and
  a controlled override mechanism (see "City Launch Preview extension" below).
- The application-level hierarchy cache: eager startup preload of all public-active cities'
  promoted graphs, readiness gating, promotion-event + safety-poll refresh with atomic pointer
  swap, single-flight request fallback, preview-cache isolation, and the separated short-TTL
  dynamic-count cache (see "Hierarchy loading & caching architecture" below) — all inside this PR,
  no separate caching/infrastructure PR.

**6. Backend/data changes — Recursive data model.** Investigated three options
(adjacency-list-plus-recursive-CTE, adjacency-list-plus-closure-table, materialized-path/`ltree`)
against this repo's actual write/read profile (writes only at city-prep/regeneration time; reads
dominated by "direct children of a node" and "complete ancestry of an area," both cheap at the
expected shallow depth, ≤4-5 levels). **Chosen: adjacency list with denormalized `depth` and
`ancestor_keys`, plus node-materialized **structural** values (`descendant_area_count`, bounds — no
live listing counts, see Correction 1 note below)** — computed once at generation time
(matching the existing `city_regions` materialize-at-generation precedent and the #1745
backend-owned-counts decision), so the hot Discover read path is a flat indexed lookup, not a
recursive query. Closure table and `ltree` were rejected: a closure table's only advantage (O(1)
deep reads) is already captured by the materialized ancestry/counts, and neither this codebase nor
Postgres config here has any existing tree-extension precedent to justify the added machinery.

**Corrections after adversarial review, applied to the model above:**
- **Ancestor array stores stable `node_key`s, not surrogate `id`s.** The original sketch proposed
  `ancestor_ids BIGINT[]` referencing surrogate PKs — but promotion copies sandbox rows into
  production, and nothing in this plan guarantees sandbox and production `id` values coincide (an
  identity/autogenerated PK would make a copied ID array silently reference the wrong rows). Using
  the natural, deterministically-derived `node_key` (stable because it's derived from ancestry +
  representative-area choice, not from an autogenerated counter) avoids this class of bug entirely
  and is consistent with this repo's existing preference for natural keys (`area_key`, `region_key`)
  over surrogate ones at the geography layer.
- **The composite self-FK needs an explicit unique constraint to be valid Postgres**, which the
  original sketch omitted: `(city_id, parent_node_id) REFERENCES navigation_nodes (city_id, id)`
  requires `UNIQUE (city_id, id)` on the referenced table (a bare `PRIMARY KEY (id)` does not
  satisfy a composite FK). This must be added to the actual migration.
- **Correction 1 (approved): `navigation_nodes` contains structural geography ONLY — no live
  `listing_count` column.** An earlier draft was internally contradictory: it materialized
  `listing_count` on the node at generation time while also (correctly) requiring live counts to
  stay outside the immutable structural graph. **Resolved: the node may carry stable structural
  values only** — identity, type, parent, depth, ancestry, representative areas, display
  label/order, centroid, bounds, **`descendant_area_count`** (a structural count of unique
  canonical areas beneath the node, listing-independent), policy fingerprint, and revision
  metadata. Live listing counts come exclusively from the separate short-TTL count service (see
  "Dynamic counts" below): area-level count query → canonical area counts → rolled up through the
  cached descendant-area membership into cluster/region totals. The partial unique index (one AREA
  node per canonical area) prevents duplicate area *nodes*; count double-counting is prevented at
  the count-service roll-up layer by aggregating from unique canonical leaf areas — captured by the
  roll-up tests in "Required tests" below.
- **A btree index on `(city_id, region_key, parent_node_id, display_order)` is required** for the
  "direct children of a node" read to actually be the flat indexed lookup this section claims —
  this was implicit in the original sketch's index list but is called out explicitly here since it
  is load-bearing for the stated performance claim.
- New production table `navigation_nodes` (`id`, `city_id`, `region_key`, `node_type` CHECK IN
  `('CLUSTER','AREA')`, `parent_node_id` nullable self-FK scoped by composite `(city_id, id)` with
  its required `UNIQUE (city_id, id)` constraint so cross-city parenting is impossible at the DB
  level, `node_key` (**the stable public identity — see Correction 2 below**), `area_key` nullable
  FK → `areas`, `representative_area_key`, `display_label`, `display_order`, `depth`,
  `ancestor_keys TEXT[]`, `descendant_area_count` (structural, listing-independent — per Correction
  1, **no** `listing_count` column), `centre_lat`/`centre_lon`/bounds as `NUMERIC` (matching
  `city_regions`' existing convention), `policy_fingerprint`, `generated_at`), plus a
  `sandbox_navigation_nodes` mirror scoped by `revision_id` — following the V118 sandbox-table
  pattern column-for-column. **Table-count correction (after adversarial review
  — the original draft was internally inconsistent, calling this both a "sixth" and "seventh"
  table in different places): `CityLaunchPromotionService.launch()` today promotes six tables
  (`areas`, `area_alias`, `city_regions`, `city_region_memberships`, `area_groups`,
  `area_group_members`); `sandbox_navigation_nodes → navigation_nodes` extends this to a
  seventh.** DB-level invariants as CHECK constraints and one `BEFORE INSERT/UPDATE` trigger (AREA
  nodes must be leaves) mirroring the existing V119 trigger style. Set-level invariants (no cycles,
  no one-child clusters, `descendant_area_count` = count of unique descendant AREA nodes (a
  structural check, per Correction 1 — not a listing-count check), representative-area
  membership, single-active-path completeness) are **service-validated at prepare/validate time**,
  surfaced as new boolean flags extending V120's existing validation checklist — promotion is
  blocked exactly like today's five checks until these pass too. **DB-level CHECK/trigger
  invariants must be a strict subset of what service-level validation already checked** (added
  after adversarial review) — i.e. a row should never be rejected by a DB constraint at promotion
  time for a reason the admin's approved preview never surfaced; if a new DB constraint is added, a
  corresponding service-level validation check must exist and run first, in preview.

**Promotion is a modification to a shipped critical path, not purely additive work (added after
adversarial review).** The schema itself (`navigation_nodes`, `sandbox_navigation_nodes`) is
additive, but extending `CityLaunchPromotionService.launch()`'s single `@Transactional` method to a
7th table changes its lock-acquisition order, checksum set, and CAS sequence — a bug in the new
navigation-node promotion step would abort the whole transaction, **rolling back an otherwise-valid
promotion of the existing six tables too.** Required before this PR ships: (a) a characterization
test proving the existing six-table promotion path is byte-unchanged by this extension, run
alongside the new seventh-table test, not instead of it; (b) explicit placement of the new table in
the existing ascending-key lock order (`CityLaunchPromotionService.launch()` already locks in
ascending-key order across its six tables — the seventh must be assigned an explicit position in
that order, not appended arbitrarily).

**Hierarchy generation algorithm.** A deterministic recursive process, conceptually:
`generateNode(parent, memberAreas, depth)` → if the member areas are usable as direct children,
emit them as canonical-area leaves and stop; otherwise deterministically partition `memberAreas`
into candidate clusters; if the partition isn't meaningful (would produce a one-child split, or
clusters below a minimum area count), fall back to canonical-area leaves instead; otherwise emit
cluster children and recurse into each.

**Algorithm family named explicitly (added after adversarial review — the original draft left the
partition step itself, the actual hard problem, completely unspecified, deferring only numeric
thresholds).** Standard geometric clustering families are a poor fit for the plan's own
determinism requirement: k-means requires seeded/randomized initialization, and R-tree-style
bulk-loading is insertion-order-dependent — neither reliably reproduces the same tree from the
same inputs. **Recommended family: deterministic recursive geometric bisection** — split
`memberAreas` by geometric median or longest-axis on centroids, with inputs pre-sorted by a fixed
total order (e.g. `area_key` lexicographic) before any split so ties never depend on iteration
order. A grid/quadrant-based partition is an acceptable alternative with similar determinism
properties; both were preferred over agglomerative/graph-merge approaches specifically because the
latter need an explicit, fully-specified merge order to stay deterministic, which is extra
machinery bisection/grid don't require. **Choosing between bisection and grid-based partitioning,
and which of the properties below each can natively express, is itself part of Areas PR A's design
task — not a detail to invent inline in this document, and not merely a matter of picking numeric
values for an already-chosen method.**

**Every threshold this needs — max direct-area children before subdividing, minimum clusters per
split, minimum areas per cluster, prevention of one-child splits, maximum safety depth,
spatial-compactness and sibling-separation rules, outlier treatment, Centre-region treatment,
deterministic display ordering, representative-area selection, stable label derivation — is a
policy value (extend `city_region_policy`), not a code constant.** Per D-Areas-7, this plan does
**not** pre-select "5 areas" or "8 areas" — that decision requires geography-grounded, UX-tested
calibration against real city data before Areas PR A's generation work is considered scoped, and is
tracked as its own design task inside PR A, not invented inline.

**Representative-area tie-breaking (added after adversarial review).** "Representative-area
selection" being a policy *value* (e.g. "most central") is not by itself sufficient for the
stated determinism guarantee — real geography can produce ties (two areas equally central within a
cluster). **A fixed total order (lexicographic `area_key`) breaks any tie deterministically**,
applied after the policy's primary selection metric; this must be specified alongside whatever
centrality/size metric the policy ultimately picks, not left implicit.

**Generation inputs are exclusively approved city geography** — city boundary/reference point,
canonical areas and their centroids/bounds, aliases, adjacency, existing manual overrides, and the
generation-policy version. **Listings are usable only for preview-time informational counts; they
must never determine cluster membership, hierarchy depth, representative-area names, cluster
identity, or cluster labels** — this is a hard constraint carried through as a service-level
guarantee, tested explicitly (see test list below, including the strengthened
listing-inventory-independence test). Zero-listing canonical areas still participate in the
hierarchy as real leaf nodes. Regeneration with identical inputs, policy, and overrides must be
**deterministic** — same tree, same labels, every time. **This determinism claim also needs a
geometric-near-tie test, not just the listing-count test (added after adversarial review):** a
regeneration-idempotency test run against real (not synthetic) city geometry, specifically
constructed to include areas near-equidistant from a candidate split boundary, is required in
"Required tests" below — floating-point summation order or library version changes can flip a
near-tie output even when the listing-count-independence test passes cleanly.

**Cluster naming.** Generated cluster labels use one or two geographically representative real
canonical-area names (e.g. `Hebbal & Nagawara`, `Thanisandra & R.K. Hegde Nagar`), derived from
persisted `representative_area_key`(s) chosen by the generator — never from live listing counts,
and never invented marketing/corridor names.

**Typed navigation API and ancestry resolution.** Investigated three API shapes (per-level
endpoints extending today's `/regions`/`/regions/{regionKey}/groups` pattern; one mega-endpoint
that also resolves search; a hybrid). **Chosen: a hybrid** —
`GET /api/discover/cities/{city}/navigation/{nodeKey}` (a reserved `root` token returns the city's
top level) returning the current node, its type, depth, complete ancestry, an explicit
`nextLevelType` enum (`CLUSTER | AREA | LISTINGS` — **the frontend never infers the next level from
array size, depth, or absent fields**), direct children, structural `descendant_area_count`s and
bounds (no live listing counts — per Correction 1, those come separately from the count service);
plus a separate authoritative resolver,
`GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path`, returning the exact same
`ancestry[]` shape for a canonical area, from the **same promoted revision and the same underlying
tree** guided drill-down reads — so direct-area search **never** reruns the clustering algorithm,
searches through every cluster, or infers ancestry from labels/counts/map position.
**Correction 2 (approved) — the public API and URL identity is the stable natural `node_key`, not
the surrogate database `id`.** The surrogate `id` remains internal to the database where useful;
every public surface — path parameters, URL `node=` values, React Query keys, ETags — uses
`node_key`, which is deterministically derived by the generator (for AREA nodes it incorporates or
maps directly to the canonical `area_key`; for CLUSTER nodes it is derived from ancestry +
representative-area choice). This makes stale-link recovery natural instead of requiring any
historical surrogate-ID lookup. Per-level
endpoints were rejected because variable depth means a fixed set of per-level endpoints would
re-encode "how many levels" into the API shape — exactly the constraint this feature must avoid.
Both endpoints follow this repo's existing DTO conventions (flat records, city-first field,
`@JsonInclude(NON_NULL)`, `permitAll` anon access matching today's `/api/discover/*` surface).

**Caching-window correction (added after adversarial review).** The original draft gave both
endpoints the same `Cache-Control: public, max-age=120` and separately claimed the two always
return "byte-identical" ancestry. Two independently-cached HTTP responses with the same TTL are
**not** guaranteed identical across a live promotion boundary — a CDN/browser can serve a
90-second-old `navigation-path` response alongside a freshly-fetched `navigation/{nodeKey}` response
right after a promotion, which is exactly the "same underlying tree" claim breaking in practice,
not just in theory. **Fix: key both endpoints' cache by the current promoted `revision`** (e.g.
include the revision identifier in the `Cache-Control`/`ETag` or vary the cache key on it), so a
promotion invalidates both endpoints' caches together, not independently. The "byte-identical
ancestry" sign-off claim should be understood as a data-model guarantee (both reads hit the same
promoted rows) that still needs this cache-key fix to hold true end-to-end, not just at the
database layer.

**Public-identity stability — resolved by Correction 2 (superseding an earlier, more complex
"stale surrogate-nodeId re-resolution" scheme).** Because the public identity is the deterministic
natural `node_key` — not a surrogate ID that regeneration can reassign — the routine case (a
policy recalibration bumping the revision while the geography is unchanged) leaves every shared or
bookmarked URL valid automatically: the same `node_key` simply resolves in the newly-promoted
revision. Stale-link behaviour is now a simple three-step ladder:
1. the `node_key` still exists in the promoted revision → resolve it there directly;
2. a CLUSTER `node_key` no longer exists (the partition genuinely changed) but the link's
   canonical-area target is known → resolve through the canonical `area_key` to the area's current
   position in the new tree;
3. the target geography genuinely no longer exists → fall back to the **nearest valid ancestor**
   (consistent with D-Shell-2's approved deep-link rule), or city root only if no lower ancestor
   resolves, with a non-blocking notice — never a blank or error screen.
No historical lookup from an obsolete surrogate ID is ever required, because no surrogate ID is
ever public.

**City Launch Preview extension.** Reuses the real Discover map/navigation components against the
sandbox revision — **no second hierarchy-preview application is built.** New preview capabilities:
(a) a **hierarchy tree view** listing every node's type, stable `node_key`, depth, label,
direct-child count, structural `descendant_area_count`, an informational current listing count
(**merged at display time from the count service against sandbox data — per Correction 1 it is not
stored on the node, not part of the hierarchy checksum, and a count change can never produce a
hierarchy revision, a hierarchy diff, or a cluster rename/restructure**), representative area
names, bounds, and validation status; (b) a **real Discover journey** letting the admin actually navigate
City → Region → Cluster → Sub-cluster → Area → Listings against sandbox data, including zero-listing
areas; (c) **direct-search ancestry validation** — searching an area in the preview must
immediately show its complete breadcrumb ancestry, with every ancestor crumb navigable against
sandbox data, exactly matching the guided-navigation path; (d) a **revision diff** against the
currently-promoted revision (added/removed/moved/renamed nodes, representative-area changes, depth
changes, bounds changes, ancestry changes, policy-version changes) — **a pure listing-count change
must not produce a hierarchy diff**, proving generation genuinely ignores listing inventory; (e) a
**validation report** blocking promotion on: cycles, orphan nodes, duplicate paths, areas with no
path or multiple paths, invalid depth, one-child clusters, invalid representative areas,
cross-revision references, `descendant_area_count` inconsistency (structural — per Correction 1,
listing counts are not validated here because they are not part of the hierarchy), missing bounds,
excessive depth, and any mismatch between direct-search ancestry and guided-navigation ancestry
for the same area. **Honesty
note on this last check (added after adversarial review):** because both resolvers read the same
underlying tree by design, this check mostly validates that both endpoints' *implementations*
correctly query `ancestor_keys` rather than proving an independent domain invariant — it is still
worth keeping as a regression guard against a future refactor that lets one resolver take a
shortcut (e.g. inferring ancestry from labels, which item under "Typed navigation API" above
explicitly forbids), but should not be presented as proof the tree itself is structurally sound —
the cycle/orphan/duplicate-path checks earlier in this list carry that weight.

**Manual correction strategy (Correction 7 — approved simplification).** A **controlled override
mechanism**, not a free-form drag-and-drop hierarchy editor and not an elaborate first-release
editing suite. **Initial supported operations, and nothing more:** approve; reject; regenerate
with a changed policy; move a canonical area to a different parent; change representative-area IDs
(and the resulting display label); exclude or reassign a genuine outlier where the existing
override model supports it. **Explicitly resolved (superseding the earlier open question): no
dedicated "merge sibling clusters" UI/action in the first release.** A poor sibling split is
corrected through a policy change + regeneration, or a small number of area-to-parent overrides; a
dedicated merge action is recorded as a later option **only if real launch-preview usage
demonstrates the need** — do not build it speculatively.

**Overrides are persisted as deterministic, versioned generation inputs** (extending the existing
`regional_area_overrides` pattern) that feed back into `generateNode()` on the next run — never
untracked mutations of already-generated output. Every override is versioned, deterministic,
visible in the revision diff, validated before approval, and blocked when orphaned or inconsistent
(below). **Override/regeneration reconciliation (added
after adversarial review — the original draft asserted overrides "survive a regeneration" without
saying what happens when they can't cleanly apply):** a regeneration can legitimately produce a
tree shape where a previously-applied override's target no longer exists (e.g. an override pinning
an area under cluster C7, but a policy change means C7 is no longer produced). **This must be
detected, not silently dropped or silently forced:** an override whose target is missing after
regeneration is surfaced as a **validation-report-blocking condition** ("orphaned override"),
requiring the admin to either update the override or accept the regenerated shape before that
revision can be approved — the same validation-blocks-promotion discipline the rest of this plan
already applies to structural invariants.

**Promotion.** `canonical inputs → sandbox generation → validation → preview → approval →
checksum lock → verbatim promotion`, extending `CityLaunchPromotionService.launch()`'s existing
proven six-table promotion to a seventh (`sandbox_navigation_nodes → navigation_nodes`), in the
same transaction, same checksum-verification-then-CAS pattern already shipped and tested. Promotion
**does not regenerate** — it copies the exact approved sandbox tree verbatim, preserving node
keys, ancestry, labels, ordering, bounds, representative-area IDs, policy fingerprint, overrides,
and validation evidence. A regenerated hierarchy is always a new revision requiring a new preview
and approval — never an in-place mutation of a promoted tree. **Atomicity, stated explicitly (added
after adversarial review):** because the seventh table's promotion joins the same
`@Transactional` method as the existing six, any failure — in any of the seven tables — rolls back
the entire promotion, including the six tables that would otherwise have succeeded; this is the
correct and intended behavior (an all-or-nothing promotion), not an accidental side effect, and is
why the "DB-level invariants must be a strict subset of already-validated conditions" rule above
matters — without it, a newly-added DB constraint could abort an otherwise-valid six-table
promotion for a reason the admin's approved preview never surfaced.

**Hierarchy loading & caching architecture (approved decision, this revision).** The promoted
navigation graph is served from an **application-level hierarchy cache**, not from Postgres on
every navigation click. Approved storage-responsibility split (fixed, not open for redesign):

- **Postgres** — authoritative for city regions, recursive clusters, area leaves, ancestry,
  labels, bounds, revisions, preview, and promotion. OpenSearch must never become the source of
  truth for hierarchy identity, cluster membership, depth, ancestry, breadcrumb labels,
  representative areas, or revision lifecycle.
- **OpenSearch** — listing search, map listings, filters, and dynamic listing-count aggregations
  only. Its enablement remains a deployment/configuration decision, not a blocker: Postgres stays a
  fully supported live listing/count path while `discover.opensearch.enabled` is false (as it is
  today). **Boundary verified clean against the actual code** (direct investigation, this
  revision): the routing layer (`RoutingDiscover{Listings,Markers,Summary}Service`) routes only
  listing data — no OpenSearch-routed path touches hierarchy structure, and the summary path has no
  OpenSearch adapter at all; the OpenSearch listing document carries only a flat `areaKey` (no
  denormalized region/group fields), so the recursive hierarchy requires **no OpenSearch mapping
  change or reindex** as long as `area_key` remains the leaf join key into the Postgres-owned tree
  — which this plan keeps.
- **Application hierarchy cache** — fast, immutable access to the promoted Postgres navigation
  graph, per the lifecycle below.

*Startup preload.* At application startup, every **public active** city's currently-promoted
hierarchy is eagerly bulk-loaded and built into one immutable `NavigationGraph` per city revision
(conceptually: `cityId`, `citySlug`, `revisionId`, `checksum`, `nodesByKey`, `childrenByParentKey`,
`ancestryByNodeKey`, `ancestryByAreaKey`, `descendantAreaKeysByNodeKey`, `boundsByNodeKey` — exact
Java types follow repo conventions), so the first user gets the same cache-hit performance as every
later user. **Keyed by `node_key`/`area_key`, not surrogate IDs (aligned with Correction 2 —
an earlier draft of this sketch was id-keyed and could not have answered a public request without
an unstated key→id lookup):** every public read arrives by `node_key` (navigation) or `area_key`
(ancestry resolver), so the in-memory indices are built on those same natural keys directly.
Surrogate `id`s remain a database-internal detail used for FK integrity during the load, and are
not required to serve any request once the graph is built. The load is **a small fixed number of set-based queries, not N+1 recursion**: one
query for active public cities + their active revision pointers, one query for all
`navigation_nodes` across those revisions ordered by `city_id, depth, display_order`, grouped into
per-city graph builders in memory in a single forward pass (depth ordering lets ancestry/children
maps build without recursion). Not preloaded: disabled/"Soon" cities, superseded revisions,
unapproved sandbox revisions, dynamic listings, dynamic listing counts, filtered result sets.
Per-city bounded retries (3 attempts, exponential backoff with jitter, total startup blocking
capped ~30s) with per-city error logging and validation **before** cache insertion — no partially
built graph is ever exposed to requests. **Size feasibility confirmed** (direct investigation):
Bangalore ≈ 304 canonical areas; a full per-city tree (areas + clusters + regions) is hundreds to
low-thousands of nodes, low single-digit MB in memory across all active cities — comfortably
within the existing container's heap headroom.

*Readiness.* A **custom `HealthIndicator` in the Actuator readiness group** (following the repo's
existing `cityRegionBackfill` named-health-group precedent — a direct precedent found in the code,
not a new pattern) reports the instance ready only when every required public-active-city graph is
loaded and valid. A public-active city's load/validation failure keeps the instance **not-ready**
(traffic not routed); a disabled/"Soon"/preview city's failure logs + emits a metric but does not
block readiness. A `HealthIndicator` (rather than a blocking `ApplicationRunner` gate) is chosen
deliberately: a city that recovers mid-run flips readiness back to UP without a restart, and
liveness stays independent of cache health. The eager preload itself runs in an
`ApplicationRunner` (the repo's established startup-work idiom — several already exist), but the
health indicator, not the runner, gates traffic.

*Cache structure and keys.* Two-tier, both instance-local: (1) a Caffeine cache of **immutable**
graphs keyed `citySlug:revisionId` (e.g. `bangalore:revision-43`) — following the repo's one
existing Caffeine precedent (`CachingDiscoverSummaryService`), never keyed by city slug alone,
because promotion must never mutate an existing graph in place; (2) a separate
concurrent-map **active-revision pointer** per city — the only mutable state. Readers resolve
pointer → graph; they see revision N or N+1 in full, never a half-built graph. No live listing
counts are stored inside the immutable graph. Preview (sandbox) revisions load **on demand** into
a separate preview cache namespace (`discover:preview:navigation:{launchRevisionId}` vs
`discover:navigation:{citySlug}:{revisionId}`) with its own bounded size/TTL — a preview revision
can never replace or invalidate the production active pointer, and the City Launch Preview uses
the **same** `NavigationGraph` builder and navigation services against sandbox rows, not a second
implementation.

*Promotion refresh (restart is manual recovery, never the normal invalidation mechanism).*
Promotion today publishes **no event at all** (confirmed by direct code read — 
`CityLaunchPromotionService.launch()` is a pure DB write with zero cache/notification hooks), so
this PR adds the hook: after the promotion transaction commits, publish a
`CityNavigationRevisionPromoted` Spring `ApplicationEvent` via
`@TransactionalEventListener(phase = AFTER_COMMIT)` (guaranteeing the pointer row is durably
committed before any listener loads), consumed asynchronously by the cache. The mandatory order is
`load → validate → build → atomic pointer swap → retain old revision for a grace period (~120s,
covering in-flight requests and the poll window) → evict old revision` — **never evict-then-load**,
because a load failure must leave the old revision serving, keeping the city available. A failed
refresh logs + metrics and does not swap; recovery is automatic via the poll below. Old-revision
eviction is **time-based after demotion, never memory-pressure-based** for active revisions.

*Multi-instance consistency.* Each instance owns its local cache. The AFTER_COMMIT event covers
the same-process case (promotion and reads run in one deployable today); a **30–60s safety poll**
reading `cityId + activeRevisionId` and refreshing only on mismatch covers missed events and
multiple replicas — modeled on the repo's existing DB-poller precedent
(`AreaRegionReclassOutboxPoller`, the codebase's one proven cross-instance-safe primitive; no
Redis exists anywhere in the dependency tree, confirmed). The poll is the safety net, not the
primary mechanism. No instance ever requires a restart after a city launch or hierarchy
correction. **Rolling-deploy safety:** revision-keyed caching keeps old-code and new-code
instances individually coherent (each serves its own loaded revision; bounded cross-instance skew
is acceptable-by-design) — with one real hazard flagged by review: if a code change alters
graph-build/validation logic, two code versions could build **different graphs from the same
revision rows**. Mitigation: any graph-build-logic change requires a new revision + re-promotion
(never re-interpreting an existing revision), and the graph's schema version is folded into the
validation checksum so an incompatible instance fails readiness rather than silently serving a
divergent tree.

*Request-time fallback.* On a cache miss (newly activated city, evicted entry, missed
notification, preview load, operational recovery): a **single-flight** Postgres load — Caffeine's
`get(key, mappingFunction)` already guarantees at-most-once execution per key under concurrent
misses, with load+validate inside the mapping function (a thrown validation failure is not cached,
so a bad revision cannot poison the key). No additional locking machinery is needed.

*Dynamic counts (OpenSearch/Postgres) — kept strictly outside the structural cache.* Recommended
flow: cached `NavigationGraph` + **one area-level count aggregation for the active city/filter
context** (from OpenSearch when enabled, Postgres otherwise), rolled up in memory from **unique
canonical leaf areas** through the cached hierarchy into cluster/region totals — never one query
per region or cluster, never double-counting (uniqueness comes from the one-AREA-node-per-area
guarantee). **Correction 8 (approved) — a small provider abstraction keeps OpenSearch strictly
non-blocking:** an `AreaCountProvider` interface (exact name per repo conventions) with
`PostgresAreaCountProvider` and `OpenSearchAreaCountProvider` implementations, both returning
counts keyed by canonical `area_key`, with the roll-up logic **shared** above the provider
boundary. The Postgres provider must be production-ready for the Areas launch; the OpenSearch
provider must be implemented and validated (provider-parity tested on identical seeded data)
before OpenSearch is enabled in production; the structural hierarchy is identical regardless of
provider; OpenSearch never stores or owns hierarchy ancestry; and no listing reindex is required
solely because the navigation hierarchy changes. This abstraction lives inside Areas PR A — no
new infrastructure PR. The count result is cached separately with a short TTL (investigate
30–120s against measured update rate/query cost — do not fix the TTL without measuring), keyed by
`city + active hierarchy revision + Buy/Rent intent + normalized filter hash + anon/authed
exposure mode`. **Three implementation-shape corrections from direct code investigation, so this
is scoped honestly:** (a) the current Postgres summary path computes region counts via **three
separate region-granularity GROUP BY queries** (`queryHotspots`, `queryAreaGroupRegions`,
`queryCorridorRegions` in `DiscoverSummaryService`) — the roll-up design **replaces** those with a
single area-level aggregation, it does not wrap a cache around the existing three-query shape;
(b) OpenSearch currently has **no area-level terms-aggregation at all** (only `locality_agg`) — the
area-level aggregation is net-new on the OpenSearch path, not present-but-unused; (c) the
`anon/authed exposure mode` key dimension is **proactive design** — no code-level anon-count
differentiation exists today (coarsening applies to per-listing fields only), so this dimension
initially collapses to one value and exists so a future anon-count-coarsening feature cannot
silently share cache entries. Additionally, the existing `CachingDiscoverSummaryService` (the
repo's one Caffeine cache, revision-unaware, caching whole summary responses on a 120s TTL) must
get an explicit interaction story in this PR: either retire it in favour of the new
revision-aware count cache, or make it revision-aware — it must not silently coexist serving up to
120s of stale pre-promotion counts with no invalidation tie to the hierarchy revision.

*Redis.* **Not required for the first implementation** — Caffeine is sufficient while active
cities are few, graphs are lightweight (confirmed low-MB), startup loading is fast, and each
instance can warm independently. Redis is documented as an optional later L2 only if measurement
shows excessive repeated cold loads across many instances, expensive graph construction, high
instance churn, or a materially large active-city count. Promotion events and active-revision
polling remain required even if Redis is later introduced.

*HTTP and frontend caching.* Revision-aware: `ETag: <revisionId>:<checksum>` (strong validator —
the checksum guards against revision-ID reuse). Active-revision navigation endpoints
(`navigation/{nodeKey}`, `navigation-path`) get **moderate-with-revalidation**
(`max-age≈60, must-revalidate` + ETag → cheap 304s, promotion picked up within a minute) — this
also supersedes the earlier flat `max-age=120` and completes the caching-window fix above.
Explicitly-revisioned immutable responses may use a long-lived `immutable` policy, since a
`citySlug:revisionId` body never changes. React Query keys **must** include
`citySlug + revisionId + nodeKey` (per Correction 2 — the stable public identity, never the
surrogate ID) — a promotion changes `revisionId`, naturally busting every client entry;
**no city-only React Query key may exist**, since it would survive a promotion and serve a stale
tree. **Bootstrapping note:** the navigation URL is keyed only by `nodeKey` (no revision in the
path — that is deliberate, so shared links stay revision-independent), so the client obtains the
current `revisionId` from the first navigation response body and uses it to construct subsequent
query keys; a cold load therefore resolves `nodeKey` first and keys its cache entry once the
revision is known.

*Operational metrics and logging (Correction 9 — tiered so observability never becomes a delivery
blocker).* Micrometer (the repo's confirmed convention — Prometheus registry + `discover.*`
timer/counter naming with percentile histograms already configured). **Required initial metrics
(merge-gating):** hierarchy graph load duration and result
(`discover_navigation_cache_load_seconds` histogram + `_load_total`/`_load_failures_total`),
loaded graph node/area count (`_graph_nodes` gauge), active revision (**gauge value keyed only by
`citySlug` — never revision-as-label**, the classic unbounded-cardinality leak), promotion refresh
success/failure (`_promotion_refresh_total`/`_promotion_refresh_failures_total`), count-provider
query duration and result, and readiness state/reason. **Secondary metrics (add where trivial, do
not delay the feature for them):** cache hit/miss (`_hit_total`/`_miss_total`), request fallback
load (`_fallback_load_total`), poll mismatch
(`discover_navigation_active_revision_poll_mismatch_total`), refresh retry count. Safe labels:
`citySlug` (only while the active-city count remains controlled), `trigger`
(`startup|event|poll|fallback`), `status`/`result`/`provider` (fixed enumerations). Forbidden
labels: node key, area key, arbitrary URL, filter hash, revision, or any unbounded set — revision
appears as a log field or gauge value only. Structured logs (following the repo's plain-SLF4J
`key=value` convention — JSON logging is not an existing convention here) containing: city,
revision, checksum, graph node count, area count, load duration, trigger
(startup/promotion/poll/request-fallback), success/failure reason.

*Performance budgets and merge gates (Correction 6 — approved; supersedes the earlier
measurements-only paragraph).* Final numerical targets stay repository- and environment-based —
no invented SLO numbers — but the process is now enforceable: Areas PR A must (1) capture a
baseline using representative datasets, (2) record the agreed budgets in the PR, and (3) **fail
acceptance if the implementation exceeds them**. Measure and budget at minimum: Postgres query
count during startup warm-up; startup warm-up duration; memory per city graph; total
hierarchy-cache memory; cached hierarchy request latency; request-time fallback latency; promotion
refresh duration; active-revision safety-poll duration; Postgres area-count query latency;
in-memory count roll-up latency; OpenSearch area-aggregation latency when enabled; hierarchy
endpoint response size; browser navigation response time on desktop and mobile. **Explicit merge
gates (pass/fail, not aspirations):**
- a structural hierarchy cache hit performs **zero** hierarchy SQL queries;
- startup uses a fixed set-based query count, never N+1;
- the first routed request after readiness is a hierarchy cache hit;
- a promotion refresh never makes the existing city unavailable;
- a failed refresh leaves the previous revision serving;
- the Postgres fallback count query is inspected with `EXPLAIN ANALYZE`;
- representative **100k, 200k and 500k** listing volumes are assessed through realistic query
  plans or generated benchmark data;
- the count roll-up scales with canonical areas/navigation nodes, **not** with listing volume;
- heap impact stays within an agreed production budget.

*Active-revision pointer — resolved (Correction 4; supersedes the earlier open question).* The
authoritative source of truth is the **existing `city_launch_revision` table** — no new pointer
table. Direct code investigation already confirmed V118's partial unique index
(`uq_clr_current_promoted`) enforces **at most one `lifecycle_status='PROMOTED'` revision per
city**, which is precisely an indexed, guaranteed-unique active-revision lookup:
`SELECT id, ... FROM city_launch_revision WHERE city_id = ? AND lifecycle_status = 'PROMOTED'`.
Promotion already changes it transactionally (the shipped `PROMOTING→PROMOTED` CAS plus
supersession of the prior revision inside `CityLaunchPromotionService.launch()`'s single
transaction), so: the in-memory active pointer mirrors this row; the startup preload's first query
reads it for all public-active cities (joined to `cities`); the 30–60s safety poll re-reads
exactly this indexed lookup and refreshes only on mismatch; and rollback/read-path switching
operates on lifecycle status, not on a duplicate pointer that could drift. A separate pointer
table would be introduced only if implementation uncovers a concrete inadequacy in this model —
none is currently known. **With this resolved, the fixed two-query startup preload claim is
confirmed, not provisional.**

**City launch: operator workflow (Correction 5 — the seed-to-production operator runbook).**
This makes the launch operable by an engineer without tribal knowledge. Commands/endpoints marked
**[exists]** were confirmed by direct code investigation; those marked **[PR A]** are concrete
implementation requirements of Areas PR A — no command below is invented beyond those two
categories.

*Required input contract* (per city): city identifier and slug (required); city boundary
(optional where trusted bounds exist); city reference point/centre (required); canonical areas
with stable `area_key`s and names (required); aliases (optional); centroids (required); trusted
geometry or bounds (required at area level); adjacency data (optional — only if the chosen
partition algorithm uses it); source/version metadata (required); generation policy (required —
the extended `city_region_policy` values); approved overrides (optional). **Listings are never a
required input for hierarchy generation.**

*Workflow:*
1. Validate the source dataset — the offline OSM/Geofabrik extraction workflow established under
   #1900 **[exists as process]**; automated structural checks on the input package **[PR A]**.
2. Import/seed canonical areas + aliases into the sandbox revision —
   `AreaOnboardingApplyService` + its gated runners **[exists]**;
   `POST /api/admin/city-launch/cities/{cityId}/prepare` starts async sandbox preparation
   **[exists]**, progress via `GET .../prepare` **[exists]**.
3. Prepare city regions — `CityRegionOnboardingService` (dry-run + apply) **[exists]**, invoked
   within the sandbox preparation flow for the revision **[wiring: PR A]**.
4. Generate the recursive hierarchy — the new `generateNode()` service writing
   `sandbox_navigation_nodes` **[PR A]**.
5. Run structural validation — the extended validation checklist
   (`GET .../validation`, `PUT .../validation/checks/{checkKey}` **[exists]**; the new
   hierarchy-check flags **[PR A]**).
6. Open the City Launch Preview — existing preview endpoints
   (`GET .../preview/{regions,areas,markers,listings,...}`) **[exists]**; hierarchy tree view
   **[PR A]**.
7. Inspect guided navigation — the real-Discover-journey embed against sandbox data **[PR A]**.
8. Search areas directly and verify ancestry — preview direct-search ancestry validation
   **[PR A]**.
9. Inspect the revision diff — **[PR A]**.
10. Apply supported corrections (Correction 7's operations) or regenerate — **[PR A]**.
11. Approve and checksum-lock the revision —
    `POST .../validation/mark-validated` (atomic PREPARED→VALIDATED) **[exists]**.
12. Promote the exact approved revision — `POST .../launch` →
    `CityLaunchPromotionService.launch()` **[exists]**, extended to the seventh table **[PR A]**.
13. Verify the active revision in Postgres — the indexed `PROMOTED`-row lookup (Correction 4)
    **[exists as schema; verification query documented in PR A's runbook]**.
14. Verify the hierarchy cache loaded on every instance — via the new metrics/log lines
    **[PR A]**.
15. Verify readiness remains healthy — Actuator health group **[exists as pattern; new indicator
    PR A]**.
16. Run the public Discover smoke journey — extends `discover-real-data-smoke.spec.ts` model
    **[exists as pattern; new journey spec PR B]**.
17. Verify metrics and logs — Correction 9's required initial metrics **[PR A]**.
18. Record launch evidence — per the repo's existing evidence conventions (CLAUDE.md §11)
    **[exists as process]**.

*Required launch fixtures* (reusable across tests and preview): shallow hierarchy (Region → Area);
one cluster level; two cluster levels; three cluster levels where policy permits; zero-listing
canonical areas; an intentionally invalid hierarchy that blocks validation; an
override + regeneration case; a stale/superseded revision case.

**7. Frontend changes.** None in this PR except the City Launch Preview's own admin-only UI
extension (hierarchy tree, real-Discover-journey embed, diff, validation report, override
controls) — no change to the public-facing Discover shopper experience yet (that is PR B).

**8. Map/geospatial changes.** None to the shopper-facing map. The City Launch Preview's real
Discover journey reuses `PropertyMap`/marker layers unchanged, against sandbox data.

**9. URL and restoration behaviour.** Not yet exposed to shopper-facing URL state (PR B adds the
`node` param). The City Launch Preview's own internal navigation state is admin-tool-scoped and out
of this feature's shopper-facing URL contract.

**10-12. Desktop / mobile / accessibility acceptance.** N/A for the shopper-facing surface (no
shopper UI yet). The City Launch Preview extension itself must be usable by an admin at normal
desktop widths; no mobile/a11y bar is imposed on this internal admin tool beyond what the existing
City Launch Preview already meets.

**13. Loading, empty and error handling.** The navigation API returns an explicit terminal
`LISTINGS` `nextLevelType` (not an error) at the bottom of the tree; an area/region with zero
eligible children is a valid, well-formed empty result, not an error — zero-listing canonical areas
must still resolve and render.

**14. Security considerations.** New endpoints follow the existing anon-safe `/api/discover/*`
read pattern (no new auth surface for shoppers); the City Launch Preview extension stays behind the
existing admin-only `/api/admin/city-launch/**` auth guard, unchanged.

**15. Unit/component tests.** Deterministic-generation unit tests for `generateNode()` (see the
full list under "Required tests" below); DTO/record serialization tests for the navigation API
matching this repo's existing DTO test conventions.

**16. Backend integration tests.** New Testcontainers ITs covering the full generation → validation
→ preview → promotion cycle for the recursive tree (see "Required tests" below), following the
existing `CityLaunchPromotionServiceIT`/`AdminCityLaunchLaunchControllerIT` pattern of driving the
*real* pipeline, not hand-seeding a shortcut.

**17. Real-data E2E journey.** None yet against the shopper-facing surface (no shopper UI) —
deferred to PR B. **Integration checkpoint:** before PR A signs off, exercise the new navigation and
ancestry-resolver endpoints with a synthetic/scripted API-level consumer call against real seeded
geography for at least a zero-cluster city, a one-cluster-level city, and a two-cluster-level city,
confirming response shape, `nextLevelType` correctness, and ancestry consistency match what PR B's
frontend will assume.

**18. Visual comparison states and viewports.** N/A for the shopper surface. The City Launch
Preview's new hierarchy-tree/diff/validation-report views are functionally verified (not
`toHaveScreenshot`-gated — this is an internal admin tool, not a Discover V2 design-parity surface).

**19. Rollout/rollback (Correction 3 — approved expand/contract rule, removing an earlier
contradiction between "drop the new tables" and "never drop applied Flyway tables").** Expand
only: add the new tables and endpoints, keep the current production read path unchanged, validate
the new functionality independently. If PR A's application code must be rolled back: disable
hierarchy generation, disable/remove application use of the new endpoints, **keep the additive
Flyway tables in place**, leave the existing production Discover read path active — **never
reverse or drop an already-applied Flyway migration.** A later contract migration may remove
unused schema only through a separate, explicitly authorised change.

**20. Explicit non-goals.** No shopper-facing frontend change; no cutover of the *live* shopper
read path (that's PR B); no free-form drag-and-drop hierarchy editor; no cross-city depth
hardcoding of any kind.

**21. Sign-off checklist.** All items under "Required tests" (Areas PR A) green, including
determinism, zero-listing retention, listing-inventory-independence, invariant, and
promotion-fidelity tests; the integration checkpoint (item 17) confirmed matching PR B's expected
contract; City Launch Preview extension demonstrated end to end by an admin for at least one
multi-level city (real navigation, real direct-search ancestry match, real validation-report
block-then-pass cycle, real diff against a promoted baseline); #1910 confirmed retained
unmodified as a compatibility layer (D-Areas-6); user sign-off to proceed to PR B.

### Areas PR B — Complete Areas user experience (arbitrary depth)

1. **User outcome.** A shopper can navigate the complete recursive hierarchy at whatever depth the
   backend-approved model for their city actually has — City → Region → zero or more nested
   clusters → Area → Listings — search, filter, save, and open listing detail, all at Discover V2
   design parity, on desktop and mobile, with a complete, always-accurate breadcrumb.
2. **Complete user journey.** Every real hierarchy level a city's promoted revision actually has,
   from the shallowest (`Hubli → North → Vidya Nagar → Listings`) to the deepest
   (`Bangalore → North → Thanisandra & R.K. Hegde Nagar → Hebbal & Nagawara → Hebbal → Listings`,
   or deeper for a very large city) — as **one adaptive journey**, not separate "shallow" and
   "dense" features. Includes direct-area search converging on the exact same canonical ancestry
   guided navigation would produce.
3. **Included frozen-design state IDs.** `areas-city-default`, `areas-region-clusters` (now
   rendering however many recursive levels the promoted revision has), `areas-region-areas`,
   `areas-area-listings`, `areas-listings-query-active`, `areas-listings-filters-active`,
   `areas-browse-all`. Journey-specific content within `areas-city-default-mobile` /
   `areas-area-listings-mobile` (shell infrastructure from Feature 1; this PR proves Areas' own
   content, including the long-breadcrumb mobile treatment below, inside it).
4. **Existing production functionality being retained.** Region → canonical-area shallow
   drill-down ([02](02-production-baseline-audit.md) §A.6, §B.6); area results + filters +
   property-search (`useDiscoverFilteredMarkers`, `useDiscoverSearchState`); listing cards with
   correct trust badges and anon price-band coarsening ([02](02-production-baseline-audit.md)
   §A.12, §B.8); favourites (`useSavedListings.ts`); listing-detail navigation, confirmed at runtime
   to survive Back with full panel/breadcrumb/filter/viewport rehydration
   ([02](02-production-baseline-audit.md) §A.14); map/panel bidirectional hover/select sync
   ([02](02-production-baseline-audit.md) §B.7); the Schools-shortcut affordance. **Named
   explicitly:** the on-map listing-peek popover driven by the `listing=<uuid>` URL param (#1946)
   is a distinct surface, independently re-verified, not assumed covered by listing-detail
   navigation's retention statement.
5. **Missing functionality being introduced.** Arbitrary-depth recursive rendering (any number of
   nested cluster levels, driven entirely by the navigation API's `nextLevelType`, never a
   hardcoded per-city depth); the complete breadcrumb showing every real ancestor level with no
   artificial empty level ever inserted; `city_regions`/the new `navigation_nodes` tree as the live
   read path, including the Centre region and every generated cluster level appearing in production
   for the first time; direct-area search converging on the exact canonical ancestry via the new
   `navigation-path` resolver; deletion of `src/utils/macroRegionResolver.ts` (superseded by the
   new tree as the single source of truth for region/cluster aggregation); **the URL contract
   change described in item 9 below** (a single stable `node` param replacing the earlier-proposed
   serialized cluster-path param, per the API/URL investigation).
6. **Backend/data changes.** Consumes PR A's navigation + ancestry-resolver endpoints; a new
   `GET .../resolve-node` compatibility endpoint that maps legacy `groupId`/`region`/`areaKey`/
   `scope` values to a stable `node_key` (per Correction 2 — never a surrogate ID), for
   backward-compatible cold-load resolution of old deep links (no new schema beyond PR A).
7. **Frontend changes.** Recursive drill-down rendering component that renders **any** depth the
   API declares (region → cluster → sub-cluster → … → area), driven by `nextLevelType`, not a fixed
   set of panel components per level; re-skin of area-listings + filters + property-search (compact
   toolbar chips, listing-card restyle, school-shortcut styling); breadcrumb rendering the complete
   `ancestry[]` from the navigation response as interactive links (city crumb → city overview;
   region crumb → that region's direct children; each cluster crumb → that cluster's direct
   children; area crumb → area listings) — direct search and guided navigation render **identical**
   breadcrumbs, since both come from the same ancestry source; deletion of `macroRegionResolver.ts`
   and its call sites; `useDiscoverUrlState.ts` extended with one new `node` param carrying the
   stable `node_key` (see item 9); `discoverUrlNormalize.ts` extended to resolve legacy
   `groupId`/`region`/`areaKey`/`scope` params to a `node_key` via the new resolver endpoint on
   cold load, then `history.replace` to `node=`, exactly mirroring the shim's existing legacy-alias
   pattern — old deep links keep working, legacy params become read-only (not newly written),
   matching the existing `selectedGroup @deprecated` precedent.
8. **Map/geospatial changes.** Directional/compass marker rendering reuses `regionCompassLayout.ts`
   unchanged (confirmed safe reuse); the top-level map's marker density is reduced by the
   direction→cluster model, which is the basis for closing out #1943 per D-Areas-4. **Concrete
   closure gate:** #1943 is closed only when the map, at the issue's own originally-reported repro
   coordinates and zoom level, no longer shows the reported overlap — a shallow city/region with no
   cluster levels gets no density reduction and may still reproduce the original defect unchanged;
   if so, #1943 is not closed by this feature. **Breadcrumb camera-fit wiring, added after
   adversarial review (previously unaddressed for Areas — only specified for Agricultural
   elsewhere in this plan):** clicking any breadcrumb ancestor (item 7) must route its map re-fit
   through the same single-owner `CameraIntent` + suppress-TTL guard (`PropertyMap.tsx`'s
   `MapController`, per [02](02-production-baseline-audit.md) §B.2) that governs every other camera
   move in this codebase — a click on the city crumb from 5 levels deep issues **one** direct fit to
   city bounds, not five chained animations. This is required explicitly here because item 15
   already flags viewport/camera state ownership as fragile in this feature; deep-breadcrumb camera
   behavior must not be assumed to "just work" via the existing guard without being named as an
   acceptance item.
9. **URL and restoration behaviour (Correction 2 applied — the URL carries the stable natural
   `node_key`, never a surrogate database ID).** One new, additive `node=<stable-node-key>` param
   identifies the current navigation node; the backend supplies the complete `ancestry[]` on load
   (via the navigation endpoint), so arbitrary depth is represented without serializing every
   ancestor into the URL and without the frontend ever hardcoding per-city depth. Drill-down
   (`setNode(nodeKey)`) is a **push**, matching the existing navigational-destination discipline;
   viewport/scope/intent refinements stay **replace**, unchanged. Refresh and cold deep-links read
   `node` and call the navigation endpoint for the full node+ancestry+children in one round trip.
   Stale-link handling follows Correction 2's three-step ladder (Areas PR A, "Public-identity
   stability"): a `node_key` that still exists in the promoted revision resolves directly (the
   routine case — a policy recalibration with unchanged geography leaves every shared URL valid,
   no re-resolution machinery involved); a vanished CLUSTER `node_key` with a known canonical-area
   target resolves through `area_key`; genuinely-removed geography falls back to the nearest valid
   ancestor (city root only as last resort) with a non-blocking notice. The navigation response's
   `revision` field lets the frontend detect revision changes. Existing `city`/`areaKey`/`groupId`/`scope`/`region` params and existing deep links
   keep working via the `discoverUrlNormalize.ts` resolver shim described in item 7. **Because this
   PR combines the new param, the tree-as-live-read-path cutover, and `macroRegionResolver.ts`'s
   deletion, run the full existing ~60-spec Discover E2E suite** (not just journey-specific specs)
   before sign-off, in addition to the new arbitrary-depth assertions. **Deep-history acknowledgment
   (added after adversarial review):** because each drill-down level is its own push, Back from a
   5-level-deep node takes 5 presses to reach city root — a real multiplier versus the prior flatter
   region→area model. This plan accepts that as expected browser-history behavior (consistent with
   the existing per-level push discipline) rather than building a history-collapsing shortcut, but
   it must be called out explicitly in Areas PR B's E2E restoration tests (below) rather than left
   unacknowledged, so a reviewer isn't surprised by it during sign-off.
10. **Desktop acceptance.** All included states match at 1366×768 for at least three real depth
    profiles: a zero-cluster-level region, a one-cluster-level region, and a two-cluster-level
    region, all against real Bangalore data (plus a synthetic/seeded shallower city if Bangalore
    alone can't exercise the zero-cluster case).
11. **Mobile acceptance.** All states re-verified at 390×844 inside Feature 1's mobile shell
    `[SUPERSEDED wording — see "SUPERSEDED — mobile shell design" note above; the shell is a
    List-first Map/List toggle, not a "stacking sheet"]`,
    including the single-column (`<560px`) listing-grid collapse and the **long-breadcrumb
    mobile treatment**. **Revised collapse pattern (after adversarial review — "first + last two"
    was found to drop the region/direction crumb, the single most orientation-critical level in a
    directional-cluster hierarchy):** collapse to **city + region (always visible) + `…` + current
    node's immediate parent + current node**, not "first + last two" — this preserves both the
    top-of-hierarchy anchor (city) and the one crumb that tells a shopper which direction of the
    city they're in, at the cost of the intermediate cluster levels, which remain reachable via the
    expandable `…`. Reuses this repo's existing `BreadcrumbEllipsis` shadcn primitive rather than
    inventing a horizontal-scroll container (the breadcrumb renders inside a fixed-width floating
    map pill where horizontal scroll would push ancestors off-screen with no scroll affordance).
    Intermediate hierarchy levels are **never permanently hidden** — the collapsed segment is always
    expandable to the full path. **Expanded-state layout, specified explicitly (previously
    unspecified — added after adversarial review):** when the collapsed segment expands, the pill
    grows to an internal `max-height` with its own scrollable list of the full ancestry, rather than
    growing unbounded over the map or wrapping to multiple lines of chevron-separated text — the
    expanded state gets its own explicit `toHaveScreenshot` baseline (see item 18), not just the
    collapsed one.
12. **Accessibility acceptance.** Cluster/area drill-down cards and listing cards are fully
    keyboard operable with visible focus. **Screen-reader mechanism specified explicitly (after
    adversarial review — the original draft asserted an outcome without naming the mechanism, which
    risked overclaiming beyond what the reused primitive actually does by default):** the standard
    shadcn `BreadcrumbEllipsis` is a disclosure control (collapsed items are not in the accessibility
    tree until the trigger is activated, `aria-expanded` toggling visibility) — this plan adopts
    that standard disclosure behavior rather than an always-present-but-visually-hidden list, so a
    screen-reader user hears the collapsed items **after activating the ellipsis control**, not
    automatically as part of every page read. The always-visible crumbs (city, region, immediate
    parent, current) are announced normally without any activation step. This distinction must be
    reflected literally in the test (below), not glossed over as "the complete path is always
    announced." Reuses Feature 1's `jest-axe`/`@axe-core/playwright` setup.
13. **Loading, empty and error handling.** Listing/area loading, empty, and error states get
    explicit treatment reusing `emptyStateCopy.ts`; a `node` naming valid-but-empty data (a
    zero-listing area, per the approved product decision) renders as a normal, non-error empty
    state, never a fallback or error.
14. **Security considerations.** Anon price-band coarsening and trust-badge exposure re-verified
    unchanged after the tree cutover (same `PriceBand.of()`/`GeoCoarsener.coarsen()`/
    `TrustBadge.publicBadge()` helpers — this PR does not touch those helpers, only the region/tree
    source they read from).
15. **Unit/component tests.** New/updated Vitest specs for the recursive drill-down component (any
    depth, driven by `nextLevelType`), the breadcrumb's complete-ancestry rendering (including the
    collapsed-mobile variant), the `resolve-node` legacy-param migration, and confirmation that
    `macroRegionResolver.ts`'s removal has no remaining consumers. Includes the previously-flagged
    debounced-replace viewport-race regression test ([03](03-functional-parity-matrix.md) Part C
    item 7), since this feature again touches state ownership around navigation/URL restoration.
16. **Backend integration tests.** Extends PR A's coverage only if the live cutover surfaces a gap;
    otherwise relies on PR A's Testcontainers ITs for the tree itself.
17. **Real-data E2E journey.** See "Required tests — Areas PR B" below for the full list (deep
    guided journey, direct search, breadcrumb navigation at every level, shallow-city path,
    restoration at every depth) — **plus the full ~60-spec Discover E2E suite** per item 9's
    elevated regression scope, plus the listing-peek popover round-trip named in item 4.
18. **Visual comparison states and viewports.** All included state IDs at 1366×768 and 390×844,
    including **both** the collapsed-mobile-breadcrumb state **and its expanded state** (added
    after adversarial review — the expanded state was previously unspecified and un-baselined) as
    their own explicit baselines, added to the running `toHaveScreenshot` set. **Shared-chrome
    acceptance rule (unchanged):** a diff isolated to Feature 1's shell chrome inside an Areas
    screenshot is a Feature-1-owned regression, not an Areas defect.
19. **Rollout/rollback.** The tree-as-live-read-path cutover is the one real rollback risk in this
    feature — plan it as expand/contract: `area_groups`/flat `city_regions` and the new
    `navigation_nodes` tree stay independently queryable through the rollout window; run a
    side-by-side count/ancestry diff between old and new on real data before flipping the live read
    path; keep the flip itself a single, fast, revertible read-path selector, not a data migration,
    so a revert during rollout requires no schema rollback or re-onboarding.
20. **Explicit non-goals.** No second live city; no change to listing/school/parcel detail pages;
    no Agricultural content; no free-form hierarchy editor exposed to shoppers (admin-only, PR A).
21. **Sign-off checklist.** All items under "Required tests" (Areas PR B) green across at least
    three real depth profiles; visual match at both viewports including the collapsed-mobile
    breadcrumb; URL/Back/Forward/refresh confirmed at every depth; direct-search and
    guided-navigation breadcrumbs confirmed byte-identical for the same area; #1943 verified closed
    per its concrete gate; `macroRegionResolver.ts` confirmed deleted with no remaining consumers;
    existing production Areas capabilities (favourites, listing-detail Back-survival, map/panel
    sync, listing-peek popover) confirmed preserved; explicit user sign-off before Feature 4 starts.
    **Areas is signed off only after this PR proves the complete adaptive-depth journey across
    multiple real depth profiles — PR A alone is never presented as "Areas done."**

### Required tests — Areas PR A (recursive hierarchy generation/promotion)

- Shallow city with zero cluster levels (region → area directly).
- City with exactly one cluster level.
- City with exactly two cluster levels.
- City with three cluster levels, where the policy permits it. **Fixture-distinctness requirement
  (added after adversarial review):** this must use geography genuinely requiring 3 levels under
  the chosen policy, not the same 2-level fixture with a policy value tweaked — the point is to
  prove the algorithm's recursion terminates correctly at a third level on real-shaped data, which
  a reused fixture with an adjusted threshold would not actually exercise.
- Deterministic generation: running the generator twice on identical inputs/policy/overrides
  produces an identical tree and identical labels. **Strengthened with a geometric-near-tie case
  (added after adversarial review):** run against real (not synthetic) city geometry constructed to
  include areas near-equidistant from a candidate split boundary — this is a distinct failure mode
  from the listing-count test below (floating-point/library-version order sensitivity, not input
  mutation) and must be tested separately.
- **Listing-inventory independence — two distinct claims, both required (strengthened after
  adversarial review, since the original single test only proved the weaker claim):**
  (a) *regeneration stability*: changing seeded listing counts while holding geography/policy/
  overrides fixed produces no change to cluster membership, depth, representative-area names,
  cluster identity, or labels — only the informational aggregate count changes; **and**
  (b) *never-an-input*: generate a tree with listing data entirely absent/zeroed at initial
  generation time and confirm it is structurally identical to one generated with listings present
  — (a) alone does not prove listings were never consulted in the first place, only that changing
  them later doesn't matter; both must pass.
- Zero-listing canonical areas are retained as real leaf nodes, not dropped.
- No cycles (reachability check via recursive CTE at validation time).
- No orphan nodes.
- Exactly one active navigation path per canonical area (no area in two active leaf paths).
- No duplicate-descendant-area counting (cluster aggregate count equals the sum of unique
  descendant-area counts, not a naive sum-of-children that could double-count) — this is a
  service-level aggregation test, not a claim the partial unique index enforces on its own (see the
  data-model correction above).
- Representative areas are confirmed actual members of their own cluster, including the
  lexicographic-tie-break case (two equally-representative candidate areas resolve deterministically
  to the same one every run).
- Bounds are generated for every navigable node, not just leaves.
- Override persistence: an applied override survives a regeneration and is reflected in the new
  tree.
- Regeneration preserves previously-approved overrides unless explicitly superseded.
- **Override/regeneration consistency (added after adversarial review — the original two tests
  above prove persistence, not tree consistency after the round-trip):** apply an override, trigger
  a regeneration under a policy change that could plausibly invalidate the override's target, and
  confirm the result is either a valid tree with the override cleanly applied, or an explicit
  orphaned-override validation failure blocking promotion — never a silently-inconsistent tree that
  passes validation by accident.
- Preview and promotion preserve the exact approved hierarchy (node keys, ancestry, labels,
  ordering, bounds, representative-area IDs, policy fingerprint) — a promoted tree is byte-for-byte
  the previewed/approved one, not regenerated at promotion time.
- **Existing six-table promotion characterization test (added after adversarial review):** the
  pre-existing promotion of `areas`/`area_alias`/`city_regions`/`city_region_memberships`/
  `area_groups`/`area_group_members` is byte-unchanged by this PR's extension to a seventh table —
  run this alongside, not instead of, the new seventh-table promotion test.
- The promoted checksum matches the approved checksum (extends the existing checksum-verification
  pattern already proven in `CityLaunchPromotionServiceIT`).
- The direct-area ancestry resolver (`navigation-path`) returns an ancestry identical to what
  guided navigation (`navigation/{nodeKey}`) would produce for the same area, for every node in a
  seeded test tree.
- Stale-link ladder (Correction 2): (a) an unchanged `node_key` resolves directly in a
  newly-promoted revision with no re-resolution machinery; (b) a vanished CLUSTER `node_key` with
  a known canonical-area target resolves through `area_key` to the area's new position; (c)
  genuinely-removed geography falls back to the nearest valid ancestor, city root only as last
  resort — each rung tested separately, and no historical surrogate-ID lookup exists anywhere in
  the path.
- Rollback follows the Correction 3 expand/contract rule: application code disabled/rolled back
  while already-applied Flyway tables stay in place; no test or procedure reverses or drops an
  applied migration (schema removal only via a separate, explicitly authorised contract
  migration).

**Hierarchy-cache tests (added with the approved caching architecture — all part of Areas PR A,
no separate caching PR):**

*Startup warmup:*
- All public active cities load successfully at startup.
- Disabled/"Soon" cities are skipped by the preload.
- Preview (sandbox) revisions are not production-preloaded.
- The hierarchy loads via the fixed set-based bulk queries, not N+1 recursion (assert query count).
- A valid graph is available before readiness reports healthy — the first request is a cache hit.
- A public-active-city load failure keeps readiness unhealthy.
- A disabled/optional-city load failure does not incorrectly block readiness.

*Cache correctness:*
- The cache key contains both city and revision (`citySlug:revisionId`).
- Two revisions of one city can coexist briefly (during the post-swap grace period).
- The graph is immutable after insertion (no mutation path exists or succeeds).
- Area-ancestry lookup returns the full authoritative path from the cached graph.
- Child lookup works at arbitrary depth from the cached graph.
- No live listing counts are stored inside the structural graph.

*Promotion refresh:*
- The promoted revision is fully loaded and validated **before** the pointer swap.
- A validation failure leaves the old revision active and serving.
- A successful load atomically changes the active pointer.
- In-flight requests may complete against the previous immutable revision.
- The old revision is evicted only after the configured grace period.
- Promotion requires no instance restart.
- Promotion does not regenerate the hierarchy (re-asserted at the cache layer: the cached graph's
  checksum equals the approved sandbox checksum).

*Event/poll resilience:*
- The promotion event refreshes the instance.
- A missed event is repaired by the active-revision safety poll.
- An unchanged revision causes no reload on poll.
- Concurrent refreshes for one revision are coalesced.
- A failed refresh is retried with bounded backoff.

*Request fallback:*
- A cache miss loads exactly once.
- Concurrent misses are single-flight (one mapping-function execution per key).
- A fallback validation failure does not expose partial state (and is not cached).
- A newly activated city can load without restart.

*Preview isolation:*
- The preview graph builds from sandbox revision rows.
- Preview and production cache keys cannot collide (distinct namespaces).
- A preview refresh cannot replace or invalidate the production active pointer.

*OpenSearch/count separation:*
- The structural cache is byte-unchanged when listing inventory changes.
- The area-level count aggregation rolls up correctly through recursive ancestors.
- No descendant area is double-counted in any rolled-up cluster/region total.
- Buy and Rent count-cache entries do not collide.
- Different normalized filter hashes do not collide.
- Anonymous and authenticated exposure-mode cache entries do not collide (even while the dimension
  collapses to one value today — the key structure is asserted now).
- The replaced `DiscoverSummaryService` region queries and the new single area-level roll-up
  produce equal totals on identical seeded data (a migration-equivalence test for the three-query →
  one-query rewrite identified by code investigation).

*Restart behaviour:*
- A restart clears the local cache.
- Startup repopulates all active cities.
- Restart is documented (and asserted in ops docs) as operational recovery, not the normal
  promotion-invalidation mechanism.

### Required tests — Areas PR B (shopper-facing adaptive-depth UX)

- **Deep guided journey:** `Bangalore → North → Thanisandra & R.K. Hegde Nagar →
  Hebbal & Nagawara → Hebbal → Listings`, confirming every intermediate step renders correctly and
  the map/panel stay in sync at each level.
- **Direct search:** search "Hebbal" → select result → same area state, same hierarchy, same
  breadcrumb, same map fit, same canonical URL state as the guided journey above would produce.
- **Breadcrumb navigation:** clicking `Hebbal & Nagawara` shows its direct children; clicking
  `Thanisandra & R.K. Hegde Nagar` shows its direct children; clicking `North` shows the region's
  direct children; clicking `Bangalore` returns to the city overview — every ancestor crumb is
  independently clickable and correct.
- **Shallow path:** `Hubli → North → Vidya Nagar` with no invented cluster level — confirms the
  algorithm's "fall back to canonical-area leaves" branch renders correctly in the UI, not just in
  backend tests.
- **Restoration:** refresh at every depth; Back at every depth (including the acknowledged
  multi-press cost from a deep node to city root — added after adversarial review, tested
  explicitly rather than left implicit); Forward at every depth; a direct deep link at every depth;
  a stale/superseded deep link (first attempts `node_key` re-resolution, only degrades to city root
  if that fails — added after adversarial review); an alias search resolving to its canonical area
  and correct ancestry; a mobile long breadcrumb (city+region+…+parent+current collapse pattern,
  both its collapsed and expanded states — added after adversarial review); keyboard navigation
  through every crumb; screen-reader announcement of the always-visible crumbs plus the
  disclosure-gated announcement of collapsed crumbs only after the ellipsis is activated (added
  after adversarial review — not "always announced").
- **The following were previously named only as PR-description acceptance criteria and are made
  explicit Required tests here (added after adversarial review, since acceptance-criteria prose is
  weaker than a named required test):**
  - **Debounced-replace viewport-race regression** ([03](03-functional-parity-matrix.md) Part C
    item 7): an in-flight debounced viewport write at the exact instant of navigating to a listing
    detail page does not get lost on Back.
  - **#1943 closure verification**: the top-level map, at #1943's own originally-reported repro
    coordinates and zoom level, no longer shows the reported marker overlap for at least one
    cluster-bearing region; a shallow region with no cluster levels is separately checked and, if it
    still reproduces the defect, is reported as #1943 **not** closed by this feature (per item 8's
    concrete gate), not silently passed.
  - **Shared-chrome regression check**: `areas-city-default`'s screenshot diffed specifically for
    Feature-1-owned chrome regions (control bar, mode selector, breadcrumb frame) versus
    Areas-owned regions (directional content), confirming the ownership split in item 18 is
    actually checkable, not just asserted.

---

## Feature 4 — Agricultural journey

**Max: 2 PRs**, for the same reason as Areas: a backend/data entity (Town/Destination) does not
exist and cannot be honestly rendered around without being designed and built first. **Both PRs
are one feature — PR A is not independently signed off as a completed Agricultural experience;
only PR B's end-to-end proof closes this gate.**

### Why the split is unavoidable

[02-production-baseline-audit.md](02-production-baseline-audit.md) §C.4 and
[03-functional-parity-matrix.md](03-functional-parity-matrix.md) Part C item 3 confirm there is no
Town/Destination/Village entity anywhere in the codebase today — only raw parcel listings and
manually-seeded direction-label strings. The frozen design's "town/destination" results step has
nothing to query against. Designing and migrating that entity is real, non-cosmetic backend work
that must exist and be tested before a frontend town-results UI can honestly render anything.

**What PR A enables:** a real, queryable Town/Destination entity with deterministic grouping,
versioning, aggregate counts, and anon-safe coarsening — the data PR B's UI needs to exist for
real, not synthesized from raw parcels. **Why it is not an independent product sign-off:** a user
cannot browse towns through PR A alone; it ships no UI. **How PR B proves the complete feature:**
PR B is the only PR where a user can walk the full origin → direction → distance band → town →
parcel journey and see it at design parity.

### Agricultural PR A — Destination data enablement

1. **User outcome (of this PR alone).** None directly visible — enables PR B's UI honestly.
2. **Complete user journey enabled (not yet exposed).** The backend can answer, for any
   direction/distance band from a given origin, "what towns/destinations exist, and how many
   parcels does each contain" — anon-safe.
3. **Included frozen-design state IDs prepared for (not rendered yet).** `agri-corridor-towns`
   (the town-results step) and `agri-town-parcels` (town→parcels hierarchy) — the data these
   states need.
4. **Existing production functionality being retained.** Raw parcel listings, the directional
   sector wedge (`SectorOverlay`/`buildSectorPolygon`), and the single-outer-arc distance-band
   rendering all stay live and unaffected until PR B wires the new entity in.
5. **Missing functionality being introduced.** Per decision D-Agri-1: the Town/Destination
   definition and grouping algorithm, implemented as a real entity + generation service.
6. **Backend/data changes.** New Town/Destination entity + Flyway migration, following the same
   versioned-generation pattern as the Areas cluster tier (checksum/fingerprint, sandbox mirror,
   city-launch-style promotion). New/extended endpoint(s) for town listing + per-town aggregate
   parcel counts. **Repair #1926/#1927 (agri E2E auth-selector drift and consent-banner pointer
   interception) as part of this PR's test-readiness work, per D-Agri-2** — quantify the actual
   failure mode and fix effort *before* this PR's implementation starts (not discovered mid-PR), and
   track it as a distinct, bounded sub-scope within this PR's own estimate if it turns out to be
   non-trivial; new agri E2E specs in PR B must not inherit that existing flakiness. An anon-safe
   coarsening funnel for the new town/parcel surface, audited explicitly rather than assumed to
   inherit the residential `PriceBand.of()`/`GeoCoarsener.coarsen()` helpers unchanged (per
   [02](02-production-baseline-audit.md) §C.9 — Agricultural's anon exposure rules need their own
   scrutiny, not an assumption of generalization).
7. **Frontend changes.** None — PR A is backend/test-infra-only.
8. **Map/geospatial changes.** None.
9. **URL and restoration behaviour.** Not yet exposed (PR B adds any new params).
10. **Desktop acceptance.** N/A (no UI).
11. **Mobile acceptance.** N/A (no UI).
12. **Accessibility acceptance.** N/A (no UI).
13. **Loading, empty and error handling.** API returns explicit empty-towns response for a
    band/direction with no towns, not an error.
14. **Security considerations.** This is the core of PR A: a dedicated security review of the new
    anon-safe town/parcel coarsening funnel (aggregate counts, town labels, parcel exposure) before
    any frontend surface reads it — do not assume the residential coarsening helpers generalize.
15. **Unit/component tests.** Backend-focused; no frontend units yet.
16. **Backend integration tests.** New Testcontainers IT for the Town entity's grouping algorithm
    (deterministic — same parcel data in, same town groupings out) and for the anon-coarsened
    read path.
17. **Real-data E2E journey.** None yet (no UI); the #1926/#1927 repairs are verified via the
    existing agri E2E suite running clean (not flaky) as this PR's own evidence. **Integration
    checkpoint added after adversarial review:** before sign-off, exercise the new town/parcel
    endpoint(s) with a synthetic/scripted API-level consumer call against real seeded parcel data,
    confirming response shape, aggregate counts, and anon-coarsening behavior match what PR B's
    frontend will assume.
18. **Visual comparison states and viewports.** N/A.
19. **Rollout/rollback.** Same expand/contract standard as Areas PR A (Correction 3): additive
    schema + new endpoint(s); no existing agri read path is touched until PR B wires the frontend
    to it. An application-code rollback disables the new generation/endpoints but **keeps the
    additive Flyway tables in place** — never reverse or drop an applied migration; a later
    contract migration removes unused schema only as a separate, explicitly authorised change.
20. **Explicit non-goals.** No frontend change; no cumulative-arc rendering work (that's PR B,
    frontend-only extension of existing arc-sampling primitives).
21. **Sign-off checklist.** Testcontainers ITs green (grouping determinism + anon coarsening);
    security review of the new coarsening funnel completed and signed off; #1926/#1927 confirmed
    fixed (existing agri E2E suite green, not flaky); user sign-off to proceed to PR B.

### Agricultural PR B — Complete Agricultural user experience

1. **User outcome.** A user can set an origin (city centre or a selected area), pick an outbound
   direction, choose a cumulative distance band, browse real towns/destinations in that band, and
   drill into parcels — entirely at design parity, with breadcrumb language that never implies
   containment (an agri origin is a point of reference, not a container).
2. **Complete user journey.** City-or-selected-area origin → Direction → Cumulative distance band
   (10/25/50/100 km) → Town/destination → Parcels, including resetting the origin.
3. **Included frozen-design state IDs.** `agri-city-default`, `agri-area-origin`,
   `agri-corridor-towns`, `agri-town-parcels`.
4. **Existing production functionality being retained.** The directional sector wedge
   (`SectorOverlay.tsx` + `buildSectorPolygon`, confirmed E2E-hardened,
   [02](02-production-baseline-audit.md) §B.10); the origin-vs-container semantics, **confirmed
   already correct in the frozen export's own hash-based rendering**
   (`#m=agri&ao=hebbal` → "Origin: Hebbal", direction/distance recomputed relative to origin, never
   implying containment — [01](01-frozen-design-audit.md) Phase 2); `AgriMarkerClusterLayer` +
   `AgriPolygonLayer`; `useAgriMapListings`/`useFilteredAgriListings`; the `region`
   (corridor-direction) + `maxKm` (distance-band) orthogonal URL axis
   ([02](02-production-baseline-audit.md) §A.11). **Named explicitly (after adversarial review,
   previously only implied by map/hook components):** the existing drill-down panel chain
   `AgriRegionalGroupsPanel` → `AgriGroupLocalityPanel` → `AgriGroupSelectedPanel` →
   `AgriGroupListingPeek` ([02](02-production-baseline-audit.md) §A.11) — this feature re-skins
   these panels and wires the town-level ones to PR A's entity, it does not replace them wholesale.
5. **Missing functionality being introduced.** Real Town/Destination rows and town→parcel
   hierarchy replacing the current raw-parcel-only view, wired to PR A's entity; cumulative
   concentric distance-band rings at all four bands simultaneously (10/25/50/100 km), extending
   `SectorOverlay` from today's single outer arc. **Scope correction (after adversarial review):**
   this is **not** purely "reuse existing arc-sampling primitives" as the original draft
   characterized it — rendering four *simultaneous* rings (vs. today's one) introduces genuinely
   new work: ring topology (an annular band needs an outer+reversed-inner arc pair, which
   `buildSectorPolygon` does not currently produce), z-order and opacity-blending across four
   overlapping translucent fills (compounding darkening where bands overlap, not just "per-ring
   opacity"), per-band labels, and a defined selection/highlight semantic for which band is
   "active" among four simultaneously-rendered ones (today's `maxKm` selects exactly one). Budget
   this as real, reviewed geometry/UX work, not a small extension. Explicit production verification
   (not just assumption) that the non-containment origin-semantics the design export gets right are
   reproduced exactly in the production port.
6. **Backend/data changes.** Consumes PR A's Town/Destination entity and coarsening funnel; no new
   schema in this PR unless PR A's review surfaced a follow-up.
7. **Frontend changes.** Re-skin of `agri-corridor-towns` (town rows, evergreen accent, 4 outbound
   direction cards) and `agri-town-parcels` (parcel search/filters/cards), now wired to the real
   Town entity; extend `SectorOverlay` to render all four concentric bands at once (see item 5's
   scope correction — this includes the new ring-topology/opacity/label/selection work, not just a
   loop over the existing single-arc renderer); explicit origin-reset control; breadcrumb using
   non-containment "Origin: X" language for both city-centre and selected-area origins.
8. **Map/geospatial changes.** Concentric multi-ring distance-band rendering — annular ring
   geometry, cross-ring opacity/z-order handling, per-ring labels, and active-band selection among
   four simultaneously-rendered rings (the real new geometry/UX work per item 5, not a thin
   extension); real town positions plotted from PR A's entity instead of synthesized from raw
   parcel coordinates. **Added after adversarial review:** verify the 100 km outer ring's large
   bounding box interacts correctly with the single-owner `CameraIntent` + 8-second suppress-TTL
   guard ([02](02-production-baseline-audit.md) §B.2) on band selection — a large band's fit
   request must not fight an in-flight camera suppression from the prior band.
   **Geodesic acceptance (Correction 12 — approved; replaces the earlier ellipse-shape
   criterion):** each ring is calculated using **geodesic distance from the selected origin**;
   verification samples cardinal and intermediate points and asserts the 10/25/50/100 km distances
   within an agreed numeric tolerance, plus the selected bearing and sector geometry;
   Leaflet/Web Mercator projects the geodesic geometry naturally — **do not manually distort a
   circle into an ellipse, and do not treat the rendered shape's ellipse-ness as an acceptance
   criterion**; ring ordering, labels, opacity, z-index, and interaction are verified separately;
   camera fit is verified; visual comparison is against the frozen mock.
9. **URL and restoration behaviour.** **Committed at PR-A sign-off, not deferred to "if needed"
   (correction after adversarial review):** a town-selection param is added to the `region`/`maxKm`
   axis additively; refresh/Back/Forward must restore the exact origin + direction + band + town
   selection.
10. **Desktop acceptance.** All 4 states match at 1366×768 with real town data, all four
    concentric bands rendering correctly (no off-by-one band, correct per-ring fill opacity — the
    specific risk flagged in [03](03-functional-parity-matrix.md) Part C item 8).
11. **Mobile acceptance.** All 4 states re-verified at 390×844 inside Feature 1's mobile shell
    `[SUPERSEDED wording — see "SUPERSEDED — mobile shell design" note above; the shell is a
    List-first Map/List toggle, not a "stacking sheet"]`.
12. **Accessibility acceptance.** Direction cards, distance-band selector, and town/parcel rows are
    keyboard operable with visible focus; reuses Feature 1's a11y tooling.
13. **Loading, empty and error handling.** Town/parcel loading, empty (no towns in this
    band/direction), and error states get explicit treatment.
14. **Security considerations.** Full security review of the anon-facing town/parcel surface as it
    actually renders in production (building on PR A's funnel review, now checked against the real
    UI's data exposure, not just the API contract in isolation).
15. **Unit/component tests.** New/updated Vitest specs for the town-row/parcel-card components, the
    multi-ring `SectorOverlay` extension, and the origin-reset control.
16. **Backend integration tests.** Extends PR A's coverage only if this PR's review surfaces a gap;
    otherwise relies on PR A's ITs.
17. **Real-data E2E journey.** Full origin → direction → distance-band → town → parcel spec against
    live data, including an explicit assertion that the breadcrumb never renders "inside" language
    for an agri origin (both city-centre and selected-area origin cases), building on the
    now-repaired (PR A) agri E2E infra.
18. **Visual comparison states and viewports.** All 4 Agricultural state IDs at 1366×768 and
    390×844, added to the running baseline set, compared against the frozen mock. **Includes
    (per Correction 12)** cross-ring opacity/z-order correctness where bands overlap and per-ring
    label placement — the ring *shapes* are accepted as whatever Web Mercator naturally projects
    from the geodesic geometry (item 8's numeric-tolerance checks own distance correctness; the
    visual baseline does not gate on projected shape distortion).
19. **Rollout/rollback.** Frontend-only cutover from raw-parcel view to Town-entity view; revert is
    a plain single-PR revert since PR A's backend stays additive and unused if PR B reverts.
20. **Explicit non-goals.** No listing/school/parcel detail-page redesign; no second live city.
21. **Sign-off checklist.** Unit + a11y + E2E green; visual match at both viewports (including the
    cross-ring opacity/label checks in item 18); URL/Back/Forward/refresh
    confirmed; origin-vs-container non-containment semantics explicitly verified via E2E;
    concentric-band **geodesic distances verified within tolerance at sampled cardinal and
    intermediate points** (per Correction 12), correct at all four bands, including no camera-fit
    fight with the suppress-TTL guard on band changes (item 8); security review of the production-rendered
    anon surface completed; existing Agricultural capabilities (sector wedge, filters, parcel
    cards, the retained panel chain in item 4) confirmed preserved; explicit user sign-off.
    **Agricultural is signed off only after this PR proves the complete origin-to-parcel journey —
    PR A alone is never presented as "Agricultural done."**

---

## Final programme-wide regression run

After all four gates have individually signed off, run one full regression pass across all four
journeys plus the shell (unit + E2E + a11y + visual baseline, full suite, both viewports). This is
**not a planned "polish PR"** — it is a verification run. Any failure found here is fixed inside
the feature that owns the regressed surface (e.g. a Schools regression caused by the Areas
region-model cutover is fixed as a Schools-owned patch, not folded into a new cross-cutting PR).

**Made explicit after adversarial review, to prevent this run from becoming a de facto 7th PR:**

- **Ownership default for ambiguous cross-feature regressions:** if a regression clearly involves
  two features' surfaces (e.g. a region-model change breaking a town/parcel aggregate), the feature
  that owns the *data source* of the regression is the owner (in the example, Areas owns the region
  model, so Areas owns the fix), not the feature that merely displays the symptom. If ownership is
  genuinely ambiguous, the earlier-numbered feature gate owns triage and either fixes it directly
  or explicitly hands it to the later feature with a documented reason.
- **This run is a scheduled, staffed verification pass, not open-ended cleanup:** it runs the exact
  suites and baselines each feature already built (no new test categories are introduced here), and
  it does not carry its own "improve visual polish" scope — any finding is either a genuine
  regression (fixed by its owning feature per the rule above) or is out of scope and logged for a
  future, separately-approved change.

---

## What was removed from the prior 7-phase / ~20-PR plan, and why

- **Phase 0 (tooling/foundation) as a standalone PR** — removed. The assertion-free-E2E gate,
  `jest-axe`/`@axe-core/playwright` setup, and the first `toHaveScreenshot` baselines are now built
  inside **Feature 1**, against the shell they need to protect, instead of shipping as a
  documentation/tooling-only PR with nothing for a user to sign off on.
- **`macroRegionResolver.ts` deletion as its own PR (Phase 0.2)** — removed. Folded into **Areas PR
  B**, the feature that actually supersedes what this file did on the client; per the user's
  instruction, this is not treated as a standalone cleanup PR.
- **A standalone "decision record" PR (Phase 0.3)** — removed. Decisions are now recorded inside
  the feature gate section above and inside the owning PR's own documentation, not as a
  documentation-only implementation PR.
- **Splitting shallow-Areas (old Phase 3) and dense-Areas/cluster-backend (old Phase 4) into
  separate phases** — removed. Both are now one feature (Feature 3), delivered as two PRs of the
  same feature, with PR B proving both depths together — there is no standalone "shallow Areas"
  sign-off.
- **A separate shell-components phase (old Phase 2) delivered independently of any journey** —
  removed. Shell work is now Feature 1, and it is graded as a complete, sign-offable user-facing
  feature in its own right (not a layer), including its own full desktop/mobile/a11y/URL evidence,
  rather than an interstitial phase with no independent user outcome.
- **A separate agri-E2E-infra-repair PR (old Phase 5.1)** — removed. Folded into **Agricultural PR
  A**'s test-readiness scope, since #1926/#1927 must be fixed before PR B's new specs are written,
  not shipped as a standalone E2E-prep PR.
- **A final cross-journey "polish" phase (old Phase 6)** — removed as a *planned* phase. Its
  substance splits two ways: the `NOT_DESIGNED`-state decisions are now resolved per-feature (see
  the decision-gates section above), and the final regression pass is kept as a verification run
  (see above), explicitly not a polish PR that defers visual consistency to the end.
- **~20 PRs across 7 phases → 6 PRs across 4 feature gates.** The reduction is possible because
  most of the old plan's PR boundaries were technical-layer boundaries (a re-skin PR, then a
  separate hook-wiring PR, then a separate E2E PR) rather than genuine feature boundaries; folding
  a journey's frontend + backend + tests + a11y + visual evidence into one PR per feature (or two,
  only where a real backend-enablement boundary exists) removes that fragmentation without losing
  any of the underlying verification work — it is now all inside the feature PR that needs it,
  not a separate PR of its own.
