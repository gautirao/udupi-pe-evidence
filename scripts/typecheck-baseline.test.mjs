// Tests for scripts/typecheck-baseline.mjs.
//
// Uses node's built-in test runner so this suite runs without any
// vitest/vite config changes (vitest config is out of scope for this
// slice):
//
//   node --test scripts/typecheck-baseline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTscOutput,
  normaliseMessage,
  computeFingerprint,
  buildEntriesFromOutput,
  compareAgainstBaseline,
  sortEntries,
  isBrokenCompilerRun,
} from './typecheck-baseline.mjs';

const SAMPLE_OUTPUT = `src/hooks/usePropertyListings.ts(440,18): error TS2339: Property 'area_key' does not exist on type 'SelectQueryError<"column 'area_key' does not exist on 'property_listings'.">'.
src/hooks/usePropertyListings.ts(441,27): error TS2339: Property 'area_key' does not exist on type 'SelectQueryError<"column 'area_key' does not exist on 'property_listings'.">'.
src/lib/discoverMappers.ts(108,5): error TS2322: Type 'string' is not assignable to type '"dealer" | "broker" | "owner" | "builder"'.
  Types of property 'seller_type' are incompatible.
    Type 'string' is not assignable to type '"dealer" | "broker" | "owner" | "builder"'.
Found 3 errors in 2 files.
`;

test('parseTscOutput: extracts only primary diagnostic lines', () => {
  const diagnostics = parseTscOutput(SAMPLE_OUTPUT);
  assert.equal(diagnostics.length, 3);
  assert.equal(diagnostics[0].filePath, 'src/hooks/usePropertyListings.ts');
  assert.equal(diagnostics[0].line, 440);
  assert.equal(diagnostics[0].column, 18);
  assert.equal(diagnostics[0].tsErrorCode, 'TS2339');
});

test('parseTscOutput: excludes indented continuation lines', () => {
  const diagnostics = parseTscOutput(SAMPLE_OUTPUT);
  // "Types of property 'seller_type' are incompatible." must NOT appear as
  // its own diagnostic — only the discoverMappers.ts primary line should.
  const messages = diagnostics.map((d) => d.rawMessage);
  assert.ok(!messages.some((m) => m.includes('are incompatible')));
});

test('parseTscOutput: excludes trailing summary lines', () => {
  const diagnostics = parseTscOutput(SAMPLE_OUTPUT);
  assert.ok(!diagnostics.some((d) => d.rawMessage.includes('Found 3 errors')));
});

test('parseTscOutput: excludes rtk-style summary/trailer lines', () => {
  const rtkStyleOutput = `${SAMPLE_OUTPUT}TypeScript: 3 errors in 2 files
Top codes: TS2339 (2), TS2322 (1)
[full output: /tmp/rtk-typecheck-abc123.log]
`;
  const diagnostics = parseTscOutput(rtkStyleOutput);
  assert.equal(diagnostics.length, 3);
});

test('normaliseMessage: collapses whitespace but keeps type names/quotes', () => {
  const raw = "Type   'string'  is  not\nassignable to type '\"dealer\" | \"broker\"'.";
  const normalised = normaliseMessage(raw);
  assert.equal(normalised, "Type 'string' is not assignable to type '\"dealer\" | \"broker\"'.");
});

test('normaliseMessage: strips absolute filesystem paths', () => {
  const raw = "Cannot find module '/Users/dev/project/src/lib/foo.ts' or its type declarations.";
  const normalised = normaliseMessage(raw);
  assert.ok(!normalised.includes('/Users/dev/project'));
  assert.ok(normalised.includes('foo.ts'));
});

test('computeFingerprint: excludes line/column, is deterministic', () => {
  const fp1 = computeFingerprint('src/foo.ts', 'TS2339', "Property 'x' does not exist.");
  const fp2 = computeFingerprint('src/foo.ts', 'TS2339', "Property 'x' does not exist.");
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 40); // sha1 hex digest length
});

test('buildEntriesFromOutput: dedups same file+code+message into one fingerprint', () => {
  // Two raw diagnostics in SAMPLE_OUTPUT share file+code+message (only
  // line/column differ) — they must collapse to a single entry.
  const entries = buildEntriesFromOutput(SAMPLE_OUTPUT, '/repo');
  const areaKeyEntries = entries.filter((e) => e.message.includes("'area_key'"));
  assert.equal(areaKeyEntries.length, 1);
  assert.equal(entries.length, 2); // area_key entry + discoverMappers.ts entry
});

