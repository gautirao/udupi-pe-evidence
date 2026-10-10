// node --test scripts/e2e/ci-drift.test.mjs  (issue #2750, FC-23)
//
// ci.yml cannot be proven green remotely (Actions billing is blocked), so this test pins its WIRING:
// the e2e-canonical job must keep calling the shared scripts in the right phases, and the frontend job
// must keep running the estate guard, the node tests and the pre-push classification test. Any drift
// fails here, locally and in CI.
//
// CI_YML_PATH=<file> points the same assertions at another copy (used to prove the test goes red on a
// mutated workflow).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CI_PATH = process.env.CI_YML_PATH ?? path.join(ROOT, '.github', 'workflows', 'ci.yml');
const CI_TEXT = fs.readFileSync(CI_PATH, 'utf8');

/** Minimal indentation parser: { jobId: { text, steps: [{ name, text, run, ifCond }] } } */
export function parseJobs(text) {
  const lines = text.split('\n');
  const jobs = {};
  let inJobs = false;
  let job = null;
  let step = null;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    const jm = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jm) { job = { id: jm[1], text: '', steps: [] }; jobs[job.id] = job; step = null; continue; }
    if (!job) continue;
    job.text += `${line}\n`;
    const sm = line.match(/^ {6}- (.*)$/);
    if (sm) { step = { head: sm[1], text: '' }; job.steps.push(step); }
    if (step) step.text += `${line}\n`;
  }
  for (const j of Object.values(jobs)) {
    for (const s of j.steps) {
      s.name = (s.text.match(/^\s*- name:\s*(.+)$/m) ?? [])[1] ?? s.head;
      s.ifCond = (s.text.match(/^ {8}if:\s*(.+)$/m) ?? [])[1] ?? null;
      const runIdx = s.text.search(/^ {8}run:/m);
      s.run = runIdx >= 0 ? s.text.slice(runIdx) : '';
    }
  }
  return jobs;
}

