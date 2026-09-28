import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2657 R2 (code-review Finding 2 regression lock).
 *
 * THE RULE:
 *   (a) no production file under `apps/web/src` (excluding `**\/testing/**`
 *       and `**\/__tests__/**`) may reference `LegacyFlatRightPanelProps` —
 *       the pre-C8 flat prop bag, confined to
 *       `right-panel/testing/flatPropsRightPanel.ts` (the only legitimate
 *       consumer: the ~12 `DiscoverRightPanel.*.test.tsx` suites that still
 *       render pre-C8 flat fixtures).
 *   (b) `contracts.ts` does not import from
 *       `@/components/discover/DiscoverRightPanel` at all — every
 *       `RightPanelView`/`RightPanelCommands` field type is derived from
 *       `DiscoverPanelSurfaceView`/`Commands`
 *       (surfaces/buildPanelSurfaceModel.ts), selector `ReturnType`s, or a
 *       small justified named type — never from the component's own props.
 *
 * WHY A DEDICATED GUARD. Finding 2 was that `contracts.ts` indexed ~70 field
 * types off a renamed flat prop bag still exported from PRODUCTION
 * `DiscoverRightPanel.tsx` — a duplicate hand-written field list one rename
 * away from silent drift. Moving the type once is not durable on its own; a
 * later commit could re-import it (or a fresh flat-shape helper) without
 * anyone noticing. This assertion is what makes the fix permanent.
 */

const SRC_ROOT = path.resolve(__dirname, '../../../../..');
const CONTRACTS_FILE = path.resolve(__dirname, '..', 'contracts.ts');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Production files only — excludes any `**\/testing/**` directory (the
 * legitimate flat-shape adapter) and any `**\/__tests__/**` directory or
 * `*.test.ts(x)` file (a test may legitimately reference the type name in a
 * mock or an assertion string).
 */
const PRODUCTION_FILES = walk(SRC_ROOT).filter((f) => {
  const rel = path.relative(SRC_ROOT, f);
  if (/\.test\.tsx?$/.test(rel)) return false;
  if (rel.split(path.sep).includes('__tests__')) return false;
  if (rel.split(path.sep).includes('testing')) return false;
  return true;
});

describe('LegacyFlatRightPanelProps stays confined to the test-only flat-props adapter', () => {
  it('finds the src tree (guard is not silently scanning an empty set)', () => {
    const names = PRODUCTION_FILES.map((f) => path.basename(f));
    expect(names).toContain('contracts.ts');
    expect(names).toContain('DiscoverRightPanel.tsx');
  });

  it('no production file (outside testing/__tests__) references LegacyFlatRightPanelProps', () => {
    // Strip comments first — prose is allowed to NAME the type when explaining
    // where it moved from/to (e.g. this guard's own doc comment, and
    // DiscoverRightPanel.tsx's "moved to testing/flatPropsRightPanel.ts" note);
    // only a live import/type reference in CODE is the violation this guards.
    const offenders = PRODUCTION_FILES.filter((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return body.includes('LegacyFlatRightPanelProps');
    }).map((f) => path.relative(SRC_ROOT, f));

    expect(offenders).toEqual([]);
  });

  it("contracts.ts does not import from '@/components/discover/DiscoverRightPanel'", () => {
    const source = fs.readFileSync(CONTRACTS_FILE, 'utf-8');
    expect(source).not.toMatch(/from\s+['"]@\/components\/discover\/DiscoverRightPanel['"]/);
  });

  it('the flat-props test adapter DOES define LegacyFlatRightPanelProps (guard discriminates, not just a blanket ban)', () => {
    const adapterFile = path.resolve(__dirname, '..', 'testing', 'flatPropsRightPanel.ts');
    const source = fs.readFileSync(adapterFile, 'utf-8');
    expect(source).toMatch(/export interface LegacyFlatRightPanelProps/);
  });
});
