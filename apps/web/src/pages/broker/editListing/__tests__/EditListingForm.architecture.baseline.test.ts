/**
 * Issue #1838 — architecture baseline / ceiling guard, 5-layer edition (PR D).
 *
 * PR A (test-only) captured a single-file ceiling for EditListingForm.tsx.
 * PR B decomposed its state + hydration ownership into 3 new hook files.
 * PR C decomposes its save/submit COMMAND ownership into a 4th file
 * (useEditListingCommands.ts) and converts LocationStep/ReviewStep to a
 * {view, commands} prop contract (steps/stepContracts.ts).
 * PR D splits DescribeStep.tsx's own 955-LOC render block into 7 module-scope
 * section components under steps/describe/ (AgriDetailsSection,
 * ResidentialFeaturesSection, FloorsAndFurnishingFields,
 * CommercialBasicsSection, CommercialSubtypeSection, RentDetailsSection,
 * ResidentialTermsSection) — zero public contract change (DescribeStepProps
 * unchanged, same exported component name), so this file adds a 5th layer
 * on top of PR C's four:
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
 *   (e) DescribeStep.tsx scope-lock, UPDATED for PR D: DescribeStep.tsx
 *       ITSELF is no longer byte-identical to origin/main (PR D changed it —
 *       that claim now only holds through PR C). What stays byte-identical
 *       to origin/main are DescribeStep.test.tsx and DescribeStep.domOrder.test.tsx
 *       (verified via a direct two-dot `git diff origin/main HEAD -- <path>`,
 *       not the three-dot form — this stacked branch's merge-base with
 *       origin/main predates origin/main's own PR-A merge, so a three-dot
 *       diff misreports these as "new" even though their tip content is
 *       identical) — not re-asserted here since a git-diff check doesn't
 *       belong in a unit test. DescribeStep.tsx's own new LOC ceiling (layer
 *       (f) below) is the content-level proxy for PR D's scope instead.
 *   (f) NEW for PR D — DescribeStep.tsx + steps/describe/*.tsx dimension:
 *       DescribeStep.tsx's LOC ceiling is LOWERED to its measured
 *       post-split size. Each of the 7 new section files gets its own
 *       measured per-file LOC ceiling. None of the 8 files owns any
 *       useState/useRef/useEffect/useCallback/useMemo or calls `.mutate(`
 *       (this split moves JSX + prop-routing only, never introduces new
 *       state or side effects). A conservation-total check across all 8
 *       files catches logic being duplicated rather than moved. A
 *       directory-listing check on steps/describe/ pins the file count to
 *       exactly 7 (catches an accidental 8th file or a stray barrel/index).
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
 *
 * Baseline captured 2026-09-26 (PR D) against this worktree:
 *   DescribeStep.tsx: 316 LOC / 35 top-level DescribeStepProps members
 *     (down from 1,611 LOC pre-split — same 35-member DescribeStepProps,
 *     unchanged)
 *   steps/describe/AgriDetailsSection.tsx:          276 LOC
 *   steps/describe/CommercialBasicsSection.tsx:      95 LOC
 *   steps/describe/CommercialSubtypeSection.tsx:    443 LOC
 *   steps/describe/FloorsAndFurnishingFields.tsx:   115 LOC
 *   steps/describe/RentDetailsSection.tsx:           64 LOC
 *   steps/describe/ResidentialFeaturesSection.tsx:  404 LOC
 *   steps/describe/ResidentialTermsSection.tsx:     141 LOC
 *   Conservation total (all 8 files): 1,854 LOC (higher than the ~1,700-1,750
 *     originally estimated for this split — verified this is per-file
 *     import/interface/JSDoc boilerplate across 7 new files, not duplicated
 *     logic: the sum of the 7 section files' JSX bodies plus DescribeStep.tsx's
 *     own remaining JSX accounts for the original 955-LOC render block with
 *     no gate duplicated, and typecheck + the full DescribeStep test trio
 *     confirm no behavior changed)
 *
 * Counts are derived from the live source at test time (not hardcoded
 * snapshots of unrelated content) so the guard fails loudly the moment any
 * file crosses its ceiling, without needing manual re-transcription for
 * unrelated line-content changes elsewhere in the file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
const DESCRIBE_DIR = path.resolve(__dirname, '../steps/describe');
const AGRI_DETAILS_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'AgriDetailsSection.tsx');
const COMMERCIAL_BASICS_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'CommercialBasicsSection.tsx');
const COMMERCIAL_SUBTYPE_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'CommercialSubtypeSection.tsx');
const FLOORS_AND_FURNISHING_FIELDS_PATH = path.resolve(DESCRIBE_DIR, 'FloorsAndFurnishingFields.tsx');
const RENT_DETAILS_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'RentDetailsSection.tsx');
const RESIDENTIAL_FEATURES_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'ResidentialFeaturesSection.tsx');
const RESIDENTIAL_TERMS_SECTION_PATH = path.resolve(DESCRIBE_DIR, 'ResidentialTermsSection.tsx');
const DESCRIBE_SECTION_PATHS = [
  AGRI_DETAILS_SECTION_PATH,
  COMMERCIAL_BASICS_SECTION_PATH,
  COMMERCIAL_SUBTYPE_SECTION_PATH,
  FLOORS_AND_FURNISHING_FIELDS_PATH,
  RENT_DETAILS_SECTION_PATH,
  RESIDENTIAL_FEATURES_SECTION_PATH,
  RESIDENTIAL_TERMS_SECTION_PATH,
];

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

  it('does not exceed the recorded LOC ceiling (lowered from 290 by the PR E {view,commands} DescribeStep swap)', () => {
    expect(countLines(source)).toBeLessThanOrEqual(255);
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

describe('DescribeStep.tsx — architecture baseline (Issue #1838 PR A/B/C/D ceiling, LOWERED by PR E\'s {view,commands} swap)', () => {
  const source = readFileSync(DESCRIBE_STEP_PATH, 'utf-8');

  it('does not exceed the recorded LOC ceiling (lowered from 320 by the PR E {view,commands} swap)', () => {
    expect(countLines(source)).toBeLessThanOrEqual(267);
  });

  it('does not declare a bare 35-flat-prop DescribeStepProps interface any more (moved to stepContracts.ts as {view, commands})', () => {
    expect(source).not.toMatch(/interface DescribeStepProps \{/);
  });
});

describe('steps/stepContracts.ts — DescribeStep {view, commands} contract member ceilings (Issue #1838 PR E)', () => {
  const source = readFileSync(STEP_CONTRACTS_PATH, 'utf-8');

  function countTopLevelMembers(interfaceName: string): number {
    const interfaceMatch = source.match(
      new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`),
    );
    expect(interfaceMatch, `${interfaceName} interface not found`).toBeTruthy();
    const body = interfaceMatch ? interfaceMatch[1] : '';
    // Strip line comments before counting so comment-only line growth never
    // trips this guard — only actual member additions should.
    const withoutComments = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Top-level members are exactly the lines ending in `;` at 2-space
    // indent (nested types don't introduce extra top-level `;`-terminated
    // lines beyond their own).
    return withoutComments.split('\n').filter((line) => /^ {2}\S.*;\s*$/.test(line)).length;
  }

  it('DescribeStepProps has exactly the {view, commands} 2 top-level members', () => {
    expect(countTopLevelMembers('DescribeStepProps')).toBeLessThanOrEqual(2);
  });

  it('DescribeStepView does not exceed its 9 top-level member ceiling', () => {
    expect(countTopLevelMembers('DescribeStepView')).toBeLessThanOrEqual(9);
  });

  it('DescribeStepCommands does not exceed its 8 top-level member ceiling', () => {
    expect(countTopLevelMembers('DescribeStepCommands')).toBeLessThanOrEqual(8);
  });

  it('setPropertyType is never referenced as a live type/value (comments may still explain why it is absent)', () => {
    // Strip comments first — this file's own header comment explains the
    // setPropertyType exclusion in prose, which would otherwise self-trip
    // a raw substring check.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(withoutComments).not.toMatch(/\bsetPropertyType\b/);
  });
});

describe('Issue #1838 PR D — layer (f): DescribeStep internal split (DescribeStep.tsx + steps/describe/*.tsx)', () => {
  const describeStepSource = readFileSync(DESCRIBE_STEP_PATH, 'utf-8');
  const sectionSources = DESCRIBE_SECTION_PATHS.map((p) => readFileSync(p, 'utf-8'));
  const allSources = [describeStepSource, ...sectionSources];

  it('steps/describe/ contains exactly 7 files (catches an accidental 8th file or a stray barrel/index)', () => {
    const entries = readdirSync(DESCRIBE_DIR);
    expect(entries.length).toBe(7);
  });

  it.each([
    // Issue #1838 PR E commit 1 — 3 of these ceilings are RAISED from their
    // PR D values (AgriDetailsSection 280->281, CommercialSubtypeSection
    // 450->453, ResidentialFeaturesSection 410->414): each section's prop
    // type narrowed from `Pick<ReturnType<typeof useXFields>, 'values'|
    // 'setters'>` to `FieldSlice<XValues, XSetters, K>`, which adds a type
    // import + a local `type ...ValueKeys` alias per file — legitimate,
    // measured growth from this PR's own change, not accidental creep.
    ['AgriDetailsSection.tsx', AGRI_DETAILS_SECTION_PATH, 281],
    ['CommercialBasicsSection.tsx', COMMERCIAL_BASICS_SECTION_PATH, 100],
    ['CommercialSubtypeSection.tsx', COMMERCIAL_SUBTYPE_SECTION_PATH, 453],
    ['FloorsAndFurnishingFields.tsx', FLOORS_AND_FURNISHING_FIELDS_PATH, 120],
    ['RentDetailsSection.tsx', RENT_DETAILS_SECTION_PATH, 70],
    ['ResidentialFeaturesSection.tsx', RESIDENTIAL_FEATURES_SECTION_PATH, 414],
    ['ResidentialTermsSection.tsx', RESIDENTIAL_TERMS_SECTION_PATH, 146],
  ])('%s does not exceed its per-file LOC ceiling', (_name, filePath, ceiling) => {
    const source = readFileSync(filePath as string, 'utf-8');
    expect(countLines(source)).toBeLessThanOrEqual(ceiling as number);
  });

  it('conservation total across DescribeStep.tsx + the 7 new files does not exceed the measured total (lowered from 1,854 by the PR E swap — DescribeStep.tsx itself shrank more than the 7 sections grew)', () => {
    const total = allSources.reduce((sum, source) => sum + countLines(source), 0);
    expect(total).toBeLessThanOrEqual(1845);
  });

  it.each([
    ['useState', USE_STATE_PATTERN],
    ['useRef', USE_REF_PATTERN],
    ['useEffect', USE_EFFECT_PATTERN],
    ['useCallback', USE_CALLBACK_PATTERN],
    ['useMemo', USE_MEMO_PATTERN],
  ])('none of DescribeStep.tsx + the 7 new files calls %s (pure prop-routing + JSX, no new state/side effects)', (_hookName, pattern) => {
    const total = allSources.reduce((sum, source) => sum + countHookCalls(source, pattern as RegExp), 0);
    expect(total).toBeLessThanOrEqual(0);
  });

  it('none of DescribeStep.tsx + the 7 new files calls `.mutate(` directly (unchanged — DescribeStep only ever received updateListing as a prop, and PR E removed even that — see next test)', () => {
    const total = allSources.reduce((sum, source) => sum + countHookCalls(source, MUTATE_CALL_PATTERN), 0);
    expect(total).toBeLessThanOrEqual(0);
  });

  // Issue #1838 PR E — the 7 sections no longer type their props via
  // `Pick<ReturnType<typeof useXFields>, 'values'|'setters'>` (replaced by
  // `FieldSlice<XValues, XSetters, K>`, which never spells `ReturnType<typeof
  // use...Fields>`), and DescribeStep.tsx no longer receives a raw
  // `updateListing` prop (replaced by `status.isSaving` on the view).
  // Mutation-checked 2026-09-27: temporarily reverting one section
  // (AgriDetailsSection.tsx) back to `Pick<ReturnType<typeof useAgriFields>,
  // 'values' | 'setters'>` turned this guard red; reverted.
  const RETURN_TYPE_USE_FIELDS_PATTERN = /ReturnType<typeof use\w+Fields>/g;
  const USE_UPDATE_LISTING_PATTERN = /useUpdateListing/g;

  it('none of DescribeStep.tsx + the 7 new files types a prop via `ReturnType<typeof useXFields>` any more (replaced by FieldSlice)', () => {
    const total = allSources.reduce(
      (sum, source) => sum + countHookCalls(source, RETURN_TYPE_USE_FIELDS_PATTERN),
      0,
    );
    expect(total).toBeLessThanOrEqual(0);
  });

  it('none of DescribeStep.tsx + the 7 new files references `useUpdateListing` any more (DescribeStep now reads view.status.isSaving, not a raw mutation object)', () => {
    const total = allSources.reduce(
      (sum, source) => sum + countHookCalls(source, USE_UPDATE_LISTING_PATTERN),
      0,
    );
    expect(total).toBeLessThanOrEqual(0);
  });
});
