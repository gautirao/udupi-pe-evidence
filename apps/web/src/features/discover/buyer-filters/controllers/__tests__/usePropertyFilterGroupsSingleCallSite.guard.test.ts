import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2658 (C6) — `usePropertyFilterGroups()` must be called from
 * EXACTLY the two production surfaces that render the buyer quick-filter
 * card: AreaSelectedPanel.tsx (List) and MapFilterSheet.tsx (Map). Both
 * this hook's own file header and PropertyFilterGroups.tsx's doc comment
 * document why a THIRD call site for the same (filters, onFiltersChange)
 * pair — or any independent call whose `activeFamily`/`familyOverride`
 * state could disagree with the canonical one — is the exact "two family
 * authorities" class #2596 fixed and #2658 exists to keep fixed.
 *
 * A speculative third call site (`useBuyerFilterController.ts`, an unwired
 * {view,commands,summary,external} adapter from an earlier commit in this
 * same issue) existed until this guard was written and was deleted rather
 * than excluded, once confirmed to have zero real importers — see this
 * commit's own message for that verification.
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
  it('is called from exactly AreaSelectedPanel.tsx and MapFilterSheet.tsx, nowhere else', () => {
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
      ].sort(),
    );
  });
});