test('compareAgainstBaseline: PASS when current fingerprints are a subset of baseline', () => {
  const baseline = [
    { fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' },
    { fingerprint: 'b', file: 'y.ts', code: 'TS2', message: 'm2' },
  ];
  const current = [{ fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' }];
  const result = compareAgainstBaseline(current, baseline);
  assert.equal(result.pass, true);
  assert.equal(result.newEntries.length, 0);
});

test('compareAgainstBaseline: FAIL when current has a fingerprint absent from baseline', () => {
  const baseline = [{ fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' }];
  const current = [
    { fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' },
    { fingerprint: 'z', file: 'new.ts', code: 'TS9', message: 'new error' },
  ];
  const result = compareAgainstBaseline(current, baseline);
  assert.equal(result.pass, false);
  assert.equal(result.newEntries.length, 1);
  assert.equal(result.newEntries[0].fingerprint, 'z');
});

test('compareAgainstBaseline: a fixed/absent baseline fingerprint still PASSes', () => {
  // Baseline has two entries; current run only reproduces one (the other
  // bug was fixed). This must still PASS — missing entries are not a
  // gate failure, only new/unseen entries are.
  const baseline = [
    { fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' },
    { fingerprint: 'b', file: 'y.ts', code: 'TS2', message: 'm2' },
  ];
  const current = [{ fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' }];
  const result = compareAgainstBaseline(current, baseline);
  assert.equal(result.pass, true);
  assert.equal(result.missingEntries.length, 1);
  assert.equal(result.missingEntries[0].fingerprint, 'b');
});

test('--prune semantics: missingEntries identifies exactly the stale baseline fingerprint', () => {
  const baseline = [
    { fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' },
    { fingerprint: 'stale', file: 'gone.ts', code: 'TS9', message: 'fixed already' },
  ];
  const current = [{ fingerprint: 'a', file: 'x.ts', code: 'TS1', message: 'm1' }];
  const { missingEntries } = compareAgainstBaseline(current, baseline);
  const pruned = baseline.filter((b) => !missingEntries.some((m) => m.fingerprint === b.fingerprint));
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].fingerprint, 'a');
});

test('sortEntries: stable, deterministic ordering by file then code then message', () => {
  const unsorted = [
    { fingerprint: 'z', file: 'b.ts', code: 'TS2', message: 'm2' },
    { fingerprint: 'a', file: 'a.ts', code: 'TS9', message: 'm1' },
    { fingerprint: 'y', file: 'a.ts', code: 'TS1', message: 'm1' },
  ];
  const sorted = sortEntries(unsorted);
  assert.deepEqual(
    sorted.map((e) => `${e.file}|${e.code}`),
    ['a.ts|TS1', 'a.ts|TS9', 'b.ts|TS2']
  );
});

test('sortEntries: repeated calls on the same input produce identical output (stability)', () => {
  const entries = [
    { fingerprint: 'b', file: 'a.ts', code: 'TS1', message: 'm2' },
    { fingerprint: 'a', file: 'a.ts', code: 'TS1', message: 'm1' },
  ];
  const first = JSON.stringify(sortEntries(entries));
  const second = JSON.stringify(sortEntries(sortEntries(entries)));
  assert.equal(first, second);
});

test('isBrokenCompilerRun: status 0 with zero parsed diagnostics is NOT broken (normal clean pass)', () => {
  assert.equal(isBrokenCompilerRun(0, 0), false);
});

test('isBrokenCompilerRun: non-zero status WITH parsed diagnostics is NOT broken (normal tsc-found-errors path)', () => {
  assert.equal(isBrokenCompilerRun(2, 5), false);
});

test('isBrokenCompilerRun: non-zero status with zero parsed diagnostics IS broken (hard-fail path)', () => {
  assert.equal(isBrokenCompilerRun(1, 0), true);
});

test('isBrokenCompilerRun: null status is treated as success/not-broken, even with zero diagnostics', () => {
  assert.equal(isBrokenCompilerRun(null, 0), false);
});

test('isBrokenCompilerRun: null status with parsed diagnostics is NOT broken', () => {
  assert.equal(isBrokenCompilerRun(null, 3), false);
});
