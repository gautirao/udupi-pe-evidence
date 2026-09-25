# Issue #2716 — mobile Map summary pill overlapping the Leaflet zoom control: before/after evidence

Captured 2026-09-25 with headless Chromium (Playwright), against two isolated local
fixture stacks (own Postgres/PostGIS containers, own backend/frontend ports —
never the shared dev Supabase). Telemetry consent is declined (best-effort) before
each measurement, mirroring the app's own real dismissal path.

| label | source | served on |
|---|---|---|
| `before-*` | detached worktree at `da2cd18e` (origin/main, this branch's merge-base) | :5201 / :8201 |
| `after-*` | `fix/2716-city-landing-summary-pill-zoom` (this branch's HEAD, after the fix below) | :5200 / :8200 |

State captured: the public, anonymous city-landing view for Bangalore
(`/discover?city=bangalore`, no area/school selected — the guided-entry /
area-first-city-landing state that renders `DiscoverMapCountBadge`'s
public-landing summary pill). For the three mobile widths, the mobile Map
overlay is opened via the **Map** toggle (the only render path where
`isMobileMapOverlay` is true) before measuring. The 1440×900 capture is the
desktop layout, where the Map overlay toggle does not exist and the fix is a
no-op by construction (`isMobileMapOverlay` defaults `false`).

Each `*-report.json` holds the `getBoundingClientRect()` of the summary pill
(`[data-testid="discover-badge"]`) and the Leaflet zoom-out control
(`.leaflet-control-zoom-out`), plus a boolean axis-aligned intersection test
between them.

| viewport | overlaps before | overlaps after |
|---|---|---|
| 375×667 (mobile Map) | **true** | false |
| 390×844 (mobile Map) | **true** | false |
| 412×915 (mobile Map) | **true** | false |
| 1440×900 (desktop) | false | false (byte-identical pill rect to `before`) |

Desktop pill rect is identical on both sides —
`{left: 180.43, top: 842.5, right: 539.57, bottom: 880}` — confirming the fix
is scoped entirely to the mobile Map overlay and does not touch #2714's
(separate, still-open) desktop bottom-chrome issue.

## Files

- `before-375x667.png`, `before-390x844.png`, `before-412x915.png`,
  `before-1440x900.png` — origin/main.
- `after-375x667.png`, `after-390x844.png`, `after-412x915.png`,
  `after-1440x900.png` — this branch.
- `before-report.json`, `after-report.json` — bounding-box + intersection data
  backing the table above.

## Reproduce

```bash
# from a worktree at the desired commit, with .env.e2e / apps/api/.env symlinked
# and a distinct .env.e2e.local port pair for that worktree:
EVIDENCE_LABEL=before bash scripts/run-e2e-local.sh --project=full e2e/capture-2716-evidence.spec.ts
# writes scratch/evidence-2716/before-*.png and before-report.json
```

The capture spec used to produce these screenshots (`capture-2716-evidence.spec.ts`,
a one-off measurement harness, not a regression test) was run ad hoc from
`e2e/` in each worktree and is not committed — it is not part of either
worktree's diff. The actual regression coverage for this issue lives in
`e2e/discover-mobile-map-badge-zoom-2716.spec.ts`, which is committed on the
`fix/2716-city-landing-summary-pill-zoom` branch.
