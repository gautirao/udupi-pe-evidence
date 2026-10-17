#!/usr/bin/env node
// scripts/e2e/check-canonical-journeys.mjs - issue #2750
//
// The ONE implementation of the canonical E2E journey checks. CI (.github/workflows/ci.yml,
// e2e-canonical job), the local gate (scripts/run-e2e-gate.sh) and the pre-push hook all call THIS
// file, so a local pass validates the same code CI runs (no inline logic in the workflow).
//
// Usage (node stdlib only):
//   node scripts/e2e/check-canonical-journeys.mjs --phase=static  [--root <dir>]
//   node scripts/e2e/check-canonical-journeys.mjs --phase=list    --list <playwright --list --reporter=json file>
//   node scripts/e2e/check-canonical-journeys.mjs --phase=results --list <list.json> --results <results.json>
//                                                  [--report-dir <dir>] [--traces-dir <dir>]
//
// static : no stack needed. Matrix shape, every matrix id has a title in e2e/canonical/*.canonical.ts,
//          T15_ENABLED coupling, FC-14 production-default flag guard.
// list   : consumes the real `playwright test --list --reporter=json` output. Project roster + every
//          matrix id collected in ITS project. Refuses CANONICAL_SKIP_SHA_PROVENANCE.
// results: consumes the real run's JSON results. FAILS CLOSED (see failures codes FC-xx below).
//
//   node scripts/e2e/check-canonical-journeys.mjs --phase=scan --scan-path <p> [--scan-path <p> ...] [--purge]
//        K3 credential scan (inflates zips and the HTML report's base64 zip); --purge removes EVERY
//        scan path on a hit OR on an artefact it cannot scan (FAIL[FC-K3] unscannable, exit 4). Gate and CI call it identically, BEFORE any run log is printed.
// GAP_CLOSING_IN_C2 rows: static WARNs; list and results FAIL ("PR-1 incomplete") until C2 closes them.
//
// Exit codes: 0 pass, 1 a check failed (one "FAIL[FC-xx] ..." line per failure on stderr), 2 usage,
// 4 a credential literal was found in a run artefact, or one could not be scanned (K3; purged before upload).
//
// ID MATCHING: an id is matched as the LEADING token of a title segment (a describe or test title,
// after any "[role:x]" tag): `^(\[role:\w+\]\s*)*<id>(?![A-Za-z0-9])`. That is word-boundary matching
// anchored to the start, so CC1 is never satisfied by CC1b, T1 never by T10, and a title that merely
// mentions "T13's listingId" (T14) never satisfies T13.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(SELF_DIR, '..', '..');

// Env var NAMES whose literal VALUES must never appear in uploaded/saved artefacts (K3). Names only
// here; values are read from the process env at check time and never printed.
export const CREDENTIAL_ENV_NAMES = [
  'ADMIN_PASSWORD', 'BROKER_PASSWORD', 'DEALER_PASSWORD', 'SMOKE_USER_PASSWORD',
  'ADMIN_EMAIL', 'BROKER_EMAIL', 'DEALER_EMAIL', 'SMOKE_USER_EMAIL',
  // Local-auth mode (#2750 amendment 1): the role users' passwords above are GENERATED per run, and the gate also
  // hands the scan the per-run stack secrets under these names (never inherited from a file or the caller).
  'E2E_AUTH_AUTHENTICATOR_PASSWORD', 'E2E_AUTH_GOTRUE_JWT_SECRET', 'E2E_AUTH_SERVICE_ROLE_KEY',
  // The per-run phone-encryption key the gate generates for the Request-a-property test stack (#1793, RQ1/RQ2).
  'E2E_PHONE_ENCRYPTION_KEY',
  // Local-only dedicated identity for the T1 sign-out test (#2750 CANON (d)); generated per run, never read from a file.
  'E2E_SIGNOUT_USER_PASSWORD', 'E2E_SIGNOUT_USER_EMAIL',
];
const CREDENTIAL_MIN_LEN = 6;

export const KNOWN_ROLES = ['user', 'broker', 'admin'];

// The matrix must NOT certify itself: the vocabulary and the project roster it is checked against
// are pinned HERE, and a matrix that declares anything different fails (the roster below is the old
// ci.yml roster: four role projects plus three setup projects).
export const ALLOWED_STATUSES = ['COVERED', 'GAP_CLOSING_IN_C2', 'DESCOPED_DARK'];
export const REQUIRED_PROJECTS = ['canonical-anon', 'canonical-user', 'canonical-broker', 'canonical-admin'];
export const REQUIRED_SETUP_PROJECTS = ['canonical-setup-user', 'canonical-setup-broker', 'canonical-setup-admin'];
export const GAP_STATUS = 'GAP_CLOSING_IN_C2';
// Only these journeys may be descoped (DESCOPED_DARK): they sit behind a flag that is dark in production. Pinned
// HERE so a matrix edit cannot silently turn any other GAP row into a "descoped" one (review cycle 2).
export const DESCOPABLE_IDS = ['J12', 'J13', 'J15'];
// Only these ids may carry `localAuthOnly: true` (pinned HERE, like DESCOPABLE_IDS, so a matrix edit cannot exempt any other
// journey from the hosted collection). T1c (sign-out) needs the dedicated E2E_SIGNOUT_USER_* identity, which only the LOCAL auth
// stack creates; in the ENVIRONMENT_GATED hosted mode (E2E_AUTH_MODE=hosted) the spec does not register it. The exemption is
// honoured ONLY when the checker is told the run is hosted (isHostedRun); in the local gate the id is required like any other.
export const LOCAL_AUTH_ONLY_IDS = ['T1c'];

