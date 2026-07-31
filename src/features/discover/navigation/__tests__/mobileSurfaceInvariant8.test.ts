/**
 * Issue #1956 PR-5 (Slice 4, AC5.12) — Invariant 8 static guard for the
 * MOBILE Areas-journey surface, including the new sheets.
 *
 * `staticSweep.test.ts` (this same directory) is a FORBIDDEN glob for this
 * PR and stays byte-unchanged — its own invariant-8 coverage is untouched.
 * This is a NEW, separate spec sweeping the files PR-5 actually added/
 * touched for the mobile surface: the new
 * `src/features/discover/views/mobile/` presentation components and the
 * two approved existing files this PR's mobile surface is built from
 * (`DiscoverAreasJourneyPanel.tsx`, `HierarchyBackButton.tsx`). No
 * result-scope control (Edit areas / Clear selected areas / Add nearby
 * areas / Draw search area / Search this area / Create alert) may appear in
 * any of them, in either LIST or MAP mode.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '..', '..', '..', '..'); // src/
const MOBILE_DIR = path.join(SRC_ROOT, 'features/discover/views/mobile');

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

const MOBILE_SURFACE_FILES = [
  ...walkTsx(MOBILE_DIR),
  path.join(SRC_ROOT, 'features/discover/views/DiscoverAreasJourneyPanel.tsx'),
  path.join(SRC_ROOT, 'components/discover/navigation/HierarchyBackButton.tsx'),
].filter((f) => fs.existsSync(f));

const FORBIDDEN_PHRASES: RegExp[] = [
  /edit areas/i,
  /clear selected areas/i,
  /add nearby areas/i,
  /draw search area/i,
  /search this area/i,
  /create alert/i,
];

describe('mobile AREA surface — Invariant 8 static guard (AC5.12)', () => {
  it('sanity — at least the mobile presentation modules are present to sweep', () => {
    expect(MOBILE_SURFACE_FILES.length).toBeGreaterThan(0);
  });

  for (const file of MOBILE_SURFACE_FILES) {
    const rel = path.relative(SRC_ROOT, file);
    it(`${rel} contains no forbidden result-scope phrase`, () => {
      const source = stripComments(read(file));
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(source, `${rel} matched forbidden phrase ${phrase}`).not.toMatch(phrase);
      }
    });
  }
});
