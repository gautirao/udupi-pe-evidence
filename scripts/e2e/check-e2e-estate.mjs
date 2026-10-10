#!/usr/bin/env node
// scripts/e2e/check-e2e-estate.mjs - issue #2750
//
// Estate guard: ties the Playwright files on disk to docs/testing/e2e-retirement-manifest.csv so the
// E2E estate can only change on purpose. Node stdlib only; runs in ~1s with no stack.
//
//   node scripts/e2e/check-e2e-estate.mjs [--root <dir>] [--manifest <csv>]
//
// Exit 0 = estate consistent; 1 = one "FAIL[FC-xx] ..." line per violation on stderr; 2 = usage.
//
// Rules (FC ids refer to the #2750 fail-closed table):
//  FC-17 every Playwright-matchable file (*.{spec,test}.{ts,js,mjs,cjs,tsx,jsx}) under e2e/ and
//        e2e-parity/ has EXACTLY one manifest row (a new unlisted spec fails with the #2750 rule).
//  FC-18 status RETIRED => file absent; status SCHEDULED(PR-n) / RETAIN_SPECIALIST => file present.
//  FC-19 decisions are final (no PENDING / NEEDS_REVIEW); DELETE_DUP names a canonical id; MOVE_DOWN
//        names a destination, which must exist once the row is RETIRED; RETAIN_SPECIALIST has a
//        written reason; *.canonical.ts only under e2e/canonical/; no literal test.skip / test.fixme /
//        test.only in e2e/canonical/**; the playwright*.config.ts set equals the fixed current list.
//  K4    no tracked file under e2e/canonical/.auth/ or playwright-report*/.
//  FC-24 sum(issue_2751_titles) over all rows == 66 and every #2751 file has a row.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectCanonicalTitles, loadMatrix, requiredEntries } from './check-canonical-journeys.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SELF_DIR, '..', '..');
export const MANIFEST_REL = 'docs/testing/e2e-retirement-manifest.csv';

export const HEADER = ['file', 'bucket', 'decision', 'canonical_equivalent_or_destination', 'rationale', 'slice', 'issue_2751_titles', 'status'];
export const DECISIONS = ['DELETE_DUP', 'DELETE_OBSOLETE', 'MOVE_DOWN', 'CANONICAL_GAP_CLOSED', 'RETAIN_SPECIALIST'];
export const ISSUE_2751_TOTAL = 66;
export const ISSUE_2751_FILES = [
  'e2e/capture-discover-agri-first-polish-1771.spec.ts',
  'e2e/capture-school-first-polish-1770.spec.ts',
  'e2e/discover-agri-grouped-journey-1412.spec.ts',
  'e2e/discover-agri-journey-1375.spec.ts',
  'e2e/discover-agri-price-gate-1551.spec.ts',
  'e2e/discover-correctness-1064.spec.ts',
  'e2e/discover-school-bounded-search.spec.ts',
  'e2e/discover-school-first-journey.spec.ts',
  'e2e/discover-school-journey.spec.ts',
  'e2e/discover-school-selected.spec.ts',
  'e2e/discover/desktop-control-bar-shell-1953.spec.ts',
  'e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts',
  'e2e/discover/mobile-landing-journey-switcher-1953.spec.ts',
  'e2e/discover/school-panel-error-states.spec.ts',
  'e2e/issue-2015-search-this-area-viewport.spec.ts',
  'e2e/issue-2461-polygon-panel-parity.spec.ts',
  'e2e/school-first-back-nav.spec.ts',
];
// The complete set of Playwright config files that may exist. A new config must be a reviewed change
// to this list (and to the manifest series), never a side effect.
export const EXPECTED_CONFIGS = [
  'e2e-parity/mock-capture/playwright.mock-capture.config.ts',
  'playwright.canonical.config.ts',
  'playwright.config.ts',
  'playwright.parity.config.ts',
];
export const NEW_SPEC_RULE =
  'Per #2750, new permanent Playwright coverage must extend the canonical suite (e2e/canonical/, journey-matrix.json) for a documented journey gap, or carry an explicit specialist reason as a RETAIN_SPECIALIST row in docs/testing/e2e-retirement-manifest.csv.';

