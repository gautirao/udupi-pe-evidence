/**
 * School panels — {view,commands} contract guards (Issue #2661 commit 5).
 *
 * Two kinds of guard live here:
 *
 * 1. TYPE-LEVEL (checked by `tsc`, not by `vitest run`) — the `_Check*` type
 *    aliases below use a dependency-free type-equality trick (no `expectTypeOf`
 *    import, which this repo's toolchain does not carry) to force a COMPILE
 *    ERROR if any of the 4 panels' public props gain or lose a top-level
 *    member, or if `SchoolBrowsePanelCommands`'s three command groups gain any
 *    member beyond the named safe set — in particular, no select-school-
 *    equivalent action anywhere (closing the H2-vs-H1 gap qa-fast flagged:
 *    browse must never gain a select-school command even structurally, only
 *    SchoolsInAreaPanel's `commands.schools.select` stays optional). These
 *    aliases are referenced only as type positions; if you see a TS2344 error
 *    pointing at this file, that IS this guard failing — it is caught by the
 *    mandatory `tsc -p apps/web/tsconfig.app.json --noEmit` regression gate,
 *    not by the `it()` below (which exists so a plain `vitest run` still
 *    reports this file, and documents the mechanism for anyone reading test
 *    output rather than tsc output).
 *
 * 2. RUNTIME (checked by `vitest run`) — a source-text scan proving no
 *    `UseQueryResult` (or other raw TanStack Query result type) is imported
 *    by any leaf component under `schools/`, i.e. no whole-hook-result
 *    passthrough remains in the decomposed tree.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SchoolBrowsePanelCommands, SchoolBrowsePanelProps } from '../schools/browse/SchoolBrowsePanel';
import type { SchoolsInAreaPanelProps } from '../schools/area/SchoolsInAreaWithHomesPanel';
import type { SchoolSelectedPanelProps } from '../schools/selected/SchoolSelectedPanel';
import type { AreaSchoolCombinedPanelProps } from '../schools/combined/AreaSchoolCombinedPanel';

// ── Type-level exact-key equality (dependency-free; no expectTypeOf) ─────────

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type AssertTrue<T extends true> = T;

// Each of the 4 panels' public props has EXACTLY the top-level members
// `view` and `commands` — no third field, no fewer.
type _CheckBrowseProps = AssertTrue<Equals<keyof SchoolBrowsePanelProps, 'view' | 'commands'>>;
type _CheckAreaProps = AssertTrue<Equals<keyof SchoolsInAreaPanelProps, 'view' | 'commands'>>;
type _CheckSelectedProps = AssertTrue<Equals<keyof SchoolSelectedPanelProps, 'view' | 'commands'>>;
type _CheckCombinedProps = AssertTrue<Equals<keyof AreaSchoolCombinedPanelProps, 'view' | 'commands'>>;

// SchoolBrowsePanel's ENTIRE commands tree contains only these named-safe
// members — in particular, no select-school-equivalent action anywhere.
type _CheckBrowseChrome = AssertTrue<
  Equals<keyof SchoolBrowsePanelCommands['chrome'], 'startOver' | 'back' | 'selectJourney'>
>;
type _CheckBrowseScope = AssertTrue<Equals<keyof SchoolBrowsePanelCommands['scope'], 'clear'>>;
type _CheckBrowseNavigation = AssertTrue<
  Equals<keyof SchoolBrowsePanelCommands['navigation'], 'selectGroup' | 'selectAreaKey'>
>;
type _CheckBrowseCommandGroups = AssertTrue<
  Equals<keyof SchoolBrowsePanelCommands, 'chrome' | 'scope' | 'navigation'>
>;

// ── Runtime scan: no whole-hook-result passthrough under schools/ ───────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHOOLS_ROOT = join(__dirname, '..', 'schools');

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('School panels — {view,commands} contract (Issue #2661 commit 5)', () => {
  it('type-level guards above compile (see _Check* aliases; a tsc failure IS this test failing)', () => {
    // Referencing the aliases keeps them from being tree-shaken/unused-flagged
    // and gives `vitest run` something to report even though the real check
    // is `tsc`'s, not this assertion's.
    const _refs: [
      _CheckBrowseProps,
      _CheckAreaProps,
      _CheckSelectedProps,
      _CheckCombinedProps,
      _CheckBrowseChrome,
      _CheckBrowseScope,
      _CheckBrowseNavigation,
      _CheckBrowseCommandGroups,
    ] = [true, true, true, true, true, true, true, true];
    expect(_refs.every(Boolean)).toBe(true);
  });

  it('no schools/ leaf component imports a raw UseQueryResult (or similar whole-hook-result) type', () => {
    const files = listFilesRecursive(SCHOOLS_ROOT);
    const offenders = files
      .map((f) => ({ f, src: readFileSync(f, 'utf-8') }))
      .filter(({ src }) => /\bUseQueryResult\b/.test(src))
      .map(({ f }) => f);
    expect(offenders).toEqual([]);
  });
});
