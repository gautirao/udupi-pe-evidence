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
//
// Specialist suite (#2750 S0; tag FAIL[FC-19/SPn]; e2e/specialist/ + playwright.specialist.config.ts, opt-in, local-only,
// NOT the gate; host tables come from scripts/e2e/specialist-suite.mjs):
//  SP1   isolation: *.specialist.ts only under e2e/specialist/; that directory holds only *.specialist.ts, support/**
//        (*.ts without a spec/test infix) and README.md, so the legacy config can never collect anything there.
//  SP2   bidirectional manifest link: every e2e/specialist/**/*.specialist.ts has exactly one RETAIN_SPECIALIST row (decision
//        AND status); every RETAIN_SPECIALIST row's file is under e2e/specialist/ or e2e-parity/ (grandfathered).
//  SP3   an e2e/specialist RETAIN_SPECIALIST rationale starts with [CODE] token(s) from the 6-code list + >= 20 characters.
//  SP4   no production/shared/external host literal in e2e/specialist/** (README.md excepted; comments NOT exempt).
//  SP5   no test.skip/fixme/only/fail (or describe.*) in e2e/specialist/** (comments stripped).
//  SP6   no legacy hosted-auth state (fixtures/*-auth.json) in e2e/specialist/**.
//  SP7   every *.specialist.ts imports `test` from './support/specialist-test', never from '@playwright/test'.
//  SP8   no route continue call in *.specialist.ts (comments stripped): use fallback() or fulfill().
//  SP9   no direct APIRequestContext / global fetch (bare, globalThis/window/self-qualified, bracket form) in *.specialist.ts (comments stripped; in-page fetch inside page.evaluate is flagged too): use backendGet().
//        SP4 allows reserved-TLD (.test/.invalid/.example) literals statically (fulfil-mocks use them); the runtime guard blocks UNMOCKED ones.
//  CFG   the playwright*.config.ts set (EXPECTED_CONFIGS) includes playwright.specialist.config.ts.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectCanonicalTitles, loadMatrix, requiredEntries } from './check-canonical-journeys.mjs';
import { findForbiddenHostLiterals, stripCommentsStrict } from './specialist-suite.mjs';

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
  'playwright.deployed.config.ts',
  'playwright.parity.config.ts',
  'playwright.specialist.config.ts',
];
export const SPECIALIST_REASON_CODES = ['HIT_TEST', 'PAINT_GEOMETRY', 'LAYOUT_OVERFLOW', 'LEAFLET_REAL', 'RADIX_REAL', 'POINTER_REAL'];
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

const SPECIALIST_DIR = 'e2e/specialist/';

/** Names imported from one `import ... from '<source>'` clause; `namespace`/`default` flag the forms that hide `test`. */
function importClauses(code) {
  const out = [];
  for (const m of code.matchAll(/\bimport\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[2].trim();
    const braces = clause.match(/\{([^}]*)\}/);
    const named = braces
      ? braces[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ typeOnly: Boolean(m[1]) || /^type\s/.test(s), name: s.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim() }))
      : [];
    out.push({ source: m[3], named, namespace: /\*\s*as\s/.test(clause), hasDefault: clause.replace(/\{[^}]*\}/, '').replace(/\*\s*as\s+\w+/, '').replace(/,/g, '').trim() !== '' });
  }
  return out;
}