const nonComment = (text) => text.split('\n').filter((l) => !/^\s*#/.test(l));

export function checkCiStructure(text) {
  const errors = [];
  const jobs = parseJobs(text);
  const e2e = jobs['e2e-canonical'];
  const fe = jobs.frontend;
  if (!e2e) return ['job e2e-canonical is missing'];
  if (!fe) errors.push('job frontend is missing');
  const idx = (pred) => e2e.steps.findIndex(pred);

  const refuse = idx((s) => s.text.includes('CANONICAL_SKIP_SHA_PROVENANCE') && /exit 1/.test(s.run));
  const install = idx((s) => /npm ci/.test(s.run));
  const pull = idx((s) => /bash scripts\/e2e\/auth-stack\/pull-images\.sh/.test(s.run));
  const gate = idx((s) => /^\s*bash scripts\/run-e2e-gate\.sh\s*$/m.test(s.run.replace(/^ {8}run:\s*/, '        ')));
  const scan = idx((s) => /^canonical_scan$/.test((s.text.match(/^ {8}id:\s*(.+)$/m) ?? [])[1]?.trim() ?? ''));

  // ---- the SHA-provenance opt-out ----
  if (refuse < 0) errors.push('no step refuses CANONICAL_SKIP_SHA_PROVENANCE (exit 1) in e2e-canonical');
  else {
    if (install >= 0 && refuse > install) errors.push('the CANONICAL_SKIP_SHA_PROVENANCE refusal must run before npm ci');
    const rs = e2e.steps[refuse];
    // Both the INHERITED value and the repository variable must be checked, under different names: a
    // step env entry called CANONICAL_SKIP_SHA_PROVENANCE would shadow whatever the job inherited.
    if (!rs.run.includes('${CANONICAL_SKIP_SHA_PROVENANCE:-}')) errors.push('the provenance refusal no longer checks the inherited CANONICAL_SKIP_SHA_PROVENANCE value');
    if (!/CANONICAL_SKIP_SHA_PROVENANCE_REPO_VAR:\s*\$\{\{\s*vars\.CANONICAL_SKIP_SHA_PROVENANCE\s*\}\}/.test(rs.text) || !rs.run.includes('${CANONICAL_SKIP_SHA_PROVENANCE_REPO_VAR:-}')) errors.push('the provenance refusal no longer checks the repository variable under a separate name (CANONICAL_SKIP_SHA_PROVENANCE_REPO_VAR)');
    if (/^\s+CANONICAL_SKIP_SHA_PROVENANCE:/m.test(rs.text)) errors.push('the provenance refusal step sets CANONICAL_SKIP_SHA_PROVENANCE in its own env, which shadows an inherited value');
    // Review cycle 2 (INFO): outside the guard step NOTHING in the workflow may mention the opt-out, in any job or at
    // workflow level (an env entry would silently set it for the gate). Comments are ignored; the guard step is exempt.
    const guardLines = new Set(nonComment(rs.text));
    const stray = nonComment(text).filter((l) => /CANONICAL_SKIP_SHA_PROVENANCE/.test(l) && !guardLines.has(l));
    if (stray.length > 0) errors.push(`CANONICAL_SKIP_SHA_PROVENANCE is mentioned outside its guard step in ci.yml (${stray.length} line(s)); only the refusal step may name it`);
  }

  // ---- local auth: pinned image pull, then THE gate script ----
  if (pull < 0) errors.push('e2e-canonical lacks the pinned local-auth image pull (bash scripts/e2e/auth-stack/pull-images.sh)');
  if (gate < 0) errors.push('e2e-canonical lacks `bash scripts/run-e2e-gate.sh`: CI must run the same gate script a developer runs');
  if (install >= 0 && pull >= 0 && pull < install) errors.push('the image pull must run after npm ci');
  if (pull >= 0 && gate >= 0 && gate < pull) errors.push('the gate must run AFTER the pinned image pull');
  const eNon = nonComment(e2e.text).join('\n');
  if (/\bsecrets\./.test(eNon)) errors.push('e2e-canonical references a `secrets.` value; local auth needs none (role credentials are generated per run)');
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PROJECT_REF', 'E2E_AUTH_MODE', 'ADMIN_PASSWORD', 'SMOKE_USER_PASSWORD', 'DEALER_PASSWORD']) {
    if (eNon.includes(name)) errors.push(`e2e-canonical mentions ${name}: the hosted-auth wiring (or a hosted-mode switch) must not return to the merge gate`);
  }
  if (/local-fixture-backend\.sh/.test(eNon)) errors.push('e2e-canonical starts the backend through scripts/dev/local-fixture-backend.sh instead of the gate script');
  // The open-gap override can only ever make a run NOT a pass, but CI must never even carry it.
  if (nonComment(text).some((l) => /E2E_GATE_(ALLOW_OPEN_GAPS|EVIDENCE_DIR)/.test(l))) errors.push('ci.yml mentions E2E_GATE_ALLOW_OPEN_GAPS or E2E_GATE_EVIDENCE_DIR; CI must never set the open-gap override or the local-evidence aid');

  // ---- K3: the gate scans; a marker becomes the step outcome that gates every upload ----
  const uploads = e2e.steps.map((s, i) => ({ s, i })).filter(({ s }) => /actions\/upload-artifact/.test(s.text));
  if (scan < 0) errors.push('e2e-canonical lacks the step with id canonical_scan (K3 outcome)');
  else {
    const ss = e2e.steps[scan];
    if (!/^always\(\)$/.test((ss.ifCond ?? '').trim())) errors.push('the K3 scan step must carry `if: always()`');
    if (!ss.run.includes('test-results/gate/k3-scan.ok')) errors.push('the K3 scan step no longer checks the gate\'s k3-scan.ok marker');
    if (gate >= 0 && scan < gate) errors.push('the K3 scan outcome step must run AFTER the gate');
    const dump = idx((s) => /Dump backend log/.test(s.name) && /\b(cat|tail)\b/.test(s.run));
    if (dump >= 0 && dump < scan) errors.push('the backend log is printed before the K3 scan outcome is known');
    if (dump >= 0 && !/steps\.canonical_scan\.outcome\s*==\s*'success'/.test(e2e.steps[dump].ifCond ?? '')) errors.push('the backend log dump does not require steps.canonical_scan.outcome == \'success\'');
    for (const { s, i } of uploads) {
      if (i < scan) errors.push(`artifact upload "${s.name}" runs before the K3 scan outcome`);
      if (!/steps\.canonical_scan\.outcome\s*==\s*'success'/.test(s.ifCond ?? '')) errors.push(`artifact upload "${s.name}" does not require steps.canonical_scan.outcome == 'success' (an unscannable or leaked artefact could be uploaded)`);
    }
  }
  if (uploads.length === 0 || !uploads.some(({ s }) => /results\.json/.test(s.text))) errors.push('results.json is no longer uploaded as an artifact');
  // Q0: the HTML report records the sign-in fill() values verbatim; the gate/CI run list + json reporters only, so the report is never uploaded.
  for (const { s } of uploads) {
    if (nonComment(s.text).some((l) => /^\s*path:.*playwright-report/.test(l))) errors.push(`artifact upload "${s.name}" uploads the Playwright HTML report; the gate/CI run without the html reporter (it records credential values)`);
  }
  if (/node -e/.test(eNon)) errors.push('e2e-canonical contains an inline `node -e` block; the logic belongs in scripts/e2e/check-canonical-journeys.mjs');

  if (fe) {
    const feRuns = fe.steps.map((s) => s.run).join('\n');
    if (!/npm run test:e2e:guard\b/.test(feRuns)) errors.push('frontend job lost `npm run test:e2e:guard` (estate guard + journey static)');
    if (!/node --test scripts\/e2e\/\*\.test\.mjs/.test(feRuns)) errors.push('frontend job lost `node --test scripts/e2e/*.test.mjs`');
    if (!/bash scripts\/dev\/tests\/pre-push-classify\.test\.sh/.test(feRuns)) errors.push('frontend job lost `bash scripts/dev/tests/pre-push-classify.test.sh`');
  }
  return errors;
}

