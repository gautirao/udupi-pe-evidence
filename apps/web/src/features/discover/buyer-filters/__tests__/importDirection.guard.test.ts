import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Issue #2658 (C6) — import-direction guard: the buyer-filters domain
 * (selectors, controllers, sections) must never import FROM the
 * area-selected domain.
 *
 * The dependency arrow runs one way: AreaSelectedPanel.tsx (and its own
 * area-selected/ controllers/sections) import buyer-filters' selectors,
 * controllers and sections — never the reverse. buyer-filters is the
 * lower-level, domain-agnostic filter-editing layer (shared by List's
 * AreaSelectedPanel AND Map's MapFilterSheet); area-selected is
 * List-panel-specific composition built ON TOP of it. A buyer-filters file
 * importing from area-selected would be a layering inversion — this file
 * pins that it has never happened and fails loudly the day it does.
 *
 * A source-text guard (like drawEntryPlacement.guard.test.ts), not a
 * dependency-graph tool, so it needs no build step and stays fast; it walks
 * every real .ts/.tsx file under buyer-filters (skipping __tests__, which
 * legitimately import test fixtures/helpers that live elsewhere) and checks
 * every `from '...'` import specifier for the substring `area-selected`.
 */

const BUYER_FILTERS_ROOT = resolve(__dirname, '..');

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('#2658 C6 — buyer-filters never imports from area-selected (import-direction guard)', () => {
  it('no buyer-filters source file imports anything from the area-selected domain', () => {
    const files = collectSourceFiles(BUYER_FILTERS_ROOT);
    expect(files.length).toBeGreaterThan(0); // sanity: the walk actually found files

    const violations: { file: string; line: number; text: string }[] = [];
    const importFromPattern = /from\s+['"]([^'"]+)['"]/g;

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = importFromPattern.exec(content)) !== null) {
        const specifier = match[1];
        if (specifier.includes('area-selected')) {
          const line = content.slice(0, match.index).split('\n').length;
          violations.push({ file, line, text: match[0] });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
