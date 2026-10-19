// node --test scripts/e2e/e2e-watch-failclosed.test.mjs  (issue #2850 PR-7, amendment 3)
//
// scripts/e2e-watch.sh is DISABLED (fail-closed): immediately after its LEGACY banner it refuses unconditionally (exit 3),
// BEFORE any source, env-file read or external command. Proven on a SANDBOXED COPY under `env -i` with a stub dir first on PATH;
// every command the script could reach is a RECORDING stub (appends to <sandbox>/invoked.log) and the sourced lib is a SENTINEL
// that records "SOURCED" and exits 99 if it is ever read. Hosted-looking settings are inert strings in sandbox files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'e2e-watch.sh');
const REPORT = process.env.WATCH_MUTATION_REPORT === '1';
const MESSAGE = 'scripts/e2e-watch.sh is DISABLED (fail-closed, #2850 PR-7)';
const STUBBED = ['curl', 'npx', 'npm', 'node', 'mvn', 'docker', 'supabase', 'psql', 'lsof', 'nc', 'sleep', 'kill'];
const BLOCK_START = '# #2850 PR-7 FAIL-CLOSED';
const BLOCK_END = 'exit 3\n';
const HOSTED = {
  envE2e: 'PLAYWRIGHT_BASE_URL=https://hosted-frontend.example.invalid\nBACKEND_BASE_URL=https://hosted-backend.example.invalid\n',
  apiEnv: 'SUPABASE_PROJECT_REF=hosted-project-ref-for-test\n',
  child: { PLAYWRIGHT_BASE_URL: 'https://hosted-frontend.example.invalid', BACKEND_BASE_URL: 'https://hosted-backend.example.invalid', SUPABASE_PROJECT_REF: 'hosted-project-ref-for-test' },
};
const LOOPBACK = {
  envE2e: 'PLAYWRIGHT_BASE_URL=http://localhost:5399\nBACKEND_BASE_URL=http://localhost:8399\n',
  apiEnv: 'AI_API_KEY=test-key\n',
  child: { PLAYWRIGHT_BASE_URL: 'http://localhost:5399', BACKEND_BASE_URL: 'http://localhost:8399' },
};

function runCase(scriptText, settings, args) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-watch-failclosed-'));
  try {
    const log = path.join(sb, 'invoked.log');
    const stubDir = path.join(sb, 'stubbin');
    const write = (rel, text, mode = 0o755) => { const p = path.join(sb, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, { mode }); };
    for (const n of STUBBED) write(`stubbin/${n}`, `#!/bin/bash\necho "${n} $*" >> "${log}"\nexit 0\n`);
    write('scripts/e2e-watch.sh', scriptText);
    write('scripts/dev/lib/port-ownership.sh', `echo "SOURCED port-ownership.sh" >> "${log}"\nexit 99\n`, 0o644);
    write('apps/api/run-local.sh', `#!/bin/bash\necho "apps/api/run-local.sh $*" >> "${log}"\nexit 0\n`);
    write('apps/api/.env', settings.apiEnv, 0o644);
    write('.env.e2e', settings.envE2e, 0o644);
    const before = fs.readdirSync(sb).sort();
    const childEnv = Object.entries(settings.child).map(([k, v]) => `${k}=${v}`);
    const r = spawnSync('/usr/bin/env', ['-i', `PATH=${stubDir}:/usr/bin:/bin`, `HOME=${sb}`, `TMPDIR=${sb}`, ...childEnv, '/bin/bash', path.join(sb, 'scripts', 'e2e-watch.sh'), ...args], { encoding: 'utf8', timeout: 20_000 });
    const invoked = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    const newEntries = fs.readdirSync(sb).sort().filter((e) => !before.includes(e) && e !== 'invoked.log');
    return { status: r.status, stderr: r.stderr ?? '', invoked, newEntries };
  } finally { fs.rmSync(sb, { recursive: true, force: true }); }
}

function check(res) {
  const f = [];
  if (res.status !== 3) f.push(`exit ${res.status} !== 3`);
  if (!res.stderr.includes(MESSAGE)) f.push('refusal message missing');
  if (!res.stderr.includes('#2854') || !res.stderr.includes('npm run test:e2e:gate')) f.push('message must name #2854 and npm run test:e2e:gate');
  if (res.invoked.trim() !== '') f.push(`recorded invocation/sourcing: ${res.invoked.trim().split('\n').join(' | ')}`);
  if (res.newEntries.length) f.push(`sandbox side effects: ${res.newEntries.join(',')}`);
  return f;
}