/** True only for the explicit ENVIRONMENT_GATED hosted mode. Anything else (unset, 'local', any other string) is the local gate. */
export function isHostedRun(env = process.env) {
  return env?.E2E_AUTH_MODE === 'hosted';
}

/** Rows whose journey still has an open C2 gap. The static phase WARNs; list/results FAIL. */
export function gapRows(matrix) {
  return (matrix?.rows ?? []).filter((r) => r.status === GAP_STATUS);
}
export function gapFailures(matrix) {
  return gapRows(matrix).map((r) => `FAIL[FC-GAP] PR-1 incomplete: journey ${r.id} gap not closed (C2)`);
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `segment` starts (after [role:x] tags) with `match` not followed by an alphanumeric. */
export function segmentMatches(segment, match) {
  const stripped = String(segment).replace(/^(?:\s*\[role:\w+\])*\s*/, '');
  if (!stripped.startsWith(match)) return false;
  const next = stripped.charAt(match.length);
  // `_` is part of an id token: T1_x is a different id from T1.
  return next === '' || !/[A-Za-z0-9_]/.test(next);
}

export function chainMatches(titlePath, match) {
  return titlePath.some((seg) => segmentMatches(seg, match));
}

/** Every {id, match, project, journey} the matrix requires, harness included. */
export function requiredEntries(matrix) {
  const out = [];
  for (const h of matrix.harness ?? []) {
    out.push({ id: h.id, match: h.match ?? h.id, project: h.project, journey: 'harness' });
  }
  for (const row of matrix.rows ?? []) {
    for (const c of row.canonical_ids ?? []) {
      out.push({ id: c.id, match: c.match ?? c.id, project: c.project, journey: row.id, localAuthOnly: c.localAuthOnly === true });
    }
  }
  return out;
}

/** What a RUN (list/results phase) must see: the full set, minus localAuthOnly ids when (and only when) the run is hosted. */
export function requiredEntriesForRun(matrix, env = process.env) {
  const all = requiredEntries(matrix);
  return isHostedRun(env) ? all.filter((e) => !e.localAuthOnly) : all;
}

// ---------------------------------------------------------------------------------------------
// matrix loading + shape
// ---------------------------------------------------------------------------------------------
export function loadMatrix(matrixPath) {
  const errors = [];
  let matrix;
  try {
    matrix = JSON.parse(readText(matrixPath));
  } catch (err) {
    return { matrix: null, errors: [`FAIL[FC-MATRIX] cannot read/parse journey matrix ${matrixPath}: ${err.message}`] };
  }
  const sameSet = (a, b) => Array.isArray(a) && [...a].sort().join('|') === [...b].sort().join('|');
  if (!sameSet(matrix.statuses, ALLOWED_STATUSES)) errors.push(`FAIL[FC-MATRIX] matrix "statuses" must be exactly [${ALLOWED_STATUSES.join(', ')}] (pinned in the checker; the matrix cannot redefine its own vocabulary)`);
  if (!sameSet(matrix.required_projects, REQUIRED_PROJECTS)) errors.push(`FAIL[FC-MATRIX] matrix "required_projects" must be exactly [${REQUIRED_PROJECTS.join(', ')}] (pinned in the checker)`);
  if (!sameSet(matrix.required_setup_projects, REQUIRED_SETUP_PROJECTS)) errors.push(`FAIL[FC-MATRIX] matrix "required_setup_projects" must be exactly [${REQUIRED_SETUP_PROJECTS.join(', ')}] (pinned in the checker)`);
  const statuses = ALLOWED_STATUSES;
  const rows = matrix.rows ?? [];
  const expectedIds = Array.from({ length: 16 }, (_, i) => `J${String(i + 1).padStart(2, '0')}`);
  const seen = rows.map((r) => r.id);
  for (const id of expectedIds) {
    if (!seen.includes(id)) errors.push(`FAIL[FC-MATRIX] journey row ${id} is missing from the matrix (a journey may be descoped only by an explicit DESCOPED_DARK row, never by absence)`);
  }
  for (const id of seen) {
    if (!expectedIds.includes(id)) errors.push(`FAIL[FC-MATRIX] unexpected journey row id ${id}`);
    if (seen.filter((x) => x === id).length > 1) errors.push(`FAIL[FC-MATRIX] duplicate journey row ${id}`);
  }
  for (const row of rows) {
    for (const f of ['id', 'journey', 'family', 'status', 'canonical_ids', 'notes']) {
      if (row[f] === undefined) errors.push(`FAIL[FC-MATRIX] ${row.id ?? '?'} lacks field "${f}"`);
    }
    if (!statuses.includes(row.status)) errors.push(`FAIL[FC-MATRIX] ${row.id} has unknown status "${row.status}"`);
    if (row.status === 'COVERED' && (row.canonical_ids ?? []).length === 0) {
      errors.push(`FAIL[FC-MATRIX] ${row.id} is COVERED but names no canonical id`);
    }
    if (row.status === 'DESCOPED_DARK' && !DESCOPABLE_IDS.includes(row.id)) {
      errors.push(`FAIL[FC-MATRIX] ${row.id} is DESCOPED_DARK but only ${DESCOPABLE_IDS.join(', ')} may be descoped (pinned in the checker)`);
    }
    if (row.status === 'DESCOPED_DARK' && String(row.notes ?? '').trim().length < 20) {
      errors.push(`FAIL[FC-MATRIX] ${row.id} is DESCOPED_DARK without a written reason in notes`);
    }
    for (const c of row.canonical_ids ?? []) {
      if (!/^[A-Za-z0-9]+$/.test(c.id ?? '')) errors.push(`FAIL[FC-MATRIX] ${row.id}: id "${c.id}" must be alphanumeric`);
      if (!REQUIRED_PROJECTS.includes(c.project)) errors.push(`FAIL[FC-MATRIX] ${row.id}: ${c.id} names project "${c.project}" which is not in required_projects`);
      if (c.localAuthOnly !== undefined && (c.localAuthOnly !== true || !LOCAL_AUTH_ONLY_IDS.includes(c.id))) {
        errors.push(`FAIL[FC-MATRIX] ${row.id}: ${c.id} sets localAuthOnly=${JSON.stringify(c.localAuthOnly)}, but only true on ${LOCAL_AUTH_ONLY_IDS.join(', ')} is allowed (pinned in the checker)`);
      }
    }
  }
  return { matrix, errors };
}

// ---------------------------------------------------------------------------------------------
// static phase
// ---------------------------------------------------------------------------------------------
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

const TITLE_RE = /\btest(?:\.describe(?:\.(?:serial|parallel))?)?\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

export function extractTitles(source) {
  const clean = stripComments(source);
  const titles = [];
  let m;
  TITLE_RE.lastIndex = 0;
  while ((m = TITLE_RE.exec(clean)) !== null) titles.push(m[2]);
  return titles;
}

export function collectCanonicalTitles(root) {
  const dir = path.join(root, 'e2e', 'canonical');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.canonical.ts')) continue;
    const file = path.join(dir, name);
    for (const t of extractTitles(readText(file))) out.push({ file: `e2e/canonical/${name}`, title: t });
  }
  return out;
}

