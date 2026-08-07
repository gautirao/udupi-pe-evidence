/**
 * Static enforcement sweep — Issue #1956 PR 1 (FE-3, item 3).
 *
 * Real, falsifying checks over the SOURCE TEXT of the modules PR 1 introduces.
 * Salvaged from the `issue-1956-pr-b-frontend-areas-journey` worktree's sweep of
 * the same name and audited ASSERTION BY ASSERTION against what actually exists
 * on this branch. What was dropped, and why, is recorded at the bottom of this
 * comment — a sweep whose scope you cannot reconstruct is a sweep nobody trusts.
 *
 * ── SCOPE ──
 * The sweep targets the modules that DID NOT EXIST before #1956 PR 1. It
 * deliberately does NOT assert anything about the legacy Areas code path
 * (`DiscoverRightPanel`'s legacy branches, `macroRegionResolver.ts`). Those
 * files are KEPT by design; an assertion that any of them is absent would be
 * wrong here, and none is made.
 *
 * UPDATE (Issue #1956 PR 6, final cutover, Step 3) — `AreaGroupsLandingPanel`,
 * `AreaGroupResultsPanel`, and `AreaGroupSelectedPanel` are no longer "kept by
 * design": they are DELETED at cutover. See the "the legacy Areas panels are
 * permanently deleted" describe block below (AC6.3) for the permanence guard
 * that replaces the old "kept" framing for exactly these three files.
 *
 * ── DROPPED FROM THE SALVAGE (each with its reason) ──
 *  • Every entry in the salvaged module list for a file PR 1 does not have:
 *    `useAreasNavigationJourney.ts`, `AreasBreadcrumbTrail.tsx`,
 *    `NavigationLevelPanel.tsx`, `NavigationChildList.tsx`,
 *    `NavigationChildCard.tsx`, `NavigationResolutionNotice.tsx`,
 *    `DiscoverAreasJourneyPanel.tsx`. PR 1 ships NO new UI, so a sweep over
 *    them would throw on `readFileSync`, not fail meaningfully.
 *  • The OQ5(b) "flat-fallback never renders a breadcrumb trail" block — its
 *    only target is `DiscoverAreasJourneyPanel.tsx` (absent).
 *  • The M2 "`node=` is mutated in exactly one module" block, INCLUDING its
 *    positive control asserting `state/url/navigation.ts` exports
 *    `clearNodeParam` and performs `.set('node')`/`.delete('node')`. PR 1's
 *    navigation domain is deliberately READ-ONLY and has no writer at all, so
 *    the positive control is false here. The stronger PR-1 fact — that NOTHING
 *    writes `areasPreview` anywhere in `src/` — is already owned by
 *    `state/url/__tests__/navigation.test.ts` and is not duplicated here.
 *  • The B2 "MapDiscovery.tsx wires entry item 2" block (`navigationNode`,
 *    `onSelectNavigationAncestor`, `buildNodeHref`, `navigationScopedAreaKeys`)
 *    — none of those props exists in PR 1.
 *  • The fix-cycle-2 `boundAreaKeysForRequest` / `convergeAreaSearch` blocks —
 *    neither helper exists in PR 1.
 *  • The salvage's "never reads node.depth" assertion applied to modules OTHER
 *    than `nodeLevelKind.ts`: `navigationModel.ts` legitimately reads `depth` as
 *    VALIDATOR INPUT (invariant #14 is a statement ABOUT depth). The assertion
 *    is kept where it is true and load-bearing — on `nodeLevelKind.ts`, the one
 *    module that must never branch level KIND on depth.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAV_DIR = path.join(HERE, '..');
// Issue #1956 PR 6 Step 1 (9660e549) deleted src/features/discover/preview/
// (areasPreviewCapability.ts + its test) outright — the preview-capability +
// areasPreview dual gate is fully retired at cutover, not merely unmounted.
// There is nothing left under that directory to sweep, and `fs.readdirSync`
// on a directory that no longer exists throws ENOENT, so the preview sweep
// target is removed rather than pointed at a path that can't be scanned.
const URL_DOMAIN_DIR = path.join(HERE, '..', '..', 'state', 'url');
const HOOKS_DIR = path.join(HERE, '..', '..', '..', '..', 'hooks');
const SRC_ROOT = path.resolve(HERE, '..', '..', '..', '..');

/**
 * Strips block and line comments before any assertion. Every module here has
 * extensive doc comments that MENTION the very identifiers being swept for
 * (explaining why they are absent from the code), so matching raw source would
 * fail against prose rather than against code.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function read(file: string): string {
  return stripComments(fs.readFileSync(file, 'utf8'));
}

/**
 * The pure navigation/preview modules under sweep. These own no URLs, no camera,
 * no labels of their own — every sweep below is scoped to them.
 *
 * ── CHANGED IN PR 2: DISCOVERED, NOT HARDCODED ──
 * PR 1 declared this as a hardcoded 8-item allowlist pinned by
 * `expect(...length).toBe(8)`. That made the sweep BLIND BY CONSTRUCTION to every
 * module added afterwards: a new navigation module was simply not in the array,
 * so "no new module calls the camera" silently meant "none of these eight does",
 * which was already true and stayed true no matter what was added. PR 2 adds
 * modules to exactly this directory — including, in a later pass, a journey hook
 * that DOES publish a camera intent — so the allowlist form would have let the
 * one file the sweep most needs to police walk straight past it.
 *
 * The list is therefore now a DIRECTORY WALK with an EXPLICIT EXEMPTION SET. A
 * new file is swept by default; excluding one is a deliberate, named, reasoned
 * act recorded below rather than an omission nobody notices.
 */

