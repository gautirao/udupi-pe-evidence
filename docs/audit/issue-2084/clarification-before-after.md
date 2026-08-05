# #2084 — Clarification PR: approved Before/After contract

**Status:** clarification-only. This PR contains no production code — planning/test artefacts and this document only. Per the controlling amendment on #2084 ([comment](https://github.com/gautirao/udupi-property-explorer/issues/2084#issuecomment-5180039872)) and the #2096 process gate, implementation may not begin (and no production code may be pushed) until a reviewer posts the exact-head `implementation-understanding:v1` marker approving the After column below.

## Context

- Delivery issue: #2084 ("restore Areas panel structure, journey controls and approved shell layout")
- Predecessor: #2083 (merged, PR #2097) — corrected navigation hierarchy/state; this slice must integrate with it, not reimplement it
- Source findings: `docs/audit/issue-2076/discrepancy-register.md` F8, F10, F12, F13, F16 (F14/F15/F17 explicitly out of scope per the issue body, re-checked below rather than unilaterally dropped)
- Approved mock: `docs/design/retrends-design-system/ui_kits/new_discover/experience.html`
- A structural implementation of this slice was already built and independently verified in a prior work session (unit/integration tests, code review, live-browser Phase 7A/7B) but is **parked, uncommitted to any pushed branch** pending this approval — see `.claude/handoffs/issue-2084/workdone-candidate.toml` and `.claude/handoffs/issue-2084/product-verification.toml` for that evidence. This table is written from that investigation, not invented fresh.

## Slice boundaries

