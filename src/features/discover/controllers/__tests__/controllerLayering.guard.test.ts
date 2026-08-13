import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 SOLID follow-up (commit 4) — the dependency-direction guard for
 * the controller layer.
 *
 * TWO RULES, both about direction rather than size:
 *
 *   (a) Controllers must not depend UPWARD. A controller is consumed by the
 *       composition hook and its outputs are shaped by the surface builders;
 *       if a controller imports a surface or a page, the dependency graph has
 *       a cycle and the controller can no longer be reasoned about (or tested)
 *       without the thing that renders it.
 *
 *   (b) Router / query-client / toast have ONE owner. `useDiscoverPageContext`
 *       is the single adapter between the Discover page and its ambient
 *       framework services: it calls `useNavigate`, `useQueryClient` and
 *       `useToast` once and hands them down as plain values. Every other
 *       controller receives what it needs as a parameter. Without this rule
 *       "the controllers own the decisions" degrades into twenty controllers
 *       each independently reaching for the router, which is precisely the
 *       coupling that made MapDiscovery.tsx untestable in the first place.
 */

const CONTROLLERS_DIR = path.resolve(__dirname, '..');
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

/**
 * Production files only. NOTE: this directory has BOTH co-located
 * `useXController.test.ts` files and a `__tests__/` subdirectory — both must be
 * excluded, since a controller test legitimately imports MemoryRouter, a
 * QueryClientProvider, or a page module to drive the hook.
 */
const PRODUCTION_FILES = walk(CONTROLLERS_DIR).filter(
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

function offenders(predicate: (imp: ImportStatement, file: string) => boolean): string[] {
  const found: string[] = [];
  for (const file of PRODUCTION_FILES) {
    const rel = path.relative(SRC_ROOT, file);
    for (const imp of importsOf(file)) {
      if (predicate(imp, rel)) found.push(`${rel} -> ${imp.spec}`);
    }
  }
  return found.sort();
}

const PAGE_CONTEXT_FILE = 'features/discover/controllers/useDiscoverPageContext.ts';

/** The three ambient framework services `useDiscoverPageContext` is the sole owner of. */
const AMBIENT_SERVICE_MODULES = ['react-router-dom', '@tanstack/react-query', '@/hooks/use-toast'];

/**
 * KNOWN, PINNED EXCEPTION — found by this guard on its first run, not designed in.
 *
 * `useDiscoverCameraController.ts` VALUE-imports two pure helpers
 * (`isSelectedNodeOutOfView`, `getCameraIntentForRecenter`) from
 * `@/pages/MapDiscovery.recenter` — a leftover from when the recenter policy
 * was page-local. The module is pure functions, NOT the page component, so this
 * is a misfiled file rather than a runtime cycle; the fix is to move it under
 * `features/discover/` (its `AreaPoint` type dependency keeps it out of
 * `selectors/` as that directory is defined today — see
 * selectors/__tests__/selectorPurity.guard.test.ts).
 *
 * Not fixed here because a file move plus its test relocation is production
 * scope, not a test-only commit. Pinned to the exact importer AND the exact
 * specifier so no second page import can hide behind it.
 */
const UPWARD_IMPORT_EXCEPTIONS = [
  'features/discover/controllers/useDiscoverCameraController.ts -> @/pages/MapDiscovery.recenter',
];

describe('controllers/** dependency direction (#2142 commit 4)', () => {
  it('finds the controllers (guard is not silently scanning an empty set)', () => {
    const names = PRODUCTION_FILES.map((f) => path.basename(f));
    expect(names).toContain('useDiscoverPageContext.ts');
    expect(names).toContain('useDiscoverCameraController.ts');
    expect(names).toContain('useDiscoverMapDataController.ts');
    expect(PRODUCTION_FILES.length).toBeGreaterThanOrEqual(20);
  });

  it('(a) no controller VALUE-imports a surface or a page (no upward dependency)', () => {
    const found = offenders(
      (imp) =>
        !imp.typeOnly &&
        (imp.spec.startsWith('@/features/discover/surfaces/') || imp.spec.startsWith('@/pages/')),
    );
    expect(found).toEqual(UPWARD_IMPORT_EXCEPTIONS);
  });

  it('(b) only useDiscoverPageContext.ts VALUE-imports the router / query client / toast', () => {
    const found = offenders(
      (imp, rel) =>
        !imp.typeOnly && AMBIENT_SERVICE_MODULES.includes(imp.spec) && rel !== PAGE_CONTEXT_FILE,
    );
    expect(found).toEqual([]);
  });

  it('(b) ...and useDiscoverPageContext.ts really is that owner (the rule is not vacuous)', () => {
    // If these three moved elsewhere, the assertion above would keep passing
    // while meaning nothing. This pins that the ownership is real.
    const specs = importsOf(path.join(SRC_ROOT, PAGE_CONTEXT_FILE))
      .filter((imp) => !imp.typeOnly)
      .map((imp) => imp.spec);
    for (const service of AMBIENT_SERVICE_MODULES) {
      expect(specs).toContain(service);
    }
  });
});
