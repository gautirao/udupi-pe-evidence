/**
 * Barrel-only guard — Issue #2661 commit 4.
 *
 * SchoolJourneyPanels.tsx must contain ONLY `export ... from '...'` statements
 * (plus comments/blank lines) from this commit onward. This protects
 * commitAllowlist.2553.test.tsx's `vi.mock('@/components/discover/panels/SchoolJourneyPanels', ...)`
 * mock path, which must keep working unchanged — the module's public surface
 * (named exports) is preserved even though its implementation now lives under
 * ./schools/.
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

// Strip block comments, line comments, and blank lines — what remains must be
// entirely `export ... from '...';` statements (value or type-only).
function nonReexportStatements(src: string): string[] {
  const withoutBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = withoutBlockComments
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);

  const reexportPattern = /^export\s+(type\s+)?\{[^}]*\}\s+from\s+['"][^'"]+['"];?$/;
  return lines.filter((line) => !reexportPattern.test(line));
}

describe('SchoolJourneyPanels.tsx — barrel-only guard (Issue #2661 commit 4)', () => {
  it('contains only `export ... from` statements (no inline definitions, no other statement type)', () => {
    const offending = nonReexportStatements(readTarget());
    expect(offending).toEqual([]);
  });

  it('still exports the 4 public panels and SchoolCard by name (contract preserved)', () => {
    const src = readTarget();
    for (const name of [
      'SchoolBrowsePanel',
      'SchoolsInAreaPanel',
      'SchoolSelectedPanel',
      'AreaSchoolCombinedPanel',
      'SchoolCard',
    ]) {
      expect(src).toMatch(new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`));
    }
  });
});
