#!/usr/bin/env node
/**
 * typecheck-baseline.mjs
 *
 * Runs `tsc -p tsconfig.app.json --noEmit`, parses the primary diagnostic
 * lines it emits, fingerprints each distinct (file, code, normalised
 * message) tuple, and compares the resulting set against a committed
 * baseline (typecheck-baseline.json) in apps/web.
 *
 * Modes (mutually exclusive — always invoke separately, never combined):
 *   (default)  GATE    — exit non-zero if any current fingerprint is not
 *                         present in the baseline (set-membership check).
 *                         Baseline fingerprints that are no longer produced
 *                         by the current run are NOT a failure (that is
 *                         progress — a bug was fixed). Run `--prune` in a
 *                         follow-up, separate invocation to remove them.
 *   --update           — add any new (out-of-baseline) fingerprints found in
 *                         the current run into the baseline file, write it
 *                         back sorted, and exit 0. Does not remove entries.
 *   --prune            — remove baseline fingerprints that are no longer
 *                         present in the current run, write the baseline
 *                         back sorted, and exit 0. Does not add entries.
 *
 * Rationale for keeping --update and --prune separate: combining "add new"
 * and "drop stale" into a single flag makes it easy to accidentally
 * silence a regression (new error added) while also masking that a fixed
 * error's baseline entry was dropped, in one unreviewable diff. Two flags
 * keep each baseline mutation an explicit, single-purpose, reviewable
 * change.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(REPO_ROOT, 'apps/web');
const BASELINE_PATH = path.join(APP_ROOT, 'typecheck-baseline.json');

// Matches a primary tsc diagnostic line, e.g.:
//   src/foo/Bar.ts(12,34): error TS2345: Argument of type 'X' is not assignable...
// Continuation lines (indented detail) and summary lines (e.g.
// "Found 31 errors in 10 files.", "TypeScript: N errors in M files",
// "Top codes:", or an rtk "[full output: ...]" trailer) never match this
// pattern because they either have no line/col prefix or no error code,
// so they are naturally skipped.
const PRIMARY_LINE_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Parse raw tsc --noEmit output into an array of primary diagnostics.
 * Continuation lines (indented, no "(line,col): error TSxxxx:" prefix) and
 * trailing summary lines are ignored.
 *
 * @param {string} rawOutput
 * @returns {Array<{ filePath: string, line: number, column: number, tsErrorCode: string, rawMessage: string }>}
 */
export function parseTscOutput(rawOutput) {
  const diagnostics = [];
  const lines = rawOutput.split(/\r?\n/);
  for (const line of lines) {
    const match = PRIMARY_LINE_RE.exec(line);
    if (!match) continue;
    const [, filePath, lineNo, colNo, tsErrorCode, rawMessage] = match;
    diagnostics.push({
      filePath,
      line: Number(lineNo),
      column: Number(colNo),
      tsErrorCode,
      rawMessage,
    });
  }
  return diagnostics;
}

/**
 * Relativise a file path emitted by tsc to the repo root, using forward
 * slashes so fingerprints are stable across platforms.
 *
 * @param {string} filePath
 * @param {string} [repoRoot]
 * @returns {string}
 */
export function relativiseFilePath(filePath, repoRoot = REPO_ROOT) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  return rel.split(path.sep).join('/');
}

