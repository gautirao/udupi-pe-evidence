import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2142 (correction pass) — the guard that makes "the composition hook
 * stays composition-only" mechanical rather than a comment.
 *
 * The owner's BLOCKING review of PR #2146 named the exact failure mode this
 * prevents: "What would not be acceptable is hiding 1k+ lines behind one new
 * composition hook." A thin MapDiscovery.tsx proves nothing on its own if the
 * bulk simply moved one level down. These assertions are what make the page's
 * size an honest signal.
 *
 * The rule: useDiscoverPageComposition.ts may call controllers, apply the
 * unsupported-city gate, and join controller outputs into surface contracts.
 * It may NOT own state, run effects, memoise, hold refs, fetch, or make
 * domain decisions.
 */

const HOOK_PATH = path.resolve(__dirname, '../useDiscoverPageComposition.ts');
const source = fs.readFileSync(HOOK_PATH, 'utf-8');

/** Strip block comments and line comments so prose about a rule never satisfies (or trips) it. */
const body = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('useDiscoverPageComposition is composition-only (structural guard)', () => {
  it('owns no React hook primitives — every one belongs to a named controller', () => {
    for (const primitive of [/\buseState[(<]/, /\buseEffect\(/, /\buseMemo\(/, /\buseCallback\(/, /\buseRef[(<]/]) {
      expect(body).not.toMatch(primitive);
    }
  });

  it('imports no data hook VALUE from @/hooks/* (controllers own every query)', () => {
    // `import type` from @/hooks/* is fine — a type carries no behaviour and
    // the surface contracts are keyed off those shapes. A VALUE import is not:
    // it would mean this hook can fetch.
    const valueImports = [...body.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+'(@\/hooks\/[^']+)';/gm)];
    expect(valueImports.map((m) => m[1])).toEqual([]);
  });

  it('imports no React Query / Supabase client directly', () => {
    expect(body).not.toMatch(/from '@tanstack\/react-query'/);
    expect(body).not.toMatch(/from '@\/integrations\/supabase\/client'/);
  });

  it('contains exactly ONE conditional — the unsupported-city route gate', () => {
    // `if (` / ternaries / `&&`-shortcircuits are how domain decisions sneak
    // back in. Exactly one `if` is permitted, and it must be the city gate.
    const ifStatements = [...body.matchAll(/\bif\s*\(/g)];
    expect(ifStatements.length).toBe(1);
    expect(body).toMatch(/if \(!isCityValid\) return \{ status: 'unsupported-city', city \} as const;/);
  });

  it('contains no ternary expression (a ternary here is a derivation that belongs in a builder)', () => {
    expect(body).not.toMatch(/\?[^.:]*:/);
  });

  it('renders nothing — the file extension itself forbids JSX', () => {
    // A `.ts` extension is the guarantee: TypeScript rejects JSX syntax in a
    // non-.tsx file outright, so this cannot be satisfied by accident. (A
    // source regex for `<Component` is NOT usable here — it false-positives on
    // every generic type argument, e.g. `Pick<DiscoverUrlState, ...>`.)
    expect(HOOK_PATH.endsWith('.ts')).toBe(true);
    expect(HOOK_PATH.endsWith('.tsx')).toBe(false);
  });

  it('every hook it calls is a controller (features/discover/controllers) — no bare feature-state hooks', () => {
    const calledHooks = [...body.matchAll(/\b(use[A-Z]\w*)\(/g)].map((m) => m[1]);
    const uniqueCalled = [...new Set(calledHooks)].filter((h) => h !== 'useDiscoverPageComposition');
    const importedFromControllers = new Set(
      [...source.matchAll(/import \{ (use\w+) \} from '@\/features\/discover\/controllers\/[^']+';/g)].map(
        (m) => m[1],
      ),
    );
    const strays = uniqueCalled.filter((h) => !importedFromControllers.has(h));
    expect(strays).toEqual([]);
  });
});
