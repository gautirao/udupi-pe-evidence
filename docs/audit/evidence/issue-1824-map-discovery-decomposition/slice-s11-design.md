# Slice S11 — Design + <800 Feasibility Finding (ESCALATION)

Base: origin/main @ `838f620e` (MapDiscovery.tsx 2421 lines after S1-S10). S11 was framed as "the lever that
reaches the <800 composition-root target that closes #1824." Phase 0.7 (explorer-planner + architect) surfaced
a scope-reshaping / acceptance-criterion finding — HALTED for Main-Agent (likely user) ratification before
authoring.

## The <800 finding (LOAD-BEARING)

The JSX return tree is **L1844-2420 (~576 lines)**. Decomposing ONLY the JSX lands at **~2000**, NOT <800:

| Extraction | JSX removed | Call-site prop-threading added back | Net |
|---|---|---|---|
| DiscoverMapCanvas (map half, ~50 shared props) | ~320 | ~60 | −260 |
| DiscoverRightPanel container (~100 props) | ~224 | ~100 | −124 |
| Sheets group | ~22 | ~5 | −17 |
| **JSX-only total** | | | **→ ~2020** |

Every prop the map/panel halves consume (currentMapMarkerListings, overviewAreas, discoverBadge, mapLayerKind,
journey segments, ...) is **shared across both sibling halves and/or the handlers**, so a sub-view cannot carry
its derived-consts OUT — they must be prop-threaded (net-neutral). Only the markup itself leaves the file.

Going below ~2000 requires dissolving the ~600 LOC derived-consts + ~300 LOC URL-state-machine handlers +
~300 LOC irreducible core hook wiring into new hooks (~30% threading overhead each). Realistic multi-slice
floor ≈ **~1200-1400**. Pushing below that fragments the URL-state-machine handlers + the core hook wiring
across ~10 artificial hooks that fight the composition-root pattern — decomposition-for-line-count, net-negative
for maintainability.

## Architect verdict (to ratify)

**<800 is infeasible at acceptable architectural quality. Re-baseline the acceptance floor to ~1200 via a
3-slice sequence:**
- **S11a** (this slice): DiscoverMapCanvas (map half L1850-2169 incl. the sr-only announce) + DiscoverOverlaySheets
  (NearSchoolSheet + ConsentBanner + PrivacyToggle L2397-2418) → lands **~2050**. HIGH risk (the ~50-prop
  verbatim threading surface), opus review + performance-analyst pass required.
- **S11b**: move the 2-3 most cohesive derived-const clusters into presenter hooks (extends the S9b pattern) → ~1600.
- **S11c**: DiscoverRightPanelContainer call-site + 1 handler command-hook → ~1200.
- Close #1824 at ~1200 on the criterion "no God-component region >~600 LOC; all cohesive clusters extracted"
  — NOT a raw <800. If the user insists on <800, technically reachable via ~4-6 further hook slices, advised
  against (flag each as decomposition-for-line-count).

## New allowed path

`src/features/discover/views/` (PropertyMap.tsx / DiscoverRightPanel.tsx / SchoolGroupAreasPanel.tsx /
DiscoverMapMarkerPopover.tsx / src/components/discover/** / src/features/discover/state/** remain FORBIDDEN —
consumed, not modified).

## S11a first-slice gates (if ratified)

AC-VERBATIM (the moved JSX byte-for-byte incl. the #1801/#1806/#1798/#1547 rationale comments L1892-1994 +
L2152-2156; no derived-const/handler logic moves — all prop-threaded); prop-parity checklist (source name ===
passed name for the ~50 props); S8 badge-fork guard (DiscoverMapCanvas receives discoverBadge/copy as PROPS
only, must NOT import formatDiscoverBadgeCopy/deriveSchoolRadiusPillNoun/hasActiveAnonPropertyFilter);
behaviour-preservation (area-first/school-first/agri-first journey mounts, #1798 popover, #1547 scroll+highlight,
#1806 cluster click, #1588/#1607 CitySelect gating); performance-analyst pass (DiscoverMapCanvas re-renders on
every mapZoom change — confirm no new per-zoom-tick re-render regression from inline-literal props
schoolCircle L1881 / sectorOverlay L1980 / areaRestoreBbox L1963 / schoolFocusRadiusKm IIFE L1953).

Constraint C1 (S11b): any presenter hook must respect the L1781 early return — the post-return plain-const block
(L1783-1842) can't be pulled into a hook without hoisting inputs above L1781 (why resolveMarkerPopover is a plain
function).
