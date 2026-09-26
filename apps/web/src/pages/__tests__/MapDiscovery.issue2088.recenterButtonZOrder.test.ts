/**
 * Issue #2088 (commit 6) — "Recenter on <label>" affordance regression test.
 *
 * LIVE-VERIFIED DEFECT (not caught by the pre-existing unit tests
 * `useDiscoverMapData.recenter.test.ts` / `PropertyMap.recenterBypass.test.tsx`,
 * which only exercise the CameraIntent producer in isolation and never render
 * the button's real DOM position): the recenter `<button>` this file portals
 * into `mapContainerRef.current` and `DiscoverMapCountBadge.tsx`'s
 * `data-testid="discover-badge"` pill were BOTH anchored to the exact same
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
 * Issue #2714 (desktop bottom-chrome overlap) moved this button OFF the
 * horizontal centre entirely, into the bottom-right column (alongside the
 * Leaflet zoom control, the "Recenter on <city>" button and the school-radius
 * "more" hint — see the stacking-budget describe block below), so the
 * original #2088 "shares the badge's left-1/2 anchor" premise this file's
 * helpers were built around no longer holds on desktop. The tests below were
 * updated in place rather than deleted: the underlying regression risk (two
 * `position: relative`-child controls painting over each other in a stacking
 * context jsdom can't lay out) is the same one #2714's stacking-budget tests
 * guard against, just via a different anchor.
 *
 * Issue #2724 (pass 3, owner-directed desktop/mobile parity) moved "Recenter
 * on <area>" a third time: OFF the #2714 right-anchored (`right-4`) column
 * entirely and onto the count badge's own row (`bottom-60`), flanking the
 * opposite side of centre from it (`left-1/2 ml-2` vs the badge's `right-1/2
 * mr-2`) — see the dedicated pairing describe block below. It is therefore no
 * longer part of the #2714 stacking-budget block's right-anchored column.
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
 * Strips both block comments and line comments. Issue #2714's own source comments narrate the
 * exact bottom-N/right-4 values being fixed (for the historical record), so a literal-scanning
 * regex run against the raw source risks pairing an apostrophe inside prose (e.g. "control's")
 * with an unrelated string literal's quote and capturing a false "className" that spans real code
 * and comment text. Scanning comment-stripped source first removes that whole class of false
 * positive.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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

describe('Issue #2088 — recenter button is portalled with an explicit stacking z-index', () => {
  // The horizontal-centre collision this file originally guarded against no longer applies on
  // desktop (Issue #2714 moved the button into the bottom-right column — see the stacking-budget
  // describe block below), but the z-index defence-in-depth check still stands on its own.
  const mapDiscoverySource = readFileSync(MAP_DISCOVERY_PATH, 'utf-8');
  const recenterClassNames = extractClassNameLiterals(mapDiscoverySource, 'areas-recenter-button');

  it('every recenter button placement (mobile and desktop) declares an explicit z-index', () => {
    expect(recenterClassNames.length).toBeGreaterThan(0);
    for (const className of recenterClassNames) {
      expect(className, `"${className}" is missing a z-[N] stacking index`).toMatch(/\bz-\[\d+\]/);
    }
  });
});

// Issue #2714 — the desktop bottom-right column, bottom-up: attribution, the Leaflet zoom control
// (not in our source, live-measured top edge ≈91px), "Recenter on <city>" (DiscoverMapCanvas), the
// school-radius "more" hint (DiscoverMapStatusHints — the count badge's school-radius branch and
// this hint can render together in the anon school-radius "showing first N" state), then the count
// badge's right-anchored variant (DiscoverMapCountBadge). Heights are the live-measured (Playwright,
// 1440x900/1024x768) rendered heights: city recenter 30px, the hint 66px (wraps inside its
// max-w-[16rem]), the badge 38px (no wrap — unlike its centred sibling, this variant has no width
// cap).
//
// Issue #2724 (pass 3) — "Recenter on <area>" (DiscoverMapSurface) is NO LONGER part of this
// right-anchored column: it moved onto the count badge's own paired row instead (bottom-60,
// `left-1/2 ml-2`). See the dedicated pairing describe block below for that relationship.
describe('Issue #2714 — desktop bottom-right column stacking budget', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');
  const canvasSource = read('../../features/discover/views/DiscoverMapCanvas.tsx');
  const countBadgeSource = readFileSync(COUNT_BADGE_PATH, 'utf-8');
  const hintsSource = read('../../components/discover/DiscoverMapStatusHints.tsx');

  /** The single `right-4` (desktop, not mobile's `right-[10px]`) + `bottom-N` string literal in a file. */
  function desktopColumnBottomPx(source: string, label: string): number {
    const literals = Array.from(stripComments(source).matchAll(/'([^']*\bright-4\b[^']*)'/g), (m) => m[1]);
    expect(literals, `${label}: expected exactly one right-4-anchored desktop placement`).toHaveLength(1);
    const token = literals[0].match(/\bbottom-\d+\b/)?.[0];
    expect(token, `${label}: desktop placement must declare bottom-N`).toBeDefined();
    return tailwindSpacingToPx(token as string);
  }

  const ZOOM_TOP_PX = 91;
  const CITY_RECENTER_HEIGHT_PX = 30;
  const HINT_HEIGHT_PX = 66;
  const MIN_GAP_PX = 8;

  const cityBottom = desktopColumnBottomPx(canvasSource, 'city recenter (DiscoverMapCanvas)');
  const hintBottom = desktopColumnBottomPx(hintsSource, 'school-radius hint (DiscoverMapStatusHints)');
  const badgeBottom = desktopColumnBottomPx(countBadgeSource, 'count badge, right-anchored variant (DiscoverMapCountBadge)');

  it('"Recenter on <city>" clears the Leaflet zoom control', () => {
    expect(cityBottom - ZOOM_TOP_PX).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('the school-radius "more" hint clears the Leaflet zoom control', () => {
    expect(hintBottom - ZOOM_TOP_PX).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('the count badge clears "Recenter on <city>"', () => {
    expect(badgeBottom - (cityBottom + CITY_RECENTER_HEIGHT_PX)).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });

  it('the count badge clears the school-radius "more" hint', () => {
    expect(badgeBottom - (hintBottom + HINT_HEIGHT_PX)).toBeGreaterThanOrEqual(MIN_GAP_PX);
  });
});

// Issue #2724 (pass 3) — "Recenter on <area>" left the #2714 right-anchored column above and now
// pairs with the count badge on ONE shared row instead, flanking opposite sides of centre
// (`left-1/2 ml-2` vs the badge's `right-1/2 mr-2`), mirroring the "Recenter on <city>"/badge
// pairing that #2724's earlier passes already established for the other desktop states.
describe('Issue #2724 pass 3 — "Recenter on <area>" pairs with the count badge on one row', () => {
  const surfaceSource = readFileSync(MAP_DISCOVERY_PATH, 'utf-8');
  const countBadgeSource = readFileSync(COUNT_BADGE_PATH, 'utf-8');

  it('shares the exact same bottom-N row as the count badge\'s paired ("left row-mate") variant', () => {
    // extractClassNameLiterals assumes `data-testid` precedes `className` on the tag (true for
    // `areas-recenter-button`, used below), but DiscoverMapCountBadge's own `discover-badge` tag
    // declares `className={...}` BEFORE `data-testid="discover-badge"` — so that helper isn't a
    // fit here; a direct, comment-stripped literal scan (mirroring desktopColumnBottomPx above) is
    // used for the badge side instead. The badge's `right-1/2 mr-2` text is intentionally reused
    // verbatim across two mutually-exclusive branches (isAreaFirstSelectedAreaState paired and
    // isSelectedGroupState paired), so this deliberately does not require exactly one match.
    const surfaceLiterals = extractClassNameLiterals(surfaceSource, 'areas-recenter-button');
    const pairedSurfaceLiteral = surfaceLiterals.find(
      (literal) => literal.includes('left-1/2') && literal.includes('ml-2'),
    );
    expect(pairedSurfaceLiteral, 'expected a left-1/2 + ml-2 desktop paired-row literal').toBeDefined();
    const areaToken = pairedSurfaceLiteral?.match(/\bbottom-\d+\b/)?.[0];
    expect(areaToken, 'area recenter paired-row placement must declare bottom-N').toBeDefined();

    const badgeLiterals = Array.from(
      stripComments(countBadgeSource).matchAll(/'([^']*\bright-1\/2\b[^']*\bmr-2\b[^']*)'/g),
      (m) => m[1],
    );
    expect(badgeLiterals.length, 'expected at least one right-1/2 + mr-2 desktop paired-row literal').toBeGreaterThan(0);
    const badgeToken = badgeLiterals[0].match(/\bbottom-\d+\b/)?.[0];
    expect(badgeToken, 'count badge paired-row placement must declare bottom-N').toBeDefined();

    expect(tailwindSpacingToPx(areaToken as string)).toBe(tailwindSpacingToPx(badgeToken as string));
  });

  it('no longer declares a right-4-anchored desktop placement', () => {
    const literals = Array.from(
      stripComments(surfaceSource).matchAll(/'([^']*\bright-4\b[^']*)'/g),
      (m) => m[1],
    );
    expect(literals).toHaveLength(0);
  });
});

// Issue #2724 (pass 4, code review) — the desktop paired-row placement above had no width cap, so
// a long area name ("Recenter on Jayaprakash Narayana Extension & Kodihalli Layout Cross") wrapped
// to 3 lines at 1024px and, being bottom-anchored, grew UPWARD into the count badge sharing its
// row (see DiscoverMapSurface.tsx's own doc comment on this same button). Fix: cap the button's
// width to the SAME max-w-[220px] the badge already uses, and clamp the label span to 2 lines.
describe('Issue #2724 pass 4 — the desktop area-recenter button is width-capped and height-clamped', () => {
  const surfaceSource = readFileSync(MAP_DISCOVERY_PATH, 'utf-8');

  it('the desktop paired-row placement declares the same max-w-[220px] cap the count badge uses', () => {
    const surfaceLiterals = extractClassNameLiterals(surfaceSource, 'areas-recenter-button');
    const pairedSurfaceLiteral = surfaceLiterals.find(
      (literal) => literal.includes('left-1/2') && literal.includes('ml-2'),
    );
    expect(pairedSurfaceLiteral, 'expected a left-1/2 + ml-2 desktop paired-row literal').toBeDefined();
    // No trailing \b after the closing `]` — `]` is a non-word char, and the
    // char after it here is a space (also non-word), so \b never matches
    // there and would silently fail to match even a real occurrence.
    expect(pairedSurfaceLiteral).toMatch(/\bmax-w-\[220px\]/);
  });

  it('does not cap the mobile placement (mobile is out of scope — issue #2727)', () => {
    const surfaceLiterals = extractClassNameLiterals(surfaceSource, 'areas-recenter-button');
    const mobileLiteral = surfaceLiterals.find((literal) => literal.includes('right-[10px]'));
    expect(mobileLiteral, 'expected a right-[10px] mobile literal').toBeDefined();
    expect(mobileLiteral).not.toMatch(/\bmax-w-\[220px\]/);
  });

  it('clamps the desktop label to 2 lines via line-clamp-2, but leaves the mobile label unclamped', () => {
    // The label span's className is conditional on `isMobileMapOverlay`
    // (`isMobileMapOverlay ? undefined : 'line-clamp-2'`) rather than a second
    // data-testid'd tag, so extractClassNameLiterals (built for data-testid
    // tags) isn't a fit here — a direct, comment-stripped literal scan is used
    // instead, mirroring the pattern the pass-3 block above already uses for
    // DiscoverMapCountBadge.tsx.
    const stripped = stripComments(surfaceSource);
    expect(stripped).toMatch(/isMobileMapOverlay\s*\?\s*undefined\s*:\s*'line-clamp-2'/);
  });

  it('keeps the full "Recenter on <area>" text as the button\'s own accessible-name source (not just in title)', () => {
    // line-clamp is purely visual (CSS -webkit-line-clamp / overflow), so the
    // label span's DOM text content — the accessible name's source — must
    // still contain the full, un-truncated interpolated label, not a
    // JS-truncated substring. Real-DOM accessible-name computation is covered
    // separately (DiscoverMapSurface.test.tsx); this guards the JSX itself
    // never starts pre-truncating the label text in source.
    const stripped = stripComments(surfaceSource);
    expect(stripped).toMatch(/Recenter on \{view\.overlays\.recenter\.label\}/);
  });

  it('also exposes the full label via a title attribute for hover', () => {
    const stripped = stripComments(surfaceSource);
    expect(stripped).toMatch(/title=\{`Recenter on \$\{view\.overlays\.recenter\.label\}`\}/);
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
    const literals = Array.from(stripComments(source).matchAll(/'([^']*\bright-\[10px\][^']*)'/g), (m) => m[1]);
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