test('FC-23: the real ci.yml keeps the e2e-canonical and frontend wiring', () => {
  assert.deepEqual(checkCiStructure(CI_TEXT), []);
});

test('FC-23: parser sees the expected jobs and ordered steps', () => {
  const jobs = parseJobs(CI_TEXT);
  assert.ok(jobs['e2e-canonical'] && jobs.frontend);
  const names = jobs['e2e-canonical'].steps.map((s) => s.name);
  const at = (re) => names.findIndex((n) => re.test(n));
  assert.ok(at(/Pull the pinned local-auth images/) >= 0 && at(/Pull the pinned local-auth images/) < at(/Run the canonical E2E gate/));
  assert.ok(at(/Run the canonical E2E gate/) < at(/Credential scan \(K3\)/));
  assert.ok(at(/Credential scan \(K3\)/) < at(/Upload canonical results\.json/));
});

const mutate = (from, to) => {
  assert.ok(CI_TEXT.includes(from), `mutation anchor not found: ${from}`);
  return CI_TEXT.replace(from, to);
};

test('FC-23 mutation: dropping `if: always()` from the K3 outcome step is detected', () => {
  const m = mutate('        id: canonical_scan\n        if: always()\n', '        id: canonical_scan\n');
  assert.ok(checkCiStructure(m).some((e) => e.includes('if: always()')));
});

test('FC-23 mutation: removing the gate call, or the pinned image pull, is detected', () => {
  assert.ok(checkCiStructure(mutate('run: bash scripts/run-e2e-gate.sh\n', 'run: echo skipped\n')).some((e) => e.includes('bash scripts/run-e2e-gate.sh')));
  assert.ok(checkCiStructure(mutate('run: bash scripts/e2e/auth-stack/pull-images.sh\n', 'run: echo skipped\n')).some((e) => e.includes('pinned local-auth image pull')));
});

test('FC-23 mutation: re-introducing an inline node -e block is detected', () => {
  const m = mutate('run: bash scripts/run-e2e-gate.sh\n', "run: |\n          node -e 'process.exit(0)'\n          bash scripts/run-e2e-gate.sh\n");
  assert.ok(checkCiStructure(m).some((e) => e.includes('node -e')));
});

test('FC-23 mutation: removing the provenance refusal step is detected', () => {
  const m = mutate('            exit 1\n          fi\n        env:\n          CANONICAL_SKIP_SHA_PROVENANCE', '            true\n          fi\n        env:\n          CANONICAL_SKIP_SHA_PROVENANCE');
  assert.ok(checkCiStructure(m).some((e) => e.includes('CANONICAL_SKIP_SHA_PROVENANCE')));
});

