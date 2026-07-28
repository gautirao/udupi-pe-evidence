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
 * (`AreaGroup*Panel`, `DiscoverRightPanel`'s legacy branches,
 * `macroRegionResolver.ts`, `groupRegionLabel.ts`). Those files are KEPT in PR 1
 * by design and move in PR 6; an assertion that any of them is absent would be
 * wrong here, and none is made.
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
const PREVIEW_DIR = path.join(HERE, '..', '..', 'preview');
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
 * The pure navigation/preview modules PR 1 adds. These own no URLs, no camera,
 * no labels of their own — every sweep below is scoped to them.
 */
const PURE_NAV_MODULES: { file: string; source: string }[] = [
  { file: 'navigation/types.ts', source: read(path.join(NAV_DIR, 'types.ts')) },
  { file: 'navigation/nodeLevelKind.ts', source: read(path.join(NAV_DIR, 'nodeLevelKind.ts')) },
  { file: 'navigation/navigationModel.ts', source: read(path.join(NAV_DIR, 'navigationModel.ts')) },
  {
    file: 'navigation/nearbyAreaArithmetic.ts',
    source: read(path.join(NAV_DIR, 'nearbyAreaArithmetic.ts')),
  },
  {
    file: 'navigation/journeyVisibility.ts',
    source: read(path.join(NAV_DIR, 'journeyVisibility.ts')),
  },
  {
    file: 'navigation/areasDestination.ts',
    source: read(path.join(NAV_DIR, 'areasDestination.ts')),
  },
  {
    file: 'navigation/visibleMemberSet.ts',
    source: read(path.join(NAV_DIR, 'visibleMemberSet.ts')),
  },
  {
    file: 'preview/areasPreviewCapability.ts',
    source: read(path.join(PREVIEW_DIR, 'areasPreviewCapability.ts')),
  },
];

it('the swept module list is non-empty and complete (guards against a vacuous sweep)', () => {
  expect(PURE_NAV_MODULES.length).toBe(8);
  for (const { file, source } of PURE_NAV_MODULES) {
    expect(source.trim().length, `${file} is empty after comment stripping`).toBeGreaterThan(0);
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

  it('nextLevelType is read by exactly one module (types.ts merely declares it)', () => {
    const readers = PURE_NAV_MODULES.filter(({ source }) => /nextLevelType/.test(source)).map(
      ({ file }) => file,
    );
    expect(readers.sort()).toEqual(['navigation/nodeLevelKind.ts', 'navigation/types.ts']);
  });
});

describe('static sweep — single owner of the Areas preview capability', () => {
  const productionFiles = walkTypeScript(SRC_ROOT).filter((f) => !/\.test\.tsx?$/.test(f));

  it('the file walk found a realistic number of modules (guards against a vacuous sweep)', () => {
    expect(productionFiles.length).toBeGreaterThan(100);
  });

  it('only areasPreviewCapability.ts reads VITE_DISCOVER_AREAS_PREVIEW', () => {
    const readers = productionFiles
      .filter((file) => read(file).includes('VITE_DISCOVER_AREAS_PREVIEW'))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(readers).toEqual(['features/discover/preview/areasPreviewCapability.ts']);
  });

  it('only the navigation URL domain reads the areasPreview param', () => {
    const readers = productionFiles
      .filter((file) => /(get|has)\(\s*['"]areasPreview['"]\s*\)/.test(read(file)))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(readers).toEqual(['features/discover/state/url/navigation.ts']);
  });
});

describe('static sweep — the frontend NEVER constructs a node key', () => {
  // Node keys come only from the server (`.../areas/{areaKey}/navigation-path`).
  // The formula happens to be `"a:" + areaKey`; hardcoding it client-side is the
  // exact antipattern that produced the macroRegionResolver problem. Matches
  // CONSTRUCTION only (concatenation or interpolation onto the `a:` prefix) —
  // a literal fixture key like `'a:bangalore|whitefield'` is data, not a
  // construction site, and test files are excluded for the same reason.
  const CONSTRUCTION_PATTERNS: RegExp[] = [
    /(['"])a:\1\s*\+/, //  'a:' + something
    /\+\s*(['"])a:\1/, //  something + 'a:'
    /`a:\$\{/, //          `a:${areaKey}`
    /(['"])c:\1\s*\+/, //  the CLUSTER prefix, same rule
    /`c:\$\{/,
  ];

  it('no production module concatenates or interpolates a node-key prefix', () => {
    const offenders: string[] = [];
    for (const file of walkTypeScript(SRC_ROOT)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const source = read(file);
      if (CONSTRUCTION_PATTERNS.some((pattern) => pattern.test(source))) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the URL navigation domain exports no key-construction helper', () => {
    const source = read(path.join(URL_DOMAIN_DIR, 'navigation.ts'));
    expect(source).not.toMatch(/export function (build|make|to)Node(Key|Href)/);
  });

  it('the counts hook takes a node key as INPUT and never derives one', () => {
    const source = read(path.join(HOOKS_DIR, 'useDiscoverNavigationCounts.ts'));
    expect(source).toMatch(/nodeKey: string \| null/);
    for (const pattern of CONSTRUCTION_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
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
