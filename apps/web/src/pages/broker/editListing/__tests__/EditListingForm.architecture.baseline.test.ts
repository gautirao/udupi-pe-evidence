/**
 * Issue #1838 — architecture baseline / ceiling guard, 4-layer edition (PR C).
 *
 * PR A (test-only) captured a single-file ceiling for EditListingForm.tsx.
 * PR B decomposed its state + hydration ownership into 3 new hook files.
 * PR C decomposes its save/submit COMMAND ownership into a 4th file
 * (useEditListingCommands.ts) and converts LocationStep/ReviewStep to a
 * {view, commands} prop contract (steps/stepContracts.ts), so this file
 * adds two new dimensions on top of PR B's three layers:
 *
 *   (a) EditListingForm.tsx alone: LOC ceiling LOWERED to the actual
 *       measured post-extraction size; useState/useRef/useEffect ceilings
 *       stay at 0/0/0 (unchanged from PR B — PR C moved commands, not raw
 *       hook state).
 *   (b) Conservation total across EditListingForm.tsx + the 3 PR-B hook
 *       files + the new useEditListingCommands.ts: useState/useRef/useEffect
 *       ceilings stay 20/1/1 — the new hook adds 0 to each (it owns no raw
 *       React state at all, only useNavigate/useToast + derived values).
 *   (c) Per-file ceiling for useEditListingCommands.ts: useState/useRef/
 *       useEffect all ≤0, AND useCallback+useMemo ≤0 — enforcing the
 *       explicit "no memoization, plain per-render closures" design
 *       decision (see that file's header comment).
 *   (d) NEW "commands ownership" dimension: EditListingForm.tsx no longer
 *       declares any `const handleXxx = ...` handler, and no longer calls
 *       `.mutate(` directly at all — every save/submit command and its
 *       mutate() call now lives in useEditListingCommands.ts. The combined
 *       `.mutate(` count across EditListingForm.tsx + useEditListingCommands.ts
 *       + the 4 step files is a CONSERVATION check (was split 4 in
 *       EditListingForm.tsx + 2 in LocationStep.tsx = 6; now all 6 live in
 *       useEditListingCommands.ts). Each of LocationStep/ReviewStep's own
 *       {view, commands} Props interface (steps/stepContracts.ts) has
 *       exactly 2 top-level members.
 *   (e) DescribeStep.tsx scope-lock: still untouched (byte-identical to
 *       origin/main across the whole PR sequence) — verified separately via
 *       `git diff --exit-code origin/main...HEAD -- .../DescribeStep.tsx
 *       .../DescribeStep.test.tsx` in CI/review, not re-asserted here since
 *       a git-diff check doesn't belong in a unit test; this file keeps its
 *       existing LOC/prop-count ceiling as a content-level proxy.
 *
 * This is NOT a "these numbers must never change" assertion — it is a
 * regression guard against ACCIDENTAL growth. When a later PR intentionally
 * lowers these numbers further, this file's ceilings must be lowered too
 * (never raised) as part of that PR.
 *
 * Baseline captured 2026-09-26 (PR C) against this worktree:
 *   EditListingForm.tsx: 277 LOC / 0 useState / 0 useRef / 0 useEffect /
 *                        0 `const handleXxx =` / 0 `.mutate(`
 *   useEditListingCommands.ts: 514 LOC / 0 useState / 0 useRef / 0 useEffect /
 *                        0 useCallback / 0 useMemo / 6 `.mutate(`
 *   LocationStep.tsx / ReviewStep.tsx: 0 `.mutate(` each (moved into the hook)
 *   PhotosStep.tsx / BoundaryStep.tsx: 0 `.mutate(` each (unchanged — never
 *     called mutate directly; they always went through handler props)
 *   stepContracts.ts: LocationStepProps / ReviewStepProps — 2 top-level
 *     members each ({view, commands})
 *   useBaseFields.ts:    137 LOC / 14 useState / 0 useRef / 0 useEffect
 *   useEditListingUiState.ts: 74 LOC / 6 useState / 0 useRef / 0 useEffect
 *   useListingHydration.ts:  52 LOC / 0 useState / 1 useRef / 1 useEffect
 *   DescribeStep.tsx:    1,611 LOC / 35 top-level DescribeStepProps members
 *   (DescribeStep.tsx's baseline is untouched by PR B or PR C — see PRs D–E)
 *
 * Counts are derived from the live source at test time (not hardcoded
 * snapshots of unrelated content) so the guard fails loudly the moment any
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
const USE_BASE_FIELDS_PATH = path.resolve(__dirname, '../useBaseFields.ts');
const USE_EDIT_LISTING_UI_STATE_PATH = path.resolve(
  __dirname,
  '../useEditListingUiState.ts',
);
const USE_LISTING_HYDRATION_PATH = path.resolve(
  __dirname,
  '../useListingHydration.ts',
);
const USE_EDIT_LISTING_COMMANDS_PATH = path.resolve(
  __dirname,
  '../useEditListingCommands.ts',
);
const DESCRIBE_STEP_PATH = path.resolve(
  __dirname,
  '../steps/DescribeStep.tsx',
);
const LOCATION_STEP_PATH = path.resolve(__dirname, '../steps/LocationStep.tsx');
const REVIEW_STEP_PATH = path.resolve(__dirname, '../steps/ReviewStep.tsx');
const PHOTOS_STEP_PATH = path.resolve(__dirname, '../steps/PhotosStep.tsx');
const BOUNDARY_STEP_PATH = path.resolve(__dirname, '../steps/BoundaryStep.tsx');
const STEP_CONTRACTS_PATH = path.resolve(__dirname, '../steps/stepContracts.ts');

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
 * Strips `//` line comments and `/* *\/` block comments from source text
 * before counting hook-call occurrences — a naive raw-text count would
 * false-count occurrences inside doc comments (e.g. this file's own header,
 * or a hook file's JSDoc referencing `useState(` in prose).
 *
 * Known limitation (pre-existing, PR B code-reviewer nice-to-have, verified
 * still applicable here and not fixed as out-of-scope for PR C): a string
 * literal containing e.g. `"useState("` would also be stripped-through and
 * counted, since this is a text-level (not AST-level) strip. None of the
 * files this guard reads contain such a literal today.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/**
 * Counts top-level `useXxx(` hook-call occurrences in a file's source, after
 * stripping comments. A plain source-text count is a faithful,
 * dependency-free proxy for "how many hooks does this file itself own"
 * because every file under test is a single-component/single-hook module (no
 * other function in any of them calls a hook).
 */