const MATCHABLE = /\.(spec|test)\.(ts|js|mjs|cjs|tsx|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'test-results', 'playwright-report', '.claude', '.worktrees']);

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function* walk(dir, rootDir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('playwright-report')) continue;
      yield* walk(path.join(dir, ent.name), rootDir);
    } else {
      yield path.relative(rootDir, path.join(dir, ent.name)).split(path.sep).join('/');
    }
  }
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
}

export function gitTrackedFiles(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean);
  } catch {
    return false; // .git exists but ls-files failed: the caller must FAIL CLOSED (K4)
  }
}

// Ids that C2 has not created yet. A DELETE_DUP / CANONICAL_GAP_CLOSED row may name them only while
// it is still SCHEDULED(...); once RETIRED, every id it names must exist.
export const PLANNED_C2_IDS = ['T15b', 'T2b', 'T17b', 'T21', 'T22', 'AG1', 'AG2', 'AG3', 'T23', 'RQ1', 'RQ2'];

/** Id tokens named by a canonical_equivalent_or_destination cell ("T1 [role:admin] + T14" -> T1, T14). */
export function idTokens(cell) {
  return String(cell).replace(/\[[^\]]*\]/g, ' ').split(/[\s+,]+/).filter(Boolean);
}

export const CANONICAL_ID_SHAPE = /^[A-Z]{1,3}\d+[a-z]?$/;

function knownCanonicalIds(root, matrixPath) {
  const ids = new Set();
  const { matrix } = loadMatrix(matrixPath);
  for (const e of requiredEntries(matrix ?? { rows: [] })) ids.add(e.id);
  for (const t of collectCanonicalTitles(root)) {
    const lead = t.title.replace(/^(?:\s*\[role:\w+\])*\s*/, '').match(/^[A-Za-z][A-Za-z0-9_]*/);
    // Only id-SHAPED leading tokens (T13, AG1, T15b) count; a prose title must not become a canonical id.
    if (lead && CANONICAL_ID_SHAPE.test(lead[0])) ids.add(lead[0]);
  }
  return ids;
}