/** SP1-SP9 (see the header). Appends to `errors`. */
function checkSpecialistRules({ root, rows, byFile, allFiles, errors }) {
  const tag = (n) => `FAIL[FC-19/SP${n}]`;
  const underSpec = allFiles.filter((r) => r.startsWith(SPECIALIST_DIR) && !r.endsWith('/.DS_Store'));
  const specs = underSpec.filter((r) => r.endsWith('.specialist.ts'));

  // SP1
  for (const rel of allFiles) {
    if (rel.endsWith('.specialist.ts') && !rel.startsWith(SPECIALIST_DIR)) {
      errors.push(`${tag(1)} ${rel}: *.specialist.ts files may exist only under e2e/specialist/ (the isolation from the legacy and canonical configs depends on it)`);
    }
  }
  for (const rel of underSpec) {
    const ok = rel.endsWith('.specialist.ts')
      || rel === `${SPECIALIST_DIR}README.md`
      || (rel.startsWith(`${SPECIALIST_DIR}support/`) && /\.ts$/.test(rel) && !MATCHABLE.test(rel));
    if (MATCHABLE.test(rel)) errors.push(`${tag(1)} ${rel}: a *.spec.*/*.test.* file under e2e/specialist/ would be collected by the legacy playwright.config.ts; name specialist specs *.specialist.ts`);
    else if (!ok) errors.push(`${tag(1)} ${rel}: e2e/specialist/ holds only *.specialist.ts, support/**/*.ts and README.md`);
  }

  // SP2
  for (const rel of specs) {
    const row = byFile.get(rel);
    if (!row) errors.push(`${tag(2)} ${rel} has no RETAIN_SPECIALIST row in ${MANIFEST_REL}`);
    else if (row.f.decision !== 'RETAIN_SPECIALIST' || row.f.status !== 'RETAIN_SPECIALIST') {
      errors.push(`${tag(2)} manifest line ${row.line} (${rel}): a specialist file's row must have decision AND status RETAIN_SPECIALIST (found ${row.f.decision} / ${row.f.status})`);
    }
  }
  for (const { line, f } of rows) {
    if (f.decision !== 'RETAIN_SPECIALIST' && f.status !== 'RETAIN_SPECIALIST') continue;
    const home = (f.file.startsWith(SPECIALIST_DIR) && f.file.endsWith('.specialist.ts')) || f.file.startsWith('e2e-parity/');
    if (!home) errors.push(`${tag(2)} manifest line ${line} (${f.file}): a RETAIN_SPECIALIST row must name a file under e2e/specialist/ (*.specialist.ts) or e2e-parity/ (grandfathered)`);
  }

  // SP3
  for (const { line, f } of rows) {
    if (f.decision !== 'RETAIN_SPECIALIST' || !f.file.startsWith(SPECIALIST_DIR)) continue;
    const m = f.rationale.match(/^\s*((?:\[[A-Z_]+\])+)\s*([\s\S]*)$/);
    const where = `manifest line ${line} (${f.file})`;
    if (!m) { errors.push(`${tag(3)} ${where}: the rationale must start with a [CODE] token from ${SPECIALIST_REASON_CODES.join('|')}`); continue; }
    const codes = m[1].slice(1, -1).split('][');
    const bad = codes.filter((c) => !SPECIALIST_REASON_CODES.includes(c));
    if (bad.length > 0) errors.push(`${tag(3)} ${where}: unknown reason code [${bad.join('][')}]; allowed: ${SPECIALIST_REASON_CODES.join('|')}`);
    if (m[2].trim().length < 20) errors.push(`${tag(3)} ${where}: after the [CODE] the rationale must name the specific browser-only row (>= 20 characters)`);
  }

  // SP4 (raw text: comments are NOT exempt), SP5, SP6 over every e2e/specialist file; SP7-SP9 over the specs.
  const text = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  for (const rel of underSpec) {
    if (rel === `${SPECIALIST_DIR}README.md` || !/\.(ts|tsx|js|mjs|cjs|json)$/.test(rel)) continue;
    const raw = text(rel);
    for (const h of findForbiddenHostLiterals(raw)) {
      errors.push(`${tag(4)} ${rel}: host literal "${h.literal}" (${h.reason}); e2e/specialist/** may name no production/shared/external host (comments are not exempt)`);
    }
    if (/fixtures\/[^'"]*-auth\.json/.test(raw)) errors.push(`${tag(6)} ${rel}: references a legacy hosted-auth state file (fixtures/*-auth.json); specialist specs never use hosted-auth storageState`);
    // String-aware stripper (not stripComments above): a glob like '**/api/**' contains "/*" and would otherwise hide real code.
    const code = stripCommentsStrict(raw);
    const sk = code.match(/\b(?:(?:test|it)(?:\.describe)?|describe)\.(skip|fixme|only|fail)\b/);
    if (sk) errors.push(`${tag(5)} ${rel}: literal ${sk[0]} is banned in e2e/specialist/** (fail closed instead of skipping or parking)`);
  }
  for (const rel of specs) {
    const code = stripCommentsStrict(text(rel));
    const imports = importClauses(code);
    for (const im of imports.filter((i) => i.source === '@playwright/test')) {
      if (im.named.some((n) => n.name === 'test' && !n.typeOnly)) errors.push(`${tag(7)} ${rel}: imports \`test\` from '@playwright/test'; import it from './support/specialist-test' (the runtime request guard lives there)`);
      if (im.namespace || im.hasDefault) errors.push(`${tag(7)} ${rel}: namespace/default import of '@playwright/test' can hide \`test\`; use named imports`);
    }
    const LAUNCHERS = ['chromium', 'firefox', 'webkit', 'request', 'devices', '_electron', '_android'];
    for (const im of imports.filter((i) => ['@playwright/test', 'playwright', 'playwright-core'].includes(i.source))) {
      const bad = im.named.filter((n) => LAUNCHERS.includes(n.name) && !n.typeOnly).map((n) => n.name);
      if (bad.length > 0) errors.push(`${tag(7)} ${rel}: imports browser launcher/request API (${bad.join(', ')}) from '${im.source}'; specs may not open their own browser or request context`);
    }
    if (!imports.some((i) => i.source === './support/specialist-test' && i.named.some((n) => n.name === 'test' && !n.typeOnly))) {
      errors.push(`${tag(7)} ${rel}: must import \`test\` from './support/specialist-test'`);
    }
    if (/\.continue\s*\(/.test(code)) errors.push(`${tag(8)} ${rel}: a route continue call is banned in specialist specs (use fallback() or fulfill() so the runtime block layer cannot be bypassed)`);
    const direct = [];
    if (/\b(?:page|context|browserContext|playwright)\.request\b/.test(code)) direct.push('page.request');
    if (/\brequest\.newContext\b/.test(code)) direct.push('request.newContext');
    // SP9 is textual and comment-stripped: an in-page fetch inside page.evaluate() is flagged exactly like a Node-side one
    // (consistent with the bare-fetch rule; a spec that needs the backend uses backendGet()). Forms covered: bare
    // fetch( / fetch?.(, property-qualified globalThis|window|self|top|parent|frames .fetch( (optional whitespace and
    // optional chaining), and the bracket forms globalThis['fetch']( / window["fetch"]( . NOT flagged: prefetch(, foo.fetchData(.
    if (/(?<![\w.$])fetch\s*(?:\?\.\s*)?\(/.test(code)) direct.push('fetch(');
    if (/(?<![\w$])(?:globalThis|window|self|top|parent|frames)\s*(?:\?\.|\.)\s*fetch\s*(?:\?\.\s*)?\(/.test(code)) direct.push('globalThis/window/self.fetch(');
    if (/(?<![\w$])(?:globalThis|window|self|top|parent|frames)\s*(?:\?\.\s*)?\[\s*['"`]fetch['"`]\s*\]\s*(?:\?\.\s*)?\(/.test(code)) direct.push("globalThis['fetch'](");
    if (/\broute\.fetch\s*\(/.test(code)) direct.push('route.fetch(');
    for (const m of code.matchAll(/\(\s*\{([^{}]*)\}\s*(?:,[^()]*)?\)\s*(?:=>|\{)/g)) {
      const names = m[1].split(',').map((s) => s.split(':')[0].replace(/=.*/, '').trim());
      if (names.includes('request')) direct.push('`request` fixture parameter');
      if (names.includes('browser')) direct.push('`browser` fixture parameter');
    }
    if (/\.newContext\s*\(|\.launch(?:PersistentContext)?\s*\(|connectOverCDP/.test(code)) direct.push('browser/context launch (newContext/launch/launchPersistentContext/connectOverCDP)');
    if (direct.length > 0) errors.push(`${tag(9)} ${rel}: direct APIRequestContext/fetch/browser-launch use (${[...new Set(direct)].join(', ')}) is banned; use backendGet()/backendBaseUrl() from './support/specialist-test' and the provided page/context fixtures`);
  }
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

  // specialist suite (SP1-SP9)
  checkSpecialistRules({ root, rows, byFile, allFiles, errors });

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
