# Issue #2419 — anonymous draw-entry gate: visual evidence

Live real-browser evidence, genuine pointer interaction, against a local stack
(Vite `:5331`, Spring Boot `:8231`, isolated PostGIS fixture container
`pg-fixture-f6-2419` on `:5436`).

BEFORE and AFTER differ **only** by the two-line gate in
`apps/web/src/hooks/useDiscoverPageState.ts`. Same URL, same stack, same fixture,
same session; the BEFORE captures were taken with the gate reverted in place and
the fix restored immediately afterwards (working tree verified clean each time).

## Capture protocol

Every frame below passed a gate **before** the shutter, and the capture throws
rather than shoots if any of it fails:

- **Tiles settled** — `.leaflet-tile` count equals `.leaflet-tile-loaded` count
  and is non-zero. An unpainted map is a fair objection to an absence claim: a
  layer that has not painted might not paint an overlay either.
- **Auth state asserted** — anonymous frames require the "Sign in" affordance to
  be present; the signed-in frame requires it absent plus authenticated chrome.
  A storage state that silently fails to apply would otherwise produce an
  anonymous frame filed under a signed-in name.
- **Consent banner in the same state within each compared pair.** Stated
  precisely, because it is not uniform across the whole directory and a blanket
  claim here would be false:

  | frames | banner | why |
  |---|---|---|
  | Set B anonymous (5, 6, 7) | dismissed | Decline click took in that session |
  | Set B signed-in (8, 9) | visible | fresh session, banner re-presented |
  | Set A (1, 2, 3, 4, 4b) | visible | after clearing the origin's storage the Decline click no longer dismissed it; not fought, since leaving it present in **both** arms is equally comparable |

  The telemetry **value** is `Off` in every frame — it is default-deny, and the
  status line reads "Usage data: Off" throughout. Only the banner's visibility
  varies, and it varies **between** sets, never **within** a compared pair:
  A-BEFORE/A-AFTER both show it, B-BEFORE/B-AFTER both hide it, and the
  signed-in frames are a control arm rather than a before/after pair. Every
  comparison this evidence asks you to make is therefore matched. The banner
  also sits at the bottom edge, clear of the chip and panel regions the claims
  depend on.
- One variable per pair: same URL, same viewport, same scenario.

## Two capture sets

**Set A (1–4b)** — anonymous, committed POLYGON over a prior RR Nagar AREA_SET.
Proves the **Redraw** entry point and that the committed scope survives the fix.

```
/discover?city=bangalore
  &rscope=poly&rpoly=12.94000:77.51500;12.96000:77.51500;12.95000:77.54000
  &rprev=areas:IN|KA|Bengaluru|RR Nagar&lat=12.94995&lon=77.52490&zoom=14
```

**Set B (5–9)** — the same POLYGON scope on **Avalahalli**, the fixture's
purpose-built zero-listing area, so the POLYGON zero-result recovery panel
actually mounts and its **Adjust boundary** row is reachable. This is what makes
the absence claim non-vacuous: Set A's page has results, so the recovery panel
never mounts there and "Adjust boundary is absent" would have been true for the
wrong reason.

```
/discover?city=bangalore&node=a:IN|KA|Bengaluru|Avalahalli
  &rscope=poly&rpoly=12.94000:77.51500;12.96000:77.51500;12.95000:77.54000
  &rprev=areas:IN|KA|Bengaluru|RR Nagar
```

## Set A — anonymous, Redraw

`2` and `4b` are the primary Set A evidence: a matched pair — same camera, same
16/16 loaded tiles, same consent banner, same panel content — whose only
difference is the Redraw control.

`1` and `4` are magnifications of the chip, and they are **byte-derived from
those two files** rather than separately captured. Both are `460×40`, the exact
region `(8,132)–(468,172)`, and either is re-derivable in two lines:

```python
from PIL import Image
Image.open("2-before-anon-full-page.jpg").crop((8, 132, 468, 172)).save("check.png")
# byte-identical to 1-before-anon-chip-shows-redraw.png
#   (and 4b… -> 4-after-anon-chip-no-redraw.png)
```