/**
 * Modules inside the swept directories that are deliberately NOT held to the
 * "pure module" rules, each with the reason it is legitimately different.
 * Adding an entry here is a review-visible decision; forgetting to add a file to
 * a list is not. Keep this set as small as the truth allows.
 */
const SWEEP_EXEMPTIONS: Record<string, string> = {
  // Issue #1956 PR 2 (Slice 3) — useAreasNavigationJourney.ts is the resolved
  // navigation node's ONE source (city-root/Direction/Local-Destination/AREA),
  // and its `node.nodeKey`/`node.bounds` are what seed the exactly-one-fit-per
  // -selection camera transition in useDiscoverCameraOrchestration.ts (AC3.10,
  // T2). The actual `setPanToArea(` call site lives in that camera hook, not
  // here, precisely so the fetch/derive concern and the one-shot camera-ref
  // guard concern (which already owns prevGroupIdRef/prevScopeRef alongside
  // this new node guard) are not duplicated across two modules — but this
  // hook is the seam the camera fit is keyed on, so it is exempted from the
  // "no new module calls the camera" sweep by name here rather than left to
  // be discovered as a false failure later.
  'navigation/useAreasNavigationJourney.ts':
    'Seeds the camera-orchestration fit-once transition via node/bounds; the actual setPanToArea call lives in useDiscoverCameraOrchestration.ts, not here.',
};

function listSweptModules(dir: string, label: string): { file: string; source: string }[] {
  return fs
    .readdirSync(dir)
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .filter((entry) => fs.statSync(path.join(dir, entry)).isFile())
    .map((entry) => `${label}/${entry}`)
    .filter((file) => !(file in SWEEP_EXEMPTIONS))
    .sort()
    .map((file) => ({ file, source: read(path.join(dir, path.basename(file))) }));
}

const PURE_NAV_MODULES: { file: string; source: string }[] = [
  ...listSweptModules(NAV_DIR, 'navigation'),
];

it('the swept module list is discovered from disk and non-vacuous', () => {
  // A floor, not an equality: an equality assertion here is precisely what made
  // PR 1's version unable to see new files. The floor still catches a walk that
  // breaks and silently returns nothing.
  expect(PURE_NAV_MODULES.length).toBeGreaterThanOrEqual(8);
  for (const { file, source } of PURE_NAV_MODULES) {
    expect(source.trim().length, `${file} is empty after comment stripping`).toBeGreaterThan(0);
  }
});

