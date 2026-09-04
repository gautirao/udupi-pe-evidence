# Issue #2430 — browser evidence

Before and After captured in the **same running app**, against the **same
backend and the same data**, at both viewports the issue requires.

## How it was produced

| | |
|---|---|
| Stack | `scripts/dev-worktree-stack.sh --frontend-port 5196 --backend-port 8110` |
| Backend | one instance, left running across both captures |
| Before tree | detached worktree at `e80865da` (this PR's merge base) |
| After tree | `issue-2430-commercial-labels` |
| Swap | only the Vite frontend on 5196 was restarted between runs |

The served tree was verified each time by fetching
`http://localhost:5196/src/lib/propertyTypeConfig.ts` and checking for
`getPropertyTypeLabel` — absent for Before, present for After. This guards the
failure mode where a stale dev server silently serves the wrong worktree and
both runs produce identical output.

The telemetry consent banner is declined before each capture.

## Fixture

Udupi → Saligrama (`a:IN|KA|Udupi|Saligrama`) is the only navigable Udupi area
holding a `commercial_building`, found by scanning the anonymous
`/api/discover/cities/{city}/listings` payload for every reachable AREA node in
Udupi and Bangalore. The area also holds a `residential_plot`, so one screen
shows two previously-broken labels at once.

## Result

| Surface | Before | After |
|---|---|---|
| Result card pill | `Commercial_building` | `Commercial Building` |
| Marker popover pill | `COMM. BUILDING` | `COMMERCIAL BUILDING` |
| Map legend, row 1 | `Other` | `Residential plots` |
| Map legend, row 2 | `Other` | `Commercial buildings` |
| Raw enum tokens on page | `Commercial_building`, `Residential_plot` | none |
| A bare `Other` line | yes (1366×768) | no |
| Console errors | 0 | 0 |

Card and popover disagreed before (`Commercial_building` vs `Comm. Building`)
and now render the identical string from one owner.

Full captured page text for each run is in `before-summary.json` and
`after-summary.json`.

## Files

| File | What it shows |
|---|---|
| `before-1366x768-area-leaf.png` | legend reading `Other` / `Other` |
| `after-1366x768-area-leaf.png` | legend reading `Residential plots` / `Commercial buildings` |
| `before-1366x768-result-card.png` | card pill `Commercial_building` |
| `after-1366x768-result-card.png` | card pill `Commercial Building` |
| `before-1366x768-marker-popover.png` | popover pill `COMM. BUILDING` |
| `after-1366x768-marker-popover.png` | popover pill `COMMERCIAL BUILDING` |
| `before-390x844-result-card.png` | mobile card pill `Commercial_building` |
| `after-390x844-result-card.png` | mobile card pill `Commercial Building` |
| `*-city-root.png` | Udupi city root at both viewports, both runs |
| `*-summary.json` | machine-checked assertions per viewport and view |

## Mobile map surface (390×844)

Review finding on head `60bb55de`: the first mobile capture stayed in List mode
and recorded `NO_MARKER_RENDERED`, so neither the mobile legend nor the
marker/preview surface was exercised in a real browser.

Re-captured through the **ordinary user path** — the in-app List/Map segmented
control — then activating the same Saligrama commercial marker. No production
code was changed to make this route reachable.

| | Before | After |
|---|---|---|
| Map toggle reachable | yes | yes |
| Markers rendered | 2 | 2 |
| Mobile map legend | `Other 1` / `Other 1` | `Residential plots 1` / `Commercial buildings 1` |
| Mobile preview sheet pill | `Comm. Building` | `Commercial Building` |
| Raw enum tokens on page | `Commercial_building`, `Residential_plot` | none |
| A bare `Other` line | yes | no |
| Console errors | 0 | 0 |

Before, the same mobile screen disagreed with itself: the result card said
`Commercial_building` while the preview sheet said `Comm. Building`. Both now
render `Commercial Building` from the one owner.

Files: `before-390x844-map-mode.png`, `after-390x844-map-mode.png`,
`before-390x844-map-marker-preview.png`, `after-390x844-map-marker-preview.png`,
`before-390x844-map-summary.json`, `after-390x844-map-summary.json`.
