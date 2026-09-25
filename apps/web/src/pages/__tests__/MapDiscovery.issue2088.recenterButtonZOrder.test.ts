/**
 * Issue #2088 (commit 6) — "Recenter on <label>" affordance regression test.
 *
 * LIVE-VERIFIED DEFECT (not caught by the pre-existing unit tests
 * `useDiscoverMapData.recenter.test.ts` / `PropertyMap.recenterBypass.test.tsx`,
 * which only exercise the CameraIntent producer in isolation and never render
 * the button's real DOM position): the recenter `<button>` this file portals
 * into `mapContainerRef.current` and `DiscoverMapCountBadge.tsx`'s
 * `data-testid="discover-badge"` pill are BOTH anchored to the exact same
 * spot in several journey states — `absolute ... left-1/2 -translate-x-1/2`
 * inside the SAME `position: relative` map container, i.e. one stacking
 * context. Before the fix, the recenter button used `bottom-4` (16px)
 * against the badge's public-landing variant at `bottom-5` (20px) with the
 * badge at `z-[1000]` vs the button's `z-[500]`: the two elements' vertical
 * bands overlapped almost completely, so the (higher-z) badge painted on top
 * and fully occluded the (lower-z) button. Confirmed live in Chrome —
 * `getBoundingClientRect()` showed near-identical rects for both elements
 * while the button's own `display`/`visibility`/`opacity` all reported as
 * visible (a jsdom-only assertion on those properties would have passed).
 *
 * `DiscoverMapCountBadge.tsx` renders this pill with more than one possible
 * `left-1/2`-anchored `bottom-*` offset depending on navigation state
 * (public-landing city total vs. selected-group/selected-area states) — see
 * that file's own `isSelectedGroupState || isAreaFirstSelectedAreaState`
 * branch. Rather than pinning the test to whichever single variant this
 * investigation happened to reproduce live, this test scans the WHOLE file
 * for every `left-1/2`-anchored, `bottom-*` className token (i.e. every
 * variant that shares the recenter button's horizontal anchor and could
 * therefore collide with it) and asserts the recenter button clears all of
 * them with a safe margin.
 *
 * This is a static-source assertion (not a full render), because jsdom has
 * no layout engine and can't reproduce the real overlap — the actual defect
 * was only ever observable via real `getBoundingClientRect()` geometry in a
 * live browser. A future edit that moves either element back into collision
 * range fails loudly here instead of silently regressing behind a green
 * test suite again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Issue #2142 Commit 4 — the recenter button's JSX moved from MapDiscovery.tsx
// into DiscoverMapSurface.tsx (DiscoverMapMount's true-rename target), which
// now owns it directly (see buildMapSurfaceModel.ts's doc comment). Repointed
// here; the assertions/behaviour this file checks are unchanged.
const MAP_DISCOVERY_PATH = resolve(
  __dirname,
  '../../features/discover/surfaces/DiscoverMapSurface.tsx',
);
const COUNT_BADGE_PATH = resolve(
  __dirname,
  '../../components/discover/DiscoverMapCountBadge.tsx',
);

/** Tailwind's default spacing scale: bottom-N => N * 0.25rem => N * 4px. */
function tailwindSpacingToPx(token: string): number {
  const match = token.match(/^bottom-(\d+)$/);
  if (!match) throw new Error(`Unrecognized bottom-* token: ${token}`);
  return Number(match[1]) * 4;
}

/**
 * Finds the real JSX opening tag for a given `data-testid` (skipping any
 * doc-comment mentions of the same string) and returns every className string
 * literal on it: the single `className="..."` value, or each branch of a
 * `className={cond ? '...' : '...'}` ternary (Issue #2698 split the recenter
 * button into a mobile-shell and a desktop placement).
 */
