// node --test scripts/e2e/check-e2e-estate.test.mjs  (issue #2750; FC-17..FC-19, FC-24, K4)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_ID_SHAPE,
  checkEstate,
  DEFAULT_ROOT,
  EXPECTED_CONFIGS,
  HEADER,
  ISSUE_2751_FILES,
  ISSUE_2751_TOTAL,
  MANIFEST_REL,
  parseCsv,
} from './check-e2e-estate.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-e2e-estate.mjs');
const has = (res, code, needle = '') => res.errors.some((e) => e.includes(`FAIL[${code}]`) && e.includes(needle));

/** A tiny consistent estate: 2 legacy specs (one will be retired later), configs, canonical dir. */
function world(mut = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-estate-'));
  const put = (rel, txt = '') => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, txt);
  };
  const files = {
    'e2e/a.spec.ts': "test('a', () => {});",
    'e2e/b.spec.ts': "test('b', () => {});",
    'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});",
    'e2e/canonical/support/helper.ts': 'export const h = 1;',
    ...Object.fromEntries(EXPECTED_CONFIGS.map((c) => [c, 'export default {};'])),
    ...(mut.files ?? {}),
  };
  for (const [k, v] of Object.entries(files)) if (v !== null) put(k, v);
  const rows = mut.rows ?? [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'covered by T1', 'PR-3', String(ISSUE_2751_TOTAL), 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ];
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  put(MANIFEST_REL, [HEADER, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n');
  return root;
}
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });
// The synthetic world only has two rows, so give every #2751 file a row too by reusing the real rule:
// FC-24 is exercised separately; for the other arms we disable it by using trackedFiles and ignoring FC-24 noise.
const nonFc24 = (res) => ({ ...res, errors: res.errors.filter((e) => !e.includes('FAIL[FC-24]')) });

test('parseCsv handles quotes, escaped quotes and embedded commas', () => {
  const rows = parseCsv('a,"b,c","d ""q"""\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
});

test('real repo: the committed manifest and tree are consistent (FC-17/18/19/24, K4)', () => {
  const res = checkEstate({ root: DEFAULT_ROOT });
  assert.deepEqual(res.errors, []);
  assert.match(res.info.join('\n'), /issue_2751_titles=66/);
});

test('real repo: manifest has no PENDING/NEEDS_REVIEW and every #2751 file has titles', () => {
  const txt = fs.readFileSync(path.join(DEFAULT_ROOT, MANIFEST_REL), 'utf8');
  assert.doesNotMatch(txt, /\b(PENDING|NEEDS_REVIEW)\b/);
  const rows = parseCsv(txt).slice(1).filter((r) => r.length > 1);
  for (const f of ISSUE_2751_FILES) {
    const row = rows.find((r) => r[0] === f);
    assert.ok(row && Number(row[6]) >= 1, f);
  }
  assert.equal(rows.length, 217);
});

test('consistent synthetic estate passes (aside from FC-24 which needs the real file list)', () => {
  const root = world();
  try {
    const res = nonFc24(checkEstate({ root, trackedFiles: [] }));
    assert.deepEqual(res.errors, []);
  } finally { clean(root); }
});

test('FC-17: a new unlisted spec fails and the message cites the #2750 rule', () => {
  const root = world({ files: { 'e2e/zz-new.spec.ts': "test('new', () => {});" } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-17', 'e2e/zz-new.spec.ts'));
    assert.ok(res.errors.some((e) => e.includes('new permanent Playwright coverage must extend the canonical suite')));
  } finally { clean(root); }
});

test('FC-17: every matchable extension is covered (.test.ts, .spec.mjs, .spec.tsx) and e2e-parity/ too', () => {
  const root = world({ files: { 'e2e/c.test.ts': '', 'e2e/d.spec.mjs': '', 'e2e/e.spec.tsx': '', 'e2e-parity/f.spec.ts': '' } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    for (const f of ['e2e/c.test.ts', 'e2e/d.spec.mjs', 'e2e/e.spec.tsx', 'e2e-parity/f.spec.ts']) assert.ok(has(res, 'FC-17', f), f);
  } finally { clean(root); }
});

test('FC-17: a duplicate manifest row fails', () => {
  const r = ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'covered by T1', 'PR-3', '0', 'SCHEDULED(PR-3)'];
  const root = world({ rows: [r, r, ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)']] });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'more than one row')); } finally { clean(root); }
});

test('FC-18: a RETIRED row whose file still exists fails; a SCHEDULED row whose file is gone fails', () => {
  let root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-1', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-18', 'still exists')); } finally { clean(root); }
  root = world({ files: { 'e2e/b.spec.ts': null } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-18', 'does not exist')); } finally { clean(root); }
});

test('FC-18: a RETIRED row with the file really absent passes', () => {
  const root = world({
    files: { 'e2e/a.spec.ts': null },
    rows: [
      ['e2e/a.spec.ts', 'top-level', 'DELETE_OBSOLETE', 'none', 'evidence', 'PR-1', '0', 'RETIRED'],
      ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
    ],
  });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: undecided markers, bad decisions and DELETE_DUP without a canonical id fail', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'PENDING', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', '', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'not one of'));
    assert.ok(has(res, 'FC-19', 'undecided marker'));
    assert.ok(has(res, 'FC-19', 'must name the canonical id'));
  } finally { clean(root); }
});

