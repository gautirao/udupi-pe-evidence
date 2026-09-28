/**
 * Architecture baseline freeze — Issue #2657 commit C0.
 *
 * Freezes DiscoverRightPanel.tsx's current LOC / import-count / public
 * prop-count as a CEILING before the decomposition (commits C1-C9) begins.
 * Follows the pattern of Issue #2661's
 * components/discover/panels/__tests__/schoolJourney.architecture.baseline.test.ts
 * and Issue #1838's EditListingForm.architecture.baseline.test.ts.
 *
 * Measured 2026-09-28 against this worktree's DiscoverRightPanel.tsx (HEAD
 * 659a8b72, origin/main): 2255 LOC / 41 top-level `import` statements / 148
 * top-level DiscoverRightPanelProps members (matches the architect plan's
 * §1 characterization baseline exactly).
 *
 * This ceiling will be LOWERED in later commits once the split has actually
 * moved code/props out of this file — do not raise these numbers to make a
 * failing test pass; a failure here after a commit that ADDS to this file
 * (rather than extracting from it) is a real regression signal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_FILE = join(__dirname, '..', '..', '..', '..', 'components', 'discover', 'DiscoverRightPanel.tsx');

function readTarget(): string {
  return readFileSync(TARGET_FILE, 'utf-8');
}

// Newline count (matches `wc -l` / the file_outline line count) — NOT
// split('\n').length, which counts a trailing terminator as an extra segment.
function countLines(src: string): number {
  return (src.match(/\n/g) ?? []).length;
}

// Every top-level `import ...` DECLARATION (its opening line), including a
// multi-line named-import block whose `from '...'` clause lands on a later line.
function countImportStatements(src: string): number {
  return (src.match(/^import\s/gm) ?? []).length;
}

// Top-level members of `export interface DiscoverRightPanelProps { ... }`
// (2-space indentation, as written in the file) — comments stripped first so a
// comment-only line growth never trips this guard.
function countPropInterfaceMembers(src: string): number {
  const match = src.match(/export interface DiscoverRightPanelProps \{([\s\S]*?)\n\}/);
  if (!match) throw new Error('DiscoverRightPanelProps interface not found');
  const withoutComments = match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...withoutComments.matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\??:/gm)].length;
}

// Issue #2657 C0 baseline, pinned as historical CONSTANTS (not a live ceiling
// any more — see the C1 update below). Measured 2026-09-28 against this
// worktree's DiscoverRightPanel.tsx at HEAD 659a8b72 (origin/main): 2255 LOC
// / 41 top-level `import` statements / 148 top-level DiscoverRightPanelProps
// members (matches the architect plan's §1 characterization exactly).
const BASE_LOC = 2255;
const BASE_IMPORT_STATEMENTS = 41;
const BASE_PROP_MEMBERS = 148;

describe('DiscoverRightPanel.tsx — architecture baseline (Issue #2657 C0)', () => {
  it('BASE_* constants match the pinned C0 characterization (historical record, do not edit)', () => {
    expect({ BASE_LOC, BASE_IMPORT_STATEMENTS, BASE_PROP_MEMBERS }).toEqual({
      BASE_LOC: 2255,
      BASE_IMPORT_STATEMENTS: 41,
      BASE_PROP_MEMBERS: 148,
    });
  });

  // Issue #2657 C1 — the decomposition has started extracting logic (pure
  // selectors under features/discover/selectors/), which shrinks the file's
  // LOC even though it ADDS a handful of import lines for the new selector
  // calls. LOC is the metric that must ratchet down starting THIS commit, so
  // it gets a real "strictly smaller than base" gate. Import-statement count
  // and prop count are NOT expected to shrink until later commits (C8 drops
  // ~24 dead props and flips the public contract to {view, commands}) — they
  // stay "at most" against their own live-tracked ceilings below, bumped
  // only when a commit legitimately adds imports/props, never silently.
  it('LOC strictly smaller than the C0 base (decomposition is removing code, not just moving it)', () => {
    const loc = countLines(readTarget());
    expect(loc).toBeLessThan(BASE_LOC);
    // Issue #2657 C8 — the public contract flipped to `{view, commands}`; the
    // flat prop interface that used to live in THIS file is now the vestigial
    // `LegacyFlatRightPanelProps` (kept for `contracts.ts`/test-adapter typing
    // only) — still present here, so LOC didn't collapse further, but the
    // render body itself is now a flat dispatcher with no per-journey slice
    // construction. Measured at C8: 685 (down from C7's 1074).
    expect(loc).toBeLessThanOrEqual(700);
  });

  it('top-level import-statement ceiling: at most 26 (C8 — public contract flip)', () => {
    // Issue #2657 C8 — DiscoverRightPanel gains a type-only import for
    // RightPanelView/RightPanelCommands and loses none (the vestigial
    // LegacyFlatRightPanelProps interface still needs every type the old flat
    // interface did). Measured at C8: 26 import statements (down from C7's 31
    // — formatMemberAreaSummary/prettifyZoneSlug/the 3 C1 selector imports
    // that were only used by the now-removed per-journey slice construction
    // are gone).
    expect(countImportStatements(readTarget())).toBeLessThanOrEqual(26);
  });

  it('DiscoverRightPanelProps public prop-count is exactly 2 (view, commands) — Issue #2657 C8', () => {
    // Issue #2657 C8 — the flipped public contract. 148 -> 2. The ~124
    // fields that still type-check `contracts.ts`/the test-only flat-props
    // adapter live under `LegacyFlatRightPanelProps` now, not this name — see
    // that interface's own doc comment in DiscoverRightPanel.tsx.
    expect(countPropInterfaceMembers(readTarget())).toBe(2);
  });
});