const REAL = fs.readFileSync(SCRIPT, 'utf8');
const ARGS = [[], ['--slow'], ['--debug', '-g', 'GF1'], ['--slow', '--project=journey'], ['e2e/journey/anon-teaser.spec.ts']];
const failuresFor = (text) => ARGS.flatMap((a) => [HOSTED, LOOPBACK].flatMap((s, i) => check(runCase(text, s, a)).map((m) => `[${i === 0 ? 'hosted' : 'loopback'} ${a.join(' ') || '(no args)'}] ${m}`)));
function splitBlock(text) {
  const s = text.indexOf(BLOCK_START); assert.ok(s >= 0, 'refusal block marker not found');
  const e = text.indexOf(BLOCK_END, s) + BLOCK_END.length;
  return { before: text.slice(0, s), block: text.slice(s, e), after: text.slice(e) };
}

test('e2e-watch: hosted settings in sandbox env files + hosted child env -> exit exactly 3, refusal on stderr, nothing recorded, nothing sourced', () => {
  for (const a of ARGS) {
    const res = runCase(REAL, HOSTED, a);
    assert.deepEqual(check(res), [], a.join(' '));
    assert.equal(res.status, 3);
    assert.equal(res.invoked, '');
  }
});

test('e2e-watch: loopback settings get the SAME refusal (unconditional, not URL-dependent)', () => {
  for (const a of ARGS) assert.deepEqual(check(runCase(REAL, LOOPBACK, a)), [], a.join(' '));
});

test('e2e-watch source order: banner < refusal block < first source / env read / external command; block is one echo + one exit', () => {
  const lines = REAL.split('\n');
  const code = (re) => lines.findIndex((l) => !l.trim().startsWith('#') && re.test(l));
  const banner = code(/LEGACY Playwright suite/);
  const blockStart = lines.findIndex((l) => l.startsWith(BLOCK_START));
  const exit3 = lines.findIndex((l) => /^exit 3\s*$/.test(l));
  const firstSource = code(/^\s*source\s/);
  const firstEnv = code(/ENV_FILE=|\.env\.e2e|apps\/api\/\.env/);
  const firstCmdSubst = code(/\$\(/);
  assert.ok(banner >= 0 && blockStart > banner && exit3 > blockStart, `banner ${banner + 1}, block ${blockStart + 1}-${exit3 + 1}`);
  assert.ok(firstSource > exit3 && firstEnv > exit3 && firstCmdSubst > exit3, 'source / env read / command substitution all come after the refusal');
  const blockCode = lines.slice(blockStart, exit3 + 1).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  assert.deepEqual(blockCode.map((l) => l.trim().split(/\s+/)[0]), ['echo', 'exit']);
  assert.ok(!/\bif\b|&&|\|\||\bcase\b|\$\(|`|\bsource\b|\beval\b/.test(blockCode.join('\n')), 'unconditional, builtins only');
  if (REPORT) console.log(`LINES: banner ${banner + 1}; refusal block ${blockStart + 1}-${exit3 + 1}; first source ${firstSource + 1}; first env read ${firstEnv + 1}`);
});

test('MUTATION a: refusal block removed -> RED (exit 99 !== 3, SOURCED sentinel recorded)', () => {
  const { before, after } = splitBlock(REAL);
  const f = failuresFor(before + after);
  if (REPORT) console.log(`MUTATION a (block removed) RED diagnostics (${f.length}), first 6:\n  ${f.slice(0, 6).join('\n  ')}`);
  assert.ok(f.some((m) => m.includes('exit 99 !== 3')));
  assert.ok(f.some((m) => m.includes('SOURCED port-ownership.sh')));
});

test('MUTATION b: refusal block moved BELOW the first source statement -> RED', () => {
  const { before, block, after } = splitBlock(REAL);
  const anchor = 'source "$SCRIPT_DIR/dev/lib/port-ownership.sh"\n';
  assert.ok(after.includes(anchor));
  const f = failuresFor(before + after.replace(anchor, anchor + block));
  if (REPORT) console.log(`MUTATION b (block below first source) RED diagnostics (${f.length}), first 6:\n  ${f.slice(0, 6).join('\n  ')}`);
  assert.ok(f.some((m) => m.includes('exit 99 !== 3')));
  assert.ok(f.some((m) => m.includes('SOURCED port-ownership.sh')));
});