test('FC-19: MOVE_DOWN needs a destination, and a RETIRED MOVE_DOWN row needs the destination to exist', () => {
  let root = world({ files: { 'e2e/a.spec.ts': null }, rows: [
    ['e2e/a.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/missing.test.ts', 'x', 'PR-3', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', '', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'destination apps/web/src/missing.test.ts does not exist'));
    assert.ok(has(res, 'FC-19', 'must name a destination'));
  } finally { clean(root); }
  root = world({ files: { 'e2e/a.spec.ts': null, 'apps/web/src/dest.test.ts': 'x' }, rows: [
    ['e2e/a.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/dest.test.ts', 'x', 'PR-3', '0', 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: RETAIN_SPECIALIST needs a written reason and the RETAIN_SPECIALIST status', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'parity', 'RETAIN_SPECIALIST', 'x', 'short', 'PR-7', '0', 'SCHEDULED(PR-7)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'needs a written reason'));
    assert.ok(has(res, 'FC-19', 'must carry status RETAIN_SPECIALIST'));
  } finally { clean(root); }
});

test('FC-19: *.canonical.ts outside e2e/canonical fails', () => {
  const root = world({ files: { 'e2e/rogue.canonical.ts': 'x', 'apps/web/src/other.canonical.ts': 'x' } });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'e2e/rogue.canonical.ts'));
    assert.ok(has(res, 'FC-19', 'apps/web/src/other.canonical.ts'));
  } finally { clean(root); }
});

test('FC-19/FC-04: literal test.skip / test.fixme / test.only / describe.skip in e2e/canonical/** fails; comments do not', () => {
  for (const body of ["test.skip(true, 'x');", "test.fixme('t', () => {});", "test.only('t', () => {});", "test.describe.skip('d', () => {});"]) {
    const root = world({ files: { 'e2e/canonical/x.canonical.ts': body } });
    try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-04', 'e2e/canonical/x.canonical.ts'), body); } finally { clean(root); }
  }
  const root = world({ files: { 'e2e/canonical/x.canonical.ts': "// never test.skip here\n/* test.fixme(...) */\ntest('T1 - ok', () => {});" } });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: an unexpected or a missing playwright*.config.ts fails', () => {
  let root = world({ files: { 'playwright.extra.config.ts': 'x' } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'playwright.extra.config.ts')); } finally { clean(root); }
  root = world({ files: { 'playwright.parity.config.ts': null } });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'missing [playwright.parity.config.ts]')); } finally { clean(root); }
});

