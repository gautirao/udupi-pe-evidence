/**
 * Issue #1838 — architecture baseline / ceiling guard, 6-layer edition (PR F).
 *
 * PR A (test-only) captured a single-file ceiling for EditListingForm.tsx.
 * PR B decomposed its state + hydration ownership into 3 new hook files.
 * PR C decomposed its save/submit COMMAND ownership into a 4th file
 * (useEditListingCommands.ts) and converts LocationStep/ReviewStep to a
 * {view, commands} prop contract (steps/stepContracts.ts).
 * PR D splits DescribeStep.tsx's own 955-LOC render block into 7 module-scope
 * section components under steps/describe/.
 * PR F (this update) closes out issue #1838's remaining scope:
 *   - useEditListingCommands.ts (the 559-LOC de-facto God controller PR C
 *     introduced) is DELETED, split by cohesive responsibility into:
 *       editListingSelectors.ts   — pure, React-free derived-gate selectors
 *       useDescribeStepCommands.ts — step-1 save workflow + describe wiring
 *       useMediaStepCommands.ts    — step-2 video-url + continue
 *       useLocationStepCommands.ts — step-3 confirm/unconfirm/locality/continue
 *       useBoundaryStepCommands.ts — step-4 (agri) continue/skip
 *       useReviewStepCommands.ts   — submit/edit-from-review/reset-title
 *     EditListingForm.tsx composes all six directly — NO aggregator hook
 *     re-bundles them (layer (g) below asserts this).
 *   - PhotosStep.tsx and BoundaryStep.tsx convert to the {view, commands}
 *     contract (layer (d) below extends the existing LocationStep/ReviewStep
 *     member-count checks to these two).
 *
 * This is NOT a "these numbers must never change" assertion — it is a
 * regression guard against ACCIDENTAL growth. When a later PR intentionally
 * lowers these numbers further, this file's ceilings must be lowered too
 * (never raised without a stated reason) as part of that PR.
 *
 * Baseline captured 2026-09-26 (PR C/D) against this worktree — see git
 * history for the PR C/D per-file numbers this file superseded.
 *
 * Baseline captured 2026-09-28 (PR F) against this worktree:
 *   EditListingForm.tsx: 314 LOC / 0 useState / 0 useRef / 0 useEffect /
 *     1 `const handleXxx =` (handleStepClick — see layer (g) justification
 *     below) / 0 `.mutate(`.
 *     LOC ceiling RAISED from 255 to 314: PR F's own explicit instruction is
 *     that EditListingForm composes the 6 split command-hook/selector
 *     modules directly rather than delegating to a re-bundling aggregator
 *     hook (which the issue explicitly forbids as "complexity merely moved
 *     one level down"). The parameter-object construction for 5 command
 *     hooks + 11 selector call sites that used to be one `useEditListingCommands(...)`
 *     call now lives here, plus requirement 7's investigation-outcome
 *     comment on the step-2 panel — this is the intended trade-off, not
 *     accidental growth, and useState/useRef/useEffect/`.mutate(` all stay
 *     at 0.
 *   editListingSelectors.ts: 198 LOC / 0 useState/useRef/useEffect/useCallback/
 *     useMemo (pure, React-free — no React import at all).
 *   useDescribeStepCommands.ts: 284 LOC / 0 useState/useRef/useEffect/
 *     useCallback/useMemo / 1 `.mutate(`.
 *   useMediaStepCommands.ts: 48 LOC / 1 `.mutate(`.
 *   useLocationStepCommands.ts: 65 LOC / 2 `.mutate(`.
 *   useBoundaryStepCommands.ts: 42 LOC / 1 `.mutate(`.
 *   useReviewStepCommands.ts: 70 LOC / 1 `.mutate(`.
 *   PhotosStep.tsx / BoundaryStep.tsx: converted to {view, commands}
 *     (PhotosStepProps/BoundaryStepProps — 2 top-level members each);
 *     0 `.mutate(` each (unchanged).
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
const EDIT_LISTING_SELECTORS_PATH = path.resolve(__dirname, '../editListingSelectors.ts');
const USE_DESCRIBE_STEP_COMMANDS_PATH = path.resolve(__dirname, '../useDescribeStepCommands.ts');
const USE_MEDIA_STEP_COMMANDS_PATH = path.resolve(__dirname, '../useMediaStepCommands.ts');
const USE_LOCATION_STEP_COMMANDS_PATH = path.resolve(__dirname, '../useLocationStepCommands.ts');
const USE_BOUNDARY_STEP_COMMANDS_PATH = path.resolve(__dirname, '../useBoundaryStepCommands.ts');
const USE_REVIEW_STEP_COMMANDS_PATH = path.resolve(__dirname, '../useReviewStepCommands.ts');
const SPLIT_COMMAND_FILE_PATHS = [
  EDIT_LISTING_SELECTORS_PATH,
  USE_DESCRIBE_STEP_COMMANDS_PATH,
  USE_MEDIA_STEP_COMMANDS_PATH,
  USE_LOCATION_STEP_COMMANDS_PATH,
  USE_BOUNDARY_STEP_COMMANDS_PATH,
  USE_REVIEW_STEP_COMMANDS_PATH,
];
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
 * still applicable here and not fixed as out-of-scope for PR C/F): a string
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

describe('EditListingForm.tsx — architecture baseline, layer (a): the component itself (Issue #1838 PR F)', () => {
  const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');

  it('does not exceed the recorded LOC ceiling (RAISED from 255 to 314 by PR F — see file header)', () => {
    expect(countLines(source)).toBeLessThanOrEqual(314);
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

describe('EditListingForm.tsx + PR-B hooks + the PR F split command files — architecture baseline, layer (b): conservation total (Issue #1838 PR F)', () => {
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
  const splitCommandSources = SPLIT_COMMAND_FILE_PATHS.map((p) => readFileSync(p, 'utf-8'));
  const sources = [
    editListingFormSource,
    useBaseFieldsSource,
    useEditListingUiStateSource,
    useListingHydrationSource,
    ...splitCommandSources,
  ];

  function totalHookCalls(pattern: RegExp): number {
    return sources.reduce((sum, source) => sum + countHookCalls(source, pattern), 0);
  }

  it('does not exceed the PR-A useState ceiling (state moved, not grown; the six PR F files add 0 combined)', () => {
    expect(totalHookCalls(USE_STATE_PATTERN)).toBeLessThanOrEqual(20);
  });

  it('does not exceed the PR-A useRef ceiling (state moved, not grown; the six PR F files add 0 combined)', () => {
    expect(totalHookCalls(USE_REF_PATTERN)).toBeLessThanOrEqual(1);
  });

  it('does not exceed the PR-A useEffect ceiling (state moved, not grown; the six PR F files add 0 combined)', () => {
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

describe('editListingSelectors.ts — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR F)', () => {
  const source = readFileSync(EDIT_LISTING_SELECTORS_PATH, 'utf-8');

  it('is entirely hook-free — pure, React-free selector functions only', () => {
    const total = [USE_STATE_PATTERN, USE_REF_PATTERN, USE_EFFECT_PATTERN, USE_CALLBACK_PATTERN, USE_MEMO_PATTERN]
      .reduce((sum, pattern) => sum + countHookCalls(source, pattern), 0);
    expect(total).toBeLessThanOrEqual(0);
  });

  it('does not import React at all (no `from \'react\'` import)', () => {
    expect(source).not.toMatch(/from ['"]react['"]/);
  });
});

describe.each([
  ['useDescribeStepCommands.ts', USE_DESCRIBE_STEP_COMMANDS_PATH],
  ['useMediaStepCommands.ts', USE_MEDIA_STEP_COMMANDS_PATH],
  ['useLocationStepCommands.ts', USE_LOCATION_STEP_COMMANDS_PATH],
  ['useBoundaryStepCommands.ts', USE_BOUNDARY_STEP_COMMANDS_PATH],
  ['useReviewStepCommands.ts', USE_REVIEW_STEP_COMMANDS_PATH],
])('%s — architecture baseline, layer (c): per-file ceiling (Issue #1838 PR F split of useEditListingCommands.ts)', (_name, filePath) => {
  const source = readFileSync(filePath as string, 'utf-8');

  it('does not exceed its useState/useRef/useEffect ceiling (all 0 — no raw React state)', () => {
    const total = [USE_STATE_PATTERN, USE_REF_PATTERN, USE_EFFECT_PATTERN]
      .reduce((sum, pattern) => sum + countHookCalls(source, pattern), 0);
    expect(total).toBeLessThanOrEqual(0);
  });

  it('does not use useCallback/useMemo — plain per-render closures only (preserved from useEditListingCommands.ts\'s no-memoization design decision)', () => {
    const total = [USE_CALLBACK_PATTERN, USE_MEMO_PATTERN]
      .reduce((sum, pattern) => sum + countHookCalls(source, pattern), 0);
    expect(total).toBeLessThanOrEqual(0);
  });
});

describe('Issue #1838 PR F — layer (d): commands ownership dimension', () => {
  it('EditListingForm.tsx declares at most 1 `const handleXxx =` handler (handleStepClick — the stepper click-gate is intentionally kept as a plain closure per the issue\'s own instruction not to extract a hook for 3 lines of glue; every OTHER handler moved to the split command-hook files)', () => {
    const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');
    expect(countHookCalls(source, HANDLE_CONST_PATTERN)).toBeLessThanOrEqual(1);
  });

  it('EditListingForm.tsx calls no `.mutate(` directly (all moved to the split command-hook files)', () => {
    const source = readFileSync(EDIT_LISTING_FORM_PATH, 'utf-8');
    expect(countHookCalls(source, MUTATE_CALL_PATTERN)).toBeLessThanOrEqual(0);
  });

  it('combined `.mutate(` count across EditListingForm.tsx + the 5 split command-hook files + the 4 step files stays conserved (was 6 total in useEditListingCommands.ts)', () => {
    const paths = [
      EDIT_LISTING_FORM_PATH,
      USE_DESCRIBE_STEP_COMMANDS_PATH,
      USE_MEDIA_STEP_COMMANDS_PATH,
      USE_LOCATION_STEP_COMMANDS_PATH,
      USE_BOUNDARY_STEP_COMMANDS_PATH,
      USE_REVIEW_STEP_COMMANDS_PATH,
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

  it('PhotosStepProps has exactly the {view, commands} 2 top-level members (Issue #1838 PR F conversion)', () => {
    const source = readFileSync(STEP_CONTRACTS_PATH, 'utf-8');
    expect(countTopLevelInterfaceMembers(source, 'PhotosStepProps')).toBeLessThanOrEqual(2);
  });

  it('BoundaryStepProps has exactly the {view, commands} 2 top-level members (Issue #1838 PR F conversion)', () => {
    const source = readFileSync(STEP_CONTRACTS_PATH, 'utf-8');
    expect(countTopLevelInterfaceMembers(source, 'BoundaryStepProps')).toBeLessThanOrEqual(2);
  });
});

describe('Issue #1838 PR F — layer (g): no re-bundling aggregator hook', () => {
  it('useEditListingCommands.ts no longer exists (deleted, split by cohesive responsibility)', () => {
    expect(() => readFileSync(path.resolve(__dirname, '../useEditListingCommands.ts'), 'utf-8'))
      .toThrow();
  });

  it('none of the 6 split files imports any of the other 5 (each is independently composed by EditListingForm.tsx, not by one another)', () => {
    const basenames = SPLIT_COMMAND_FILE_PATHS.map((p) => path.basename(p, path.extname(p)));
    for (const filePath of SPLIT_COMMAND_FILE_PATHS) {
      const source = readFileSync(filePath, 'utf-8');
      const ownName = path.basename(filePath, path.extname(filePath));
      for (const otherName of basenames) {
        if (otherName === ownName) continue;
        expect(source, `${ownName} must not import ${otherName}`).not.toMatch(
          new RegExp(`['"]\\./${otherName}['"]`),
        );
      }
    }
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