This replaces an earlier pair of crops that carried the same caption but were
**not** derived from `2` and `4b`. They were separate `zoom` captures, and the
`zoom` action re-renders the live page rather than cropping the prior
screenshot — so the map camera, still animating between the two calls, had moved
on. The images were of the correct region at a slightly later moment, which made
the provenance sentence false even though the chip content was right. An
independent verifier caught it by re-deriving the crop and finding the
backgrounds did not match. Recorded here because the failure is not obvious:
a "crop" that silently re-photographs is the kind of artefact that reads as
verifiable and is not.

| | |
|---|---|
| `1-before-anon-chip-shows-redraw.png` | Chip offers **Redraw**. `active-scope-chip-redraw` present; chip text `"Drawn area / Redraw / Return to RR Nagar"`. |
| `2-before-anon-full-page.jpg` | The same state full-page, for comparison against `4b`. |
| `3-before-anon-redraw-enters-draw-mode.jpg` | Clicking Redraw **enters draw mode** — "Draw your search area … Undo last point / Cancel". The wasted journey. |
| `4-after-anon-chip-no-redraw.png` | Same region, same session: `"Drawn area / Return to RR Nagar"`. `active-scope-chip-redraw` **absent** — removed, not disabled. |
| `4b-after-anon-full-page-scope-intact.jpg` | No collateral damage: polygon still renders, 9 results, "Return to RR Nagar" still works. |

## Set B — anonymous, BOTH entry points, and the signed-in control arm

| | |
|---|---|
| `5-before-anon-both-entries-redraw-and-adjust-boundary.jpg` | **Both** entry points in one frame: **Redraw** in the chip and **Adjust boundary** under "CHANGE YOUR DRAWN AREA", with "No matching homes inside your drawn area". |
| `6-before-anon-adjust-boundary-enters-draw-mode.jpg` | Clicking **Adjust boundary** also enters draw mode — the second wasted journey, proved distinctly from Redraw. |
| `7-after-anon-both-entries-absent-panel-still-mounted.jpg` | Same URL/session with the fix: no Redraw, and the whole "CHANGE YOUR DRAWN AREA" section gone — **while the zero-result panel is still mounted**. The absence is of the control, not of the surface. |
| `8-after-signed-in-both-entries-retained.jpg` | Same URL, same build, signed in: **"Draw search area"** and **"Redraw"** both present, authenticated chrome, and the polygon query actually runs — "RESULT SCOPE — DRAWN AREA · 2 shown for sale". |
| `9-after-signed-in-redraw-enters-draw-mode.jpg` | Signed-in Redraw still enters draw mode. No signed-in regression. |

## DOM assertions

| state | `active-scope-chip-redraw` | `area-zero-recovery-adjust-boundary` | zero-result panel mounted | tiles | anonymous |
|---|---|---|---|---|---|
| Set A BEFORE | present | n/a (page has results) | no | 16/16 | yes |
| Set A AFTER | **absent** | n/a | no | 16/16 | yes |
| Set B BEFORE | present | present | yes | settled | yes |
| Set B AFTER (anon) | **absent** | **absent** | **yes** | settled | yes |
| Set B AFTER (signed in) | present | n/a — polygon returns 2 results | no | settled | no |

The signed-in row is the control arm: at the same URL on the same build, the
controls the anonymous shopper no longer sees are still there for a signed-in
one — so the AFTER absence is the gate acting, not the page failing to render.

## Method notes

- Signed-in captures reuse the E2E harness's own provisioned storage state
  (`e2e/fixtures/user-auth.json`, `testuser@retrends.com`) injected into
  `localStorage`. No credentials were entered.
- That token was **cleared** from the origin before re-shooting Set A — a stale
  session would have made an "anonymous" frame silently signed-in. The
  auth-state gate above exists because that very contamination was caught here.
- Nothing is cropped to make a point; `1` and `4` use identical crop coordinates.
