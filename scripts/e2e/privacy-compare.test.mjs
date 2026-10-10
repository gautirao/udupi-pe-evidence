// node --test scripts/e2e/privacy-compare.test.mjs  (issue #2750 FC-27c positive control, security review r2 MEDIUM-1)
//
// Drives the REAL scripts/e2e/auth-stack/privacy-compare.sh with a stub `psql` first on PATH. The stub replays a canned
// snapshot per database, or fails / prints nothing, so no database is needed. The point under test: two snapshots that are
// EMPTY (or both errored) are byte-identical, and before the positive control that was a vacuous PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'e2e', 'auth-stack', 'privacy-compare.sh');

const SECTION_A = ['anon', 'authenticated'].flatMap((r) => ['contact_info', 'contact_phone'].flatMap(
  (c) => ['INSERT', 'REFERENCES', 'SELECT', 'UPDATE'].map((p) => `${r}.${c}.${p}=false`)));
function goodSnapshot({ sectionA = SECTION_A, totalColumns = 'property_listings.total_columns=164' } = {}) {
  return [
    '== A. has_column_privilege(role, property_listings, column, priv) for the V128-revoked columns', ...sectionA,
    '== B. information_schema.column_privileges rows on the revoked columns (anon, authenticated, PUBLIC)', '0',
    '== C. whole property_listings column surface per role/privilege (count + md5 of the granted column list)',
    'anon.SELECT cols=161 md5=f2e42901ef2a8c4bc0b89c335a585e2e', ...(totalColumns ? [totalColumns] : []),
    '== E. RLS state of the V141/V143/V146 protected tables', 'property_requests rls=true force=false policies=-',
    '== D. (informational, not part of the equality) table-level SELECT on the staging tables', 'anon x=false',
  ].join('\n');
}

// A stub psql: reads STUB_<db>_OUT (a file) for the database named after `-d`, and exits with STUB_<db>_RC (default 0).
// It also records its argv so the test can prove -v ON_ERROR_STOP=1 was passed.
function runCompare({ ref, ovl, refRc = 0, ovlRc = 0, extraEnv = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privcmp-'));
  try {
    fs.writeFileSync(path.join(dir, 'ref.out'), ref);
    fs.writeFileSync(path.join(dir, 'ovl.out'), ovl);
    fs.writeFileSync(path.join(dir, 'psql'), [
      '#!/usr/bin/env bash',
      'echo "$*" >> "$STUB_DIR/argv.log"',
      'db=""; while [ $# -gt 0 ]; do [ "$1" = "-d" ] && db="$2"; shift; done',
      'if [ "$db" = "fixture_reference" ]; then cat "$STUB_DIR/ref.out"; exit "$STUB_REF_RC"; fi',
      'cat "$STUB_DIR/ovl.out"; exit "$STUB_OVL_RC"',
    ].join('\n') + '\n', { mode: 0o755 });
    const r = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env.PATH}`, HOME: process.env.HOME ?? os.homedir(), STUB_DIR: dir,
        STUB_REF_RC: String(refRc), STUB_OVL_RC: String(ovlRc), AUTH_PG_PORT: '1', AUTH_PG_PASSWORD: 'x',
        ...extraEnv,
      },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}`, argv: fs.readFileSync(path.join(dir, 'argv.log'), 'utf8') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('control: two real-looking, identical snapshots PASS and print the positive-control pass for both sides', () => {
  const r = runCompare({ ref: goodSnapshot(), ovl: goodSnapshot() });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /PASS positive control \(reference fixture_reference\): 16 section-A contact_\*=false lines/);
  assert.match(r.out, /PASS positive control \(overlay postgres\): 16 section-A contact_\*=false lines/);
  assert.match(r.out, /PASS reference == overlay/);
});

test('psql is always run with -v ON_ERROR_STOP=1 (both databases)', () => {
  const r = runCompare({ ref: goodSnapshot(), ovl: goodSnapshot() });
  const lines = r.argv.trim().split('\n');
  assert.equal(lines.length, 2);
  for (const l of lines) assert.match(l, /-v ON_ERROR_STOP=1/);
});

test('LOW-E: the snapshot SQL is FIXED (privacy-snapshot.sql beside the script); PRIVACY_SNAPSHOT_SQL in the env cannot change it', () => {
  const fake = '/tmp/definitely-not-the-real-snapshot.sql';
  const r = runCompare({ ref: goodSnapshot(), ovl: goodSnapshot(), extraEnv: { PRIVACY_SNAPSHOT_SQL: fake } });
  assert.equal(r.status, 0, r.out);
  const real = path.join(path.dirname(SCRIPT), 'privacy-snapshot.sql');
  const lines = r.argv.trim().split('\n');
  assert.equal(lines.length, 2);
  for (const l of lines) {
    assert.ok(l.includes(`-f ${real}`), `psql must be given the fixed snapshot path, got: ${l}`);
    assert.ok(!l.includes(fake), 'the env override must not reach psql');
  }
});

test('a psql error on either side fails closed with exit 2 (no partial snapshot is compared)', () => {
  assert.equal(runCompare({ ref: goodSnapshot(), ovl: goodSnapshot(), refRc: 3 }).status, 2);
  assert.equal(runCompare({ ref: goodSnapshot(), ovl: goodSnapshot(), ovlRc: 3 }).status, 2);
});

test('POSITIVE CONTROL: two EMPTY snapshots (byte-identical, the old vacuous PASS) now FAIL', () => {
  const r = runCompare({ ref: '', ovl: '' });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL positive control \(reference fixture_reference\)/);
  assert.match(r.out, /FAIL positive control \(overlay postgres\)/);
  assert.match(r.out, /PASS reference == overlay/, 'the equality alone WOULD have passed: that is exactly what the control closes');
});

test('POSITIVE CONTROL: a snapshot with a missing section-A line, or without total_columns, FAILs (one side at a time)', () => {
  const short = SECTION_A.slice(0, 15);
  let r = runCompare({ ref: goodSnapshot({ sectionA: short }), ovl: goodSnapshot({ sectionA: short }) });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL positive control \(reference fixture_reference\): section-A =false lines=15/);
  r = runCompare({ ref: goodSnapshot(), ovl: goodSnapshot({ totalColumns: '' }) });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL positive control \(overlay postgres\).*total_columns lines=0/);
  assert.match(r.out, /PASS positive control \(reference fixture_reference\)/, 'the healthy side still passes its own control');
});

test('PRIVACY: a revoked column readable on the overlay still FAILs (control for the existing checks)', () => {
  const leaked = SECTION_A.map((l) => (l === 'anon.contact_phone.SELECT=false' ? 'anon.contact_phone.SELECT=true' : l));
  const r = runCompare({ ref: goodSnapshot(), ovl: goodSnapshot({ sectionA: leaked }) });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL OVERLAY exposes a revoked column/);
  assert.match(r.out, /FAIL reference != overlay/);
});