// Matches absolute filesystem paths (unix or windows-style) so they can be
// stripped from a message body. Keeps everything else — including quoted
// type names — untouched.
const ABS_PATH_RE = /(\/[^\s'"]+|[A-Za-z]:\\[^\s'"]+)/g;

/**
 * Normalise a diagnostic message for fingerprinting: strip absolute
 * filesystem paths and collapse all whitespace runs to a single space.
 * Type names (including their quotes/apostrophes) are intentionally kept
 * verbatim so distinct type mismatches still produce distinct fingerprints.
 *
 * @param {string} message
 * @returns {string}
 */
export function normaliseMessage(message) {
  return message
    .replace(ABS_PATH_RE, (m) => {
      // Only strip things that look like real filesystem paths (contain a
      // path separator followed by more path-like segments), not stray
      // strings that merely start with '/'.
      return m.includes('/') || m.includes('\\') ? path.basename(m) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute the sha1 fingerprint for a diagnostic. Line/column are
 * deliberately excluded so the same logical error keeps a stable
 * fingerprint even if the code around it shifts.
 *
 * @param {string} relativeFilePath
 * @param {string} tsErrorCode
 * @param {string} normalisedMessage
 * @returns {string}
 */
export function computeFingerprint(relativeFilePath, tsErrorCode, normalisedMessage) {
  return createHash('sha1')
    .update(`${relativeFilePath} ${tsErrorCode} ${normalisedMessage}`)
    .digest('hex');
}

/**
 * Turn raw tsc output into a de-duplicated, sorted array of baseline
 * entries: { fingerprint, file, code, message }.
 *
 * @param {string} rawOutput
 * @param {string} [repoRoot]
 * @returns {Array<{ fingerprint: string, file: string, code: string, message: string }>}
 */
export function buildEntriesFromOutput(rawOutput, repoRoot = REPO_ROOT) {
  const diagnostics = parseTscOutput(rawOutput);
  const byFingerprint = new Map();
  for (const diag of diagnostics) {
    const file = relativiseFilePath(diag.filePath, repoRoot);
    const message = normaliseMessage(diag.rawMessage);
    const fingerprint = computeFingerprint(file, diag.tsErrorCode, message);
    if (!byFingerprint.has(fingerprint)) {
      byFingerprint.set(fingerprint, { fingerprint, file, code: diag.tsErrorCode, message });
    }
  }
  return sortEntries([...byFingerprint.values()]);
}

/**
 * Sort baseline entries deterministically: by file, then code, then
 * message, then fingerprint (as a final tiebreaker).
 *
 * @param {Array<{ fingerprint: string, file: string, code: string, message: string }>} entries
 */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0;
  });
}

/**
 * Load the baseline file. Returns an empty array if it does not exist.
 *
 * @param {string} [baselinePath]
 * @returns {Array<{ fingerprint: string, file: string, code: string, message: string }>}
 */
export function loadBaseline(baselinePath = BASELINE_PATH) {
  if (!existsSync(baselinePath)) return [];
  const raw = readFileSync(baselinePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.entries)) return parsed.entries;
  throw new Error(`Unrecognised baseline format at ${baselinePath}`);
}

/**
 * Write the baseline file, sorted, with a trailing newline.
 *
 * @param {Array<{ fingerprint: string, file: string, code: string, message: string }>} entries
 * @param {string} [baselinePath]
 */
export function writeBaseline(entries, baselinePath = BASELINE_PATH) {
  const sorted = sortEntries(entries);
  const payload = { entries: sorted };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return sorted;
}

/**
 * Compare the current run's entries against the baseline (set-membership
 * on fingerprint only).
 *
 * @param {Array<{ fingerprint: string, file: string, code: string, message: string }>} currentEntries
 * @param {Array<{ fingerprint: string, file: string, code: string, message: string }>} baselineEntries
 * @returns {{ pass: boolean, newEntries: Array, missingEntries: Array }}
 */
export function compareAgainstBaseline(currentEntries, baselineEntries) {
  const baselineSet = new Set(baselineEntries.map((e) => e.fingerprint));
  const currentSet = new Set(currentEntries.map((e) => e.fingerprint));
  const newEntries = currentEntries.filter((e) => !baselineSet.has(e.fingerprint));
  const missingEntries = baselineEntries.filter((e) => !currentSet.has(e.fingerprint));
  return { pass: newEntries.length === 0, newEntries, missingEntries };
}

/**
 * Run `tsc -p tsconfig.app.json --noEmit` and return its combined
 * stdout+stderr along with the process exit status. tsc's non-zero exit
 * code when type errors exist is expected and NOT treated as a failure of
 * this function — it is the normal, successful outcome of "run tsc and see
 * what it found". The caller (main()) is responsible for distinguishing
 * "non-zero exit because type errors were found" from "non-zero exit
 * because the compiler itself failed to run" via isBrokenCompilerRun().
 *
 * @param {string} [appRoot]
 * @returns {{ output: string, status: number | null }}
 */
export function runTsc(appRoot = APP_ROOT) {
  const result = spawnSync(
    'npx',
    ['tsc', '-p', 'tsconfig.app.json', '--noEmit'],
    { cwd: appRoot, encoding: 'utf8', shell: process.platform === 'win32' }
  );
  if (result.error) {
    throw result.error;
  }
  return {
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status,
  };
}

/**
 * Decide whether a tsc invocation should be treated as a broken compiler
 * run rather than either a clean pass or a normal "tsc found type errors"
 * run.
 *
 * `status === 0` is always a clean pass. `status === null` is treated as
 * success/not-broken: per Node's spawnSync docs, spawnSync sets `status`
 * to a number on every normal process exit, so `null` only occurs on an
 * abnormal termination path (killed by signal, spawn error) that is
 * already surfaced separately (runTsc throws on result.error); treating it
 * as "not broken" here keeps this helper's only job narrow — catching the
 * specific case of "tsc exited non-zero and produced nothing parseable".
 * A non-zero numeric status with zero parsed diagnostics means tsc exited
 * unhappily without producing anything this script can parse (bad
 * tsconfig, missing dependency, crash) — that is the broken case this
 * function exists to catch.
 *
 * @param {number | null} status
 * @param {number} parsedDiagnosticCount
 * @returns {boolean}
 */
export function isBrokenCompilerRun(status, parsedDiagnosticCount) {
  return status !== 0 && status !== null && parsedDiagnosticCount === 0;
}

function formatEntry(e) {
  return `  [${e.code}] ${e.file}: ${e.message}`;
}

function main() {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const prune = args.includes('--prune');

  if (update && prune) {
    console.error('typecheck-baseline: pass --update and --prune as separate invocations, not combined.');
    process.exit(1);
  }

  const { output: rawOutput, status } = runTsc();
  const currentEntries = buildEntriesFromOutput(rawOutput);

  if (isBrokenCompilerRun(status, currentEntries.length)) {
    console.error(rawOutput);
    console.error(`typecheck-baseline: tsc exited with status ${status} and produced zero parseable diagnostics — treating this as a broken compiler run (bad tsconfig, missing dependency, crash, etc.), not "zero type errors". Refusing to run gate/--update/--prune.`);
    process.exit(1);
  }

  const baselineEntries = loadBaseline();
  const { pass, newEntries, missingEntries } = compareAgainstBaseline(currentEntries, baselineEntries);

  if (update) {
    if (newEntries.length === 0) {
      console.log('typecheck-baseline: no new fingerprints to add. Baseline unchanged.');
      process.exit(0);
    }
    const merged = [...baselineEntries, ...newEntries];
    const written = writeBaseline(merged);
    console.log(`typecheck-baseline: added ${newEntries.length} new fingerprint(s). Baseline now has ${written.length} entries.`);
    newEntries.forEach((e) => console.log(formatEntry(e)));
    process.exit(0);
  }

  if (prune) {
    if (missingEntries.length === 0) {
      console.log('typecheck-baseline: no stale fingerprints to prune. Baseline unchanged.');
      process.exit(0);
    }
    const remaining = baselineEntries.filter(
      (b) => !missingEntries.some((m) => m.fingerprint === b.fingerprint)
    );
    const written = writeBaseline(remaining);
    console.log(`typecheck-baseline: pruned ${missingEntries.length} stale fingerprint(s). Baseline now has ${written.length} entries.`);
    missingEntries.forEach((e) => console.log(formatEntry(e)));
    process.exit(0);
  }

  // Default: gate mode.
  if (!pass) {
    console.error(`typecheck-baseline: FAIL — ${newEntries.length} new type error fingerprint(s) not in baseline:`);
    newEntries.forEach((e) => console.error(formatEntry(e)));
    console.error('\nIf these are pre-existing/expected, run `node scripts/typecheck-baseline.mjs --update` and commit the updated typecheck-baseline.json.');
    process.exit(1);
  }

  console.log(`typecheck-baseline: PASS — ${currentEntries.length} current fingerprint(s), all present in baseline (${baselineEntries.length} total).`);
  process.exit(0);
}

// Only run when invoked directly (not when imported for tests).
if (process.argv[1] === __filename) {
  main();
}
