import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 SOLID follow-up (commit 2) — PLAN REVIEW correction 3's
 * regression lock.
 *
 * THE RULE: no production file under `surfaces/panel/**` may VALUE-import the
 * Discover context facade (`useDiscoverNav` / `useDiscoverActions` /
 * `useDiscoverShell` / `useDiscoverViewport`). Every one of those values must
 * arrive through the typed `view`/`commands` contract assembled upstream.
 *
 * WHY A DEDICATED GUARD. The reviewer's point was that "no react-query /
 * react-router import" is not a sufficient layering rule on its own: the same
 * low-level dependency can be reached through the context facade instead, and
 * the file still looks clean. A renderer that reads ambient context is a
 * service locator — its type signature understates what it depends on, the
 * compiler cannot check the dependency, and it cannot be rendered in a test
 * without a provider. This assertion is what makes the fix permanent rather
 * than a one-off cleanup.
 *
 * SCOPE. Deliberately narrow: only `surfaces/panel/**`. Commit 4's
 * `surfaceLayering.guard.test.ts` generalises this across all of `surfaces/**`
 * alongside the router/query-client rules; this file is not that guard and
 * should not grow into it.
 */

const PANEL_DIR = path.resolve(__dirname, '..');
const SRC_ROOT = path.resolve(__dirname, '../../../../..');

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

/** Production files only — a test file may legitimately import the facade to mock it. */
const PANEL_PRODUCTION_FILES = walk(PANEL_DIR).filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`),
);

describe('surfaces/panel/** never reaches into the Discover context facade', () => {
  it('finds the panel renderers (guard is not silently scanning an empty set)', () => {
    // Without this, deleting/renaming the directory would make every assertion
    // below vacuously pass.
    const names = PANEL_PRODUCTION_FILES.map((f) => path.basename(f)).sort();
    expect(names).toContain('AreaFirstJourneyPanel.tsx');
    expect(names).toContain('SchoolFirstJourneyPanel.tsx');
    expect(names).toContain('LegacyRightPanelBridge.tsx');
  });

  it('no production file VALUE-imports useDiscoverContext', () => {
    const offenders = PANEL_PRODUCTION_FILES.filter((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      // `import type { ... } from '.../useDiscoverContext'` carries no
      // behaviour and is allowed; a value import is what this forbids.
      return /^import\s+(?!type\b)[\s\S]*?from\s+'@\/features\/discover\/context\/useDiscoverContext';/m.test(
        source,
      );
    }).map((f) => path.relative(SRC_ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('no production file calls a Discover context facade hook', () => {
    // Belt-and-suspenders against a re-export or a relative-path import
    // sidestepping the module-specifier check above.
    const FACADE_HOOKS = /\b(useDiscoverNav|useDiscoverActions|useDiscoverShell|useDiscoverViewport)\s*\(/;
    const offenders = PANEL_PRODUCTION_FILES.filter((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      // Strip comments first: these files legitimately NAME the hooks in prose
      // explaining what moved out of them.
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return FACADE_HOOKS.test(body);
    }).map((f) => path.relative(SRC_ROOT, f));

    expect(offenders).toEqual([]);
  });
});

/**
 * The shell is the one panel file that still legitimately renders a leaf which
 * reads context internally (`DiscoverControlBar`) — that is the leaf's own
 * business, not the shell's. This pins the boundary: the shell receives
 * `isMobileShell` as a prop and makes the desktop-only decision itself.
 */
describe('DiscoverJourneyPanelShell receives its shell state as a prop', () => {
  it('declares isMobileShell in its props rather than reading it from context', () => {
    const source = fs.readFileSync(path.join(PANEL_DIR, 'DiscoverJourneyPanelShell.tsx'), 'utf-8');
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(body).toMatch(/isMobileShell: boolean;/);
    expect(body).not.toMatch(/useDiscoverShell\s*\(/);
  });
});
