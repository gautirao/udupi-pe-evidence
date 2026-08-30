/**
 * Issue #1956 PR-5 — static guard for the mobile Areas-journey surface.
 *
 * AC5.5 / risk R2 — no mobile shell/sheet module may import a URL-writing
 * action. The Map/List toggle (`mobileView`) is plain React state with no
 * writer anywhere in the URL-state layer today (see
 * `[verified_facts].map_list_toggle_is_already_history_safe` in the approved
 * plan) — this guard keeps it that way by construction: every file under
 * `src/features/discover/views/mobile/` (this PR's new presentation
 * components) is scanned for an import of `useDiscoverActions`,
 * `useSearchParams`, `setSearchParams`, `history.pushState`/
 * `history.replaceState`, or a blind `navigate(-1)`/`navigate(1)` call — any
 * of which would be a route into a URL/history write this PR does not own.
 * A NEW file dropped in that directory which imports one of these fails
 * this guard immediately, with no reliance on a reviewer reading every new
 * diff by eye. The invariant-8 (result-scope-control) guard lives
 * separately at
 * `src/features/discover/navigation/__tests__/mobileSurfaceInvariant8.test.ts`,
 * per the approved plan's file list.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = path.join(HERE, '..'); // src/features/discover/views/mobile
const SRC_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..'); // src/

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('mobile surface — AC5.5 static guard: no URL-writing import', () => {
  const mobileFiles = walkTsx(MOBILE_DIR);

  it('sanity — at least one mobile presentation module exists to sweep', () => {
    expect(mobileFiles.length).toBeGreaterThan(0);
  });

  const FORBIDDEN_URL_WRITE_PATTERNS: RegExp[] = [
    /useDiscoverActions\s*\(/,
    /\buseSearchParams\s*\(/,
    /\bsetSearchParams\s*\(/,
    /history\.(pushState|replaceState)\s*\(/,
    /\bnavigate\s*\(\s*-?\d/, // navigate(-1) / navigate(1) — blind history traversal
  ];

  for (const file of mobileFiles) {
    const rel = path.relative(SRC_ROOT, file);
    it(`${rel} imports no URL-writing action`, () => {
      const source = stripComments(read(file));
      for (const pattern of FORBIDDEN_URL_WRITE_PATTERNS) {
        expect(source, `${rel} matched forbidden pattern ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});
