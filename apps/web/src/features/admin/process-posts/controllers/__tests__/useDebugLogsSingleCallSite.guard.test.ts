import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2662, guardrail 7 — `useDebugLogs()` must have exactly one call site
 * across the six ProcessPosts controllers: `useProcessPostsConsoleController`.
 * A second call site would split the log stream (each `useDebugLogs()` call
 * mounts its own independent log buffer), silently dropping entries from
 * whichever controller instance isn't rendered/read by the page.
 *
 * Scoped to `controllers/` (not the whole feature) because that's the only
 * layer with a plausible second call site today: `surfaces/` and
 * `composition/` only ever receive `debug` as a parameter, never call the
 * hook directly (see `processPostsSurfaceContract.ts`'s `console.debug`
 * field and `useProcessPostsPageComposition.ts`'s wiring). If a future
 * change adds a `useDebugLogs()` call outside `controllers/`, this guard
 * would not catch it — widen `readControllerSources()`'s directory if that
 * ever becomes a real risk.
 *
 * Static source-text guard rather than a runtime spy: a runtime assertion can
 * only prove the call count for the specific controller set the test happens
 * to render, not that no *other* file in this directory independently calls
 * it.
 */
const CONTROLLERS_DIR = path.resolve(__dirname, '..');

function readControllerSources(): { file: string; source: string }[] {
  return fs
    .readdirSync(CONTROLLERS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((file) => ({
      file,
      source: fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf-8'),
    }));
}

describe('ProcessPosts controllers — useDebugLogs() single-call-site guard', () => {
  it('is called exactly once across all controller files, from useProcessPostsConsoleController.ts', () => {
    const sources = readControllerSources();
    const callers = sources.filter(({ source }) => /\buseDebugLogs\s*\(/.test(source));

    expect(callers.map((c) => c.file)).toEqual(['useProcessPostsConsoleController.ts']);
  });

  it('every other controller receives debug as a parameter rather than calling useDebugLogs itself', () => {
    // A type-only import (e.g. `import type { useDebugLogs } from '...'`, used
    // to type a `debug: ReturnType<typeof useDebugLogs>` parameter) is fine —
    // the guard is on the runtime *call*, already asserted above. Only a
    // value import of the hook itself would let a file invoke it.
    const sources = readControllerSources();
    const others = sources.filter((c) => c.file !== 'useProcessPostsConsoleController.ts');

    for (const { file, source } of others) {
      expect(source).not.toMatch(/^import\s+\{[^}]*\buseDebugLogs\b[^}]*\}\s+from\s+['"]@\/components\/admin\/DebugConsole['"]/m);
    }
  });
});
