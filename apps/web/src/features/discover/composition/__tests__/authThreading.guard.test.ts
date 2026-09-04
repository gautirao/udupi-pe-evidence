import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2419 (PR-1) — the guard that keeps the signed-in gate wired.
 *
 * `isAuthenticated` is OPTIONAL on both `useDiscoverPageStateController` and
 * `useDiscoverPageState`, so that fixtures predating it keep compiling and an
 * unwired caller can never lock out a signed-in shopper. The cost of that
 * choice is that dropping the argument is invisible: the types still check,
 * every behavioural test still passes (they pass the value directly to the
 * hook), and the only symptom is that anonymous shoppers silently regain the
 * ability to commit a POLYGON scope whose results are not scoped to their
 * drawn area.
 *
 * This is a source-text guard for the same reason
 * `compositionHookScope.guard.test.ts` is one: the invariant is about the
 * WIRING between three files, which no single unit test observes.
 *
 * Comments are stripped before matching, so prose naming `isAuthenticated`
 * can never satisfy a check — including the explanatory comments this PR adds
 * at each hop.
 */

const COMPOSITION = path.resolve(__dirname, '../useDiscoverPageComposition.ts');
const CONTROLLER = path.resolve(
  __dirname,
  '../../controllers/useDiscoverPageStateController.ts',
);

function sourceWithoutComments(file: string): string {
  return fs
    .readFileSync(file, 'utf-8')
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Returns the text of the object literal passed to `callee({ ... })`. */
function callArguments(body: string, callee: string): string {
  const start = body.indexOf(`${callee}({`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = body.indexOf('{', start); i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(body.indexOf('{', start), i + 1);
    }
  }
  return '';
}

describe('#2419 — the signed-in gate stays wired end to end', () => {
  it('the composition passes BOTH auth signals into the page-state controller', () => {
    const args = callArguments(sourceWithoutComments(COMPOSITION), 'useDiscoverPageStateController');
    expect(args).not.toBe('');
    expect(args).toMatch(/\bisAuthenticated\b/);
    // `authLoading` is not optional decoration: without it the controller
    // cannot tell "anonymous" from "not resolved yet".
    expect(args).toMatch(/\bauthLoading\b/);
  });

  // The derivation lives in the CONTROLLER, not the composition. An earlier
  // revision put the ternary in the composition and broke that hook's own
  // structural guard, which forbids derivations there
  // (compositionHookScope.guard.test.ts). Asserted here so the two rules
  // cannot drift back into conflict.
  it('the loading-window suppression lives in the controller, not the composition', () => {
    const controller = sourceWithoutComments(CONTROLLER);
    const args = callArguments(controller, 'useDiscoverPageState');
    expect(args).not.toBe('');
    expect(args).toMatch(/isAuthenticated:\s*authLoading\s*\?\s*undefined\s*:\s*isAuthenticated/);

    const composition = sourceWithoutComments(COMPOSITION);
    expect(composition).not.toMatch(/isAuthenticated:\s*authLoading\s*\?/);
  });

  it('the controller consumes both signals rather than accepting and dropping them', () => {
    const body = sourceWithoutComments(CONTROLLER);
    expect(body).toMatch(/\bisAuthenticated,/);
    expect(body).toMatch(/\bauthLoading,/);
  });
});
