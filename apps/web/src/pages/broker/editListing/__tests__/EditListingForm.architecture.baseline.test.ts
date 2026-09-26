/**
 * Issue #1838 (PR A — characterization tests, zero production changes).
 *
 * Architecture baseline / ceiling guard for the two files slated for
 * clean-architecture decomposition in PRs B–E: EditListingForm.tsx and
 * DescribeStep.tsx.
 *
 * This is NOT a "these numbers must never change" assertion — it is a
 * regression guard against ACCIDENTAL growth while PR A (test-only) and any
 * other in-flight work lands. Later PRs (B, C, D, E) will perform the actual
 * decomposition and are EXPECTED to lower these numbers — when they do, this
 * file's ceilings must be lowered too (never raised) as part of that PR, so
 * the guard keeps tracking the current high-water mark rather than silently
 * going stale.
 *
 * Baseline captured 2026-09-26 against origin/main @ 46b6261a:
 *   EditListingForm.tsx: 730 LOC / 20 useState / 1 useRef / 1 useEffect
 *   DescribeStep.tsx:    1,611 LOC / 35 top-level DescribeStepProps members
 *
 * Counts are derived from the live source at test time (not hardcoded
 * snapshots of unrelated content) so the guard fails loudly the moment either
 * file crosses its ceiling, without needing manual re-transcription for
 * unrelated line-content changes elsewhere in the file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const EDIT_LISTING_FORM_PATH = path.resolve(
  __dirname,
  '../EditListingForm.tsx',
);
const DESCRIBE_STEP_PATH = path.resolve(
  __dirname,
  '../steps/DescribeStep.tsx',
);

function countLines(source: string): number {
  // A trailing newline (the normal end-of-file state) produces one extra
  // empty element from split('\n') that isn't a real line — drop it so this
  // matches `wc -l` / editor line-count conventions.
  const lines = source.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

/**
 * Counts top-level `useXxx(` hook-call occurrences in the component BODY
 * only (i.e. inside the exported component function), not inside any nested
 * hook/helper file — both files under test declare their hooks with a
 * `const [x, setX] = useState(...)` / `const ref = useRef(...)` /
 * `useEffect(() => {...`. A plain source-text count is a faithful,
 * dependency-free proxy for "how many hooks does this component itself own"
 * because both files are single-component modules (no other function in
 * either file calls a hook).
 */
function countOccurrences(source: string, pattern: RegExp): number {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

describe('EditListingForm.tsx — architecture baseline (Issue #1838 PR A)', () => {
  const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');

  it('does not exceed the recorded LOC ceiling', () => {
    expect(countLines(source)).toBeLessThanOrEqual(730);
  });

  it('does not exceed the recorded useState ceiling', () => {
    // Matches `useState(` and `useState<...>(` — covers both untyped and
    // explicitly-generic calls (e.g. `useState<number | null>(null)`).
    expect(countOccurrences(source, /\buseState(<[^>]*>)?\(/g)).toBeLessThanOrEqual(20);
  });

  it('does not exceed the recorded useRef ceiling', () => {
    expect(countOccurrences(source, /\buseRef(<[^>]*>)?\(/g)).toBeLessThanOrEqual(1);
  });

  it('does not exceed the recorded useEffect ceiling', () => {
    expect(countOccurrences(source, /\buseEffect\(/g)).toBeLessThanOrEqual(1);
  });
});

describe('DescribeStep.tsx — architecture baseline (Issue #1838 PR A)', () => {
  const source = readFileSync(DESCRIBE_STEP_PATH, 'utf-8');

  it('does not exceed the recorded LOC ceiling', () => {
    expect(countLines(source)).toBeLessThanOrEqual(1611);
  });

  it('does not exceed the recorded DescribeStepProps top-level member ceiling', () => {
    const interfaceMatch = source.match(
      /interface DescribeStepProps \{([\s\S]*?)\n\}/,
    );
    expect(interfaceMatch, 'DescribeStepProps interface not found').toBeTruthy();
    const body = interfaceMatch ? interfaceMatch[1] : '';

    // Strip line comments before counting so comment-only line growth (e.g.
    // clarifying a footgun, as several props already do) never trips this
    // guard — only actual member additions should.
    const withoutComments = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');

    // Top-level members are exactly the lines ending in `;` at 2-space
    // indent (nested types like the `fieldVisible` function signature don't
    // introduce extra top-level `;`-terminated lines beyond their own).
    const memberLines = withoutComments
      .split('\n')
      .filter((line) => /^  \S.*;\s*$/.test(line));

    expect(memberLines.length).toBeLessThanOrEqual(35);
  });
});
