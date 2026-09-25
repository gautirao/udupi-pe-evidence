# Issue #2714 — desktop Map bottom-chrome overlap: before/after evidence

Captured 2026-09-25 with headless Chromium (Playwright) against an isolated local fixture stack
(backend :8514, Flyway and scheduling off, disposable PostGIS fixture container). Telemetry was
declined in-page before each capture where the consent banner was present.

| label | source | served on | fixture DB |
|---|---|---|---|
| `before-*` | working tree with `DiscoverMapCanvas.tsx`, `DiscoverMapSurface.tsx`, `DiscoverMapCountBadge.tsx` stashed back to `origin/main` (`c7e65529`) | :5714 | `pg-e2e-2714-*` (fixture-restore, disposable) |
| `after-*` | this branch's working tree (`fix/2714-desktop-map-bottom-chrome-overlap`) | :5714 | same container, unchanged |

`*-report.json` holds, for each of the 5 states below at both viewports, the bounding box of every
visible bottom-chrome control (`tipPill`, `countBadge`, `cityRecenter`, `zoom`, `legend`,
`attribution`) and every pairwise intersection (>1px in each direction) — same method as #2713's
capture script. A second pass (`measure-2714-hint.mjs`, not checked in) added `schoolMoreHint` and
`areaRecenter` to the scan for the school-radius "showing first N" state, which is not reachable
from a plain URL (it requires forcing `hasMore: true` on the anon school-radius-listings response,
mirroring #2698's own interception approach).

## Bounding-box results (0 intersecting pairs required)

| state | viewport | overlapping pairs before | after |
|---|---|---|---|
| Area-first city landing | 1440×900 / 1024×768 | 3 / 6 | 0 / 0 |
| Selected group | 1440×900 / 1024×768 | 3 / 6 | 0 / 0 |
| Selected area (residential) | 1440×900 / 1024×768 | 3 / 6 | 0 / 0 |
| School-first landing | 1440×900 / 1024×768 | 3 / 4 | 0 / 0 |
| Agri-first landing | 1440×900 / 1024×768 | 2 / 3 | 0 / 0 |
| School-radius, anon, "showing first N" hint (`schoolMoreHint`) | 1440×900 / 1024×768 | not separately captured on main (hint didn't exist pre-#2698) | 0 / 0 |

The original 3 pairs the issue reported (`tipPill x countBadge`, `tipPill x legend`,
`cityRecenter x zoom`, all measured at the selected-area-residential/1440×900 state) are present
in `before-report.json` at that exact state/viewport, plus additional overlaps this scan surfaced
in other states the issue's "states to check" list names — `countBadge x zoom` (school-first
landing, the badge's right-anchored generic variant) and several `x legend` / `x cityRecenter`
pairs unique to the narrower 1024×768 width, where the centred tip pill and count badge's
unwrapped width reached into the neighbouring columns. All are 0 in `after-report.json`.

## Commercial subtype and "node out of view" states

Not independently re-measured: the CSS classes driving every control's position (`bottom-*`,
`left-1/2`/`right-4`, `max-w-*`) are identical regardless of the Residential/Commercial toggle —
only the panel's listing data differs — so the Commercial subtype is covered by the same fix.
The "node out of view" (`areas-recenter-button` shown) state was not reliably reproducible via a
scripted map drag in this pass; its bottom-right-column placement (`bottom-72`) was instead sized
from the same live-measured control heights (30px/38px/66px/38px for city-recenter/badge/hint/area-
recenter) used for the other three right-column occupants, with an 8px+ verified margin against
each — see the inline comments in `DiscoverMapSurface.tsx` and the new
`Issue #2714 — desktop bottom-right column stacking budget` describe block in
`apps/web/src/pages/__tests__/MapDiscovery.issue2088.recenterButtonZOrder.test.ts`.

## Zoom control clickability (AC3)

`elementFromPoint` at the centre of `.leaflet-control-zoom-out` returned the control's own inner
`SPAN` (not an overlapping control) at both 1440×900 and 1024×768 after the fix — see the visual
evidence: both zoom buttons ("+" and "−") are fully visible and unobstructed in every `after-*`
screenshot, where several `before-*` screenshots show only "+" reachable (the "−" button's own
pixels were painted over by "Recenter on <city>").

## Mobile Map placements unchanged (AC4)

No mobile-only (`isMobileMapOverlay`) branch in `DiscoverMapCanvas.tsx`, `DiscoverMapSurface.tsx`
or `DiscoverMapCountBadge.tsx` was touched — every diff in this PR is confined to the desktop
(non-`isMobileMapOverlay`) branch of each ternary. The existing `Issue #2698 — mobile Map...`
describe blocks in both touched test files pass unmodified.
