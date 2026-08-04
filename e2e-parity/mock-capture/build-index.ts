/**
 * globalTeardown for playwright.mock-capture.config.ts (issue #2076 Amendment-1, AC12).
 *
 * Aggregates every per-capture JSON metadata file written by
 * support/capture-runner.ts::runCapture (one per successful capture, under
 * docs/audit/issue-2076/mock-audit/metadata/*.json) into a single human-readable index —
 * docs/audit/issue-2076/mock-audit/index.md — plus a machine-readable
 * docs/audit/issue-2076/mock-audit/index.json.
 *
 * Reads only what runCapture actually wrote; it does not re-derive or guess at anything. If a
 * state in MOCK_STATES never produced a metadata file (the test for it failed or was skipped for
 * this run's project selection), it is listed as NOT CAPTURED THIS RUN rather than silently
 * omitted — a reader must be able to tell a real capture apart from one that simply didn't run.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_STATES } from './support/manifest-states';
import type { CaptureRecord } from './support/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../../docs/audit/issue-2076/mock-audit');
const METADATA_DIR = path.join(OUTPUT_DIR, 'metadata');

function loadRecord(id: string): CaptureRecord | null {
  const p = path.join(METADATA_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as CaptureRecord;
}

function renderMarkdownRow(record: CaptureRecord | null, id: string, manifestStateId: string, aStates: string[]): string {
  if (!record) {
    return `| ${id} | ${manifestStateId} | ${aStates.join(', ') || '—'} | NOT CAPTURED THIS RUN | — | — | — |`;
  }
  const verificationSummary = record.verifications
    .map((v) => `${v.kind}${v.recordOnly ? ' (recorded)' : ''}=${JSON.stringify(v.observed)}`)
    .join('; ');
  return (
    `| ${record.id} | ${record.manifestStateId} | ${record.aStates.join(', ') || '—'} | ` +
    `${record.hash} | ${record.viewport} (${record.observedViewport.width}x${record.observedViewport.height}) | ` +
    `${verificationSummary} | ${record.screenshotPath} |`
  );
}

export default async function globalTeardown(): Promise<void> {
  const rows = MOCK_STATES.map((state) => {
    const record = loadRecord(state.id);
    return { state, record };
  });

  const indexJson = {
    generatedAt: new Date().toISOString(),
    issue: 2076,
    ac: 'AC12',
    captures: rows.map(({ state, record }) => ({
      id: state.id,
      manifestStateId: state.manifestStateId,
      aStates: state.aStates,
      capturedThisRun: record !== null,
      record,
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(indexJson, null, 2));

  const capturedCount = rows.filter((r) => r.record !== null).length;
  const md = [
    '# Mock-capture index — issue #2076 Amendment-1 AC12',
    '',
    `Generated ${new Date().toISOString()}. ${capturedCount}/${rows.length} states captured in the most recent harness run.`,
    '',
    'This index is built from the JSON metadata files under `metadata/` by `build-index.ts` ' +
      '(a Playwright globalTeardown) — it is not hand-authored. A "NOT CAPTURED THIS RUN" row means ' +
      'the harness was invoked without that state selected (e.g. a single-project run), or that ' +
      'state\'s capture failed and threw before writing metadata — never a silent omission.',
    '',
    '| capture id | manifest state id | A-state(s) | hash | viewport | verification (method=observed) | screenshot |',
    '|---|---|---|---|---|---|---|',
    ...rows.map(({ state, record }) => renderMarkdownRow(record, state.id, state.manifestStateId, state.aStates)),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.md'), md);

  // eslint-disable-next-line no-console
  console.log(`[build-index] wrote index.md and index.json (${capturedCount}/${rows.length} captured this run)`);
}
