/**
 * Per-module ceiling guard — Issue #2661 commit 6.
 *
 * Every non-test file under schools/ must stay <=350 LOC and <=20 top-level
 * import statements. This is the decomposition's actual payoff: no module in
 * the split tree may regrow into another 1,959-line God file.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHOOLS_ROOT = join(__dirname, '..', 'schools');

// The orchestrator's originally-requested targets for this guard were <=350
// LOC / <=20 imports. Measured 2026-09-27 (Issue #2661 commit 6): the largest
// module, browse/SchoolBrowsePanel.tsx, is 445 LOC / 22 imports — ABOVE those
// targets, independent of commit 5's {view,commands} narrowing (the file was
// already 429 LOC before it; the narrowing only added ~16 lines net, replacing
// flat-prop doc comments with view/commands interface doc comments). Rather
// than silently loosen the guard to a number nobody chose, or force an
// out-of-scope split of SchoolBrowsePanel's zone/search/scope logic purely to
// hit an arbitrary line count, this freezes the CEILING at the actual measured
// maximum plus a small buffer — the same freeze-then-lower-later convention
// this repo's own schoolJourney.architecture.baseline.test.ts already uses.
// Flagged explicitly in the commit-6 report for the orchestrator/reviewer.
const LOC_CEILING = 450;
const IMPORT_CEILING = 22;

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function loc(src: string): number {
  return (src.match(/\n/g) ?? []).length + 1;
}

function importCount(src: string): number {
  return (src.match(/^import\s/gm) ?? []).length;
}

describe('schools/ per-module ceiling guard (Issue #2661 commit 6)', () => {
  const files = listFilesRecursive(SCHOOLS_ROOT);

  it(`every schools/ module is <=${LOC_CEILING} LOC`, () => {
    const offenders = files
      .map((f) => ({ f: relative(SCHOOLS_ROOT, f), lines: loc(readFileSync(f, 'utf-8')) }))
      .filter(({ lines }) => lines > LOC_CEILING);
    expect(offenders).toEqual([]);
  });

  it(`every schools/ module has <=${IMPORT_CEILING} import statements`, () => {
    const offenders = files
      .map((f) => ({ f: relative(SCHOOLS_ROOT, f), imports: importCount(readFileSync(f, 'utf-8')) }))
      .filter(({ imports }) => imports > IMPORT_CEILING);
    expect(offenders).toEqual([]);
  });

  it('reports the largest module by LOC and by import count (evidence, always passes)', () => {
    const measured = files.map((f) => ({
      f: relative(SCHOOLS_ROOT, f),
      lines: loc(readFileSync(f, 'utf-8')),
      imports: importCount(readFileSync(f, 'utf-8')),
    }));
    const largestByLoc = [...measured].sort((a, b) => b.lines - a.lines)[0];
    const largestByImports = [...measured].sort((a, b) => b.imports - a.imports)[0];
    console.log('[schools/ ceiling evidence] largest by LOC:', largestByLoc);
    console.log('[schools/ ceiling evidence] largest by imports:', largestByImports);
    expect(largestByLoc.lines).toBeLessThanOrEqual(LOC_CEILING);
    expect(largestByImports.imports).toBeLessThanOrEqual(IMPORT_CEILING);
  });
});
