import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 SOLID follow-up (commit 4) — the purity guard for the two
 * bottom layers.
 *
 * `selectors/` (pure domain derivations) and `adapters/` (request/response
 * shaping) are the leaves of the Discover dependency graph. Their whole value
 * is that they are plain functions over plain data: callable from a controller,
 * from a builder, or from a test, with no provider, no renderer and no DOM.
 *
 * Two mechanical properties keep that true:
 *   (a) NO `.tsx` file may exist in either directory. The extension is the
 *       guarantee — TypeScript rejects JSX outright in a `.ts` file, so a
 *       selector cannot start returning markup without first renaming itself
 *       into this test's field of view.
 *   (b) NO import of `react` in any form, and no VALUE import of a component.
 *
 * ON RULE (b)'s TYPE-ONLY CARVE-OUT. The rule as originally drafted forbade
 * `@/components/*` imports outright, including type-only ones. Run against the
 * real tree it fails on two production selectors that do
 * `import type { AreaPoint } from '@/components/map/AreaMarkerLayer'`. That is
 * a genuinely different thing from the coupling this guard exists to prevent:
 * `AreaPoint` is a plain data shape (an area's key/coords) that merely happens
 * to be DECLARED in a component module, it carries no behaviour, and it
 * disappears at compile time. The coupling worth forbidding — a selector that
 * can render, or that pulls a component's runtime module into a pure code path
 * — is a VALUE import, which is forbidden below with no exception. The two
 * type-only sites are pinned by name so the carve-out cannot quietly spread;
 * the real fix (relocating `AreaPoint` to a types module) is a production
 * change outside this test-only commit.
 */

const SELECTORS_DIR = path.resolve(__dirname, '..');
const ADAPTERS_DIR = path.resolve(__dirname, '../../adapters');
const SRC_ROOT = path.resolve(__dirname, '../../../..');

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

const ALL_FILES = [...walk(SELECTORS_DIR), ...walk(ADAPTERS_DIR)];

/** Production files only — a selector's own test file is `.test.ts` beside it. */
const PRODUCTION_FILES = ALL_FILES.filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`),
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface ImportStatement {
  clause: string;
  spec: string;
  typeOnly: boolean;
}

function importsOf(file: string): ImportStatement[] {
  const body = stripComments(fs.readFileSync(file, 'utf-8'));
  const withBindings = [...body.matchAll(/^import\s+([\s\S]*?)\s*from\s+'([^']+)';/gm)].map(
    ([, clause, spec]) => ({ clause: clause.trim(), spec, typeOnly: /^type\b/.test(clause.trim()) }),
  );
  const bare = [...body.matchAll(/^import\s+'([^']+)';/gm)].map(([, spec]) => ({
    clause: '',
    spec,
    typeOnly: false,
  }));
  return [...withBindings, ...bare];
}

function offenders(predicate: (imp: ImportStatement) => boolean): string[] {
  const found: string[] = [];
  for (const file of PRODUCTION_FILES) {
    for (const imp of importsOf(file)) {
      if (predicate(imp)) found.push(`${path.relative(SRC_ROOT, file)} -> ${imp.spec}`);
    }
  }
  return found.sort();
}

/** KNOWN, PINNED type-only component-type imports (see the header's rule-(b) note). */
const COMPONENT_TYPE_IMPORT_EXCEPTIONS = [
  'features/discover/selectors/displayEligibility.ts -> @/components/map/AreaMarkerLayer',
  'features/discover/selectors/effectiveArea.ts -> @/components/map/AreaMarkerLayer',
];

describe('selectors/** and adapters/** are pure, renderless modules (#2142 commit 4)', () => {
  it('finds both directories (guard is not silently scanning an empty set)', () => {
    const names = PRODUCTION_FILES.map((f) => path.basename(f));
    expect(names).toContain('panelContent.ts'); // selectors/
    expect(names).toContain('listingScope.ts'); // selectors/
    expect(names).toContain('anonMarkerAdapter.ts'); // adapters/
    expect(names).toContain('cityListingsQueryParams.ts'); // adapters/
  });

  it('(a) neither directory contains a .tsx file — a pure module cannot render', () => {
    const tsxFiles = ALL_FILES.filter((f) => f.endsWith('.tsx')).map((f) =>
      path.relative(SRC_ROOT, f),
    );
    expect(tsxFiles).toEqual([]);
  });

  it('(b) nothing imports react in any form (not even a type)', () => {
    // Type-only is forbidden here too, deliberately: a selector that needs
    // `ReactNode` or `RefObject` in its signature is shaping presentation, and
    // that belongs in a surface builder.
    expect(offenders((imp) => imp.spec === 'react' || imp.spec.startsWith('react/'))).toEqual([]);
    expect(offenders((imp) => imp.spec === 'react-dom' || imp.spec.startsWith('react-dom/'))).toEqual(
      [],
    );
  });

  it('(b) nothing VALUE-imports a component', () => {
    expect(offenders((imp) => !imp.typeOnly && imp.spec.startsWith('@/components/'))).toEqual([]);
  });

  it('(b) type-only component-type imports stay limited to the two pinned sites', () => {
    expect(offenders((imp) => imp.typeOnly && imp.spec.startsWith('@/components/'))).toEqual(
      COMPONENT_TYPE_IMPORT_EXCEPTIONS,
    );
  });
});
