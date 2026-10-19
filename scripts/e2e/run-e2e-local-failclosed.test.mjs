// node --test scripts/e2e/run-e2e-local-failclosed.test.mjs  (issue #2850 PR-7, AC12)
//
// scripts/run-e2e-local.sh is DISABLED (fail-closed): after the existing --project check it refuses unconditionally (exit 3),
// BEFORE any source, env-file read or external command. This test proves it WITHOUT touching the repo tree or the network:
// it runs a SANDBOXED COPY under `env -i` with a stub dir first on PATH. Every helper the script could reach (curl, npx, npm,
// node, mvn, docker, supabase, psql, lsof, nc, the sourced libs, restore-test-fixture.sh, apps/api/run-local.sh) is a RECORDING
// stub that appends its name to <sandbox>/invoked.log. The hosted-looking settings are inert strings in sandbox files.
//
// Cases:  H = hosted settings -> exit 3, message, empty invoked.log     L = loopback settings -> the same (the refusal is unconditional)
//         P = no --project -> exit 2 with the existing message (ordering preserved), empty invoked.log
// Mutations (run on temp copies, never on the repo file): block removed, block moved below the sourcing -> the same checks go RED.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRAPPER = path.join(ROOT, 'scripts', 'run-e2e-local.sh');
const REPORT = process.env.WRAPPER_MUTATION_REPORT === '1';
const MESSAGE = 'scripts/run-e2e-local.sh is DISABLED (fail-closed, #2850 PR-7)';
// Also the text utilities the old --project check and the env loader use (grep, sed, cat, ...): Codex r1 F1 - no external command may run before exit 3.
const STUBBED = ['curl', 'npx', 'npm', 'node', 'mvn', 'docker', 'supabase', 'psql', 'lsof', 'nc', 'grep', 'printf', 'sed', 'cat', 'awk', 'tr', 'cut', 'head', 'tail'];
const BLOCK_START = '# #2850 PR-7 FAIL-CLOSED';
const BLOCK_END = 'exit 3\n';

const HOSTED = {
  envE2e: 'PLAYWRIGHT_BASE_URL=https://hosted-frontend.example.invalid\nBACKEND_BASE_URL=https://hosted-backend.example.invalid\nADMIN_EMAIL=admin@test.local\n',
  apiEnv: 'SUPABASE_PROJECT_REF=hosted-project-ref-for-test\nAI_API_KEY=test-key\n',
  child: { PLAYWRIGHT_BASE_URL: 'https://hosted-frontend.example.invalid', BACKEND_BASE_URL: 'https://hosted-backend.example.invalid', SUPABASE_PROJECT_REF: 'hosted-project-ref-for-test' },
};
const LOOPBACK = {
  envE2e: 'PLAYWRIGHT_BASE_URL=http://localhost:5399\nBACKEND_BASE_URL=http://localhost:8399\nADMIN_EMAIL=admin@test.local\n',
  apiEnv: 'AI_API_KEY=test-key\n',
  child: { PLAYWRIGHT_BASE_URL: 'http://localhost:5399', BACKEND_BASE_URL: 'http://localhost:8399' },
};

/** Build a sandbox holding `scriptText` as scripts/run-e2e-local.sh plus recording stubs. Returns { sb, log, stubDir }. */
function makeSandbox(scriptText, settings, pathMode = 'stubs') {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-failclosed-'));
  const log = path.join(sb, 'invoked.log');
  const stubDir = path.join(sb, 'stubbin');
  const write = (rel, text, mode = 0o755) => {
    const p = path.join(sb, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, { mode });
  };
  fs.mkdirSync(stubDir, { recursive: true });
  for (const name of STUBBED) write(path.join('stubbin', name), `#!/bin/bash\necho "${name} $*" >> "${log}"\nexit 0\n`);
  // pathMode 'grep99': a PATH-overridden grep that records and exits 99. 'nogrep': PATH holds an EMPTY dir only (grep absent).
  if (pathMode === 'grep99') write(path.join('stubbin', 'grep'), `#!/bin/bash\necho "grep $*" >> "${log}"\nexit 99\n`);
  fs.mkdirSync(path.join(sb, 'emptybin'), { recursive: true });
  write('scripts/run-e2e-local.sh', scriptText);
  // Sourced libs: record, then exit 99 so a mutated copy that reaches them stops at once (and is visibly not exit 3).
  write('scripts/dev/lib/port-ownership.sh', `echo "SOURCED port-ownership.sh" >> "${log}"\nexit 99\n`, 0o644);
  write('scripts/dev/lib/e2e-identity-seed.sh', `echo "SOURCED e2e-identity-seed.sh" >> "${log}"\nexit 99\n`, 0o644);
  write('scripts/db/restore-test-fixture.sh', `#!/bin/bash\necho "restore-test-fixture.sh $*" >> "${log}"\nexit 0\n`);
  write('apps/api/run-local.sh', `#!/bin/bash\necho "apps/api/run-local.sh $*" >> "${log}"\nexit 0\n`);
  write('apps/api/.env', settings.apiEnv, 0o644);
  write('.env.e2e', settings.envE2e, 0o644);
  return { sb, log, stubDir };
}