/** FC-14 + production-default guard for the Request-a-property flags. */
export function checkProductionFlagDefaults(root, matrix) {
  const errors = [];
  const apiDir = path.join(root, 'apps', 'api', 'src', 'main', 'resources');
  const appYml = path.join(apiDir, 'application.yml');
  if (!fs.existsSync(appYml)) {
    errors.push('FAIL[FC-14] apps/api/src/main/resources/application.yml not found; cannot prove PROPERTY_REQUESTS_ENABLED defaults to false');
  } else {
    const txt = readText(appYml);
    const m = txt.match(/property-requests:\s*\n\s*enabled:\s*\$\{PROPERTY_REQUESTS_ENABLED:([^}]*)\}/);
    if (!m) errors.push('FAIL[FC-14] application.yml no longer reads "property-requests.enabled: ${PROPERTY_REQUESTS_ENABLED:<default>}"; the production default cannot be proven false');
    else if (m[1].trim() !== 'false') errors.push(`FAIL[FC-14] application.yml production default PROPERTY_REQUESTS_ENABLED is "${m[1].trim()}", must be false (flag is dark by default)`);
    if (fs.existsSync(apiDir)) {
      for (const f of fs.readdirSync(apiDir)) {
        if (!/^application-.*\.ya?ml$/.test(f)) continue;
        const t = readText(path.join(apiDir, f));
        if (/property-requests:\s*\n\s*enabled:\s*true/.test(t) || /PROPERTY_REQUESTS_ENABLED\s*[:=]\s*true/.test(t)) {
          errors.push(`FAIL[FC-14] ${f} enables property-requests outside tests; production defaults must stay false`);
        }
      }
    }
  }

  // No committed non-test config may turn the frontend flag on. Allowed: the canonical stack only
  // (package.json canonical/gate scripts, scripts/run-e2e-gate.sh, ci.yml job e2e-canonical).
  const FE_ON = /VITE_PROPERTY_REQUESTS_ENABLED\s*[:=]\s*['"]?true/;
  // Backend flag (SR LOW-2): same scan over the deploy configs. `(^|[^A-Z_])` keeps VITE_PROPERTY_REQUESTS_ENABLED from matching.
  // BE_ON_RENDER is render.yaml's two-line form (`- key: PROPERTY_REQUESTS_ENABLED` then `value: "true"`).
  // CR r2 cycle2 LOW-D: every spelling that binds app.property-requests.enabled (apps/api application.yml: `app:` > `property-requests:` >
  // `enabled`): the env name with `:`/`=`/Dockerfile-space (`ENV PROPERTY_REQUESTS_ENABLED true`), Spring's relaxed-binding names
  // (APP_PROPERTYREQUESTS_ENABLED, APP_PROPERTY_REQUESTS_ENABLED) and the dotted property (app.property-requests.enabled=true, also as -D).
  const TRUE_ = `['"]?[Tt][Rr][Uu][Ee]`;
  const BE_ON = new RegExp(
    `(^|[^A-Z_])(?:APP_)?(?:PROPERTY_?REQUESTS)_ENABLED(?:\\s*[:=]\\s*|[ \\t]+)${TRUE_}`
    + `|app\\.property[-_]?requests\\.enabled\\s*[:=]\\s*${TRUE_}`, 'm');
  // yaml/properties nested form in a committed non-test config: `property-requests:` then `enabled: true` on the next line.
  const BE_ON_YAML = /property-requests:[ \t]*\r?\n[ \t]+enabled:[ \t]*['"]?true/m;
  const BE_ON_RENDER = /(^|[^A-Z_])PROPERTY_REQUESTS_ENABLED['"]?\s*\n\s*(-\s+)?value:\s*['"]?true/m;
  const candidates = [];
  for (const f of ['render.yaml', 'render.yml', 'apps/api/render.yaml', 'apps/api/render.yml', 'apps/api/Dockerfile', 'apps/api/.env.example', 'apps/api/.env.production',
    'apps/api/fly.toml', 'docker-compose.yml', 'wrangler.toml', 'wrangler.json', '.env.example', '.env.production', '.env.e2e.example', '.env.e2e.auth.example']) {
    candidates.push(f);
  }
  const webDir = path.join(root, 'apps', 'web');
  if (fs.existsSync(webDir)) {
    for (const f of fs.readdirSync(webDir)) if (f.startsWith('.env') || /^vite\.config\./.test(f) || f === 'wrangler.toml') candidates.push(path.join('apps', 'web', f));
  }
  for (const f of ['public/_headers', 'apps/web/public/_headers']) candidates.push(f);
  for (const rel of candidates) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    const txt = readText(p);
    if (FE_ON.test(txt)) errors.push(`FAIL[FC-14] ${rel} sets VITE_PROPERTY_REQUESTS_ENABLED=true; only the canonical TEST stack may enable the flag`);
    if (BE_ON.test(txt) || BE_ON_RENDER.test(txt) || BE_ON_YAML.test(txt)) errors.push(`FAIL[FC-14] ${rel} sets PROPERTY_REQUESTS_ENABLED=true; the backend flag is dark by default and only the canonical TEST stack may enable it`);
  }
  const wfDir = path.join(root, '.github', 'workflows');
  if (fs.existsSync(wfDir)) {
    for (const f of fs.readdirSync(wfDir).filter((n) => /\.ya?ml$/.test(n))) {
      let job = null;
      readText(path.join(wfDir, f)).split('\n').forEach((line, i) => {
        const jm = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
        if (jm) job = jm[1];
        if (FE_ON.test(line) && !(f === 'ci.yml' && job === 'e2e-canonical')) {
          errors.push(`FAIL[FC-14] .github/workflows/${f}:${i + 1} (job ${job ?? '?'}) sets VITE_PROPERTY_REQUESTS_ENABLED=true outside ci.yml e2e-canonical`);
        }
        if (BE_ON.test(line) && !/^\s*#/.test(line) && !(f === 'ci.yml' && job === 'e2e-canonical')) {
          errors.push(`FAIL[FC-14] .github/workflows/${f}:${i + 1} (job ${job ?? '?'}) sets PROPERTY_REQUESTS_ENABLED=true outside ci.yml e2e-canonical`);
        }
      });
    }
  }
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const scripts = JSON.parse(readText(pkgPath)).scripts ?? {};
    for (const [name, cmd] of Object.entries(scripts)) {
      if (BE_ON.test(cmd) && !/^test:e2e:(canonical|gate)$/.test(name)) {
        errors.push(`FAIL[FC-14] package.json script "${name}" sets PROPERTY_REQUESTS_ENABLED=true; only test:e2e:canonical / test:e2e:gate may`);
      }
      if (FE_ON.test(cmd) && !/^test:e2e:(canonical|gate)$/.test(name)) {
        errors.push(`FAIL[FC-14] package.json script "${name}" sets VITE_PROPERTY_REQUESTS_ENABLED=true; only test:e2e:canonical / test:e2e:gate may`);
      }
    }
  }

  // The canonical stack MUST set both flags once a Request-a-property journey is in the matrix,
  // otherwise RQ1/RQ2 would be uncollectable/unexecutable.
  const needsFlags = requiredEntries(matrix ?? { rows: [] }).some((e) => /^RQ\d/.test(e.id));
  if (needsFlags) {
    const gate = path.join(root, 'scripts', 'run-e2e-gate.sh');
    const gateTxt = fs.existsSync(gate) ? readText(gate) : '';
    // A flag counts as ON only when a real (non-comment) shell statement sets it: `export [OTHER=x ...] NAME=true` or a bare
    // `NAME=true`. A comment line, an `echo "NAME=true"` or any other line that merely mentions it does not (review r2 LOW-5).
    const flagOn = (txt, name) => {
      const code = txt.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
      return new RegExp(`^\\s*(export\\s+([A-Za-z_][A-Za-z0-9_]*=\\S*\\s+)*)?${name}=['"]?true(['"\\s;]|$)`, 'm').test(code);
    };
    if (!flagOn(gateTxt, 'VITE_PROPERTY_REQUESTS_ENABLED') || !flagOn(gateTxt, 'PROPERTY_REQUESTS_ENABLED')) {
      errors.push('FAIL[FC-14] matrix lists RQ ids but scripts/run-e2e-gate.sh does not enable BOTH VITE_PROPERTY_REQUESTS_ENABLED=true and PROPERTY_REQUESTS_ENABLED=true for the canonical stack');
    }
    // CI does NOT set the flags itself: ci.yml's e2e-canonical job runs THE SAME script a developer runs, so the gate script
    // above is the single wiring point. What must hold is that the job really invokes it; a job that stopped doing so would
    // run the suite without the flags (RQ1/RQ2 would fail, but the drift must be named here, not discovered there).
    const ci = path.join(root, '.github', 'workflows', 'ci.yml');
    const ciTxt = fs.existsSync(ci) ? readText(ci) : '';
    let job = null;
    let ciRunsGate = false;
    let gateStepCondition = '';
    const jobLines = [];
    for (const line of ciTxt.split('\n')) {
      const jm = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
      if (jm) job = jm[1];
      if (job === 'e2e-canonical') jobLines.push(line);
    }
    // Job-level `if:` / `continue-on-error:` (4-space keys) would skip or ignore the whole job; step-level ones (below) the gate step.
    for (const l of jobLines) {
      if (/^ {4}(if|continue-on-error):/.test(l)) gateStepCondition = `job-level ${l.trim()}`;
    }
    // Split the job into steps (`      - ` starts one) and inspect the step whose `run:` invokes the gate script.
    const steps = [];
    for (const l of jobLines) {
      if (/^ {6}-\s/.test(l)) steps.push([]);
      if (steps.length) steps[steps.length - 1].push(l);
    }
    for (const stepLines of steps) {
      const code = stepLines.filter((l) => !/^\s*#/.test(l));
      if (!code.some((l) => /^\s*(-\s+)?run:\s*(bash\s+)?scripts\/run-e2e-gate\.sh\s*$/.test(l))) continue;
      ciRunsGate = true;
      const cond = code.find((l) => /^\s*(-\s+)?(if|continue-on-error):/.test(l));
      if (cond) gateStepCondition = `step-level ${cond.replace(/^\s*-?\s*/, '').trim()}`;
    }
    if (!ciRunsGate) {
      errors.push('FAIL[FC-14] matrix lists RQ ids but ci.yml job e2e-canonical does not run scripts/run-e2e-gate.sh, the single place that enables both property-request flags for the canonical stack');
    } else if (gateStepCondition) {
      errors.push(`FAIL[FC-14] ci.yml job e2e-canonical runs scripts/run-e2e-gate.sh but with a ${gateStepCondition}; the gate step must be unconditional and must not ignore failure`);
    }
  }
  return errors;
}

export function staticPhase({ root = DEFAULT_ROOT, matrixPath } = {}) {
  const mp = matrixPath ?? path.join(root, 'e2e', 'canonical', 'journey-matrix.json');
  const { matrix, errors } = loadMatrix(mp);
  const info = [];
  if (!matrix) return { ok: false, errors, info };

  const titles = collectCanonicalTitles(root);
  if (titles.length === 0) errors.push('FAIL[FC-08] no test titles found under e2e/canonical/*.canonical.ts');

  for (const e of requiredEntries(matrix)) {
    const hit = titles.find((t) => segmentMatches(t.title, e.match));
    if (!hit) errors.push(`FAIL[FC-08] matrix id ${e.id} (${e.journey}, project ${e.project}) has no title in e2e/canonical/*.canonical.ts`);
  }

  for (const t of titles) {
    for (const m of t.title.matchAll(/\[role:([^\]]*)\]/g)) {
      if (!KNOWN_ROLES.includes(m[1])) errors.push(`FAIL[FC-09] ${t.file}: unknown role tag [role:${m[1]}] in title "${t.title.slice(0, 60)}"`);
    }
  }

  // FC-13: T15_ENABLED coupling.
  const llPath = path.join(root, 'e2e', 'canonical', 'listing-lifecycle.canonical.ts');
  if (fs.existsSync(llPath)) {
    const m = stripComments(readText(llPath)).match(/\bconst\s+T15_ENABLED\s*=\s*(true|false)\b/);
    const listsT15 = requiredEntries(matrix).some((e) => e.id === 'T15');
    if (!m) errors.push('FAIL[FC-13] listing-lifecycle.canonical.ts no longer declares `const T15_ENABLED = true|false`; the descope coupling cannot be checked');
    else if (m[1] === 'false' && listsT15) errors.push('FAIL[FC-13] T15_ENABLED is false (T15 de-registered) but the matrix still lists T15; a descope must remove the matrix entry in the same change');
  }

  errors.push(...checkProductionFlagDefaults(root, matrix));
  for (const r of gapRows(matrix)) {
    info.push(`WARN: journey ${r.id} is ${GAP_STATUS}: static passes so C1-only commits stay buildable, but the list and results phases (the gate) FAIL until C2 closes it`);
  }
  info.push(`static: ${requiredEntries(matrix).length} matrix ids checked against ${titles.length} titles in e2e/canonical/*.canonical.ts`);
  return { ok: errors.length === 0, errors, info };
}

