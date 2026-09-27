/**
 * Architecture baseline freeze — Issue #2661 commit 1.
 *
 * Freezes SchoolJourneyPanels.tsx's current LOC / import-count / component-count as
 * a CEILING before the decomposition (commits 2-6) begins. Follows the pattern of
 * Issue #1838's EditListingForm.architecture.baseline.test.ts.
 *
 * This ceiling will be LOWERED in a later commit once the split has actually moved
 * code out of this file — do not raise these numbers to make a failing test pass;
 * a failure here after a commit that ADDS code to this file (rather than extracting
 * it) is a real regression signal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_FILE = join(__dirname, '..', 'SchoolJourneyPanels.tsx');

function readTarget(): string {
  return readFileSync(TARGET_FILE, 'utf-8');
}

// Top-level `import ... from '...'` statement count (named/default/type imports),
// counting each `import` STATEMENT once (not each named specifier).
function countImportStatements(src: string): number {
  // Counts every top-level `import` DECLARATION (its opening line), including a
  // multi-line named-import block whose `from '...'` clause lands on a later
  // line — a single-line-only pattern (requiring `from` on the same line)
  // silently undercounts those and was caught missing one during commit 2.
  return (src.match(/^import\s/gm) ?? []).length;
}

// All top-level function declarations (components + non-component helpers):
// homesNoun, prettifySlug, snapRadiusKm, SchoolSummaryBand, RadiusChips,
// RadiusResultHeading, SchoolRadiusEmptyState, MissingCoordsEmptyState,
// Milestone2Placeholder, SchoolBrowseIntro, SchoolCard, ZoneCard, AreaCard,
// SchoolBrowsePanel, SchoolsInAreaPanel, SchoolSelectedPanel,
// AreaSchoolCombinedPanel = 17.
function countTopLevelFunctionDeclarations(src: string): number {
  return (src.match(/^(export\s+)?function\s+[A-Za-z_]/gm) ?? []).length;
}

// Components only (PascalCase top-level function declarations) — excludes the 3
// lowercase non-component helpers (homesNoun, prettifySlug, snapRadiusKm) from the
// 17 total above, matching the file's documented "14 components" inventory.
function countTopLevelComponentDeclarations(src: string): number {
  return (src.match(/^(export\s+)?function\s+[A-Z][A-Za-z0-9_]*/gm) ?? []).length;
}

describe('SchoolJourneyPanels.tsx — architecture baseline (Issue #2661)', () => {
  // FINAL STATE (Issue #2661 commit 6) — commit 4 moved the 4 main panels +
  // SchoolCard out of this file, leaving a re-export-only barrel guarded by
  // schoolJourneyPanels.barrelOnly.test.ts. Measured 2026-09-27: 22 lines, 0
  // `import` statements (only `export ... from` remain), 0 function/component
  // declarations of any kind. These ceilings are now near-zero and MUST be
  // lowered again (not raised) if this file ever regrows — a barrel gaining a
  // real declaration is itself a regression this test exists to catch.
  //
  // The largest remaining module in the decomposed tree is
  // schools/browse/SchoolBrowsePanel.tsx (445 LOC / 22 imports) — see
  // schoolPanelsModuleCeiling.test.ts, which enforces per-module ceilings
  // directly on every schools/ file (the ceiling this barrel test used to be
  // the ONLY guard for).
  it('LOC ceiling: at most 25 lines (final barrel state)', () => {
    // Newline count (not split('\n').length, which counts a trailing terminator
    // as one extra empty segment) — matches `wc -l` / the file_outline line count.
    const lines = (readTarget().match(/\n/g) ?? []).length;
    expect(lines).toBeLessThanOrEqual(25);
  });

  it('import-statement ceiling: 0 (barrel contains only `export ... from`, no `import`)', () => {
    expect(countImportStatements(readTarget())).toBeLessThanOrEqual(0);
  });

  it('component-declaration ceiling: 0 (final barrel state — no inline declarations of any kind)', () => {
    expect(countTopLevelComponentDeclarations(readTarget())).toBeLessThanOrEqual(0);
  });

  it('total top-level function-declaration ceiling: 0 (final barrel state)', () => {
    expect(countTopLevelFunctionDeclarations(readTarget())).toBeLessThanOrEqual(0);
  });
});