In scope: restoring the in-panel JourneySwitcher for `journey=area-first`, restoring the desktop map-left/panel-right shell, panel information-architecture fixes (city-root heading, section grouping, within-area order, school-CTA prominence). Reuses the existing `JourneySwitcher` component and the existing `handleSelectJourney` writer — no new navigation/URL-state path. Out of scope: navigation hierarchy/count sourcing (owned by #2083), pixel-perfect mock matching, F14/F15/F17 cosmetic polish (re-checked, not separately scoped), map camera/clustering behaviour.

## Current code paths producing the Before state

- `src/features/discover/views/DiscoverRightPanelContainer.tsx` — routes `journey=area-first` to `DiscoverAreasJourneyPanel` via an early return that never mounts the shared panel shell (the shell that carries both the desktop flex order/width classes and the `JourneySwitcher` mount for sibling journeys).
- `src/features/discover/views/DiscoverAreasJourneyPanel.tsx` — all four state branches (city-root, Direction, Local Destination, Area/listings) return a bare `<div className="p-4">`.
- `src/components/discover/navigation/NavigationLevelPanel.tsx`, `src/components/discover/panels/AreaSelectedPanel.tsx` — render the Direction/Local-Destination/Area content without the IA elements (dividers, eyebrows, school-CTA prominence) present in the approved mock.

## Proposed component/state changes

Wrap the area-first early return once with the same shell sibling journeys already use (mounting `JourneySwitcher` via the existing `handleSelectJourney` writer, applying `lg:order-2`/`lg:h-full`/`lg:w-1/2` — desktop-only, so mobile list-first is unaffected by construction), then restore panel IA inside `DiscoverAreasJourneyPanel` / `NavigationLevelPanel` / `AreaSelectedPanel`. No new files; no state/URL contract change.

## Before / After table

| Feature / user state | Before today | After this slice | User benefit | Evidence / mock / contract | Explicitly unchanged / out of scope |
|---|---|---|---|---|---|
| City-root panel heading & intro structure | Raw city/count heading only, no invitational framing (F8) | Approved-mock invitational heading pattern; city counts (areas/properties) shown in the JourneySwitcher's metrics strip, not the heading | Matches mock's onboarding tone; counts stay visible without cluttering the heading | `docs/audit/issue-2076/discrepancy-register.md` F8; mock `experience.html`; `team-lead-plan.toml` AC6/AC7 | Underlying count source (#2083's `journey.nodeCount`) unchanged |
| Direction state | Panel shows Direction's area list; no switcher present, no clear heading hierarchy vs city root | JourneySwitcher present (compact tab-strip), Direction heading distinguishable from city-root heading, breadcrumb/geographic context preserved | User can reorient and switch journeys without losing place | `team-lead-plan.toml` AC6; live-verified in Phase 7A (South-East Bangalore Direction state) | Direction-tier hierarchy generation itself (#2083, unchanged) |
| Local Destination state | Same structural gap as Direction (switcher absent, IA flat) | Same restoration as Direction — switcher mounted, heading hierarchy applied | Consistent behaviour across all navigable tiers, no special-cased regression | `team-lead-plan.toml` — this tier explicitly named because #2083 introduced it; not independently mocked, so After state is "matches Direction-tier treatment" rather than a distinct approved visual | Not independently live-verified this session (South-East Bangalore fixture in local testing had no populated Local-Destination cluster reached); flagged as an open question below |
| Area & listings state | JourneySwitcher absent; school-CTA and filters not in approved order (F16) | JourneySwitcher present (compact); "Add a school in this area" CTA promoted above property-type/bedroom filters and listing results | School-search is the mock's promoted secondary path, not buried below results | `docs/audit/issue-2076/discrepancy-register.md` F16; `team-lead-plan.toml` AC8; live-verified in Phase 7A (RR Nagar area leaf) | Listing card content/fields themselves unchanged |
| In-panel Areas/Schools/Agricultural journey switcher | Architecturally unreachable in `journey=area-first` — `DiscoverAreasJourneyPanel`'s early return never mounts it (F12) | Mounted at all four area-first states via the existing shared `JourneySwitcher` component and its existing `handleSelectJourney` writer; full-card density at city root, compact tab-strip below | Restores the mock's in-context journey choice that sibling journeys already have; no duplicate one-off implementation | `docs/audit/issue-2076/discrepancy-register.md` F12; `team-lead-plan.toml` root_cause; live-verified in Phase 7A + Phase 7B journey-switch round trip (area-first ↔ school-first) | The switcher component's own internal behaviour/tests (untouched, reused as-is) |
| Desktop map-left / panel-right shell | Panel's shell carries no `order` class (default `order:0`) while the map carries `order-1` → panel sorts **before** map at desktop widths (F10) | Panel shell carries `lg:order-2` (desktop-only) so it sorts after the map; mobile carries no `order-*` class at any breakpoint (unchanged from today) | Desktop layout matches the mock (map-left/panel-right) without touching the mobile list-first flow | `docs/audit/issue-2076/discrepancy-register.md` F10; `team-lead-plan.toml` R1 (highest-severity risk); live-verified at 1440×900 in Phase 7A | Map component internals, camera/zoom behaviour unchanged |
| Panel section order, dividers, taglines, school shortcut | Flat `<div className="p-4">` wrapper, no dividers/eyebrows, school CTA not promoted | Section eyebrow/divider structure restored; school-CTA promoted per Area/listings row above | Panel is scannable/navigable like the mock instead of an undifferentiated block | `team-lead-plan.toml` AC6/AC7/AC8 | Per-area editorial tagline (F13) — **not implemented**, no data source exists; scaffolding restored but unique per-area copy deferred to a content follow-up (see open questions) |
| Map click / panel click / breadcrumb / in-product Back / browser Back-Forward | N/A — this slice does not touch `state/url/**`, `useAreasNavigationJourney.ts`, or `MapDiscovery.tsx` | **Unchanged.** All navigation/URL/camera/breadcrumb behaviour is owned by #2083 and is out of this slice's allowed file scope | Avoids re-litigating the #2083 contract inside a shell/IA fix | `approved-execution-handoff.toml` forbidden_globs (these files listed explicitly) | Explicitly unchanged — no rows expected to differ here |
| Empty / query-active / filters-active / listing states | Rendered inside the same bare `p-4` wrapper as the other Area states | Rendered inside the restored shell; no state-specific logic changed, only the surrounding shell/IA | No regression to existing empty/filter/query behaviour | `team-lead-plan.toml` — no AC targets state-specific logic changes | Filter/query logic itself, empty-state copy, unchanged |
| Mobile list-first & sibling-journey non-regression | N/A (this is the regression this slice must not cause) | Mobile: shell carries no bare `order-*`/`h-full` class at any breakpoint (both are `lg:`-prefixed only), verified structurally via a negative-assertion unit test that was demonstrated falsifiable (deliberately reintroducing the bug reproduces a real failure), and live-verified list-first at narrow viewport. Sibling journeys (school-first, agri-first): 303 assertions across 6 suites pass with zero assertion edits; live-verified journey-switch round trip in Phase 7B | The single highest-severity risk in the plan (R1) — this is why it is the most heavily evidenced row | `team-lead-plan.toml` R1; `workdone-candidate.toml` [evidence]/[stop_conditions_status]; `product-verification.toml`; `product-sweep.toml` | — |
| Performance-sensitive shell/panel rendering | N/A | Not independently profiled — no code changes to render loops, memoization, or list virtualization; the change is limited to a shell wrapper and static className/JSX-structure edits | — | — | **Open question below** — whether #2095 (performance-agent review) is required for this slice |

## Risks

- R1 (highest severity): an unprefixed `order-*`/`h-full` class on the new shell would silently invert mobile list-first behaviour or compress the map. Mitigated by `lg:`-only prefixing plus a falsifiable negative-assertion test (see table row above).
- R2: shared shell/panel components changing could regress sibling journeys (school-first, agricultural). Mitigated by scope-limiting to `DiscoverAreasJourneyPanel`'s own render path and the existing shared components' *usage*, not their internals; full sibling-journey regression suite required.
- R3: reintroducing a city-wide count source instead of #2083's node-scoped `journey.nodeCount`. Mitigated by explicit AC and code-review focus.

## Planned tests / browser evidence

Unit/integration coverage for the switcher mounting at all four states, the two negative assertions (no bare `order-*`, no bare `h-full`), city-root heading/IA, and school-CTA DOM order. Full sibling-journey and #2083-integration regression batches. Live-browser Phase 7A (exact changed journey) and Phase 7B (journey-switch round trip) — both already executed once against the parked implementation; see `.claude/handoffs/issue-2084/product-verification.toml` and `product-sweep.toml`. E2E: the three existing area-first specs are expected to remain `NOT_REQUIRED`/environment-blocked per the same justification recorded in `approved-execution-handoff.toml` unless local fixture E2E infra changes.

## #2095 (performance-agent review) applicability

**Open question — not yet resolved.** This slice does not touch render-loop, memoization, or virtualization code; the change is a shell wrapper plus static JSX/className edits. Recommendation: #2095 is not required for this slice, but this is a recommendation, not a ruling — requesting explicit confirmation from the reviewer.

## Expected files

`src/features/discover/views/DiscoverRightPanelContainer.tsx` (+test), `src/features/discover/views/DiscoverAreasJourneyPanel.tsx`, `src/components/discover/navigation/NavigationLevelPanel.tsx` (+test), `src/components/discover/panels/AreaSelectedPanel.tsx` (+test). No files outside `src/features/discover/views/**`, `src/components/discover/navigation/**`, `src/components/discover/panels/AreaSelectedPanel.tsx(+test)`, `src/features/discover/navigation/__tests__/**`.

## Forbidden / out-of-scope areas

`src/features/discover/views/DiscoverRightPanel.tsx`, `src/components/discover/navigation/JourneySwitcher.tsx`, `src/features/discover/views/MapDiscovery.tsx`, `src/features/discover/state/url/**`, `src/features/discover/navigation/useAreasNavigationJourney.ts`, `backend/**`, `supabase/**`, `docs/audit/issue-2076/**`.

## Assumptions

- The existing `JourneySwitcher` component and its `handleSelectJourney` writer are the correct, sole reuse target (no new switcher implementation).
- The Local-Destination tier's After state is "identical structural treatment to Direction" absent a distinct mock reference for that tier (#2083 introduced this tier; it postdates the original mock).
- F14/F15/F17 remain out of scope as cosmetic/polish per the issue body, re-confirmed rather than assumed — see open question below given the amendment's review-contract language about "closeness to the approved After experience."

## Open questions (for reviewer ruling before/at approval)

1. **Per-area editorial tagline (F13):** no data source exists anywhere in the system for unique per-area copy. Recommendation: structural scaffolding only in this slice; unique copy is a separate backend/content follow-up issue. Confirm or reject.
2. **JourneySwitcher density:** recommend FULL cards at the area-first city root (matches the mock's primary entry treatment) and COMPACT tab-strip at Direction/Local-Destination/Area (matches sibling-journey convention once a node is selected). Confirm or reject.
3. **City counts placement:** recommend relocating into the switcher's metrics strip rather than the city-root heading (no information loss, just moved). Confirm or reject.
4. **F14/F15/F17 disposition:** the issue body defers these as cosmetic/polish with no separate scope. Under the #2096 review contract's "closeness to approved After experience" standard, should any of these receive an explicit After-table row in this PR, or does the issue body's existing ruling stand?
5. **#2095 applicability:** confirm whether performance-agent review is required for this slice (see section above — current recommendation is no).

---

## Revision 2 — city-root metrics loading state (ruling-3 follow-on)

**Status:** clarification-only addendum. No production code accompanies this revision; the two files named below remain untouched in the working tree. This section supersedes nothing above except where explicitly noted — it documents a gap discovered while implementing the already-approved ruling 3 (city counts sourced from #2083's canonical `journey.nodeCount`, not a legacy city-wide fallback; [ruling](https://github.com/gautirao/udupi-property-explorer/pull/2106#issuecomment-5184927528)).

### What was found

Implementing ruling 3 correctly surfaced a state the original table did not name: the brief window before `areasNavigationJourney.nodeCount` resolves. Two behaviours were considered and both were rejected by the reviewer on 2026-08-04T21:39:16Z:

- falling back to `cityTotal`/`discoverAreas`-derived counts during that window (the legacy source ruling 3 exists to remove), and
- rendering a literal `0 areas / 0 properties` as a stand-in for "not yet loaded" (indistinguishable from a genuine zero result).

The required behaviour is an explicit loading/unknown state, visually and accessibly distinguishable from a genuine zero, until `nodeCount` resolves — then `nodeCount`-only, no fallback ever.

Investigating how to implement that surfaced a second, independent gap: `matchingAreaCount` (`useAreasNavigationJourney.ts:498-508`) is `null` **permanently** at the city ROOT — not transiently during load — because (a) the hook only computes it for `DIRECTION`/`CLUSTER` nodes, and ROOT is neither, and (b) ROOT has no `descendantAreaKeys` by backend design (per the hook's own doc comment: "the root view is unfiltered and needs no area filter"). Combined with the fact that the count chips render at exactly one site and only at city root (compact mode elsewhere hides them per ruling 2), the one state where this count is ever visible is the one state where it can never resolve today. So the ruling's separately-approved "filter-aware `matchingAreaCount`" requirement cannot be satisfied by a loading-state UI alone — there is no canonical value to eventually show at ROOT without a source-side change.

### Proposed narrow unlock (two files, additive only)

| File | Current status | Requested change | Scope |
|---|---|---|---|
| `src/components/discover/navigation/JourneySwitcher.tsx` | Forbidden | Widen `totalProperties`/`areasCount` to `number \| null`, drop the `= 0` defaults, render an explicit loading/unknown token (e.g. an `aria-busy` chip) when null, keep genuine `0` rendering as `0`. No other prop, journey definition, keyboard behaviour, or density change. | Additive, backward-compatible |
| `src/features/discover/navigation/useAreasNavigationJourney.ts` | Forbidden | Add a ROOT-scoped `matchingAreaCount` branch reusing the existing `readDestinationCounts` + `listingEligibilityAccessor` predicate over the counts snapshot's whole-city area-key set (the same predicate the map/panel machinery already uses — no new source of truth). DIRECTION/CLUSTER/AREA-leaf behaviour stays byte-identical; only the ROOT case, which currently always returns `null`, changes. | One additive `useMemo` branch, ROOT-only |

Full detail, line citations, and the resulting Before/After row are in `.claude/handoffs/issue-2084/ruling3-unlock-contract-spec.md` (author: orchestrator, read-only investigation, no file edited).

### Honest risk — flagging rather than assuming

`useAreasNavigationJourney.ts` is a file this run has treated as forbidden throughout, specifically to avoid reimplementing #2083's count model. The proposed change is deliberately the narrowest possible (one additive branch, same predicate, ROOT-only), but a reviewer may reasonably prefer this route through #2083's owner or a separate follow-up issue rather than widen #2084's scope. **Both are acceptable outcomes** — if deferred, ruling 3's filter-aware requirement should be explicitly marked deferred with the legacy-source limitation documented (not left silently unmet while any code comment claims otherwise), and this revision's "N areas" row falls back to steady-state `?? discoverAreas`-derived counts exactly as they render today, with the loading-state affordance from Unlock A still applied. There is also a smaller possibility Unlock B's frontend-only assumption is wrong (the snapshot might not actually carry a whole-city area-key set) — if so, it becomes a backend contract change and is out of this slice regardless of ruling.

### Revised Before/After row (supersedes the "In-panel Areas/Schools/Agricultural journey switcher" row's metrics-strip content only; the switcher-presence claim in that row is unchanged)

| State | Displayed "N areas" / "N properties" |
|---|---|
| Cold load (`nodeCount == null`) | Explicit loading/unknown affordance — no number, no `cityTotal`/legacy value |
| Resolved, no filters | `nodeCount.listingCount` / ROOT-scoped `matchingAreaCount` (if Unlock B approved) or existing `discoverAreas`-derived count (if deferred) |
| Resolved, filters active | Same source as above, values track active filters (only true if Unlock B approved — otherwise unchanged from today, no filter-awareness) |
| Genuine zero | Literal `0`, visually/accessibly distinct from the loading state |
| Any non-root state | Not rendered (compact strip, unchanged) |

### Additional open question

6. **Unlock B disposition:** approve the additive ROOT-scoped `matchingAreaCount` branch in `useAreasNavigationJourney.ts` as described above (in-scope for #2084), or defer it to #2083's owner / a follow-up issue (in which case ruling 3's filter-awareness is accepted as unmet for this slice, with the limitation documented in code and in the eventual PR)?

Requesting a fresh exact-head `implementation-understanding:v1` marker at this revision's head covering Unlock A (required either way) and a disposition on Unlock B / open question 6.