// ---------------------------------------------------------------------------------------------
// Playwright JSON walking
// ---------------------------------------------------------------------------------------------
export function walkTests(json) {
  const out = [];
  const walk = (suite, chain) => {
    const isFileSuite = suite.title && (suite.title === suite.file || /\.(canonical|spec)\.ts$/.test(suite.title));
    const here = suite.title && !isFileSuite ? [...chain, suite.title] : chain;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        out.push({
          project: t.projectName,
          titlePath: [...here, spec.title],
          file: spec.file ?? suite.file ?? '',
          status: t.status,
          results: (t.results ?? []).map((r) => r.status),
        });
      }
    }
    for (const sub of suite.suites ?? []) walk(sub, here);
  };
  for (const s of json.suites ?? []) walk(s, []);
  return out;
}

function readJsonFile(p, label, code, errors) {
  if (!p) {
    errors.push(`FAIL[${code}] no ${label} file path was given`);
    return null;
  }
  if (!fs.existsSync(p)) {
    errors.push(`FAIL[${code}] ${label} file does not exist: ${p}`);
    return null;
  }
  try {
    return JSON.parse(readText(p));
  } catch (err) {
    errors.push(`FAIL[${code === 'FC-01' ? 'FC-02' : code}] ${label} file is not valid JSON (${p}): ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// list phase
// ---------------------------------------------------------------------------------------------
export function listPhase({ matrix, listPath, env = process.env }) {
  const errors = [];
  const info = [];
  if ((env.CANONICAL_SKIP_SHA_PROVENANCE ?? '') !== '') {
    errors.push('FAIL[FC-15] CANONICAL_SKIP_SHA_PROVENANCE is set; this opt-out disables the build-sha provenance assertion and is refused for gate/CI runs (NOT A GATE RUN)');
  }
  const json = readJsonFile(listPath, 'playwright --list json', 'FC-01', errors);
  if (!json) return { ok: false, errors, info };

  const tests = walkTests(json);
  const byProject = new Map();
  for (const t of tests) byProject.set(t.project, (byProject.get(t.project) ?? 0) + 1);

  errors.push(...gapFailures(matrix));

  for (const p of [...REQUIRED_PROJECTS, ...REQUIRED_SETUP_PROJECTS]) {
    if (!byProject.has(p)) {
      errors.push(`FAIL[FC-roster] expected Playwright project "${p}" collected ZERO tests. Check that all six role credentials are exported and that playwright.canonical.config.ts roleCredentialsPresent() still reads the env var names the workflow sets`);
    }
  }

  if (isHostedRun(env)) {
    const exempt = requiredEntries(matrix).filter((e) => e.localAuthOnly).map((e) => e.id);
    info.push(`list: hosted run (E2E_AUTH_MODE=hosted): localAuthOnly id(s) not required: ${exempt.join(',') || 'none'}`);
  }
  for (const e of requiredEntriesForRun(matrix, env)) {
    const inProject = tests.filter((t) => t.project === e.project && chainMatches(t.titlePath, e.match));
    if (inProject.length > 0) continue;
    const elsewhere = tests.filter((t) => chainMatches(t.titlePath, e.match)).map((t) => t.project);
    if (elsewhere.length > 0) {
      errors.push(`FAIL[FC-09] matrix id ${e.id} (${e.journey}) was collected only in project ${[...new Set(elsewhere)].join(', ')}, expected ${e.project} (lost its [role:x] tag or moved project?)`);
    } else {
      errors.push(`FAIL[FC-08] matrix id ${e.id} (${e.journey}) collected ZERO tests in project ${e.project}: renamed, deleted, or filename no longer matches **/*.canonical.ts`);
    }
  }

  info.push(`list: collected=${tests.length} projects=${[...byProject].sort().map(([k, v]) => `${k}:${v}`).join(',')}`);
  return { ok: errors.length === 0, errors, info, collected: tests.length };
}

// ---------------------------------------------------------------------------------------------
// credential scan (K3)
// ---------------------------------------------------------------------------------------------
function* walkFiles(dir, unreadable) {
  if (!dir || !fs.existsSync(dir)) return;
  let st;
  try { st = fs.statSync(dir); } catch { unreadable.push(dir); return; }
  if (st.isFile()) {
    yield dir;
    return;
  }
  let names;
  try { names = fs.readdirSync(dir); } catch { unreadable.push(dir); return; }
  for (const name of names) yield* walkFiles(path.join(dir, name), unreadable);
}

// --- zip / base64-zip expansion -------------------------------------------------------------
// A Playwright HTML report embeds a base64 zip and traces are .zip files, so a literal byte scan of
// the container proves nothing: the entries are deflated. We inflate them (node stdlib only) and
// scan the inflated bytes, recursing into nested zips.
const SIG_LFH = 0x04034b50;
const SIG_CD = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const MAX_INFLATED = 256 * 1024 * 1024;

function readEntryData(buf, lho, method, csize, issues) {
  if (csize === 0xffffffff) { issues.push('a ZIP64 entry cannot be inflated'); return null; }
  if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== SIG_LFH) { issues.push('a zip entry has a missing or corrupt local header'); return null; }
  const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
  const slice = buf.subarray(start, start + csize);
  if (method === 0) return slice;
  if (method === 8) {
    try { return zlib.inflateRawSync(slice, { maxOutputLength: MAX_INFLATED }); } catch { issues.push('a deflated zip entry cannot be inflated'); return null; }
  }
  issues.push(`a zip entry uses unsupported compression method ${method}`);
  return null;
}

/** Inflated entry buffers of a zip. Central directory first; local-file-header walk as the fallback.
 *  Anything that cannot be inflated is recorded in `issues` (K3 fails closed on it: an unscanned entry is not a clean one). */
export function zipEntryBuffers(buf, issues = []) {
  const out = [];
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i -= 1) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd >= 0) {
    const n = buf.readUInt16LE(eocd + 10);
    if (n === 0xffff || buf.readUInt32LE(eocd + 16) === 0xffffffff) issues.push('a ZIP64 archive cannot be inflated');
    let p = buf.readUInt32LE(eocd + 16);
    for (let k = 0; k < n && p + 46 <= buf.length && buf.readUInt32LE(p) === SIG_CD; k += 1) {
      const method = buf.readUInt16LE(p + 10);
      const csize = buf.readUInt32LE(p + 20);
      const lho = buf.readUInt32LE(p + 42);
      p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
      const data = readEntryData(buf, lho, method, csize, issues);
      if (data) out.push(data);
    }
    if (out.length > 0 || issues.length > 0) return out;
  }
  let pos = 0;
  while (pos + 30 <= buf.length) {
    if (buf.readUInt32LE(pos) !== SIG_LFH) { pos += 1; continue; }
    const flags = buf.readUInt16LE(pos + 6);
    const method = buf.readUInt16LE(pos + 8);
    const csize = buf.readUInt32LE(pos + 18);
    const start = pos + 30 + buf.readUInt16LE(pos + 26) + buf.readUInt16LE(pos + 28);
    let data = null;
    if ((flags & 8) !== 0 && csize === 0 && method === 8) {
      try { data = zlib.inflateRawSync(buf.subarray(start), { maxOutputLength: MAX_INFLATED }); } catch { issues.push('a deflated zip entry cannot be inflated'); }
    } else {
      data = readEntryData(buf, pos, method, csize, issues);
    }
    if (data) out.push(data);
    pos = start + Math.max(csize, 1);
  }
  return out;
}

const B64_ZIP_RE = /base64,([A-Za-z0-9+/=]{64,})/g;
export const MAX_ZIP_DEPTH = 3;

/** The buffer itself plus everything reachable by inflating zips / embedded base64 zips (depth-bounded).
 *  `issues` collects reasons something could not be scanned, including a zip nested deeper than MAX_ZIP_DEPTH. */
export function expandBuffer(buf, depth = 0, issues = []) {
  const out = [buf];
  const isZip = buf.length >= 4 && buf.readUInt32LE(0) === SIG_LFH;
  if (depth >= MAX_ZIP_DEPTH) {
    if (isZip) issues.push(`a zip is nested deeper than ${MAX_ZIP_DEPTH} levels`);
    return out;
  }
  if (isZip) {
    for (const e of zipEntryBuffers(buf, issues)) out.push(...expandBuffer(e, depth + 1, issues));
  }
  if (buf.includes('base64,')) {
    const text = buf.toString('latin1');
    B64_ZIP_RE.lastIndex = 0;
    let m;
    while ((m = B64_ZIP_RE.exec(text)) !== null) {
      let dec;
      try { dec = Buffer.from(m[1], 'base64'); } catch { continue; }
      if (dec.length >= 4 && dec.readUInt32LE(0) === SIG_LFH) out.push(...expandBuffer(dec, depth + 1, issues));
    }
  }
  return out;
}

export function scanForCredentialValues({ paths, env = process.env }) {
  const errors = [];
  const secrets = [];
  for (const name of CREDENTIAL_ENV_NAMES) {
    const v = env[name];
    if (typeof v === 'string' && v.length >= CREDENTIAL_MIN_LEN) secrets.push({ name, value: Buffer.from(v) });
  }
  for (const p of paths) {
    const unreadable = [];
    for (const file of walkFiles(p, unreadable)) {
      let buf;
      try { buf = fs.readFileSync(file); } catch { unreadable.push(file); continue; }
      const issues = [];
      const views = expandBuffer(buf, 0, issues);
      // Report the env var NAME and the file only; never the value.
      for (const s of secrets) {
        if (views.some((v) => v.includes(s.value))) errors.push(`FAIL[FC-K3] the literal value of ${s.name} appears in ${file}`);
      }
      // Fail closed: something we could not look into is NOT clean (review cycle 2: unscannable != no hit).
      for (const reason of [...new Set(issues)]) errors.push(`FAIL[FC-K3] unscannable artefact ${file}: ${reason}`);
    }
    for (const f of unreadable) errors.push(`FAIL[FC-K3] unscannable artefact ${f}: it cannot be read`);
  }
  return errors;
}

/**
 * The K3 scan as a phase of its own (gate and CI call it identically BEFORE anything from a run log is
 * printed): scan every --scan-path; on a hit with purge=true, remove EVERY scan path, so the scanned
 * set and the purged set are the same set by construction.
 */
export function scanPhase({ scanPaths, purge = false, env = process.env }) {
  const errors = [];
  const info = [];
  if (!scanPaths || scanPaths.length === 0) {
    return { ok: false, errors: ['FAIL[FC-USAGE] scan phase needs at least one --scan-path'], info };
  }
  errors.push(...scanForCredentialValues({ paths: scanPaths, env }));
  if (errors.length > 0 && purge) {
    for (const p of scanPaths) fs.rmSync(p, { recursive: true, force: true });
    info.push(`scan: credential value found; purged ${scanPaths.length} scan path(s)`);
  } else {
    info.push(`scan: ${scanPaths.length} path(s) scanned, no credential value found`);
  }
  return { ok: errors.length === 0, errors, info };
}

// ---------------------------------------------------------------------------------------------
// results phase
// ---------------------------------------------------------------------------------------------
export function resultsPhase({ matrix, resultsPath, listPath, reportDir, tracesDir, env = process.env }) {
  const errors = [];
  const info = [];
  if ((env.CANONICAL_SKIP_SHA_PROVENANCE ?? '') !== '') {
    errors.push('FAIL[FC-15] CANONICAL_SKIP_SHA_PROVENANCE is set; results of a run with provenance disabled are not gate results');
  }
  errors.push(...gapFailures(matrix));
  const results = readJsonFile(resultsPath, 'results.json', 'FC-01', errors);
  const listJson = listPath ? readJsonFile(listPath, 'playwright --list json', 'FC-01', errors) : null;
  if (!listPath) errors.push('FAIL[FC-11] results phase requires --list <file>: without the listed count, executed-vs-listed cannot be verified');

  if (results) {
    if (Array.isArray(results.errors) && results.errors.length > 0) {
      errors.push(`FAIL[FC-07] Playwright reported ${results.errors.length} top-level error(s) (global setup / config); first: ${String(results.errors[0]?.message ?? '').split('\n')[0].slice(0, 160)}`);
    }
    const s = results.stats ?? {};
    if (!results.stats) errors.push('FAIL[FC-02] results.json has no stats block');
    if ((s.unexpected ?? 0) > 0) errors.push(`FAIL[FC-03] stats.unexpected=${s.unexpected} (failed tests)`);
    if ((s.flaky ?? 0) > 0) errors.push(`FAIL[FC-05] stats.flaky=${s.flaky} (retry-passed tests are not a green gate)`);
    if ((s.skipped ?? 0) > 0) errors.push(`FAIL[FC-04] stats.skipped=${s.skipped} (skipped tests, including setup-failure cascades, are not a green gate)`);
    if ((s.expected ?? 0) === 0) errors.push('FAIL[FC-11] stats.expected=0: no test passed');

    const tests = walkTests(results);
    for (const t of tests) {
      if (t.results.includes('interrupted')) errors.push(`FAIL[FC-06] interrupted result: [${t.project}] ${t.titlePath.join(' > ').slice(0, 100)}`);
    }
    for (const e of requiredEntriesForRun(matrix, env)) {
      const found = tests.filter((t) => t.project === e.project && chainMatches(t.titlePath, e.match));
      if (found.length === 0) {
        errors.push(`FAIL[FC-10] matrix id ${e.id} (${e.journey}) has no executed test in project ${e.project}`);
        continue;
      }
      const bad = found.filter((t) => !(t.status === 'expected' && t.results.length > 0 && t.results[t.results.length - 1] === 'passed'));
      for (const t of bad) {
        errors.push(`FAIL[FC-10] matrix id ${e.id} (${e.journey}) did not pass in ${e.project}: status=${t.status} final=${t.results[t.results.length - 1] ?? 'no result'}`);
      }
    }

    if (listJson) {
      const listed = walkTests(listJson).length;
      const executed = tests.filter((t) => ['expected', 'unexpected', 'flaky'].includes(t.status)).length;
      info.push(`results: listed=${listed} executed=${executed}`);
      if (listed !== executed) errors.push(`FAIL[FC-11] executed count ${executed} != listed count ${listed}`);
      info.push(`results: passed=${s.expected ?? 0} unexpected=${s.unexpected ?? 0} skipped=${s.skipped ?? 0} flaky=${s.flaky ?? 0}`);
    }
  }

  const scanPaths = [resultsPath, reportDir, tracesDir].filter(Boolean);
  errors.push(...scanForCredentialValues({ paths: scanPaths, env }));
  return { ok: errors.length === 0, errors, info };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) { args._unknown = a; continue; }
    if (m[1] === 'purge') { args.purge = true; continue; }
    const value = m[2] !== undefined ? m[2] : argv[(i += 1)];
    if (m[1] === 'scan-path') (args.scanPaths ??= []).push(value);
    else args[m[1]] = value;
  }
  return args;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const root = path.resolve(args.root ?? DEFAULT_ROOT);
  const phase = args.phase;
  if (!['static', 'list', 'results', 'scan'].includes(phase) || args._unknown) {
    process.stderr.write('usage: check-canonical-journeys.mjs --phase=static|list|results|scan [--root dir] [--matrix file] [--list file] [--results file] [--report-dir dir] [--traces-dir dir] [--scan-path p ... [--purge]]\n');
    return 2;
  }
  const matrixPath = path.resolve(args.matrix ?? path.join(root, 'e2e', 'canonical', 'journey-matrix.json'));
  let res;
  if (phase === 'static') {
    res = staticPhase({ root, matrixPath });
  } else if (phase === 'scan') {
    res = scanPhase({ scanPaths: (args.scanPaths ?? []).map((p) => path.resolve(p)), purge: args.purge === true, env });
  } else {
    const { matrix, errors } = loadMatrix(matrixPath);
    if (!matrix) res = { ok: false, errors, info: [] };
    else {
      res = phase === 'list'
        ? listPhase({ matrix, listPath: args.list && path.resolve(args.list), env })
        : resultsPhase({
          matrix,
          resultsPath: args.results && path.resolve(args.results),
          listPath: args.list && path.resolve(args.list),
          reportDir: args['report-dir'] && path.resolve(args['report-dir']),
          tracesDir: args['traces-dir'] && path.resolve(args['traces-dir']),
          env,
        });
      // Matrix shape errors count in EVERY phase (review cycle 1, BLOCKING): merge them and recompute ok.
      res = { ...res, errors: [...errors, ...res.errors], ok: res.ok && errors.length === 0 };
    }
  }
  for (const line of res.info ?? []) process.stdout.write(`${line}\n`);
  if (!res.ok) {
    for (const line of res.errors) process.stderr.write(`${line}\n`);
    process.stderr.write(`CANONICAL JOURNEYS ${phase.toUpperCase()}: FAIL (${res.errors.length} problem${res.errors.length === 1 ? '' : 's'})\n`);
    // Exit 4 = a credential literal was found in, or an artefact could not be scanned (K3): the gate/CI purge and
    // do NOT upload. A usage error (FC-USAGE) has its own code, 2, and never masquerades as a K3 finding.
    if (res.errors.some((e) => e.includes('FAIL[FC-K3]'))) return 4;
    return res.errors.some((e) => e.includes('FAIL[FC-USAGE]')) ? 2 : 1;
  }
  process.stdout.write(`CANONICAL JOURNEYS ${phase.toUpperCase()}: PASS\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