function runCase(scriptText, settings, args, pathMode = 'stubs') {
  const { sb, log, stubDir } = makeSandbox(scriptText, settings, pathMode);
  try {
    const before = fs.readdirSync(sb).sort();
    const childEnv = Object.entries(settings.child).map(([k, v]) => `${k}=${v}`);
    const r = spawnSync('/usr/bin/env', ['-i', pathMode === 'nogrep' ? `PATH=${path.join(sb, 'emptybin')}` : `PATH=${stubDir}:/usr/bin:/bin`, `HOME=${sb}`, `TMPDIR=${sb}`, ...childEnv, '/bin/bash', path.join(sb, 'scripts', 'run-e2e-local.sh'), ...args], { encoding: 'utf8', timeout: 20_000 });
    const invoked = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    const after = fs.readdirSync(sb).sort();
    return { status: r.status, stderr: r.stderr ?? '', stdout: r.stdout ?? '', invoked, newEntries: after.filter((e) => !before.includes(e) && e !== 'invoked.log') };
  } finally { fs.rmSync(sb, { recursive: true, force: true }); }
}

/** Returns the list of failed expectations for a case result (empty = the case holds). */
function check(kind, res) {
  const f = [];
  if (kind === 'P') {
    if (res.status !== 2) f.push(`P: exit ${res.status} !== 2`);
    if (!res.stderr.includes('smoke project was retired (#2750 PR-2)')) f.push('P: existing --project message missing');
  } else {
    if (res.status !== 3) f.push(`${kind}: exit ${res.status} !== 3`);
    if (!res.stderr.includes(MESSAGE)) f.push(`${kind}: refusal message missing`);
    if (!res.stderr.includes('#2854') || !res.stderr.includes('npm run test:e2e:gate')) f.push(`${kind}: message must name #2854 and npm run test:e2e:gate`);
  }
  if (res.invoked.trim() !== '') f.push(`${kind}: invoked.log not empty: ${res.invoked.trim().split('\n').join(' | ')}`);
  if (res.newEntries.length > 0) f.push(`${kind}: sandbox side effects: ${res.newEntries.join(',')}`);
  return f;
}

const REAL = fs.readFileSync(WRAPPER, 'utf8');
const CASES = [
  ['H', HOSTED, ['--project=full']],
  ['L', LOOPBACK, ['--project=full']],
  ['H', HOSTED, ['--project=journey', '--headed', '--workers=1']],
  ['P', HOSTED, []],
  ['P', LOOPBACK, ['e2e/some.spec.ts']],
];
const PATH_MODES = ['stubs', 'nogrep', 'grep99'];
const failuresFor = (text) => CASES.flatMap(([kind, settings, args]) => PATH_MODES.flatMap((pm) => check(kind, runCase(text, settings, args, pm)).map((m) => `[${kind} ${args.join(' ') || '(no args)'} PATH=${pm}] ${m}`)));

/** The refusal block: from its marker comment to the `exit 3` line. */
function splitBlock(text) {
  const s = text.indexOf(BLOCK_START);
  assert.ok(s >= 0, 'refusal block marker not found');
  const e = text.indexOf(BLOCK_END, s) + BLOCK_END.length;
  return { before: text.slice(0, s), block: text.slice(s, e), after: text.slice(e) };
}