function extractClassNameLiterals(source: string, testId: string): string[] {
  const marker = `data-testid="${testId}"`;
  let searchFrom = 0;
  for (;;) {
    const idx = source.indexOf(marker, searchFrom);
    if (idx === -1) break;
    searchFrom = idx + marker.length;
    // A mention inside a `/* ... */` (or JSX `{/* ... */}`) doc comment is not
    // the element: skip it when the nearest preceding block-comment opener has
    // not been closed yet.
    if (source.lastIndexOf('/*', idx) > source.lastIndexOf('*/', idx)) continue;
    const tagStart = source.lastIndexOf('<', idx);
    // Search for the tag's closing `>` only after the className attribute, so
    // a `>` inside a `//` comment that sits BEFORE className (e.g. "<city>")
    // is skipped. The className values themselves contain no `>`. With no
    // className after this mention there is no tag to read — never fall back
    // to `indexOf('>', -1)`, which would scan from the start of the file.
    const classNameIdx = source.indexOf('className', idx);
    if (tagStart === -1 || classNameIdx === -1) continue;
    const tagEnd = source.indexOf('>', classNameIdx);
    if (tagEnd === -1) continue;
    // Drop `//` line comments first: an apostrophe in one would otherwise
    // open a bogus string literal for the ternary scan below.
    const candidate = source.slice(tagStart, tagEnd + 1).replace(/^\s*\/\/.*$/gm, '');
    // A block comment inside the sliced span means the slice straddled a
    // comment rather than one opening tag.
    if (candidate.includes('/*') || candidate.includes('*/') || candidate.includes('<!--')) continue;
    const staticMatch = candidate.match(/className="([^"]+)"/);
    if (staticMatch) return [staticMatch[1]];
    const literals = Array.from(candidate.matchAll(/'([^']*\bbottom-[^']*)'/g), (m) => m[1]);
    if (literals.length > 0) return literals;
  }
  throw new Error(`Could not find a real, classed JSX tag for data-testid="${testId}"`);
}

/**
 * Every `left-1/2`-anchored, `bottom-*` className string token anywhere in
 * `source` — covers both a plain `className="..."` and each branch of a
 * `className={cond ? '...' : '...'}` ternary, since either form can back the
 * SAME `data-testid="discover-badge"` element across different nav states.
 */
