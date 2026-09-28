import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/test-utils/architectureGuards';

/**
 * Issue #2664 — the composition-scope guard for ProcessPosts (#2662),
 * modeled directly on Discover's
 * features/discover/composition/__tests__/compositionHookScope.guard.test.ts.
 *
 * useProcessPostsPageComposition.ts wires the six ProcessPosts controllers
 * together in dependency order and derives the `{view, commands}` surface
 * pair the thin ProcessPosts.tsx page renders (see the hook's own header
 * comment). This test makes that shape mechanical: the composition hook may
 * call the six named controllers and the two surface builders — nothing
 * else. It may NOT own state, run effects, memoise, hold refs, fetch, or
 * call a mutation directly; all of that belongs to a controller.
 */

const HOOK_PATH = path.resolve(__dirname, '../useProcessPostsPageComposition.ts');
const source = fs.readFileSync(HOOK_PATH, 'utf-8');
const body = stripComments(source);

const KNOWN_CONTROLLER_HOOKS = [
  'useProcessPostsDataController',
  'useProcessPostsConsoleController',
  'useProcessPostsEditorController',
  'useProcessPostsViewerController',
  'useProcessPostsBatchController',
  'useProcessPostsResetController',
];

describe('useProcessPostsPageComposition is composition-only (structural guard)', () => {
  it('owns no React hook primitives — every one belongs to a named controller', () => {
    for (const primitive of [/\buseState[(<]/, /\buseEffect\(/, /\buseMemo\(/, /\buseCallback\(/, /\buseRef[(<]/]) {
      expect(body).not.toMatch(primitive);
    }
  });

  it('imports no data hook VALUE from @/hooks/* (controllers own every query)', () => {
    // `import type` from @/hooks/* is fine — a type carries no behaviour. A
    // VALUE import would mean this hook can fetch directly.
    const valueImports = [...body.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+'(@\/hooks\/[^']+)';/gm)];
    expect(valueImports.map((m) => m[1])).toEqual([]);
  });

  it('imports no React Query / Supabase client directly', () => {
    expect(body).not.toMatch(/from '@tanstack\/react-query'/);
    expect(body).not.toMatch(/from '@\/integrations\/supabase\/client'/);
  });

  it('calls no `.mutate(` directly — mutations belong to a controller', () => {
    expect(body).not.toMatch(/\.mutate\(/);
  });

  it('imports and calls exactly the 6 known controller hooks — no bare feature-state hooks', () => {
    const calledHooks = [...body.matchAll(/\b(use[A-Z]\w*)\(/g)].map((m) => m[1]);
    const uniqueCalled = [...new Set(calledHooks)].filter((h) => h !== 'useProcessPostsPageComposition');
    const importedFromControllers = new Set(
      [...source.matchAll(/import \{ (use\w+) \} from '\.\.\/controllers\/[^']+';/g)].map((m) => m[1]),
    );
    const strays = uniqueCalled.filter((h) => !importedFromControllers.has(h));
    expect(strays).toEqual([]);
    // Pin the known 6 — a controller silently dropping out (with no stray
    // replacing it) would still pass the assertion above, so assert the
    // membership explicitly too.
    expect([...importedFromControllers].sort()).toEqual([...KNOWN_CONTROLLER_HOOKS].sort());
  });

  it('derives view/commands only via the two ProcessPosts surface builders', () => {
    const builderImports = [
      ...source.matchAll(/import \{ (build\w+) \} from '\.\.\/surfaces\/[^']+';/g),
    ].map((m) => m[1]);
    expect(builderImports.sort()).toEqual(['buildProcessPostsSurfaceCommands', 'buildProcessPostsSurfaceModel']);
  });

  it('renders nothing — the file extension itself forbids JSX', () => {
    expect(HOOK_PATH.endsWith('.ts')).toBe(true);
    expect(HOOK_PATH.endsWith('.tsx')).toBe(false);
  });
});