it('the sweep actually covers the modules PR 1 and PR 2 introduced', () => {
  const files = PURE_NAV_MODULES.map((m) => m.file);
  for (const required of [
    'navigation/types.ts',
    'navigation/nodeLevelKind.ts',
    'navigation/navigationModel.ts',
    'navigation/nearbyAreaArithmetic.ts',
    'navigation/journeyVisibility.ts',
    'navigation/areasDestination.ts',
    'navigation/visibleMemberSet.ts',
    'navigation/normalize.ts',
  ]) {
    expect(files, `${required} fell out of the sweep`).toContain(required);
  }
});

it('every exemption names a file that really exists (exemptions cannot rot)', () => {
  for (const [file, reason] of Object.entries(SWEEP_EXEMPTIONS)) {
    // Issue #1956 PR 6 — every exemption key sweeps `navigation/`; the
    // `preview/` sweep target was removed above (its directory is deleted).
    const base = path.basename(file);
    expect(fs.existsSync(path.join(NAV_DIR, base)), `exempted ${file} no longer exists`).toBe(true);
    expect(reason.length, `exemption for ${file} has no stated reason`).toBeGreaterThan(20);
  }
});

describe('static sweep — the new modules never build a hierarchy URL', () => {
  it.each(PURE_NAV_MODULES)('$file never builds a `/discover?...` template string', ({ source }) => {
    expect(source).not.toMatch(/\/discover\?/);
    expect(source).not.toMatch(/[`'"]&?(scope|groupId|region|areaKey)=/);
  });
});

describe('static sweep — no fixed "city"|"region"|"group"|"area" slot literal', () => {
  // The exact literal-key pattern the legacy four-slot breadcrumb array in
  // useDiscoverMapPresentation.ts uses. That legacy array is DELIBERATELY KEPT
  // (it is the pre-node fallback path) and is NOT swept — only the new modules
  // are, which must never mint fixed slot keys: the new key is the real,
  // server-supplied, arbitrary nodeKey.
  it.each(PURE_NAV_MODULES)('$file has no hardcoded 4-slot key literal', ({ source }) => {
    expect(source).not.toMatch(/key:\s*'city'/);
    expect(source).not.toMatch(/key:\s*'region'/);
    expect(source).not.toMatch(/key:\s*'group'/);
    expect(source).not.toMatch(/key:\s*'area'/);
  });
});

describe('static sweep — no label->slug inference in the new modules', () => {
  it.each(PURE_NAV_MODULES)(
    "$file never references prettifyZoneSlug/areaKeyToLabel — labels come from the server's displayLabel only",
    ({ source }) => {
      expect(source).not.toMatch(/prettifyZoneSlug|areaKeyToLabel/);
    },
  );
});

describe('static sweep — no camera call from any new module', () => {
  // PR 1 adds no camera publisher, so unlike the salvage there is no exempt
  // module: NONE of these may move the map. Anchored on an INVOCATION
  // (`identifier(`) rather than the bare identifier so a future type/prop
  // passthrough naming a producer cannot false-fail this.
  it.each(PURE_NAV_MODULES)('$file triggers NO camera call', ({ source }) => {
    expect(source).not.toMatch(
      /\bfitBounds\(|\bflyTo\(|\bsetPanToArea\(|\bsetCameraIntent\(|\bpublishCameraIntent\(|\bpublishClusterCameraIntent\(/,
    );
  });
});

describe('static sweep — no href ASSEMBLED in the new modules', () => {
  // Deliberately "no href assembled here" (template literal or concatenation),
  // not "no href present" — carrying an injected href value through is
  // legitimate; minting one is not.
  it.each(PURE_NAV_MODULES)(
    '$file never assembles an href via template literal or string concatenation',
    ({ source }) => {
      expect(source).not.toMatch(/href\s*[:=]\s*`/);
      expect(source).not.toMatch(/href\s*[:=][^;,)\n]*\+\s*['"`]/);
    },
  );
});

describe('static sweep — depth-genericity (the one level switch)', () => {
  it('nodeLevelKind.ts decides on nextLevelType alone — never on depth, city, or child count', () => {
    const source = read(path.join(NAV_DIR, 'nodeLevelKind.ts'));
    expect(source).not.toMatch(/node\.depth/);
    expect(source).not.toMatch(/\bcity\s*[=:]/); // a `city` param/variable, not the English word
    expect(source).not.toMatch(/children\.length/);
    // Positive control: the switch really is driven by nextLevelType, so the
    // negatives above are not vacuously true of an empty file.
    expect(source).toMatch(/switch \(node\.nextLevelType\)/);
  });

  it('nextLevelType is BRANCHED ON by exactly one module', () => {
    // CHANGED IN PR 2. This previously asserted the set of modules MENTIONING
    // `nextLevelType` was exactly {nodeLevelKind.ts, types.ts} (types.ts merely
    // declares it). PR 2 adds `normalize.ts`, which must name the field to map
    // its absent-key wire form to `null` — a pure DATA passthrough, not a level
    // decision. Mentioning the field and BRANCHING on it are different things,
    // and only the second is what this assertion was ever protecting.
    //
    // The assertion is therefore re-scoped to the branch, not the mention: the
    // set of modules containing a `switch`/`if` ON `nextLevelType` is still
    // exactly one. That is strictly stronger than the mention-set version, which
    // would have passed for a module that read the field and branched on it as
    // long as it happened to be one of the two named files.
    const branchers = PURE_NAV_MODULES.filter(({ source }) =>
      /(switch\s*\(|if\s*\()[^)]*nextLevelType/.test(source),
    ).map(({ file }) => file);
    expect(branchers).toEqual(['navigation/nodeLevelKind.ts']);

    // The mention set is still pinned, just no longer as a closed literal — every
    // module naming the field must be one of the three legitimate roles:
    // declaring it (types.ts), normalising it (normalize.ts), or switching on it.
    const mentioners = PURE_NAV_MODULES.filter(({ source }) => /nextLevelType/.test(source))
      .map(({ file }) => file)
      .sort();
    expect(mentioners).toEqual([
      'navigation/nodeLevelKind.ts',
      'navigation/normalize.ts',
      'navigation/types.ts',
    ]);
  });
});

describe('static sweep — the Areas preview capability is fully retired (PR 6 cutover)', () => {
  const productionFiles = walkTypeScript(SRC_ROOT).filter((f) => !/\.test\.tsx?$/.test(f));

  it('the file walk found a realistic number of modules (guards against a vacuous sweep)', () => {
    expect(productionFiles.length).toBeGreaterThan(100);
  });

  it('no production module reads VITE_DISCOVER_AREAS_PREVIEW — the deployment capability read was deleted at cutover', () => {
    const readers = productionFiles
      .filter((file) => read(file).includes('VITE_DISCOVER_AREAS_PREVIEW'))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(readers).toEqual([]);
  });

  it('no production module reads the areasPreview param — the URL flag was deleted at cutover', () => {
    const readers = productionFiles
      .filter((file) => /(get|has)\(\s*['"]areasPreview['"]\s*\)/.test(read(file)))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(readers).toEqual([]);
  });
});

describe('static sweep — the frontend NEVER constructs a node key', () => {
  // Node keys come only from the server (`.../areas/{areaKey}/navigation-path`).
  // The formula happens to be `"a:" + areaKey`; hardcoding it client-side is the
  // exact antipattern that produced the macroRegionResolver problem. Matches
  // CONSTRUCTION only (concatenation or interpolation onto the `a:` prefix) —
  // a literal fixture key like `'a:bangalore|whitefield'` is data, not a
  // construction site, and test files are excluded for the same reason.
  //
  // ── WIDENED IN PR 2 ──
  // PR 1's patterns required a BACKTICK IMMEDIATELY BEFORE the prefix
  // (/`a:\$\{/), so they only ever caught a template literal that STARTS with
  // the prefix. Three forms a producer would reach for naturally all slipped
  // through, on exactly the files this sweep exists to police:
  //   • `/discover?city=${c}&node=a:${areaKey}`  — prefix mid-template
  //   • AREA_PREFIX + areaKey                     — via a named constant
  //   • 'a:'.concat(areaKey)                      — concat instead of +
  // All three are now caught, and the `d:` DIRECTION prefix (#1956 D1, which did
  // not exist when PR 1's list was written) is swept alongside `a:` and `c:`.
  // The prefix set is derived from the backend's own NavigationKeys.java.
  const KEY_PREFIXES = ['a', 'c', 'd'];

  const CONSTRUCTION_PATTERNS: RegExp[] = [
    // 'a:' + something   /   something + 'a:'   /   'a:'.concat(...)
    ...KEY_PREFIXES.flatMap((p) => [
      new RegExp(`(['"\`])${p}:\\1\\s*\\+`),
      new RegExp(`\\+\\s*(['"\`])${p}:\\1`),
      new RegExp(`(['"\`])${p}:\\1\\s*\\.concat\\(`),
    ]),
    // `a:${...}` at the START of a template literal.
    ...KEY_PREFIXES.map((p) => new RegExp('`' + p + ':\\$\\{')),
    // ...and the same prefix in URL-PARAM POSITION anywhere inside a template —
    // `/discover?city=${c}&node=a:${areaKey}`. Anchored on a `=`/`&`/`?`
    // immediately before the prefix rather than accepting it after any character:
    // a bare `[^`]*d:${` false-positives on ordinary CSS and query strings that
    // merely END in the prefix letter (`background:${c}`, `loc:${x}`), and a
    // sweep that cries wolf on the icon builders is a sweep people switch off.
    ...KEY_PREFIXES.map((p) => new RegExp('`[^`]*[=&?]' + p + ':\\$\\{')),
    // A named constant standing in for the prefix, then concatenated.
    /\b[A-Z_]*(NODE|AREA|CLUSTER|DIRECTION)_?(KEY_)?PREFIX\b\s*\+/,
    /\+\s*\b[A-Z_]*(NODE|AREA|CLUSTER|DIRECTION)_?(KEY_)?PREFIX\b/,
  ];

  function constructsKey(source: string): boolean {
    return CONSTRUCTION_PATTERNS.some((pattern) => pattern.test(source));
  }

  it('POSITIVE CONTROL — the patterns really do trip on key construction', () => {
    // Without this, every negative assertion below is unfalsifiable: a typo in a
    // pattern would make the sweep pass forever while catching nothing. These
    // fixtures are the exact forms PR 1's narrower patterns let through.
    const OFFENDING_FIXTURES = [
      "const key = 'a:' + areaKey;",
      "const key = 'd:' + regionSlug;",
      'const key = `a:${areaKey}`;',
      'const href = `/discover?city=${city}&node=a:${areaKey}`;',
      'const href = `/discover?city=${city}&node=d:${regionSlug}`;',
      "const key = 'a:'.concat(areaKey);",
      "const AREA_KEY_PREFIX = 'a:'; const key = AREA_KEY_PREFIX + areaKey;",
      "const key = prefix + CLUSTER_PREFIX;",
    ];
    for (const fixture of OFFENDING_FIXTURES) {
      expect(constructsKey(fixture), `pattern set failed to catch: ${fixture}`).toBe(true);
    }

    // NEGATIVE CONTROL — legitimate code must not trip it, or the sweep becomes
    // noise everyone learns to route around.
    const INNOCENT_FIXTURES = [
      "const key = node.nodeKey;", //           consuming a server key
      "expect(state.node).toBe('a:IN|KA|X');", // a literal fixture is data
      "const label = `${node.displayLabel}`;", // ordinary interpolation
      "if (key.startsWith('a:')) return true;", // RECOGNISING a prefix is not minting one
      // Real code in this repo that a naïve `[^`]*d:${` pattern false-positived
      // on — CSS and cache keys that merely END in a prefix letter before a
      // colon. Pinned here so the anchoring can never be loosened back.
      'const html = `<div style="background:${discColour}">`;',
      'const dedupeKey = `loc:${dup.locality}_${dup.property_type}`;',
      'const css = `border-radius:${r}px`;',
    ];
    for (const fixture of INNOCENT_FIXTURES) {
      expect(constructsKey(fixture), `pattern set false-positived on: ${fixture}`).toBe(false);
    }
  });

  it('no production module concatenates or interpolates a node-key prefix', () => {
    const offenders: string[] = [];
    for (const file of walkTypeScript(SRC_ROOT)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      if (constructsKey(read(file))) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the URL navigation domain constructs no node key, though it may build an href from one', () => {
    // RE-SCOPED IN PR 2, deliberately — not deleted.
    //
    // This previously asserted `!/export function (build|make|to)Node(Key|Href)/`,
    // a SUBSTRING match that conflated two different things under one regex. PR 2
    // adds `buildNodeHrefFromParams`, an href builder that CONSUMES a
    // server-supplied key and never mints one; the old assertion would go red on
    // it purely because "buildNodeHref" contains the matched substring.
    //
    // The assertion's real intent was always "no key CONSTRUCTION here". That
    // intent is preserved and made exact below: a key BUILDER
    // (`buildNodeKey`/`makeNodeKey`/`toNodeKey`) is still forbidden, and the
    // module is additionally run through the same CONSTRUCTION_PATTERNS every
    // other production file is — which is a stronger guarantee than the name
    // check ever gave, since it catches construction under any function name.
    const source = read(path.join(URL_DOMAIN_DIR, 'navigation.ts'));
    expect(source).not.toMatch(/export function (build|make|to)NodeKey\b/);
    expect(constructsKey(source), 'the navigation URL domain must never mint a node key').toBe(
      false,
    );
    // Positive control: the module really is non-trivial and really does handle
    // node keys, so the negatives above are not vacuously true of an empty file.
    expect(source).toMatch(/isWritableNodeKey/);
  });

  it('the counts hook takes a node key as INPUT and never derives one', () => {
    const source = read(path.join(HOOKS_DIR, 'useDiscoverNavigationCounts.ts'));
    expect(source).toMatch(/nodeKey: string \| null/);
    for (const pattern of CONSTRUCTION_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});

describe('static sweep — no production module truncates node.children with .slice( (Issue #2086 durable guard)', () => {
  // #2086 deleted MAX_DIRECTION_DESTINATIONS/MAX_LOCAL_DESTINATIONS and the
  // `.slice(0, cap)` truncation that used them — the server now guarantees
  // <=15 children per node fail-closed, so a client-side cap can only ever
  // hide a valid destination. This sweep is the durable guard that stops the
  // cap being silently reintroduced: no production module may call `.slice(`
  // on a node's `children` array (however it is spelled — `node.children`,
  // a destructured `children`, or an intermediate `ordered`/`sorted` alias).
  const CHILDREN_SLICE_PATTERNS: RegExp[] = [
    // node.children.slice(...) / child.children.slice(...) — any `.children`
    // member access immediately followed by `.slice(`.
    /\.children\s*\.slice\(/,
    // A locally-sorted/ordered copy of children, still keyed by name, e.g.
    // `const ordered = [...node.children].sort(...)` followed later by
    // `ordered.slice(0, cap)` — caught via the exact identifiers this PR's
    // own `useAreasNavigationJourney.ts` uses for the untruncated copy.
    /\bordered\.slice\(/,
  ];

  function truncatesChildren(source: string): boolean {
    return CHILDREN_SLICE_PATTERNS.some((pattern) => pattern.test(source));
  }

  it('POSITIVE CONTROL — the pattern really does trip on a children-truncation call', () => {
    const OFFENDING_FIXTURES = [
      'const capped = node.children.slice(0, MAX_DIRECTION_DESTINATIONS);',
      'const capped = child.children.slice(0, 6);',
      'const ordered = [...node.children].sort((a, b) => a.displayOrder - b.displayOrder);\nreturn ordered.slice(0, cap);',
    ];
    for (const fixture of OFFENDING_FIXTURES) {
      expect(truncatesChildren(fixture), `pattern failed to catch: ${fixture}`).toBe(true);
    }

    // NEGATIVE CONTROL — legitimate, non-truncating uses of `.slice(` must
    // not trip the sweep, or it becomes noise everyone routes around.
    const INNOCENT_FIXTURES = [
      // The real, current, untruncated PR-2086 code: a full array COPY via
      // spread, never a `.slice(` call, and no cap argument follows.
      'const ordered = [...node.children].sort((a, b) => a.displayOrder - b.displayOrder);',
      // An unrelated string slice.
      "const short = label.slice(0, 20);",
      // Slicing something that is not a children array at all.
      'const page = results.slice(offset, offset + pageSize);',
    ];
    for (const fixture of INNOCENT_FIXTURES) {
      expect(truncatesChildren(fixture), `pattern false-positived on: ${fixture}`).toBe(false);
    }
  });

  it('no production module truncates node.children with .slice(', () => {
    const offenders: string[] = [];
    for (const file of walkTypeScript(SRC_ROOT)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      if (truncatesChildren(read(file))) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('static sweep — the legacy Areas panels are permanently deleted (Issue #1956 PR 6, AC6.3)', () => {
  // Issue #1956 PR 6 (final cutover, Step 3) — these three panels (and their
  // dedicated test files) are deleted outright, not merely unmounted. This
  // guard exists so they cannot be silently resurrected — e.g. by a bad
  // revert, a stray cherry-pick, or a future contributor re-adding the file
  // without realising it was a deliberate retirement — without a red test
  // naming exactly which file came back.
  const DELETED_PANEL_FILES = [
    'src/components/discover/panels/AreaGroupsLandingPanel.tsx',
    'src/components/discover/panels/AreaGroupResultsPanel.tsx',
    'src/components/discover/panels/AreaGroupSelectedPanel.tsx',
    'src/components/discover/panels/__tests__/AreaGroupsLandingPanel.test.tsx',
    'src/components/discover/panels/__tests__/AreaGroupResultsPanel.test.tsx',
    'src/components/discover/panels/__tests__/AreaGroupSelectedPanel.test.tsx',
    'src/components/discover/panels/__tests__/AreaGroupSelectedPanel.shownOfTotal.test.tsx',
    'src/components/discover/__tests__/groupedCardAreaNames.test.tsx',
  ];

  it.each(DELETED_PANEL_FILES)('%s does not exist on disk', (relativePath) => {
    expect(fs.existsSync(path.join(SRC_ROOT, relativePath))).toBe(false);
  });

  it('no production module imports AreaGroupsLandingPanel, AreaGroupResultsPanel, or AreaGroupSelectedPanel', () => {
    const offenders: string[] = [];
    for (const file of walkTypeScript(SRC_ROOT)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      if (/\bAreaGroup(sLanding|Results|Selected)Panel\b/.test(read(file))) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('static sweep — issue #2088 (commit 4/7, BR7): clusterFocus is excluded from KEY_PREFIXES and every hierarchy-request builder', () => {
  // V-a (issue-2088 orchestrator variance) — the engineer satisfied BR7 only
  // STRUCTURALLY (clusterFocus.ts lives in state/url/, outside NAV_DIR, so
  // it never even enters this file's own PURE_NAV_MODULES walk). The
  // committed BR7 test case requires EXTENDING this sweep with an actual
  // positive AND negative control: clusterFocus is not in the node-key
  // KEY_PREFIXES vocabulary above, and no hierarchy-request builder ever
  // emits it onto a request URL. Both assertions are proven over REAL
  // production source text (not the pure-module walk, since clusterFocus.ts
  // is deliberately outside it), read fresh here rather than relying on the
  // "the sweep actually covers..." list above (that list is scoped to
  // NAV_DIR only, by design).
  const clusterFocusSource = read(path.join(URL_DOMAIN_DIR, 'clusterFocus.ts'));
  const navigationSource = read(path.join(URL_DOMAIN_DIR, 'navigation.ts'));
  const journeyHookSource = read(path.join(NAV_DIR, 'useAreasNavigationJourney.ts'));
  const countsHookSource = read(path.join(HOOKS_DIR, 'useDiscoverNavigationCounts.ts'));

  it('POSITIVE CONTROL — clusterFocus really is a DISTINCT param name from the node-key KEY_PREFIXES vocabulary (`a`/`c`/`d`/`root`), so the negative below is not vacuously true', () => {
    // clusterFocus.ts declares its own param constant, never one of the
    // prefixed node-key forms this sweep's KEY_PREFIXES section polices.
    expect(clusterFocusSource).toMatch(/CLUSTER_FOCUS_PARAM\s*=\s*'clusterFocus'/);
    expect(['a', 'c', 'd']).not.toContain('clusterFocus');
  });

  it('clusterFocus is never listed as one of the hierarchy node-key prefixes (KEY_PREFIXES) anywhere in the URL navigation domain', () => {
    // The KEY_PREFIXES array (declared in the describe block above, over
    // NAV_DIR only) is the authority for what a `node=` value's prefix may
    // be; `navigation.ts`'s own NODE_KEY_PREFIXED_SHAPE regex is the second,
    // load-bearing copy of that same vocabulary (`root|[acd]:`). That regex
    // line itself may never grow a `clusterFocus` alternative — that would
    // mean a clusterFocus value could be silently accepted and WRITTEN as
    // `node=`, exactly the BR1 violation this binding requirement exists to
    // prevent. (navigation.ts legitimately MENTIONS `clusterFocus` elsewhere
    // — it imports `clearClusterFocusParam` to DELETE the param on every node
    // write, BR5 — so the assertion is scoped to the shape-regex line only,
    // not the whole file.)
    const shapeRegexLine = navigationSource
      .split('\n')
      .find((line) => line.includes('NODE_KEY_PREFIXED_SHAPE ='));
    expect(shapeRegexLine, 'NODE_KEY_PREFIXED_SHAPE declaration not found').toBeDefined();
    expect(shapeRegexLine).toMatch(/\^\(\?:root\|\[acd\]:/);
    expect(shapeRegexLine).not.toMatch(/clusterFocus/);
  });

  it('NEGATIVE CONTROL — no hierarchy-request builder (the navigation-resolve/counts fetchers) ever reads or emits clusterFocus onto a request URL', () => {
    // `useAreasNavigationJourney.ts` builds the resolve/counts request from
    // `requestedNodeKey` (rawNodeParam) ONLY (BR7's own module-doc claim,
    // clusterFocus.ts:39-44); this proves it textually rather than trusting
    // the doc comment. `useDiscoverNavigationCounts.ts` is the sibling counts
    // fetcher already swept above ("the counts hook takes a node key as
    // INPUT and never derives one") — re-checked here for the SPECIFIC
    // `clusterFocus` identifier, which that earlier assertion does not name.
    expect(journeyHookSource).not.toMatch(/clusterFocus/i);
    expect(countsHookSource).not.toMatch(/clusterFocus/i);
  });

  it('POSITIVE CONTROL for the negative above — the request-builder sweep target text really is non-empty and really does reference the real request-driving field, so an accidental empty-file/wrong-path read cannot make the negative pass vacuously', () => {
    expect(journeyHookSource.length).toBeGreaterThan(200);
    expect(journeyHookSource).toMatch(/requestedNodeKey|rawNodeParam/);
    expect(countsHookSource.length).toBeGreaterThan(50);
    expect(countsHookSource).toMatch(/nodeKey: string \| null/);
  });
});

function walkTypeScript(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      walkTypeScript(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}