test('Case H (hosted settings, --project=full): exit exactly 3, refusal message, empty invoked.log, no side effects', () => {
  const res = runCase(REAL, HOSTED, ['--project=full']);
  assert.deepEqual(check('H', res), []);
  assert.equal(res.status, 3);
  assert.equal(res.invoked, '');
});

test('Case L (loopback settings, --project=full): the SAME refusal (unconditional, not URL-dependent)', () => {
  const res = runCase(REAL, LOOPBACK, ['--project=full']);
  assert.deepEqual(check('L', res), []);
  assert.equal(res.status, 3);
});

test('Case H2: extra legacy flags (--project=journey --headed --workers=1) do not re-enable it', () => {
  assert.deepEqual(check('H', runCase(REAL, HOSTED, ['--project=journey', '--headed', '--workers=1'])), []);
});

test('Case P (no --project): exit 2 with the existing message (ordering preserved), empty invoked.log; a spec path alone is not a project', () => {
  assert.deepEqual(check('P', runCase(REAL, HOSTED, [])), []);
  assert.deepEqual(check('P', runCase(REAL, LOOPBACK, ['e2e/some.spec.ts'])), []);
});

test('Codex r1 F1: no external command runs before exit 3 - grep/printf/sed/cat recording stubs, grep ABSENT from PATH, PATH-overridden grep exiting 99 (Cases H/L/P)', () => {
  for (const pm of PATH_MODES) {
    assert.deepEqual(check('H', runCase(REAL, HOSTED, ['--project=full'], pm)), [], `H PATH=${pm}`);
    assert.deepEqual(check('L', runCase(REAL, LOOPBACK, ['--project=full'], pm)), [], `L PATH=${pm}`);
    assert.deepEqual(check('P', runCase(REAL, HOSTED, [], pm)), [], `P PATH=${pm}`);
    assert.deepEqual(check('P', runCase(REAL, LOOPBACK, ['e2e/some.spec.ts'], pm)), [], `P2 PATH=${pm}`);
    // an arg that merely CONTAINS --project is not a project arg (only a leading --project* counts, as before)
    assert.equal(runCase(REAL, HOSTED, ['x--project=full'], pm).status, 2, `x--project is not a project arg PATH=${pm}`);
  }
});

