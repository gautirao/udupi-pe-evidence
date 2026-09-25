# Issue #2698 — mobile Map bottom-chrome overlap: before/after evidence

Captured 2026-09-25 with headless Chromium (Playwright), `isMobile`/`hasTouch`, DPR 2,
against an isolated local fixture stack (backend :8183, Flyway and scheduling off).
Telemetry was pre-declined via `localStorage`, so the consent banner does not cover the
measured controls.

| label | source | served on | fixture container |
|---|---|---|---|
| `before-*` | detached worktree at `c93f9191` (origin/main, the branch's merge-base) | :5183 | `pg-test-2698c` |
| `after-*` | `fix/2698-mobile-list-map-parity` at `afcab8a7` (re-captured after the review fix) | :5184 | `pg-test-2698d` (same seed) |

Provenance: the served `DiscoverMapSurface.tsx` contained the marker `bottom-[144px]`
0 times on :5183 and once on :5184. The served `DiscoverMapStatusHints.tsx` on :5184
contained `bottom-[192px]` (the `afcab8a7` hint fix) once.

Each Map capture follows a click on **Map**, then asserts that the Leaflet container
and a visible marker are present before measuring. `*-report.json` holds the bounding
box of every visible bottom-chrome element and every pairwise intersection (> 1px in
each direction). From `afcab8a7` onwards the measured set also includes the anonymous
school-radius "showing first N" hint and the #2628 results heading.

| state | viewport | overlapping pairs before | after |
|---|---|---|---|
| Area results (Manipal), mobile Map | 375×667 | 8 | 0 |
| Area results (Manipal), mobile Map | 390×844 | 8 | 0 |
| Area results (Manipal), mobile Map | 412×915 | 8 | 0 |
| Homes near school, mobile Map | 375 / 390 / 412 | 4 each | 0 |
| Homes near school with the "showing first N" hint (`map-school-hasmore`), mobile Map | 375 / 390 / 412 | not captured on main | 0 |
| Area results, desktop | 1440×900 | 3 | 3 (unchanged) |

`map-school-hasmore`: the fixture has only 4 homes near the school, so the capture
intercepts the real anonymous `school-radius-listings` response and sets
`hasMore: true`. Nothing else in the response is changed. This is the state where the
review of `2650b2f8` found "Recenter on ⟨city⟩" (then at `bottom-[100px]`) under the
hint (`bottom-28 right-4 z-[1000]`). At `afcab8a7` the hint sits at `bottom-[192px]`
on mobile. That collision was introduced mid-PR and never existed on main, so there is
no main-branch "before" frame for it.

School results Filters trigger: 28×28 icon-only before, 75×28 with the visible word
"Filters" after, at all three mobile widths and on desktop.