test('review cycle 1 mutation: provenance refusal must check BOTH the inherited value and the repo variable, unshadowed', () => {
  let m = mutate('[ -n "${CANONICAL_SKIP_SHA_PROVENANCE:-}" ] || ', '');
  assert.ok(checkCiStructure(m).some((e) => e.includes('inherited CANONICAL_SKIP_SHA_PROVENANCE')));
  m = mutate(' || [ -n "${CANONICAL_SKIP_SHA_PROVENANCE_REPO_VAR:-}" ]', '');
  assert.ok(checkCiStructure(m).some((e) => e.includes('repository variable')));
  m = mutate('          CANONICAL_SKIP_SHA_PROVENANCE_REPO_VAR: ${{ vars.CANONICAL_SKIP_SHA_PROVENANCE }}', '          CANONICAL_SKIP_SHA_PROVENANCE: ${{ vars.CANONICAL_SKIP_SHA_PROVENANCE }}');
  assert.ok(checkCiStructure(m).some((e) => e.includes('shadows an inherited value')));
});

test('review cycle 2 mutation: CANONICAL_SKIP_SHA_PROVENANCE named anywhere outside its guard step is detected (job, workflow or step env)', () => {
  // step env on the gate step
  let m = mutate('        id: canonical_gate\n        run: bash scripts/run-e2e-gate.sh\n', '        id: canonical_gate\n        run: bash scripts/run-e2e-gate.sh\n        env:\n          CANONICAL_SKIP_SHA_PROVENANCE: ${{ vars.X }}\n');
  assert.ok(checkCiStructure(m).some((e) => e.includes('mentioned outside its guard step')));
  // workflow-level env
  m = mutate('jobs:\n', 'env:\n  CANONICAL_SKIP_SHA_PROVENANCE: "1"\n\njobs:\n');
  assert.ok(checkCiStructure(m).some((e) => e.includes('mentioned outside its guard step')));
  // a comment elsewhere is fine (control): the real file has comments that name it
  assert.deepEqual(checkCiStructure(CI_TEXT), []);
});

test('review cycle 2 mutation: every upload step and the log dump require the K3 outcome; the K3 outcome step reads the gate marker', () => {
  const m = mutate("if: always() && steps.canonical_scan.outcome == 'success'", 'if: always()');
  assert.ok(checkCiStructure(m).some((e) => e.includes('does not require steps.canonical_scan.outcome')));
  const m2 = mutate("      - name: Upload canonical results.json\n        uses: actions/upload-artifact@v4\n        if: always() && steps.canonical_scan.outcome == 'success'", "      - name: Upload canonical results.json\n        uses: actions/upload-artifact@v4\n        if: failure()");
  assert.ok(checkCiStructure(m2).some((e) => e.includes('does not require steps.canonical_scan.outcome')));
  const m3 = mutate('if [ ! -f test-results/gate/k3-scan.ok ]', 'if [ ! -f test-results/gate/other.ok ]');
  assert.ok(checkCiStructure(m3).some((e) => e.includes('k3-scan.ok marker')));
  const m4 = mutate('      - name: Dump backend log on failure\n        if: failure() && steps.canonical_scan.outcome == \'success\'', '      - name: Dump backend log on failure\n        if: failure()');
  assert.ok(checkCiStructure(m4).some((e) => e.includes('backend log dump does not require')));
  // an upload inserted BEFORE the K3 outcome step is detected
  const m5 = mutate('      - name: Credential scan (K3) outcome gates every upload', "      - name: Early upload\n        uses: actions/upload-artifact@v4\n        if: always() && steps.canonical_scan.outcome == 'success'\n        with:\n          name: x\n          path: test-results/canonical/results.json\n\n      - name: Credential scan (K3) outcome gates every upload");
  assert.ok(checkCiStructure(m5).some((e) => e.includes('runs before the K3 scan outcome')));
});

test('Q0 mutation: re-adding the HTML report upload is detected; the gate turns the html reporter off', () => {
  const m = mutate("          retention-days: 14\n          if-no-files-found: warn\n", "          retention-days: 14\n          if-no-files-found: warn\n\n      - name: Upload report\n        uses: actions/upload-artifact@v4\n        if: always() && steps.canonical_scan.outcome == 'success'\n        with:\n          name: r\n          path: playwright-report/canonical/\n");
  assert.ok(checkCiStructure(m).some((e) => e.includes('HTML report')));
  assert.deepEqual(checkCiStructure(CI_TEXT), []);
  const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'run-e2e-gate.sh'), 'utf8');
  assert.match(gate, /^export E2E_CANONICAL_GATE=1$/m);
  const cfg = fs.readFileSync(path.join(ROOT, 'playwright.canonical.config.ts'), 'utf8');
  assert.match(cfg, /E2E_CANONICAL_GATE === '1'/);
  assert.match(cfg, /CANONICAL_GATE_OR_CI \? \[\] : \[\['html'/);
});