function findLeftAnchoredBottomClassNames(source: string): string[] {
  const stringLiteralPattern = /(["'])((?:(?!\1).)*)\1/g;
  const matches: string[] = [];
  for (const m of source.matchAll(stringLiteralPattern)) {
    const literal = m[2];
    if (literal.includes('left-1/2') && /\bbottom-\d+\b/.test(literal)) {
      matches.push(literal);
    }
  }
  return matches;
}

describe('Issue #2088 — recenter button vs. DiscoverMapCountBadge z-order/position', () => {
  const mapDiscoverySource = readFileSync(MAP_DISCOVERY_PATH, 'utf-8');
  const countBadgeSource = readFileSync(COUNT_BADGE_PATH, 'utf-8');

  const recenterClassNames = extractClassNameLiterals(mapDiscoverySource, 'areas-recenter-button');
  // The desktop placement is the centred one; Issue #2698's mobile-shell branch
  // sits in the right-hand column instead (asserted separately below).
  const recenterButtonClassName =
    recenterClassNames.find((c) => c.includes('left-1/2')) ?? recenterClassNames[0];
  const badgeCollisionCandidates = findLeftAnchoredBottomClassNames(countBadgeSource);

  it('the recenter button is anchored to the map\'s horizontal centre (precondition for the collision)', () => {
    expect(recenterButtonClassName).toMatch(/\bleft-1\/2\b/);
    expect(recenterButtonClassName).toMatch(/-translate-x-1\/2\b/);
  });

  it('Issue #2698 — the mobile-shell placement leaves the centre (where it covered the bottom-left legend) for the right-hand column', () => {
    const mobile = recenterClassNames.filter((c) => !c.includes('left-1/2'));
    expect(mobile).toHaveLength(1);
    expect(mobile[0]).toMatch(/\bright-\[10px\]/);
    expect(mobile[0]).not.toMatch(/translate-x/);
  });

  it('DiscoverMapCountBadge.tsx still has at least one left-1/2-anchored bottom pill variant (sanity check for the scan below)', () => {
    expect(badgeCollisionCandidates.length).toBeGreaterThan(0);
  });

  it('the recenter button clears every left-1/2-anchored count-badge variant with a safe margin, so the badge can never paint over it', () => {
    const recenterBottomToken = recenterButtonClassName.match(/\bbottom-\d+\b/)?.[0];
    expect(recenterBottomToken, 'recenter button must declare a bottom-N offset').toBeDefined();
    const recenterBottomPx = tailwindSpacingToPx(recenterBottomToken as string);

    // Both pills render around ~38px tall in practice (live-measured). A
    // 40px minimum gap between their `bottom` offsets guarantees their
    // bands never touch regardless of small text/line-height drift.
    const SAFE_MARGIN_PX = 40;

    for (const candidate of badgeCollisionCandidates) {
      const badgeBottomToken = candidate.match(/\bbottom-\d+\b/)?.[0] as string;
      const badgeBottomPx = tailwindSpacingToPx(badgeBottomToken);
      expect(
        recenterBottomPx - badgeBottomPx,
        `recenter button (bottom-${recenterBottomPx / 4}) does not clear count-badge variant "${candidate}" by ${SAFE_MARGIN_PX}px`,
      ).toBeGreaterThanOrEqual(SAFE_MARGIN_PX);
    }
  });

  it('the recenter button is portalled with an explicit stacking z-index (defence in depth alongside the position fix)', () => {
    expect(recenterButtonClassName).toMatch(/\bz-\[\d+\]/);
  });
});

describe('extractClassNameLiterals — parser guards', () => {
  it('skips a data-testid mention inside a /* */ doc comment and reads the real tag after it', () => {
    const source = [
      '/* the <div data-testid="x" className="bottom-1 comment-copy"> pill */',
      '<div data-testid="x" className="bottom-2 real-tag">',
    ].join('\n');
    expect(extractClassNameLiterals(source, 'x')).toEqual(['bottom-2 real-tag']);
  });

  it('throws rather than slicing from the start of the file when no className follows the mention', () => {
    // Unguarded, `indexOf('>', -1)` finds the FIRST `>` in the file and the slice returns the
    // OTHER element's classes as if they belonged to data-testid="x".
    const source = '<div className="bottom-9 other-element">\n// mentions data-testid="x" only in prose';
    expect(() => extractClassNameLiterals(source, 'x')).toThrow(/Could not find/);
  });
});

// Issue #2698 — the full-screen mobile Map's bottom-right column, bottom-up. The Leaflet zoom
// control (not in our source) tops out at ≈90px above the map's bottom edge. Heights are the
// rendered pill heights: "Recenter on <city>" (py-1.5 + text-xs + border ≈ 30px), "Recenter on
// <area>" (py-2 + text-sm + border ≈ 38px). Every item must clear the one below by ≥ 8px, and the
// z-[1000] school-radius hint must sit ABOVE both z-[500] buttons or it swallows their taps.
describe('Issue #2698 — mobile Map right-hand column stacking budget', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');
  const canvasSource = read('../../features/discover/views/DiscoverMapCanvas.tsx');
  const surfaceSource = read('../../features/discover/surfaces/DiscoverMapSurface.tsx');
  const hintsSource = read('../../components/discover/DiscoverMapStatusHints.tsx');

  /** The single `right-[10px]` + `bottom-[Npx]` string literal in a file, as N. */
  function mobileColumnBottomPx(source: string, label: string): number {
    const literals = Array.from(source.matchAll(/'([^']*\bright-\[10px\][^']*)'/g), (m) => m[1]);
    expect(literals, `${label}: expected exactly one right-[10px] mobile placement`).toHaveLength(1);
    const px = literals[0].match(/\bbottom-\[(\d+)px\]/)?.[1];
    expect(px, `${label}: mobile placement must declare bottom-[Npx]`).toBeDefined();
    return Number(px);
  }

  const ZOOM_TOP_PX = 90;
  const CITY_RECENTER_HEIGHT_PX = 30;
  const AREA_RECENTER_HEIGHT_PX = 38;
  const MIN_GAP_PX = 8;

  const cityBottom = mobileColumnBottomPx(canvasSource, 'city recenter (DiscoverMapCanvas)');
  const areaBottom = mobileColumnBottomPx(surfaceSource, 'area recenter (DiscoverMapSurface)');
  const hintBottom = mobileColumnBottomPx(hintsSource, 'school-radius hint (DiscoverMapStatusHints)');

  it('"Recenter on <city>" clears the Leaflet zoom control', () => {
    expect(cityBottom - ZOOM_TOP_PX).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('"Recenter on <area>" clears "Recenter on <city>"', () => {
    expect(areaBottom - (cityBottom + CITY_RECENTER_HEIGHT_PX)).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('the school-radius "more" hint sits above both Recenter buttons', () => {
    expect(hintBottom - (areaBottom + AREA_RECENTER_HEIGHT_PX)).toBeGreaterThanOrEqual(MIN_GAP_PX);
    expect(hintBottom - (cityBottom + CITY_RECENTER_HEIGHT_PX)).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('the area recenter keys its mobile placement on the canvas\'s own discriminator (mobileListButton)', () => {
    expect(surfaceSource).toMatch(/const isMobileMapOverlay = !!view\.mobile\.mobileListButton;/);
    expect(surfaceSource).toMatch(/className=\{\s*isMobileMapOverlay\s*\?/);
    expect(canvasSource).toMatch(/const isMobileMapOverlay = !!mobileListButton;/);
  });
});
