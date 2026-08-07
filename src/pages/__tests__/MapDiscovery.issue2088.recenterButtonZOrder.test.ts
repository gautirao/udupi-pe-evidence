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
const MAP_DISCOVERY_PATH = resolve(__dirname, '../MapDiscovery.tsx');
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
 * doc-comment mentions of the same string) and returns its `className="..."`
 * value.
 */
function extractStaticClassName(source: string, testId: string): string {
  const marker = `data-testid="${testId}"`;
  let searchFrom = 0;
  for (;;) {
    const idx = source.indexOf(marker, searchFrom);
    if (idx === -1) break;
    const tagStart = source.lastIndexOf('<', idx);
    const tagEnd = source.indexOf('>', idx);
    if (tagStart !== -1 && tagEnd !== -1) {
      const candidate = source.slice(tagStart, tagEnd + 1);
      const isRealTag =
        !candidate.includes('/*') && !candidate.includes('*/') && !candidate.includes('<!--');
      const classNameMatch = isRealTag ? candidate.match(/className="([^"]+)"/) : null;
      if (classNameMatch) return classNameMatch[1];
    }
    searchFrom = idx + marker.length;
  }
  throw new Error(`Could not find a real, statically-classed JSX tag for data-testid="${testId}"`);
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

  const recenterButtonClassName = extractStaticClassName(
    mapDiscoverySource,
    'areas-recenter-button',
  );
  const badgeCollisionCandidates = findLeftAnchoredBottomClassNames(countBadgeSource);

  it('the recenter button is anchored to the map\'s horizontal centre (precondition for the collision)', () => {
    expect(recenterButtonClassName).toMatch(/\bleft-1\/2\b/);
    expect(recenterButtonClassName).toMatch(/-translate-x-1\/2\b/);
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
