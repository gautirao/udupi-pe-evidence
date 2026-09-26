import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Issue #2662, guardrail 16 — `useProcessPostsBatchController` and
 * `useProcessPostsResetController` must never introduce `useMemo`/
 * `useCallback`. Both close over `unprocessedPosts`/`processedPosts` inside
 * long-running async work (the SSE stream loop; the reset-all mutation);
 * memoizing a callback here risks a stale closure over a prior posts
 * snapshot that a later render has already superseded. See each
 * controller's own JSDoc for the full rationale.
 *
 * Static source-text guard: this is a "never add" rule, not a behavior to
 * exercise at runtime — a text scan is the direct, tamper-evident way to
 * lock it in as a regression gate.
 */
const CONTROLLERS_DIR = path.resolve(__dirname, '..');
const GUARDED_FILES = ['useProcessPostsBatchController.ts', 'useProcessPostsResetController.ts'];

describe('ProcessPosts controllers — no memoization in volatile controllers guard', () => {
  it.each(GUARDED_FILES)('%s never calls useMemo or useCallback', (file) => {
    const source = fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf-8');

    expect(source).not.toMatch(/\buseMemo\s*\(/);
    expect(source).not.toMatch(/\buseCallback\s*\(/);
  });
});
