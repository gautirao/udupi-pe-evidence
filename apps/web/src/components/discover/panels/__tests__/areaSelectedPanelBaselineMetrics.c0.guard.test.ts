import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Issue #2658 — C0 baseline characterization.
 *
 * Pins the pre-decomposition shape of AreaSelectedPanel.tsx (the
 * PropertyFilterGroups.tsx half of this file's original pair was retired
 * in C4 — that file is now DELETED, its hook and presentational component
 * relocated verbatim to
 * features/discover/buyer-filters/{controllers,sections}/PropertyFilterGroups*
 * once nothing outside the buyer-filters domain imported it anymore; the
 * `PropertyFilterGroupsProps extends...`/"God-hook 30+ fields"/agri-scope-
 * creep characterizations that used to live here proved a PRE-decomposition
 * shape that no longer exists to characterize post-C4, so they retire with
 * the file rather than chase a path that isn't the God-hook anymore).
 *
 * This is a static source guard, not a render test: the point is the shape
 * of AreaSelectedPanel.tsx as it exists on this branch, not its runtime
 * behaviour (that's covered by the existing AreaSelectedPanel.*.test.tsx
 * suite).
 *
 * Comments are stripped before counting so prose can't inflate/deflate a
 * count; JSX comments are stripped too.
 *
 * Issue #2658 (C5) — the "~40-field flat prop dump" characterization this
 * file used to pin here has RETIRED, not merely gone stale: the {view,
 * commands} contract flip is the decomposition landing, not scope creep, so
 * re-widening this guard's threshold to match would pin the very sprawl the
 * issue exists to collapse. `AreaSelectedPanelPropsBudget.guard.test.ts`
 * (C6) is the guard that now owns the props-shape characterization going
 * forward — it asserts the POST-flip shape (exactly `{view, commands}`)
 * rather than a field count that has no post-flip meaning.
 */

const PANEL = resolve(__dirname, '../AreaSelectedPanel.tsx');
// Issue #2658 (C4) — the relocated home of the QUICK_PROPERTY_TYPES constant
// the agri scope-creep guard below still pins; see this file's header for
// why the rest of the old PropertyFilterGroups.tsx characterization retired.
const RELOCATED_FILTER_GROUPS_SECTION = resolve(
  __dirname,
  '../../../../features/discover/buyer-filters/sections/PropertyFilterGroups.tsx',
);

const stripComments = (raw: string) =>
  raw
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const panelSource = readFileSync(PANEL, 'utf-8');
const panelStripped = stripComments(panelSource);
const relocatedFilterGroupsStripped = stripComments(
  readFileSync(RELOCATED_FILTER_GROUPS_SECTION, 'utf-8'),
);

const countMatches = (source: string, pattern: RegExp) =>
  (source.match(pattern) ?? []).length;

describe('#2658 C0 — pre-decomposition baseline (AreaSelectedPanel + PropertyFilterGroups)', () => {
  it('AreaSelectedPanel.tsx LOC reflects the completed C3 section-extraction reduction (was 1,319 pre-decomposition)', () => {
    // Issue #2658 (C3) — updated after ListingsBody (the last, largest
    // area-selected section) moved into
    // features/discover/area-selected/sections/, on top of every prior C3
    // section extraction and the C2 controller-wiring reduction this same
    // assertion already absorbed. The architect's plan cited 1,319 LOC on
    // main @ ceac0151 as the PRE-decomposition figure. Banded rather than
    // exact-pinned so an unrelated formatting nit doesn't fail this guard.
    // All 7 named area-selected sections (Breadcrumb, Toolbar,
    // ViewportSchoolCta, ResultHeading, WorkflowGroup, ListingsBody,
    // TrustStrip) are now extracted, so this band is not expected to need
    // updating again until C4 (Map migration) touches this file — a
    // shrinking LOC count here was the DESIRED signal of decomposition
    // progress throughout, not drift to chase away (same rule the
    // PropertyFilterGroups assertion below states).
    const loc = panelSource.split('\n').length;
    expect(loc).toBeGreaterThan(600);
    expect(loc).toBeLessThan(800);
  });

  // Issue #2658 (C5) — RETIRED. The pre-decomposition assertion here
  // (`AreaSelectedPanelProps carries the ~40-field flat prop dump the
  // decomposition must collapse`) pinned exactly the sprawl this issue
  // exists to collapse; keeping it green post-flip would mean either
  // reopening the flat interface or widening the threshold to match a
  // shape that no longer exists on this branch. Superseded by
  // `AreaSelectedPanelPropsBudget.guard.test.ts`, which asserts the real
  // post-flip contract (`AreaSelectedPanelProps` is exactly `{view,
  // commands}`) — the shape characterization this file's own header says
  // belongs to a C0 baseline, not a moving target chased release to
  // release.

  it('AreaSelectedPanel carries exactly 1 inline useCallback handler after C2 controller wiring (was 6+ pre-decomposition)', () => {
    // Issue #2658 (C2) — handleReturnToPreviousScope, handleEditAreas,
    // handleClearAreas, handleRemoveCommittedArea and handleAddNearbyAreas
    // all moved into useResultScopeController / useAreaSetScopeCommands.
    // Only handleAddSchool remains inline. Expected to hit 0 once C3 moves
    // it too — see the LOC guard above for the same "shrinking is the
    // signal" framing.
    const callbackCount = countMatches(panelStripped, /useCallback\(/g);
    expect(callbackCount).toBe(1);
  });

  it('Agricultural quick types are never routed through the family/subtype logic (guard against scope creep)', () => {
    // R-Agri guard from the architect's plan: prove Agricultural is never
    // part of the buyer-filters quick-type vocabulary today, so a future
    // commit that "widens" it is a deliberate, reviewable change — not a
    // silent side-effect of the decomposition. Re-pointed in C4 at the
    // relocated PropertyFilterGroups.tsx section (features/discover/
    // buyer-filters/sections/) after the old components/discover/panels/
    // copy was deleted.
    expect(relocatedFilterGroupsStripped).toMatch(
      /QUICK_PROPERTY_TYPES = \['apartment', 'villa', 'residential_plot'\]/,
    );
    expect(relocatedFilterGroupsStripped).not.toMatch(/agricultural/i);
  });
});
