# CLI reading guide — active context & count-badge design handoff

**For:** an agent/CLI with full project access, picking up this design handoff.
**Nature:** design-only. No production/app code was changed. Two new files, both under `ui_kits/discover/src/`.

---

## What changed (exhaustive)

Two files were **added**. Nothing else was edited, moved, or deleted.

| File | Type | Purpose |
|---|---|---|
| `ui_kits/discover/src/ACTIVE_CONTEXT_AND_COUNT_BADGE_DESIGN.md` | Markdown spec | The complete design decision + all required tables + engineering handoff. **Source of truth — read this first.** |
| `ui_kits/discover/src/ACTIVE_CONTEXT_wireframes.html` | Static HTML | Annotated desktop mock screens (7 states) + chip anatomy + badge matrix. Visual companion to the spec. Open in a browser. |

Verify with git:

```bash
git status --short            # → two untracked files under ui_kits/discover/src/
git log --oneline -5          # no app-source commits from this work
```

---

## Read in this order

1. **`ACTIVE_CONTEXT_AND_COUNT_BADGE_DESIGN.md`** — start at §1 (Problem & principle). The whole design collapses to two sentences at the end of §1:
   - *Scope lives in the breadcrumb. Filters and search live in chips.*
   - *The count always names its scope and shows `M of N` when filtered.*
   Then §3 (chip taxonomy table), §6 (badge state table), §8 (Start over), §13 (engineering handoff).
2. **`ACTIVE_CONTEXT_wireframes.html`** — render it (`open` it, or serve the project root and browse to the file) to see the seven states the spec describes. It links `../../../styles.css` for the ReTrends tokens.

---

## How to ground the design against the current code

The spec references real files. To see the *current* behaviour the design changes, read these (do not modify them — design handoff only):

- `ui_kits/discover/src/DiscoverPortal.jsx`
  - state model — `filters` / `setFilters`, `DP_DEFAULT_FILTERS` (line ~70): today only `{ budget, ptype, beds, verified }`. The design extends this with `sellerType`, `dateRange`, `backOnMarket`, `newToMarket`, `reraRegistered`, `readyToMove`, and `q`.
  - `reset()` (line ~115): the current Start-over. Already a clean slate (Option A); the design promotes it to a labelled button + conditional confirm.
  - `summary` / `crumbMap` (line ~209): what feeds the map badge today.
- `ui_kits/discover/src/PortalMap.jsx`
  - the bottom-center **"Showing X {noun}"** pill (search `Showing`, ~line 895) — the badge the design re-specifies (§6).
  - the top-left crumb chip (~line 840) — the breadcrumb the design keeps as the home of *scope*.
- `ui_kits/discover/src/components/shared.jsx`
  - `DPHeaderBand` (crumb + stats) and `DPFilterBar` / `DP_DEFAULT_FILTERS` — where the new `DPActiveContextBar` + `DPChip` + extended filter model would live.
- `ui_kits/discover/src/DiscoverPanel.jsx`
  - per-layer panel bodies + the `DPEmpty` empty states (§7 routes these by cause).

Prior related handoffs in the same folder give house style and precedent:
`REGION_SELECTION_GUIDANCE.md`, `ISSUE_1808_COMMENT.md`, `PR_B_IMPLEMENTATION.md`, `AREA_MARKER_UX.md`, `MAP_PANEL_ALIGNMENT.md`.

---

## Guardrails (from the brief)

- **Design only.** Do not implement React/backend from this handoff unless a new implementation issue is opened.
- **Do not touch** app source outside the design-artifact area for this task.
- **Out of scope:** mobile bottom sheet/layout, map label-overlap, school-search internals, taxonomy/Central-Bangalore, ingestion/DB, saved-homes & trust-tier logic.
- **One flagged dependency:** a possible **count-contract gap** (§6, §13 "Risks") — if the panel result list and the map query can ever return different totals for the same context, the `M of N` promise needs a single shared count selector; until reconciled, the badge falls back to `Filtered results` (no number). This is the one place the design suspects a missing API contract.

---

## When you're ready to build

The spec's §13 is a ready-to-file issue: title, scope, likely files, acceptance criteria, test scenarios, risks, non-goals. Recommended issue title:

```
feat(discover): add active context chips and trustworthy result-count badge behaviour
```