test('amendment 1 mutation: hosted-auth wiring returning to the merge gate is detected; CI never carries the open-gap override', () => {
  for (const [from, to, needle] of [
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/run-e2e-gate.sh\n        env:\n          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}\n', 'VITE_SUPABASE_URL'],
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/run-e2e-gate.sh\n        env:\n          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}\n', 'secrets.'],
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/run-e2e-gate.sh\n        env:\n          E2E_AUTH_MODE: hosted\n', 'E2E_AUTH_MODE'],
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/run-e2e-gate.sh\n        env:\n          E2E_GATE_ALLOW_OPEN_GAPS: "1"\n', 'E2E_GATE_ALLOW_OPEN_GAPS'],
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/run-e2e-gate.sh\n        env:\n          E2E_GATE_EVIDENCE_DIR: /tmp/x\n', 'E2E_GATE_EVIDENCE_DIR'],
    ['run: bash scripts/run-e2e-gate.sh\n', 'run: bash scripts/dev/local-fixture-backend.sh\n', 'local-fixture-backend.sh'],
  ]) {
    assert.ok(checkCiStructure(mutate(from, to)).some((e) => e.includes(needle)), needle);
  }
});

test('FC-23 mutation: removing the frontend guard, node tests or classify test is detected', () => {
  for (const [from, needle] of [
    ['run: npm run test:e2e:guard', 'test:e2e:guard'],
    ['run: node --test scripts/e2e/*.test.mjs', 'node --test'],
    ['run: bash scripts/dev/tests/pre-push-classify.test.sh', 'pre-push-classify'],
  ]) {
    const m = mutate(from, 'run: echo removed');
    assert.ok(checkCiStructure(m).some((e) => e.includes(needle)), needle);
  }
});

test('hook, scripts and package.json still point at the same guards', () => {
  const pre = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-push'), 'utf8');
  assert.match(pre, /check-e2e-estate\.mjs/);
  assert.match(pre, /check-canonical-journeys\.mjs"\s+--phase=static/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(pkg['test:e2e:gate'], 'bash scripts/run-e2e-gate.sh');
  assert.match(pkg['test:e2e:guard'], /check-e2e-estate\.mjs/);
  assert.match(pkg['test:e2e:guard'], /check-canonical-journeys\.mjs --phase=static/);
  const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'run-e2e-gate.sh'), 'utf8');
  for (const phase of ['--phase=static', '--phase=list', '--phase=results']) assert.ok(gate.includes(phase), phase);
  assert.match(gate, /CANONICAL_SKIP_SHA_PROVENANCE/);
  // K3: the gate scans (and purges) BEFORE it prints run.log, with the same scan set the CI marker relies on
  assert.ok(gate.indexOf('--phase=scan') > 0 && gate.indexOf('--phase=scan') < gate.indexOf('tail -n 25 "$OUT/run.log"'), 'gate must scan before printing run.log');
  for (const needle of ['--purge', '--scan-path "$ROOT/test-results"', '--scan-path "$ROOT/playwright-report"', '--scan-path "$OUT/backend.log"']) assert.ok(gate.includes(needle), needle);
  assert.ok(gate.indexOf(': > "$OUT/k3-scan.ok"') > gate.indexOf('--phase=scan'), 'the K3 marker is written only after the scan');
  // K7: every inherited SPRING_* is refused, the JVM option variables are checked, and the datasource is pinned
  assert.match(gate, /case "\$n" in SPRING_\*\) k7_offenders=/);
  assert.match(gate, /JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS MAVEN_OPTS MAVEN_ARGS/);
  assert.match(gate, /-Dspring-boot\.run\.arguments=--spring\.datasource\.url=jdbc:postgresql:\/\/localhost:\$\{PG_PORT\}\/postgres/);
  // Local auth: secrets travel through --env-file, never -e, in the stack scripts
  const up = fs.readFileSync(path.join(ROOT, 'scripts', 'e2e', 'auth-stack', 'stack-up.sh'), 'utf8');
  assert.ok(!/docker run[^\n]*\s-e\s/.test(up) && !/^\s*-e\s/m.test(up), 'stack-up.sh must not pass secrets with -e');
  assert.equal((up.match(/--env-file "\$AUTH_WORKDIR\//g) ?? []).length, 2, 'GoTrue and PostgREST both use --env-file');
});