export function checkEstate({ root = DEFAULT_ROOT, manifestPath, matrixPath, trackedFiles } = {}) {
  const errors = [];
  const info = [];
  const mp = manifestPath ?? path.join(root, MANIFEST_REL);
  if (!fs.existsSync(mp)) {
    return { ok: false, errors: [`FAIL[FC-17] manifest not found: ${path.relative(root, mp) || mp}`], info };
  }
  const table = parseCsv(fs.readFileSync(mp, 'utf8')).filter((r) => !(r.length === 1 && r[0] === ''));
  if (table.length === 0 || table[0].join(',') !== HEADER.join(',')) {
    return { ok: false, errors: [`FAIL[FC-17] manifest header must be exactly: ${HEADER.join(',')}`], info };
  }
  const rows = table.slice(1).map((r, i) => ({ line: i + 2, f: Object.fromEntries(HEADER.map((h, k) => [h, r[k] ?? ''])), n: r.length }));

  const byFile = new Map();
  for (const r of rows) {
    if (r.n !== HEADER.length) errors.push(`FAIL[FC-19] manifest line ${r.line}: expected ${HEADER.length} columns, found ${r.n}`);
    const file = r.f.file;
    if (byFile.has(file)) errors.push(`FAIL[FC-17] manifest has more than one row for ${file} (line ${r.line})`);
    byFile.set(file, r);
  }

  // files on disk
  const onDisk = new Set();
  for (const top of ['e2e', 'e2e-parity']) {
    for (const rel of walk(path.join(root, top), root)) if (MATCHABLE.test(rel)) onDisk.add(rel);
  }
  for (const rel of [...onDisk].sort()) {
    if (!byFile.has(rel)) errors.push(`FAIL[FC-17] ${rel} is a Playwright spec with no row in ${MANIFEST_REL}. ${NEW_SPEC_RULE}`);
  }

  let idCache = null;
  const canonicalIds = () => {
    idCache ??= knownCanonicalIds(root, matrixPath ?? path.join(root, 'e2e', 'canonical', 'journey-matrix.json'));
    return idCache;
  };

  const todoToken = /\b(PENDING|NEEDS_REVIEW|TBD|TODO)\b/;
  let sum2751 = 0;
  for (const { line, f } of rows) {
    const where = `manifest line ${line} (${f.file})`;
    const exists = onDisk.has(f.file) || fs.existsSync(path.join(root, f.file));
    if (!DECISIONS.includes(f.decision)) errors.push(`FAIL[FC-19] ${where}: decision "${f.decision}" is not one of ${DECISIONS.join('|')}`);
    for (const col of ['decision', 'status', 'canonical_equivalent_or_destination', 'rationale']) {
      if (todoToken.test(f[col])) errors.push(`FAIL[FC-19] ${where}: column ${col} holds an undecided marker ("${f[col].slice(0, 40)}"); decisions must be FINAL`);
    }
    if (!/^(SCHEDULED\(PR-[1-9]\)|RETIRED|RETAIN_SPECIALIST)$/.test(f.status)) {
      errors.push(`FAIL[FC-19] ${where}: status "${f.status}" must be SCHEDULED(PR-n), RETIRED or RETAIN_SPECIALIST`);
    }
    if (f.status === 'RETIRED' && exists) errors.push(`FAIL[FC-18] ${where}: status RETIRED but the file still exists on disk`);
    if ((f.status.startsWith('SCHEDULED') || f.status === 'RETAIN_SPECIALIST') && !exists) {
      errors.push(`FAIL[FC-18] ${where}: status ${f.status} but the file does not exist on disk`);
    }
    const sm = f.status.match(/^SCHEDULED\((PR-\d)\)$/);
    if (sm && f.slice !== sm[1]) errors.push(`FAIL[FC-19] ${where}: slice ${f.slice} disagrees with status ${f.status}`);
    if ((f.decision === 'DELETE_DUP' || f.decision === 'CANONICAL_GAP_CLOSED') && !f.canonical_equivalent_or_destination.trim()) {
      errors.push(`FAIL[FC-19] ${where}: ${f.decision} must name the canonical id that proves the journey`);
    } else if (f.decision === 'DELETE_DUP' || f.decision === 'CANONICAL_GAP_CLOSED') {
      for (const tok of idTokens(f.canonical_equivalent_or_destination)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tok)) {
          errors.push(`FAIL[FC-19] ${where}: "${tok}" is not a canonical id (name ids only, e.g. "T4 + T5")`);
        } else if (!canonicalIds().has(tok)) {
          const planned = PLANNED_C2_IDS.includes(tok) && f.status.startsWith('SCHEDULED');
          if (!planned) {
            errors.push(`FAIL[FC-19] ${where}: canonical id "${tok}" is neither in the journey matrix nor a collected e2e/canonical title${PLANNED_C2_IDS.includes(tok) ? ' (a not-yet-created C2 id is allowed only while the row is SCHEDULED)' : ''}`);
          }
        }
      }
    }
    if (f.decision === 'MOVE_DOWN') {
      const dest = f.canonical_equivalent_or_destination.trim();
      if (!dest) errors.push(`FAIL[FC-19] ${where}: MOVE_DOWN must name a destination test path`);
      else if (f.status === 'RETIRED' && !fs.existsSync(path.join(root, dest))) {
        errors.push(`FAIL[FC-19] ${where}: RETIRED MOVE_DOWN row but destination ${dest} does not exist`);
      }
    }
    if (f.decision === 'RETAIN_SPECIALIST') {
      if (f.rationale.trim().length < 20) errors.push(`FAIL[FC-19] ${where}: RETAIN_SPECIALIST needs a written reason`);
      if (f.status !== 'RETAIN_SPECIALIST') errors.push(`FAIL[FC-19] ${where}: decision RETAIN_SPECIALIST must carry status RETAIN_SPECIALIST`);
    }
    const n = Number(f.issue_2751_titles);
    if (!Number.isInteger(n) || n < 0) errors.push(`FAIL[FC-24] ${where}: issue_2751_titles "${f.issue_2751_titles}" is not a non-negative integer`);
    else sum2751 += n;
  }

  // FC-24
  if (sum2751 !== ISSUE_2751_TOTAL) errors.push(`FAIL[FC-24] sum of issue_2751_titles is ${sum2751}, expected ${ISSUE_2751_TOTAL} (#2751 reconciliation)`);
  for (const f of ISSUE_2751_FILES) {
    if (!byFile.has(f)) errors.push(`FAIL[FC-24] #2751 file ${f} has no manifest row`);
    else if (Number(byFile.get(f).f.issue_2751_titles) < 1) errors.push(`FAIL[FC-24] #2751 file ${f} carries issue_2751_titles=0`);
  }

  // *.canonical.ts only under e2e/canonical/ ; literal skip/fixme/only inside it
  const allFiles = [...walk(root, root)];
  for (const rel of allFiles) {
    if (rel.endsWith('.canonical.ts') && !rel.startsWith('e2e/canonical/')) {
      errors.push(`FAIL[FC-19] ${rel}: *.canonical.ts files may exist only under e2e/canonical/ (the isolation from playwright.config.ts depends on it)`);
    }
  }
  for (const rel of allFiles.filter((r) => r.startsWith('e2e/canonical/') && /\.(ts|js|mjs|tsx)$/.test(r))) {
    const code = stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));
    const m = code.match(/\b(?:test|it)(?:\.describe)?\.(skip|fixme|only|fail)\b/);
    if (m) errors.push(`FAIL[FC-04] ${rel}: literal test.${m[1]} is banned in e2e/canonical/** (gate by project selection or the documented *_ENABLED flag, never skip)`);
  }

  // config set
  const configs = allFiles.filter((r) => /(^|\/)playwright[^/]*config[^/]*\.ts$/.test(r)).sort();
  const want = [...EXPECTED_CONFIGS].sort();
  if (configs.join('\n') !== want.join('\n')) {
    const extra = configs.filter((c) => !want.includes(c));
    const missing = want.filter((c) => !configs.includes(c));
    errors.push(`FAIL[FC-19] playwright*.config.ts set changed: unexpected [${extra.join(', ')}] missing [${missing.join(', ')}]. A config change is a reviewed change to EXPECTED_CONFIGS in scripts/e2e/check-e2e-estate.mjs`);
  }

  // K4 tracked artefacts
  const tracked = trackedFiles === undefined ? gitTrackedFiles(root) : trackedFiles;
  if (tracked === null) info.push('estate: not a git checkout, tracked-artefact check (K4) skipped');
  else if (tracked === false) errors.push('FAIL[K4] git ls-files failed in a checkout that has a .git entry; the tracked-artefact check cannot run, so it fails closed');
  else {
    for (const f of tracked) {
      if (f.startsWith('e2e/canonical/.auth/') || /(^|\/)playwright-report[^/]*\//.test(f)) {
        errors.push(`FAIL[K4] ${f} is tracked by git; storageState files and Playwright reports must stay untracked`);
      }
    }
  }

  const retired = rows.filter((r) => r.f.status === 'RETIRED').length;
  info.push(`estate: files=${onDisk.size} rows=${rows.length} retired=${retired} scheduled=${rows.filter((r) => r.f.status.startsWith('SCHEDULED')).length} issue_2751_titles=${sum2751}`);
  return { ok: errors.length === 0, errors, info };
}

export function main(argv = process.argv.slice(2)) {
  let root = DEFAULT_ROOT;
  let manifestPath;
  for (let i = 0; i < argv.length; i += 1) {
    const m = argv[i].match(/^--(root|manifest)(?:=(.*))?$/);
    if (!m) { process.stderr.write('usage: check-e2e-estate.mjs [--root dir] [--manifest csv]\n'); return 2; }
    const v = m[2] ?? argv[++i];
    if (m[1] === 'root') root = path.resolve(v); else manifestPath = path.resolve(v);
  }
  const res = checkEstate({ root, manifestPath });
  for (const l of res.info) process.stdout.write(`${l}\n`);
  if (!res.ok) {
    for (const l of res.errors) process.stderr.write(`${l}\n`);
    process.stderr.write(`E2E ESTATE GUARD: FAIL (${res.errors.length} problem${res.errors.length === 1 ? '' : 's'})\n`);
    return 1;
  }
  process.stdout.write('E2E ESTATE GUARD: PASS\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