test('Codex r1 F1: the region before exit 3 has no command substitution, pipe, or external command word', () => {
  const lines = REAL.split('\n');
  const exit3 = lines.findIndex((l) => /^exit 3\s*$/.test(l));
  const code = lines.slice(0, exit3).filter((l) => l.trim() !== '' && !l.trim().startsWith('#') && !l.trim().startsWith('echo ')).join('\n');
  assert.ok(!/\$\(|`|\|(?!\|)|\bgrep\b|\bsed\b|\bcat\b|\bawk\b|\bsource\b|\beval\b|\bcurl\b|\bnpx?\b/.test(code), `external/pipe construct before exit 3:\n${code}`);
});

test('source order: --project check < refusal block < first source / env-file read / external command; block uses builtins only', () => {
  const lines = REAL.split('\n');
  const idx = (re) => lines.findIndex((l) => re.test(l));
  const projectExit2 = idx(/^\s*exit 2\s*$/);
  const blockStart = idx(/^# #2850 PR-7 FAIL-CLOSED/);
  const exit3 = idx(/^exit 3\s*$/);
  const firstSource = idx(/^source\s/);
  const firstEnvRead = lines.findIndex((l) => !l.trim().startsWith('#') && /ENV_FILE=|\.env\.e2e|apps\/api\/\.env/.test(l));
  assert.ok(projectExit2 >= 0 && blockStart > projectExit2, `block must follow the --project check (exit 2 at ${projectExit2 + 1}, block at ${blockStart + 1})`);
  assert.ok(exit3 > blockStart);
  const firstCode = lines.findIndex((l, i) => i > exit3 && l.trim() !== '' && !l.trim().startsWith('#'));
  assert.ok(firstSource > exit3 && firstCode > exit3, 'all executable lines come after the refusal');
  assert.ok(firstEnvRead > exit3, `no env-file read before the block (first at line ${firstEnvRead + 1})`);
  const blockCode = lines.slice(blockStart, exit3 + 1).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  assert.deepEqual(blockCode.map((l) => l.trim().split(/\s+/)[0]), ['echo', 'exit'], 'the block is one echo and one exit (builtins only)');
  assert.ok(!/\$\(|`|\bsource\b|\beval\b|\bcurl\b|\bnpx?\b/.test(blockCode.join('\n')), 'no command substitution or external command in the block');
  if (REPORT) console.log(`LINES: --project exit 2 at ${projectExit2 + 1}; refusal block ${blockStart + 1}-${exit3 + 1}; first source at ${firstSource + 1}`);
});

test('no bypass: the refusal block has no condition (no if/&&/||/case) and the file has no env/flag that skips it', () => {
  const { block } = splitBlock(REAL);
  const code = block.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#')).join('\n');
  assert.ok(!/\bif\b|&&|\|\||\bcase\b/.test(code), `block must be unconditional: ${code}`);
});

test('MUTATION 1: refusal block removed -> the cases go RED (exit !== 3 and/or a non-empty invoked.log)', () => {
  const { before, after } = splitBlock(REAL);
  const f = failuresFor(before + after);
  if (REPORT) console.log(`MUTATION 1 (block removed) RED diagnostics (${f.length}):\n  ${f.join('\n  ')}`);
  assert.ok(f.some((m) => m.includes('exit 99 !== 3') || m.includes('!== 3')), 'exit-3 assertion must fire');
  assert.ok(f.some((m) => m.includes('invoked.log not empty')), 'invoked.log assertion must fire');
});

test('MUTATION 2: refusal block moved BELOW the sourcing -> the cases go RED', () => {
  const { before, block, after } = splitBlock(REAL);
  const anchor = 'source "$SCRIPT_DIR/dev/lib/e2e-identity-seed.sh"\n';
  assert.ok(after.includes(anchor), 'sourcing anchor missing');
  const f = failuresFor(before + after.replace(anchor, anchor + block));
  if (REPORT) console.log(`MUTATION 2 (block moved below sourcing) RED diagnostics (${f.length}):\n  ${f.join('\n  ')}`);
  assert.ok(f.some((m) => m.includes('!== 3')), 'exit-3 assertion must fire');
  assert.ok(f.some((m) => m.includes('SOURCED')), 'the recording stub must show the sourcing happened first');
});

test('MUTATION 3: a conditional refusal (only when the target looks hosted) is NOT accepted: Case L goes RED', () => {
  const { before, after } = splitBlock(REAL);
  const conditional = 'if [ "${BACKEND_BASE_URL:-}" != "http://localhost:8399" ]; then\n  echo "ERROR: ' + MESSAGE + ' #2854 npm run test:e2e:gate" >&2\n  exit 3\nfi\n';
  const f = failuresFor(before + conditional + after);
  if (REPORT) console.log(`MUTATION 3 (conditional refusal) RED diagnostics (${f.length}):\n  ${f.join('\n  ')}`);
  assert.ok(f.some((m) => m.startsWith('[L ')), 'Case L must go RED');
});

test('MUTATION 4 (Codex r1 F1): the old `printf | grep` --project check restored -> the new assertions go RED, attributable to grep', () => {
  const NEW_CHECK = /has_project=0\nfor arg in "\$@"; do\n  case "\$arg" in\n    --project\*\) has_project=1; break ;;\n  esac\ndone\nif \[ "\$has_project" -eq 0 \]; then/;
  assert.ok(NEW_CHECK.test(REAL), 'builtin project check not found');
  const mutated = REAL.replace(NEW_CHECK, () => "if ! printf '%s\\n' \"$@\" | grep -q '^--project'; then");
  assert.notEqual(mutated, REAL);
  const f = failuresFor(mutated);
  if (REPORT) console.log(`MUTATION 4 (grep pipeline restored) RED diagnostics (${f.length}):\n  ${f.join('\n  ')}`);
  assert.ok(f.some((m) => m.includes('invoked.log not empty') && m.includes('grep -q ^--project')), 'recording grep stub must show grep ran before exit 3');
  assert.ok(f.some((m) => m.includes('PATH=nogrep') && m.includes('!== ')), 'grep-absent case must change the exit code');
  assert.ok(f.some((m) => m.includes('PATH=grep99') && m.includes('!== ')), 'PATH-overridden grep (exit 99) must change the exit code');
});
