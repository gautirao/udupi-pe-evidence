import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2658 (C6) — `usePropertyFilterGroups()` must be called EXACTLY
 * ONCE per production panel that renders a buyer quick-filter row/card.
 * Both this hook's own file header and PropertyFilterGroups.tsx's doc
 * comment document why a SECOND call for the same (filters,
 * onFiltersChange) pair within the same panel — or any independent call
 * whose `activeFamily`/`familyOverride` state could disagree with the
 * canonical one — is the exact "two family authorities" class #2596 fixed
 * and #2658 exists to keep fixed. The guard is an ALLOWLIST of legitimate
 * single-call-site panels, not a cap of two — adding a new panel that
 * needs its own compact filter row is expected to add itself here exactly
 * once (never a duplicate entry for the same panel).
 *
 * A speculative third call site (`useBuyerFilterController.ts`, an unwired
 * {view,commands,summary,external} adapter from an earlier commit in this
 * same issue) existed until this guard was written and was deleted rather
 * than excluded, once confirmed to have zero real importers — see this
 * commit's own message for that verification.
 *
 * Issue #2762 PR-B (architect decision) — School's compact FilterBar is
 * built from `usePropertyFilterGroups` directly (the SAME data model
 * By-area uses), NOT by wrapping the older MapFilters UI component. Adds
 * AreaSchoolCombinedPanel.tsx and SchoolSelectedPanel.tsx as two more
 * legitimate single-call-site panels — each calls the hook exactly once,
 * per that file's own `useSchoolFilterBarGroups` doc comment, and passes
 * the SAME result through to `useSchoolFilterBarGroups` rather than that
 * adapter calling the hook a second time (it only imports the hook's
 * RESULT type, never the hook itself).
 *
 * Static source-text guard, like `useDebugLogsSingleCallSite.guard.test.ts`
 * (the #2662 lane's equivalent pattern this mirrors): a runtime assertion
 * can only prove the call count for the specific component tree the test
 * happens to render, not that no *other* file in the repo independently
 * calls the hook.
 */
const SRC_ROOT = path.resolve(__dirname, '../../../../../');

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      // Exclude the hook's own definition file — it contains the function
      // declaration `function usePropertyFilterGroups(`, not a call.
      fullPath !== path.resolve(
        __dirname,
        '../usePropertyFilterGroups.ts',
      )
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('#2658 C6 — usePropertyFilterGroups() single-call-site guard', () => {
  it('is called from exactly the allowlisted panels, nowhere else', () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0); // sanity: the walk actually found files

    const callSitePattern = /\busePropertyFilterGroups\s*\(/;
    const callers = files
      .filter((file) => callSitePattern.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(SRC_ROOT, file))
      .sort();

    expect(callers).toEqual(
      [
        'components/discover/panels/AreaSelectedPanel.tsx',
        'features/discover/components/map/MapFilterSheet.tsx',
        // Issue #2762 PR-B — School's two panels, each calling the hook exactly once.
        'components/discover/panels/schools/combined/AreaSchoolCombinedPanel.tsx',
        'components/discover/panels/schools/selected/SchoolSelectedPanel.tsx',
      ].sort(),
    );
  });
});
