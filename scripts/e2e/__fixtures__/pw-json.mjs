// Synthetic Playwright JSON + repo-root builders for scripts/e2e/*.test.mjs (issue #2750).
// Mirrors the shape of `playwright test --list|--reporter=json` output: suites[] > (file suite) >
// suites[] (describe) > specs[] > tests[{projectName,status,results[]}]; stats{} only on a real run.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Builds a Playwright JSON report. tests: [{project, describe?, title, status?, results?}] */
export function pwJson({ tests, stats, errors = [] }) {
  const byFile = new Map();
  for (const t of tests) {
    const file = t.file ?? 'spec.canonical.ts';
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(t);
  }
  const suites = [];
  for (const [file, ts] of byFile) {
    const fileSuite = { title: file, file, specs: [], suites: [] };
    const describes = new Map();
    for (const t of ts) {
      const testObj = {
        projectName: t.project,
        status: t.status ?? 'expected',
        results: (t.results ?? ['passed']).map((status) => ({ status })),
      };
      const spec = { title: t.title, file, tests: [testObj] };
      if (t.describe) {
        if (!describes.has(t.describe)) {
          const d = { title: t.describe, file, specs: [], suites: [] };
          describes.set(t.describe, d);
          fileSuite.suites.push(d);
        }
        describes.get(t.describe).specs.push(spec);
      } else {
        fileSuite.specs.push(spec);
      }
    }
    suites.push(fileSuite);
  }
  const out = { config: {}, suites, errors };
  if (stats) out.stats = stats;
  return out;
}

export function passingStats(n) {
  return { expected: n, unexpected: 0, flaky: 0, skipped: 0, duration: 1 };
}

/**
 * A matrix with all 16 journey rows; ids given for J01, J12/J13/J15 DESCOPED_DARK (the only descopable rows) and the
 * rest COVERED by J01's own ids (so a passing world has no open C2 gap; pass extraRows {J02: {status: 'GAP_CLOSING_IN_C2'}} to
 * model one). The vocabulary and project rosters equal the ones pinned in the checker.
 */
export function makeMatrix({ j01Ids = [], harness = [], extraRows = {} } = {}) {
  const rows = Array.from({ length: 16 }, (_, i) => {
    const id = `J${String(i + 1).padStart(2, '0')}`;
    if (id === 'J01') {
      return { id, journey: 'Area-first Discover', family: 'discover', status: 'COVERED', canonical_ids: j01Ids, notes: 'fixture row' };
    }
    // Only the checker's pinned DESCOPABLE_IDS may be DESCOPED_DARK; every other filler row is COVERED by J01's ids.
    if (['J12', 'J13', 'J15'].includes(id)) {
      return { id, journey: `fixture ${id}`, family: 'fixture', status: 'DESCOPED_DARK', canonical_ids: [], notes: 'fixture row descoped on purpose (dark)', ...(extraRows[id] ?? {}) };
    }
    return { id, journey: `fixture ${id}`, family: 'fixture', status: 'COVERED', canonical_ids: j01Ids, notes: 'fixture filler row', ...(extraRows[id] ?? {}) };
  });
  return {
    version: 1,
    required_projects: ['canonical-anon', 'canonical-user', 'canonical-broker', 'canonical-admin'],
    required_setup_projects: ['canonical-setup-user', 'canonical-setup-broker', 'canonical-setup-admin'],
    statuses: ['COVERED', 'GAP_CLOSING_IN_C2', 'DESCOPED_DARK'],
    harness,
    rows,
  };
}

const APP_YML_DEFAULT_FALSE = 'app:\n  property-requests:\n    enabled: ${PROPERTY_REQUESTS_ENABLED:false}\n';

/** Creates a temp repo root. Returns its path. */
export function makeRoot({ matrix, sources = {}, applicationYml = APP_YML_DEFAULT_FALSE, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guard-'));
  const put = (rel, txt) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  };
  put('e2e/canonical/journey-matrix.json', JSON.stringify(matrix ?? makeMatrix()));
  put('apps/api/src/main/resources/application.yml', applicationYml);
  for (const [name, src] of Object.entries(sources)) put(`e2e/canonical/${name}`, src);
  for (const [rel, txt] of Object.entries(files)) put(rel, txt);
  return root;
}

export function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

export function writeJson(dir, name, obj) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
}

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guard-io-'));
}
