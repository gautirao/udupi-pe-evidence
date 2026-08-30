import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 SOLID follow-up (commit 4) — the dependency-direction guard for
 * the surface layer.
 *
 * THE RULE. A surface is a RENDERER. It receives an already-shaped
 * `{ view, commands }` contract and turns it into DOM. It therefore must not:
 *   (a) VALUE-import a data hook from `@/hooks/*`  — that would be fetching,
 *   (b) import the router or the query client at all — that would be routing
 *       or cache access,
 *   (c) VALUE-import a controller — surfaces consume controller RESULT TYPES
 *       (via `Pick<ReturnType<typeof useXController>, ...>` in the builders)
 *       and never CALL a controller,
 *   (d) VALUE-import the Discover context facade — an ambient read is a
 *       service locator: the component's type signature understates its real
 *       dependencies, the compiler cannot check them, and it cannot be
 *       rendered without a provider.
 *
 * Type-only imports are permitted everywhere they are permitted below because
 * a type carries no behaviour: the whole point of the surface contracts is
 * that they are keyed off the controllers' own output shapes, so a controller
 * renaming a field is a compile error rather than silent drift.
 *
 * RELATIONSHIP TO panel/__tests__/panelAmbientContext.guard.test.ts. That file
 * is commit 2's narrower ancestor and its own header anticipates this one. Its
 * rule-(d) module-specifier assertion was DELETED there when this file landed
 * — this guard asserts the identical thing over a strict superset of the same
 * files, and two files asserting one rule over one file set is drift waiting
 * to happen. What stayed there is what is genuinely unique to it: the
 * identifier-level facade-hook CALL scan (which also catches a re-export or a
 * relative-path import that sidesteps a module-specifier check) and the
 * DiscoverJourneyPanelShell prop-shape check.
 */

const SURFACES_DIR = path.resolve(__dirname, '..');
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

/** Production files only — a test file legitimately imports hooks/router/controllers to drive or mock them. */
const PRODUCTION_FILES = walk(SURFACES_DIR).filter(
  (f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`),
);

/** Prose about a forbidden import must never satisfy (or trip) a source scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface ImportStatement {
  /** The clause between `import` and `from`, e.g. `type { Foo }` or `{ bar }`. */
  clause: string;
  /** The module specifier, e.g. `@/hooks/useDiscoverAreas`. */
  spec: string;
  /** `import type ... from` — carries no runtime behaviour. */
  typeOnly: boolean;
}

function importsOf(file: string): ImportStatement[] {
  const body = stripComments(fs.readFileSync(file, 'utf-8'));
  const withBindings = [...body.matchAll(/^import\s+([\s\S]*?)\s*from\s+'([^']+)';/gm)].map(
    ([, clause, spec]) => ({ clause: clause.trim(), spec, typeOnly: /^type\b/.test(clause.trim()) }),
  );
  // Side-effect imports (`import 'x';`) have no bindings but DO execute the
  // module — they must still be visible to the "no router / no query client"
  // rule, which forbids the dependency in ANY form.
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

const CONTEXT_FACADE_MODULE = '@/features/discover/context/useDiscoverContext';

/**
 * KNOWN, PINNED EXCEPTION — found by this guard on its first run, not designed in.
 *
 * `DiscoverMapSurface.tsx` reads `useDiscoverShell()` for `{ isMobileShell,
 * mobileView }` to compute its `shouldMount` real-unmount gate. That is the
 * same service-locator shape commit 2 removed from `surfaces/panel/**`, and it
 * should be resolved the same way: as a prop, exactly like
 * `DiscoverPageShell`/`DiscoverJourneyPanelShell` already take `isMobileShell`.
 *
 * It is NOT fixed in this commit because the smallest correct fix threads a new
 * value from `useDiscoverPageComposition`'s `shell` group through
 * `MapDiscovery.tsx` (or a new field through `buildMapSurfaceModel` and its
 * fixtures), and both routes move the frozen LOC/import baselines that
 * `pages/__tests__/MapDiscovery.architecture.baseline.test.ts` pins — out of
 * scope for a test-only commit. Recorded here so the debt is VISIBLE and,
 * critically, CANNOT GROW: the exception is one named file limited to one named
 * hook, asserted below.
 */
const AMBIENT_CONTEXT_EXCEPTIONS = ['features/discover/surfaces/DiscoverMapSurface.tsx'];

describe('surfaces/** dependency direction (#2142 commit 4)', () => {
  it('finds the surfaces (guard is not silently scanning an empty set)', () => {
    // Without this, moving/renaming the directory would make every assertion
    // below vacuously pass.
    const names = PRODUCTION_FILES.map((f) => path.basename(f));
    expect(names).toContain('DiscoverMapSurface.tsx');
    expect(names).toContain('DiscoverPanelSurface.tsx');
    expect(names).toContain('DiscoverOverlaySurface.tsx');
    expect(names).toContain('buildPanelSurfaceModel.ts');
    // ...including the nested panel/ renderers — the scan is recursive.
    expect(names).toContain('AreaFirstJourneyPanel.tsx');
    expect(names).toContain('SchoolFirstJourneyPanel.tsx');
  });

  it('(a) VALUE-imports no data hook from @/hooks/* — surfaces render, they do not fetch', () => {
    expect(offenders((imp) => !imp.typeOnly && imp.spec.startsWith('@/hooks/'))).toEqual([]);
  });

  it('(b) imports neither @tanstack/react-query nor react-router-dom in ANY form', () => {
    // No type-only escape hatch here on purpose: a surface has no legitimate
    // reason to name a QueryClient or a router type at all. Reaching for either
    // means routing/cache decisions are being made in a renderer.
    const FORBIDDEN = ['@tanstack/react-query', 'react-router-dom'];
    expect(offenders((imp) => FORBIDDEN.includes(imp.spec))).toEqual([]);
  });

  it('(c) VALUE-imports no controller — surfaces consume controller RESULT TYPES, never call them', () => {
    // `import type { useXController }` (to write `ReturnType<typeof
    // useXController>`) is exactly the intended coupling and stays legal.
    expect(
      offenders(
        (imp) => !imp.typeOnly && imp.spec.startsWith('@/features/discover/controllers/'),
      ),
    ).toEqual([]);
  });

  it('(d) VALUE-imports the Discover context facade nowhere but the one pinned exception', () => {
    expect(offenders((imp) => !imp.typeOnly && imp.spec === CONTEXT_FACADE_MODULE)).toEqual(
      AMBIENT_CONTEXT_EXCEPTIONS.map((f) => `${f} -> ${CONTEXT_FACADE_MODULE}`),
    );
  });

  it('the pinned ambient-context exception stays limited to useDiscoverShell (the debt cannot grow)', () => {
    // If DiscoverMapSurface.tsx starts reaching for useDiscoverNav/
    // useDiscoverActions/useDiscoverViewport as well, that is a new violation
    // wearing an old exemption, and this fails.
    const source = fs.readFileSync(
      path.join(SRC_ROOT, AMBIENT_CONTEXT_EXCEPTIONS[0]),
      'utf-8',
    );
    const facadeImport = importsOf(path.join(SRC_ROOT, AMBIENT_CONTEXT_EXCEPTIONS[0])).find(
      (imp) => imp.spec === CONTEXT_FACADE_MODULE,
    );
    expect(facadeImport?.clause).toBe('{ useDiscoverShell }');
    const body = stripComments(source);
    for (const hook of ['useDiscoverNav', 'useDiscoverActions', 'useDiscoverViewport']) {
      expect(body).not.toMatch(new RegExp(`\\b${hook}\\s*\\(`));
    }
  });
});