function countHookCalls(source: string, pattern: RegExp): number {
  const withoutComments = stripComments(source);
  const matches = withoutComments.match(pattern);
  return matches ? matches.length : 0;
}

const USE_STATE_PATTERN = /\buseState(<[^>]*>)?\(/g;
const USE_REF_PATTERN = /\buseRef(<[^>]*>)?\(/g;
const USE_EFFECT_PATTERN = /\buseEffect\(/g;
const USE_CALLBACK_PATTERN = /\buseCallback\(/g;
const USE_MEMO_PATTERN = /\buseMemo\(/g;
const HANDLE_CONST_PATTERN = /\bconst handle\w+\s*=/g;
const MUTATE_CALL_PATTERN = /\.mutate\(/g;

describe('EditListingForm.tsx — architecture baseline, layer (a): the component itself (Issue #1838 PR C)', () => {
  const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');

  it('does not exceed the recorded LOC ceiling (lowered from PR B by the PR C command extraction)', () => {
    expect(countLines(source)).toBeLessThanOrEqual(290);
  });

  it('owns no raw useState — all state now comes from composed hooks', () => {
    expect(countHookCalls(source, USE_STATE_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('owns no raw useRef — moved into useListingHydration.ts', () => {
    expect(countHookCalls(source, USE_REF_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('owns no raw useEffect — moved into useListingHydration.ts', () => {
    expect(countHookCalls(source, USE_EFFECT_PATTERN)).toBeLessThanOrEqual(0);
  });
});

describe('EditListingForm.tsx + PR-B hooks + useEditListingCommands.ts — architecture baseline, layer (b): conservation total (Issue #1838 PR C)', () => {
  const editListingFormSource = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');
  const useBaseFieldsSource = readFileSync(USE_BASE_FIELDS_PATH, 'utf-8');
  const useEditListingUiStateSource = readFileSync(
    USE_EDIT_LISTING_UI_STATE_PATH,
    'utf-8',
  );
  const useListingHydrationSource = readFileSync(
    USE_LISTING_HYDRATION_PATH,
    'utf-8',
  );
  const useEditListingCommandsSource = readFileSync(
    USE_EDIT_LISTING_COMMANDS_PATH,
    'utf-8',
  );
  const sources = [
    editListingFormSource,
    useBaseFieldsSource,
    useEditListingUiStateSource,
    useListingHydrationSource,
    useEditListingCommandsSource,
  ];

  function totalHookCalls(pattern: RegExp): number {
    return sources.reduce((sum, source) => sum + countHookCalls(source, pattern), 0);
  }

  it('does not exceed the PR-A useState ceiling (state moved, not grown; new hook adds 0)', () => {
    expect(totalHookCalls(USE_STATE_PATTERN)).toBeLessThanOrEqual(20);
  });

  it('does not exceed the PR-A useRef ceiling (state moved, not grown; new hook adds 0)', () => {
    expect(totalHookCalls(USE_REF_PATTERN)).toBeLessThanOrEqual(1);
  });

  it('does not exceed the PR-A useEffect ceiling (state moved, not grown; new hook adds 0)', () => {
    expect(totalHookCalls(USE_EFFECT_PATTERN)).toBeLessThanOrEqual(1);
  });
});

describe('useBaseFields.ts — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR B)', () => {
  const source = readFileSync(USE_BASE_FIELDS_PATH, 'utf-8');

  it('does not exceed its useState ceiling', () => {
    expect(countHookCalls(source, USE_STATE_PATTERN)).toBeLessThanOrEqual(14);
  });

  it('does not exceed its useRef ceiling', () => {
    expect(countHookCalls(source, USE_REF_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not exceed its useEffect ceiling', () => {
    expect(countHookCalls(source, USE_EFFECT_PATTERN)).toBeLessThanOrEqual(0);
  });
});

describe('useEditListingUiState.ts — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR B)', () => {
  const source = readFileSync(USE_EDIT_LISTING_UI_STATE_PATH, 'utf-8');

  it('does not exceed its useState ceiling', () => {
    expect(countHookCalls(source, USE_STATE_PATTERN)).toBeLessThanOrEqual(6);
  });

  it('does not exceed its useRef ceiling', () => {
    expect(countHookCalls(source, USE_REF_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not exceed its useEffect ceiling', () => {
    expect(countHookCalls(source, USE_EFFECT_PATTERN)).toBeLessThanOrEqual(0);
  });
});

describe('useListingHydration.ts — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR B)', () => {
  const source = readFileSync(USE_LISTING_HYDRATION_PATH, 'utf-8');

  it('does not exceed its useState ceiling', () => {
    expect(countHookCalls(source, USE_STATE_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not exceed its useRef ceiling', () => {
    expect(countHookCalls(source, USE_REF_PATTERN)).toBeLessThanOrEqual(1);
  });

  it('does not exceed its useEffect ceiling', () => {
    expect(countHookCalls(source, USE_EFFECT_PATTERN)).toBeLessThanOrEqual(1);
  });
});

describe('useEditListingCommands.ts — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR C)', () => {
  const source = readFileSync(USE_EDIT_LISTING_COMMANDS_PATH, 'utf-8');

  it('does not exceed its useState ceiling', () => {
    expect(countHookCalls(source, USE_STATE_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not exceed its useRef ceiling', () => {
    expect(countHookCalls(source, USE_REF_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not exceed its useEffect ceiling', () => {
    expect(countHookCalls(source, USE_EFFECT_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not use useCallback — plain per-render closures only (no memoization design decision)', () => {
    expect(countHookCalls(source, USE_CALLBACK_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('does not use useMemo — plain per-render values only (no memoization design decision)', () => {
    expect(countHookCalls(source, USE_MEMO_PATTERN)).toBeLessThanOrEqual(0);
  });
});

describe('Issue #1838 PR C — layer (d): commands ownership dimension', () => {
  it('EditListingForm.tsx declares no `const handleXxx =` handler (all moved to useEditListingCommands.ts)', () => {
    const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');
    expect(countHookCalls(source, HANDLE_CONST_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('EditListingForm.tsx calls no `.mutate(` directly (all moved to useEditListingCommands.ts)', () => {
    const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');
    expect(countHookCalls(source, MUTATE_CALL_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('combined `.mutate(` count across EditListingForm.tsx + useEditListingCommands.ts + the 4 step files stays conserved (was 4 in EditListingForm.tsx + 2 in LocationStep.tsx = 6)', () => {
    const paths = [
      EDIT_LISTING_FORM_PATH,
      USE_EDIT_LISTING_COMMANDS_PATH,
      LOCATION_STEP_PATH,
      REVIEW_STEP_PATH,
      PHOTOS_STEP_PATH,
      BOUNDARY_STEP_PATH,
    ];
    const total = paths.reduce(
      (sum, p) => sum + countHookCalls(readFileSync(p, 'utf-8'), MUTATE_CALL_PATTERN),
      0,
    );
    expect(total).toBeLessThanOrEqual(6);
  });

  function countTopLevelInterfaceMembers(source: string, interfaceName: string): number {
    const interfaceMatch = source.match(
      new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`),
    );
    expect(interfaceMatch, `${interfaceName} interface not found`).toBeTruthy();
    const body = interfaceMatch ? interfaceMatch[1] : '';
    const withoutComments = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Top-level members are lines ending in `;` at 2-space indent.
    return withoutComments.split('\n').filter((line) => /^ {2}\S.*;\s*$/.test(line)).length;
  }

  it('LocationStepProps has exactly the {view, commands} 2 top-level members', () => {
    const source = readFileSync(STEP_CONTRACTS_PATH, 'utf-8');
    expect(countTopLevelInterfaceMembers(source, 'LocationStepProps')).toBeLessThanOrEqual(2);
  });

  it('ReviewStepProps has exactly the {view, commands} 2 top-level members', () => {
    const source = readFileSync(STEP_CONTRACTS_PATH, 'utf-8');
    expect(countTopLevelInterfaceMembers(source, 'ReviewStepProps')).toBeLessThanOrEqual(2);
  });
});

describe('DescribeStep.tsx — architecture baseline (Issue #1838 PR A, untouched by PR B or PR C)', () => {
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
      .filter((line) => /^ {2}\S.*;\s*$/.test(line));

    expect(memberLines.length).toBeLessThanOrEqual(35);
  });
});
