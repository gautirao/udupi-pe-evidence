/**
 * Import-direction guard — Issue #2661 commit 6.
 *
 * Static import-scan (no bundler/graph tool — a plain regex over each file's
 * own `import ... from '../<folder>/...'` lines is sufficient and matches
 * this repo's existing fs-regex guard-test convention, e.g.
 * schoolJourneyPanels.barrelOnly.test.ts). Enforces the decomposition's
 * layering:
 *   - radius/     -> may import shared/ only (never area/, browse/, selected/, combined/)
 *   - selected/   -> may import radius/ + shared/ only
 *   - combined/   -> may import radius/ + shared/ only
 *   - area/       -> may import shared/ only
 *   - browse/     -> may import shared/ only
 *   - shared/     -> may import none of the above state folders
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHOOLS_ROOT = join(__dirname, '..', 'schools');
const STATE_FOLDERS = ['radius', 'selected', 'combined', 'area', 'browse', 'shared'] as const;
type StateFolder = (typeof STATE_FOLDERS)[number];

const ALLOWED: Record<StateFolder, StateFolder[]> = {
  radius: ['shared'],
  selected: ['radius', 'shared'],
  combined: ['radius', 'shared'],
  area: ['shared'],
  browse: ['shared'],
  shared: [],
};

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `../<folder>/` or `../../schools/<folder>/`-shaped relative import target folder under schools/. */
function crossFolderImportTargets(src: string): StateFolder[] {
  const targets: StateFolder[] = [];
  const importLineRe = /^import\s[^;]*from\s+['"](\.\.\/[^'"]+)['"];?$/gm;
  let m: RegExpExecArray | null;
  while ((m = importLineRe.exec(src))) {
    const spec = m[1];
    for (const folder of STATE_FOLDERS) {
      // Matches '../<folder>/...' (one level up into a sibling state folder).
      if (new RegExp(`(^|/)\\.\\./${folder}/`).test(spec)) {
        targets.push(folder);
      }
    }
  }
  return targets;
}

describe('schools/ import-direction guard (Issue #2661 commit 6)', () => {
  for (const folder of STATE_FOLDERS) {
    it(`${folder}/ only imports ${ALLOWED[folder].length ? ALLOWED[folder].join(', ') : 'no other state folder'}`, () => {
      const dir = join(SCHOOLS_ROOT, folder);
      const files = listFilesRecursive(dir);
      const violations: string[] = [];
      for (const file of files) {
        const src = readFileSync(file, 'utf-8');
        const targets = crossFolderImportTargets(src);
        for (const target of targets) {
          if (target === folder) continue; // same-folder relative import, not a cross-folder one
          if (!ALLOWED[folder].includes(target)) {
            violations.push(`${file} imports ../${target}/ (not allowed for ${folder}/)`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