test('K4: tracked storageState files and tracked reports fail; untracked ones pass', () => {
  const root = world();
  try {
    const bad = checkEstate({ root, trackedFiles: ['e2e/canonical/.auth/user.json', 'playwright-report/canonical/index.html', 'src/x.ts'] });
    assert.equal(bad.errors.filter((e) => e.includes('FAIL[K4]')).length, 2);
    assert.equal(nonFc24(checkEstate({ root, trackedFiles: ['src/x.ts'] })).errors.length, 0);
  } finally { clean(root); }
});

test('FC-24: a wrong #2751 sum and a missing #2751 file row both fail', () => {
  const root = world({ rows: [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '10', 'SCHEDULED(PR-3)'],
    ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ] });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-24', `sum of issue_2751_titles is 10, expected ${ISSUE_2751_TOTAL}`));
    assert.ok(has(res, 'FC-24', `#2751 file ${ISSUE_2751_FILES[0]} has no manifest row`));
  } finally { clean(root); }
});

test('FC-24: a #2751 file whose row carries 0 titles fails', () => {
  const real = fs.readFileSync(path.join(DEFAULT_ROOT, MANIFEST_REL), 'utf8').split('\n');
  const target = ISSUE_2751_FILES[3];
  const mutated = real.map((l) => (l.startsWith(`${target},`) ? l.replace(/,(\d+),SCHEDULED/, ',0,SCHEDULED') : l)).join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-estate-m-'));
  try {
    const mp = path.join(tmp, 'm.csv');
    fs.writeFileSync(mp, mutated);
    const res = checkEstate({ root: DEFAULT_ROOT, manifestPath: mp, trackedFiles: [] });
    assert.ok(has(res, 'FC-24', target));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('manifest header and missing manifest fail closed', () => {
  const root = world();
  try {
    fs.writeFileSync(path.join(root, MANIFEST_REL), 'file,decision\n');
    assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'header'));
    fs.rmSync(path.join(root, MANIFEST_REL));
    assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-17', 'manifest not found'));
  } finally { clean(root); }
});

// ---- review cycle 1: canonical id validation, test.fail ban, K4 fail-closed ----------------------------
const dupRows = (cell, status = 'SCHEDULED(PR-3)', decision = 'DELETE_DUP') => [
  ['e2e/a.spec.ts', 'top-level', decision, cell, 'x', 'PR-3', '0', status],
  ['e2e/b.spec.ts', 'top-level', 'DELETE_DUP', 'T1', 'x', 'PR-3', '0', 'SCHEDULED(PR-3)'],
];

test('FC-19: DELETE_DUP / CANONICAL_GAP_CLOSED must name ids that exist (matrix or collected title)', () => {
  for (const decision of ['DELETE_DUP', 'CANONICAL_GAP_CLOSED']) {
    const root = world({ rows: dupRows('T1 + T99', 'SCHEDULED(PR-3)', decision) });
    try {
      const res = checkEstate({ root, trackedFiles: [] });
      assert.ok(has(res, 'FC-19', 'canonical id "T99"'), decision);
      assert.ok(!has(res, 'FC-19', 'canonical id "T1"'), decision);
    } finally { clean(root); }
  }
});

test('FC-19: an id embedded in prose, or T1_x standing in for T1, is rejected', () => {
  const root = world({ rows: dupRows('T1_x') });
  try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-19', 'canonical id "T1_x"')); } finally { clean(root); }
});

test('FC-19: a role tag in the cell is stripped ("T1 [role:admin] + T1")', () => {
  const root = world({ rows: dupRows('T1 [role:admin] + T1') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-19: a planned C2 id is allowed only while the row is SCHEDULED; a RETIRED row\'s ids must exist', () => {
  let root = world({ rows: dupRows('T15b + RQ1') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
  root = world({ files: { 'e2e/a.spec.ts': null }, rows: dupRows('T15b', 'RETIRED') });
  try {
    const res = checkEstate({ root, trackedFiles: [] });
    assert.ok(has(res, 'FC-19', 'canonical id "T15b"'));
    assert.ok(has(res, 'FC-19', 'only while the row is SCHEDULED'));
  } finally { clean(root); }
  root = world({ files: { 'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});\ntest('T15b - y', () => {});" }, rows: dupRows('T15b') });
  try { assert.deepEqual(nonFc24(checkEstate({ root, trackedFiles: [] })).errors, []); } finally { clean(root); }
});

test('FC-04: literal test.fail in e2e/canonical/** is banned', () => {
  for (const body of ["test.fail(true, 'x');", "test.describe.fail('d', () => {});"]) {
    const root = world({ files: { 'e2e/canonical/x.canonical.ts': body } });
    try { assert.ok(has(checkEstate({ root, trackedFiles: [] }), 'FC-04', 'test.fail'), body); } finally { clean(root); }
  }
});

test('K4: fails CLOSED when git ls-files fails in a checkout that has .git', () => {
  const root = world();
  try {
    fs.mkdirSync(path.join(root, '.git')); // a .git entry that is not a repository: ls-files exits non-zero
    const res = checkEstate({ root });
    assert.ok(has(res, 'K4', 'fails closed'));
  } finally { clean(root); }
  const noGit = world();
  try {
    const res = checkEstate({ root: noGit });
    assert.ok(res.info.some((l) => l.includes('tracked-artefact check (K4) skipped')));
    assert.ok(!has(res, 'K4'));
  } finally { clean(noGit); }
});

test('CLI: exits 0 on the real repo and 1 with FAIL lines on a broken root', () => {
  const ok = spawnSync('node', [SCRIPT, '--root', DEFAULT_ROOT], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /E2E ESTATE GUARD: PASS/);
  const root = world({ files: { 'e2e/zz-new.spec.ts': '' } });
  try {
    const bad = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /FAIL\[FC-17\].*zz-new/);
    assert.equal(spawnSync('node', [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
  } finally { clean(root); }
});

test('cycle 2 LOW: knownCanonicalIds accepts only id-shaped title tokens (a prose title is not a canonical id)', () => {
  const rows = (id) => [
    ['e2e/a.spec.ts', 'top-level', 'DELETE_DUP', id, 'covered', 'PR-3', String(ISSUE_2751_TOTAL), 'RETIRED'],
    ['e2e/b.spec.ts', 'top-level', 'MOVE_DOWN', 'apps/web/src/b.test.ts', 'component rule', 'PR-3', '0', 'SCHEDULED(PR-3)'],
  ];
  const canon = { 'e2e/canonical/x.canonical.ts': "test('T1 - x', () => {});\ntest('Smoke renders the page', () => {});\ntest('T15b - gated', () => {});" };
  // control: an id-shaped collected title is accepted
  let root = world({ rows: rows('T15b'), files: { ...canon, 'e2e/a.spec.ts': null } });
  try { assert.ok(!has(nonFc24(checkEstate({ root, trackedFiles: [] })), 'FC-19', 'canonical id'), 'id-shaped title T15b is known'); } finally { clean(root); }
  // mutation: a prose leading token ("Smoke") must NOT count as a canonical id
  root = world({ rows: rows('Smoke'), files: { ...canon, 'e2e/a.spec.ts': null } });
  try { assert.ok(has(nonFc24(checkEstate({ root, trackedFiles: [] })), 'FC-19', 'canonical id "Smoke"')); } finally { clean(root); }
  assert.match('T15b', CANONICAL_ID_SHAPE);
  assert.match('AG1', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('Smoke', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('T1_x', CANONICAL_ID_SHAPE);
  assert.doesNotMatch('harness', CANONICAL_ID_SHAPE);
});
