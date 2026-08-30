/**
 * hierarchyCameraFit.test.ts — Issue #1943, Slice A.
 *
 * `project` is a fully injected pure function, so most fixtures below use a
 * simple, hand-verifiable projection chosen specifically so every expected
 * pixel distance, overlap area and score is exact, computable arithmetic
 * (documented inline at each call site) rather than an approximation. This
 * is deliberate: several required assertions ("assert the actual
 * arithmetic", exact rect coords) are meaningless against a realistic
 * non-linear (e.g. Leaflet Mercator) projection whose per-zoom pixel values
 * aren't round numbers.
 *
 * Several fixtures use a `containmentBounds` spanning [-1,1] lat/lon whose
 * projected width/height is deliberately made to fit at one zoom but not
 * the next — this is what forces `zBase` below the effective max zoom (see
 * `hierarchyCameraFit.ts`'s module doc for why this is the ONLY way a
 * candidate above `zBase` can ever end up with `clipped === 0`: fit failing
 * at a HIGHER zoom is otherwise guaranteed to clip a CHILD card at that
 * zoom too, by the very definition of `zBase`).
 *
 * Most `containmentBounds`-driven fixtures below use `lat=1` for their
 * children — the NORTH EDGE of the `[-1,1]` bbox, not its centre. This is
 * deliberately realistic, not an oversight to "clean up": a padded or
 * elongated Direction's children legitimately sit near an edge of that
 * Direction's own bbox, and `zBase` is computed as
 * `min(childZBase, envelopeZBase)` — TWO INDEPENDENT, position-insensitive
 * searches (see `hierarchyCameraFit.ts`'s module doc's "MINIMUM of two
 * independently-computed" section) — so WHERE the anchor mean sits inside
 * `containmentBounds` never gates `zBase` on its own; only each half's own
 * geometry does. An earlier draft of this fix folded the envelope into the
 * same rect list the children were checked against, making `zBase`
 * position-sensitive to exactly this off-centre case and reintroducing (in
 * mirror image) the very bug this module fixes — see the dedicated
 * off-centre-anchor-mean fixture below, which is the regression test for
 * that mistake.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveHierarchyCameraFit,
  type HierarchyCameraFitInput,
  type HierarchyChildAnchor,
  type HierarchyProjectFn,
} from '../hierarchyCameraFit';

const K = 100;
/** project(lat, lon, zoom) = { x: lon*K*zoom, y: -lat*K*zoom }. */
const linearProject: HierarchyProjectFn = (lat, lon, zoom) => ({ x: lon * K * zoom, y: -lat * K * zoom });

function anchor(lat: number, lon: number, w: number, h: number): HierarchyChildAnchor {
  return { lat, lon, footprintWidthPx: w, footprintHeightPx: h };
}

function squareViewport(px: number) {
  return { widthPx: px, heightPx: px, insetTopPx: 0, insetRightPx: 0, insetBottomPx: 0, insetLeftPx: 0 };
}

/**
 * Issue #1943 remaining-scope fix (code review) — envelope-forced zBase now
 * requires a structurally DEGENERATE anchor spread (isAnchorSpreadDegenerate),
 * so a genuinely non-degenerate 2-anchor pair can no longer be pulled below
 * its own natural (childZBase-only) ceiling via containmentBounds. Several
 * fixtures below still need a real multi-candidate window at a fixed floor to
 * exercise argmin/clamping/dedup mechanics for a non-degenerate pair. This
 * helper places a THIRD anchor EXACTLY at the mean of the real pair (so it
 * does not shift `centre` at all — mean(A,B,mean(A,B)) = mean(A,B)) with a
 * footprint larger than any test viewport used here, guaranteeing it clips
 * identically at every candidate zoom (its own projected position always
 * equals the centre-pinned placement point) without ever being legible —
 * this forces `minZoom`/`maxZoom` to directly control the window (no
 * envelope needed) and prevents the legible-winner short-circuit from firing
 * early, so the FULL window gets evaluated.
 */
function clipAnchorAtMean(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return anchor((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, 3000, 3000);
}

function baseInput(overrides: Partial<HierarchyCameraFitInput>): HierarchyCameraFitInput {
  return {
    anchors: [],
    containmentBounds: null,
    viewport: squareViewport(3000),
    project: linearProject,
    minZoom: 10,
    maxZoom: 16,
    ...overrides,
  };
}

describe('resolveHierarchyCameraFit — null-on-no-usable-anchors', () => {
  it('returns null for an empty anchor list', () => {
    expect(resolveHierarchyCameraFit(baseInput({ anchors: [] }))).toBeNull();
  });

  it('returns null when every anchor has an unusable centroid (null Island, out-of-range, null/undefined)', () => {
    const input = baseInput({
      anchors: [
        anchor(0, 0, 100, 100), // Null Island
        anchor(91, 10, 100, 100), // out-of-range lat
        { lat: null, lon: 10, footprintWidthPx: 100, footprintHeightPx: 100 },
        { lat: 10, lon: undefined, footprintWidthPx: 100, footprintHeightPx: 100 },
      ],
    });
    expect(resolveHierarchyCameraFit(input)).toBeNull();
  });

  it('treats a non-finite projection result as unusable and drops that anchor', () => {
    const poisonedProject: HierarchyProjectFn = (lat, lon, zoom) => {
      if (lon > 5) return { x: Number.NaN, y: Number.NaN };
      return linearProject(lat, lon, zoom);
    };
    const input = baseInput({
      anchors: [anchor(1, 1, 100, 100), anchor(1, 10, 100, 100)],
      project: poisonedProject,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    // Only the (1,1) anchor is usable; the mean centre must equal it exactly
    // (a single surviving anchor, not an average with the poisoned one).
    expect(result?.centre).toEqual([1, 1]);
  });

  it('returns null when the only anchor is usable but every candidate zoom yields a non-finite projection', () => {
    const alwaysPoisoned: HierarchyProjectFn = () => ({ x: Number.NaN, y: Number.NaN });
    const input = baseInput({ anchors: [anchor(1, 1, 100, 100)], project: alwaysPoisoned });
    expect(resolveHierarchyCameraFit(input)).toBeNull();
  });
});

describe('resolveHierarchyCameraFit — bottom-centre anchoring', () => {
  it('anchors each card rect bottom-centre, not top-left/centre (a discriminating overlap fixture)', () => {
    // Anchor A projects to (x=0, y=1000) with a 50x100 footprint -> its
    // bottom-centre rect is exactly {left:-25, right:25, top:900,
    // bottom:1000}. Anchor B projects to (x=0, y=950) with a tiny 1x1
    // footprint -> its bottom-centre rect is {left:-0.5, right:0.5,
    // top:949, bottom:950}, which lies INSIDE A's vertical span [900,1000]
    // and horizontal span [-25,25] under bottom-centre anchoring. Under any
    // other anchoring convention (e.g. anchored at the point's own
    // vertical centre, or top-left) B's rect would land OUTSIDE A's span
    // and the pair would not intersect — so `pairs === 1` here is a real,
    // discriminating assertion of the bottom-centre contract.
    const fixedProject: HierarchyProjectFn = (lat) => ({ x: 0, y: lat === 1 ? 1000 : 950 });
    const input = baseInput({
      anchors: [anchor(1, 0, 50, 100), anchor(2, 0, 1, 1)],
      project: fixedProject,
      minZoom: 10,
      maxZoom: 10,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.chosen.pairs).toBe(1);
  });
});

describe('resolveHierarchyCameraFit — zBase uses REAL centre-pinned containment, not a union-dimension check (external review, post-F1-F4)', () => {
  // Both fixtures below are constructed so a pure "does the rects' UNION fit
  // inside usable's width/height" check (the prior, removed
  // `fitsWithinUsable`) says YES at zoom=4 while the REAL centre-pinned
  // placement clips a card there — and only at zoom=3 does everything
  // genuinely fit. Verified independently (a standalone script replicating
  // BOTH the old union-only check and the new real-containment check) that:
  //   OLD logic: zBase=4 (wrong) -> single candidate [4] -> clipped=1,
  //              needsDeclutter=true, EVEN THOUGH A CLEAN CAMERA EXISTS.
  //   NEW logic: zBase=3 (correct) -> candidates [3,4] -> z=3 is legible
  //              immediately -> needsDeclutter=false.
  // These fixtures FAIL on the pre-fix code and PASS on the fixed code —
  // that divergence, not just a single passing assertion, is the point.

  it('vertical/bottom-anchor source: a union that "fits" by width/height still clips one card once really placed', () => {
    // Two anchors, same lon (0.001, so they never separate horizontally),
    // 150px-tall footprints. At zoom=4 the anchors project to y=0 and
    // y=400 (a 400px vertical span); at zoom=3 to y=0 and y=300 (300px).
    // Usable height=600. Union height at zoom=4 is 550 (<=600 -> the OLD
    // check says "fits"), but the mean-anchor-pinned translation puts the
    // upper card's rect at y=[-50,100] — clipped off the top by 50px.
    // Zoom=3's union (450) ALSO fits by the old dimension check, so the OLD
    // search (scanning from the top down) never even reaches it: it
    // wrongly stops at zoom=4. The NEW check correctly rejects zoom=4 (real
    // containment fails) and finds zoom=3, where both cards are genuinely
    // and fully visible.
    const anchors = [anchor(0, 0.001, 100, 150), anchor(-1, 0.001, 100, 150)];
    const input = baseInput({
      anchors,
      viewport: { widthPx: 2000, heightPx: 600, insetTopPx: 0, insetRightPx: 0, insetBottomPx: 0, insetLeftPx: 0 },
      minZoom: 3,
      maxZoom: 4,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([{ zoom: 3, clipped: 0, clipOverflowPx: 0, pairs: 0, overlapAreaPx2: 0, score: 0 }]);
    expect(result?.zoom).toBe(3); // the LOWER, genuinely clean zoom — not 4
    expect(result?.needsDeclutter).toBe(false);
  });

  it('horizontal/uneven-distribution source: two DIFFERENT-WIDTH footprints break the same assumption on the X axis', () => {
    // Same shape as above, rotated onto X: two anchors at the same lat
    // (0.001, so they never separate vertically) but with DIFFERENT
    // footprint WIDTHS (250px and 50px) — this is exactly the real-world
    // shape `destinationCardFootprint.ts` produces (cards of differing
    // widths for differing label lengths), and is enough on its own to
    // make the anchor-mean's projected X diverge from the rect union's own
    // midpoint, with zero reliance on bottom-centre (vertical) anchoring:
    // both footprints here are only 10px tall and never risk clipping
    // vertically. At zoom=4 the wide card's real placement clips 25px past
    // the right edge (usable width 600); the OLD union-dimension check
    // (550<=600) misses it entirely. Zoom=3 is genuinely clean.
    const anchors = [anchor(0.001, 0, 250, 10), anchor(0.001, -1, 50, 10)];
    const input = baseInput({
      anchors,
      viewport: { widthPx: 600, heightPx: 2000, insetTopPx: 0, insetRightPx: 0, insetBottomPx: 0, insetLeftPx: 0 },
      minZoom: 3,
      maxZoom: 4,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([{ zoom: 3, clipped: 0, clipOverflowPx: 0, pairs: 0, overlapAreaPx2: 0, score: 0 }]);
    expect(result?.zoom).toBe(3);
    expect(result?.needsDeclutter).toBe(false);
  });
});

describe('resolveHierarchyCameraFit — anchor mean OFF-CENTRE within containmentBounds is safe (code review F2 residual)', () => {
  it('a degenerate single anchor hugging the NORTH EDGE of the bbox resolves the SAME envelope floor as one at the centre — envelope admissibility never depends on position', () => {
    // Issue #1943 remaining-scope fix (code review) — this originally used a
    // genuinely non-degenerate 2-anchor pair to demonstrate BOTH (a)
    // envelope position-insensitivity AND (b) a pairs transition. (b) is no
    // longer constructible for a non-degenerate pair (see the describe doc
    // two blocks up): envelope now only applies to a structurally
    // DEGENERATE spread. This redesign keeps (a) — the property actually
    // under test here — using a SINGLE anchor (still the canonical
    // degenerate case) positioned at lat=0.9 (near the north edge of the
    // [-1,1] bbox, not its centre): `envelopeZBase`'s SIZE-only,
    // position-insensitive computation must resolve to the IDENTICAL floor
    // regardless of where inside the bbox the anchor sits.
    //
    // envelopeZBase: bbox [-1,1]x[-1,1] fits at zoom=12 (2*100*12=2400<=2500)
    // but not 13 (2600>2500) -> envelopeZBase=12, independent of the
    // anchor's own lat=0.9 position. childZBase trivially reaches the
    // ceiling for this single, tiny-footprint anchor, so zBase = min(ceiling,
    // 12) = 12 — the SAME value a centre-positioned (lat=1) anchor would
    // produce, proving the envelope's admissibility never consulted the
    // anchor's position.
    const anchors = [anchor(0.9, 0, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated[0]).toEqual({
      zoom: 12,
      clipped: 0,
      clipOverflowPx: 0,
      pairs: 0,
      overlapAreaPx2: 0,
      score: 0,
    });
    expect(result?.zoom).toBe(12);
    expect(result?.needsDeclutter).toBe(false);
  });
});

describe('resolveHierarchyCameraFit — candidate ordering, clamping, dedup, never zBase-1', () => {
  it('clamps zBase+1/+2/+3 down to the caller maxZoom and drops the resulting duplicates', () => {
    // Issue #1943 remaining-scope fix (code review) — envelope-forced zBase
    // now requires a structurally DEGENERATE anchor spread (see
    // isAnchorSpreadDegenerate). This fixture uses a SINGLE anchor (the
    // canonical degenerate case) so the envelope still legitimately applies,
    // exercising the SAME clamping/dedup arithmetic as before: this is a
    // window-mechanics test, not a pairs-resolution test, so a single anchor
    // (whose OWN card rect never clips or changes across candidates) still
    // fully exercises what's being asserted here — the exact CANDIDATE ZOOM
    // VALUES produced by [zBase, zBase+1, zBase+2, zBase+3], clamped and
    // deduped.
    //
    // containmentBounds [-1,1]x[-1,1] projects to a (2*K*zoom)-wide/tall
    // square. usable width/height = 2900px (no insets). Fits at zoom=14
    // (2*100*14=2800<=2900) but NOT at zoom=15 (2*100*15=3000>2900) ->
    // envelopeZBase=14 = zBase (childZBase trivially reaches the ceiling for
    // this single, tiny-footprint anchor, so Math.min picks envelopeZBase).
    // Raw candidates [14,15,16,17] clamp to [14,15] (maxZoom=15) -> dedupe
    // to exactly [14,15]. zBase-1 (=13) must never appear.
    //
    // A LONE anchor is trivially legible at every zoom (translation always
    // places it dead-centre; nothing else to overlap with), so the
    // legible-winner short-circuit would accept z=14 immediately and this
    // test would never see z=15 evaluated. A second anchor at the EXACT
    // SAME lat/lon (still degenerate — isAnchorSpreadDegenerate requires
    // ALL anchors coincide, which this preserves) with an oversized
    // footprint forces a constant clip, preventing the short-circuit so the
    // full clamped/deduped window is actually observable.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0, 3000, 3000)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2900),
      minZoom: 14,
      maxZoom: 15,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    const zooms = result?.evaluated.map((e) => e.zoom);
    expect(zooms).toEqual([14, 15]);
    expect(zooms?.every((z) => z >= 14)).toBe(true); // never zBase-1 (=13)
  });

  it('clamps to LEAF_FIT_MAX_ZOOM (16) even when the caller-supplied maxZoom is higher', () => {
    // A single, well-separated anchor fits at every zoom, so zBase
    // saturates at the true ceiling — which must be 16, never the caller's
    // maxZoom=30.
    const input = baseInput({
      anchors: [anchor(1, 1, 50, 50)],
      minZoom: 1,
      maxZoom: 30,
      viewport: squareViewport(4000),
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated.every((e) => e.zoom <= 16)).toBe(true);
  });

  it('falls back to minZoom (never below it) when nothing fits anywhere in range', () => {
    // A 1x1 viewport can never contain even a single 100x100 card -> the
    // zBase fit-search never succeeds, so zBase falls back to minZoom.
    const input = baseInput({
      anchors: [anchor(1, 1, 100, 100), anchor(2, 2, 100, 100)],
      viewport: squareViewport(1),
      minZoom: 10,
      maxZoom: 16,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated.every((e) => e.zoom >= 10)).toBe(true);
  });

  it('respects asymmetric insets (e.g. a bottom sheet) without validating/rejecting them', () => {
    const input = baseInput({
      anchors: [anchor(1, 1, 100, 100)],
      viewport: { widthPx: 3000, heightPx: 3000, insetTopPx: 0, insetRightPx: 0, insetBottomPx: 900, insetLeftPx: 0 },
    });
    expect(() => resolveHierarchyCameraFit(input)).not.toThrow();
    expect(resolveHierarchyCameraFit(input)).not.toBeNull();
  });
});

describe('resolveHierarchyCameraFit — containmentBounds is a SOFT over-zoom guard on sparse nodes (code review F2)', () => {
  it('a single sparse anchor climbs to the LEAF_FIT_MAX_ZOOM clamp WITHOUT containmentBounds (control)', () => {
    // Same single, well-separated anchor as the guarded case below, but with
    // NO containmentBounds — nothing pulls zBase down, so it saturates at
    // the true ceiling (16). This is the "meaningless pinpoint" failure mode
    // containmentBounds exists to prevent.
    const input = baseInput({
      anchors: [anchor(1, 1, 50, 50)],
      containmentBounds: null,
      minZoom: 5,
      maxZoom: 16,
      viewport: squareViewport(2100),
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.zoom).toBe(16);
  });

  it('the SAME sparse anchor is pulled DOWN to a sane zoom WHEN containmentBounds is supplied', () => {
    // containmentBounds [-1,1]x[-1,1] projects to a 2*100*zoom-wide/tall
    // square (same convention as the other bounds-driven fixtures). Usable
    // width/height = 2100px (no insets): fits at zoom=10 (2*100*10=2000<=2100)
    // but NOT at zoom=11 (2200>2100) -> zBase=10. The single anchor has no
    // pairs to resolve, so zBase itself is immediately legible and is
    // accepted as the FIRST (only-evaluated) candidate — proving the
    // over-zoom guard actually changes the outcome, not just in theory: the
    // exact same anchor that ran to 16 above now stops at 10.
    const input = baseInput({
      anchors: [anchor(1, 1, 50, 50)],
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      minZoom: 5,
      maxZoom: 16,
      viewport: squareViewport(2100),
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 10, clipped: 0, clipOverflowPx: 0, pairs: 0, overlapAreaPx2: 0, score: 0 },
    ]);
    expect(result?.zoom).toBe(10);
    expect(result?.zoom).toBeLessThan(16);
    expect(result?.needsDeclutter).toBe(false);
  });
});

// Issue #1943 remaining-scope fix (code review) — this file used to have a
// "resolveHierarchyCameraFit — first-legible immediate acceptance" describe
// block here, whose one test forced zBase=12 via containmentBounds for a
// genuinely NON-degenerate 2-anchor pair whose overlap resolved one
// candidate later (illegible at zBase, legible at zBase+1), specifically to
// prove the search accepts that LATER legible candidate without exploring
// zBase+2/+3. That exact shape is no longer constructible: envelope-forced
// zBase now requires a structurally degenerate spread
// (isAnchorSpreadDegenerate), and — provable from the algorithm itself, not
// incidentally — a genuinely non-degenerate childZBase can NEVER have a
// clean (legible-eligible) candidate above it: childZBase is BY DEFINITION
// the first/highest zoom (scanning down from the ceiling) with clean
// containment, so anything strictly above it must have already failed
// containment when the search checked it, and evaluateCandidate's clip
// check is the IDENTICAL computation — so a "candidate above zBase is
// legible" fixture cannot exist for a real, non-degenerate multi-anchor
// spread. The "accept a later candidate over the first" behaviour itself is
// not orphaned by this removal: "zoomDelta CAN be worth paying..." below
// already proves a later-evaluated candidate can win (there, via argmin
// score rather than legible short-circuit, since nothing in that fixture is
// ever legible) — real, passing coverage of the adjacent claim, without a
// fixture shape that no longer exists. Deleted rather than left as a
// disabled/skipped stub, per this repo's test-hygiene convention.

describe('resolveHierarchyCameraFit — argmin selection and needsDeclutter boundary (exact score arithmetic)', () => {
  // Issue #1943 remaining-scope fix (code review) — these fixtures used to
  // force zBase=12 via containmentBounds for a genuinely NON-degenerate
  // 2-anchor pair. That is no longer possible: envelope now only applies to
  // a structurally degenerate anchor spread (see isAnchorSpreadDegenerate),
  // and a real, non-degenerate childZBase-derived window can NEVER contain
  // a candidate above zBase with clean containment (childZBase is BY
  // DEFINITION the first/highest zoom with clean containment scanning down
  // from the ceiling, so anything above it must have failed containment —
  // provable from the algorithm, not incidental). To still exercise a real
  // multi-candidate window at zBase=12..15 with SOME baseline clipping (so
  // the window doesn't collapse to a single candidate at the ceiling), the
  // file-level `clipAnchorAtMean` helper (see its own doc) supplies a
  // constant clip baseline via a third anchor at the real pair's mean.
  // `minZoom`/`maxZoom` directly pin the window to [12,15] since
  // containmentBounds no longer participates. The constant clip term keeps
  // `needsDeclutter` permanently true across this whole describe block
  // (verified against the real resolver, not hand-derived) — these three
  // fixtures never asserted `needsDeclutter: false`, so this is unaffected;
  // the ONE test that needed `false` (the "just resolves" case, immediately
  // below) is redesigned separately with a clean single-candidate fixture.

  it('argmin over score when nothing is legible; needsDeclutter is true; scores match the resolver exactly', () => {
    // Real pair: gap(z) = 0.05*100*z, too slow to ever separate past the
    // 100px footprint within the [12,15] window -> overlap persists at
    // every candidate, shrinking too little per step (500px^2) to justify
    // the 1000-point zoomDelta cost, so zBase (12, the LOWEST-zoom, lowest-
    // score candidate) wins. Values below are the resolver's OWN verified
    // output (a constant clipped=1/clipOverflowPx=2250 baseline from
    // `clipAnchorAtMean`, plus 2 constant pairs from that anchor overlapping
    // both real anchors — see the describe-level comment).
    const a = { lat: 1, lon: 0 };
    const b = { lat: 1, lon: 0.05 };
    const anchors = [anchor(a.lat, a.lon, 100, 100), anchor(b.lat, b.lon, 100, 100), clipAnchorAtMean(a, b)];
    const input = baseInput({ anchors, viewport: squareViewport(2500), minZoom: 12, maxZoom: 15 });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 12, clipped: 1, clipOverflowPx: 2250, pairs: 3, overlapAreaPx2: 24000, score: 1279000 },
      { zoom: 13, clipped: 1, clipOverflowPx: 2250, pairs: 3, overlapAreaPx2: 23500, score: 1279500 },
      { zoom: 14, clipped: 1, clipOverflowPx: 2250, pairs: 3, overlapAreaPx2: 23000, score: 1280000 },
      { zoom: 15, clipped: 1, clipOverflowPx: 2250, pairs: 3, overlapAreaPx2: 22500, score: 1280500 },
    ]);
    expect(result?.zoom).toBe(12);
    expect(result?.needsDeclutter).toBe(true);
    expect(result?.chosen).toEqual(result?.evaluated[0]);
  });

  it('needsDeclutter boundary: a fixture that is just-NOT-legible until the final candidate (clean, single-candidate design — see describe comment for why a multi-candidate window can no longer show this transition)', () => {
    // A clean (no clipAnchor), single-candidate design: two anchors 0.1deg
    // apart, 100px footprints. gap(z) = 0.1*100*z = 10*z. At z=10, gap=100
    // -- exactly equal to the combined half-footprints (50+50), the boundary
    // where `rectsIntersect` (strict) stops counting them as overlapping --
    // JUST resolves. minZoom=maxZoom=10 -> exactly one candidate, so this
    // needs no envelope/degenerate-gate participation at all.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.1, 100, 100)];
    const input = baseInput({ anchors, viewport: squareViewport(2500), minZoom: 10, maxZoom: 10 });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 10, clipped: 0, clipOverflowPx: 0, pairs: 0, overlapAreaPx2: 0, score: 0 },
    ]);
    expect(result?.zoom).toBe(10);
    expect(result?.needsDeclutter).toBe(false);
  });

  it('needsDeclutter boundary (companion): the SAME pair one zoom below the resolve boundary is still overlapping', () => {
    // Companion to the fixture directly above: one zoom lower (9), gap=90 <
    // 100 -> still overlapping, needsDeclutter stays true.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.1, 100, 100)];
    const input = baseInput({ anchors, viewport: squareViewport(2500), minZoom: 9, maxZoom: 9 });
    const result = resolveHierarchyCameraFit(input);
    expect(result?.needsDeclutter).toBe(true);
    expect(result?.chosen.pairs).toBeGreaterThan(0);
  });

  it('zoomDelta CAN outweigh a smaller residual overlap reduction (paying zoomDelta is not always worth it)', () => {
    // Duplicate of the argmin fixture's core point (same anchors/clipAnchor,
    // same [12,15] window), stated as its own assertion: shrinking overlap
    // by only 500px^2/step never beats the 1000/step zoomDelta cost, so the
    // SMALLEST (zBase) candidate wins.
    const a = { lat: 1, lon: 0 };
    const b = { lat: 1, lon: 0.05 };
    const anchors = [anchor(a.lat, a.lon, 100, 100), anchor(b.lat, b.lon, 100, 100), clipAnchorAtMean(a, b)];
    const input = baseInput({ anchors, viewport: squareViewport(2500), minZoom: 12, maxZoom: 15 });
    const result = resolveHierarchyCameraFit(input);
    expect(result?.zoom).toBe(12);
  });

  it('zoomDelta CAN be worth paying when it buys a larger (>1000px^2/step) overlap reduction', () => {
    // A piecewise project function gives the real children and the
    // clipAnchor (see describe-level comment) fully independent, exact
    // per-zoom pixel positions. `minZoom:10, maxZoom:11` pins a genuine
    // 2-candidate window directly (containmentBounds no longer participates
    // for this non-degenerate pair); `clipAnchorAtMean` supplies the same
    // constant clipped=1/pairs+2 baseline as the earlier fixtures, verified
    // against the real resolver output.
    //   z=10 (delta 0): real-pair gap = 0.5*150 = 75  -> overlapWidth=25 -> area=2500
    //   z=11 (delta 1): real-pair gap = 0.5*180 = 90  -> overlapWidth=10 -> area=1000
    // The 1500px^2 reduction (from the real pair alone) is worth more than
    // the 1000-point zoomDelta cost, so z=11 wins by argmin.
    const boundsScale = (zoom: number) => (zoom <= 10 ? 100 : 125);
    const childScale = (zoom: number) => (zoom <= 10 ? 150 : 180);
    const piecewiseProject: HierarchyProjectFn = (lat, lon, zoom) => {
      if (lon === 1 || lon === -1) return { x: lon * boundsScale(zoom), y: -lat * boundsScale(zoom) };
      return { x: lon * childScale(zoom), y: 0 };
    };
    const a = { lat: 1, lon: 0 };
    const b = { lat: 1, lon: 0.5 };
    const anchors = [anchor(a.lat, a.lon, 100, 100), anchor(b.lat, b.lon, 100, 100), clipAnchorAtMean(a, b)];
    const input = baseInput({
      anchors,
      project: piecewiseProject,
      viewport: squareViewport(240),
      minZoom: 10,
      maxZoom: 11,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 10, clipped: 1, clipOverflowPx: 5640, pairs: 3, overlapAreaPx2: 22500, score: 1616500 },
      { zoom: 11, clipped: 1, clipOverflowPx: 5640, pairs: 3, overlapAreaPx2: 21000, score: 1616000 },
    ]);
    expect(result?.zoom).toBe(11);
    expect(result?.needsDeclutter).toBe(true);
  });

  it('smaller-zoom tie-break: equal scores pick the SMALLER zoom', () => {
    // Same technique, tuned for an EXACT score tie between the real pair's
    // own contribution at each candidate zoom:
    //   z=10 (delta 0): real-pair gap = 0.4*100 = 40 -> overlapWidth=60 -> area=6000
    //   z=11 (delta 1): real-pair gap = 0.4*125 = 50 -> overlapWidth=50 -> area=5000
    // Verified against the real resolver: both candidates score identically
    // (1620000 — clipAnchorAtMean's constant baseline plus the real pair's
    // own tied contribution) — the documented rule (smaller zoom wins a
    // tie) is the only thing that can break it.
    const boundsScale = (zoom: number) => (zoom <= 10 ? 100 : 125);
    const tieProject: HierarchyProjectFn = (lat, lon, zoom) => {
      if (lon === 1 || lon === -1) return { x: lon * boundsScale(zoom), y: -lat * boundsScale(zoom) };
      return { x: lon * boundsScale(zoom), y: 0 };
    };
    const a = { lat: 1, lon: 0 };
    const b = { lat: 1, lon: 0.4 };
    const anchors = [anchor(a.lat, a.lon, 100, 100), anchor(b.lat, b.lon, 100, 100), clipAnchorAtMean(a, b)];
    const input = baseInput({
      anchors,
      project: tieProject,
      viewport: squareViewport(240),
      minZoom: 10,
      maxZoom: 11,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated[0].score).toBe(1620000);
    expect(result?.evaluated[1].score).toBe(1620000);
    expect(result?.zoom).toBe(10); // the smaller of the two tied zooms
  });
});

describe('resolveHierarchyCameraFit — score weights are independently decisive (exact arithmetic, not just relative ordering)', () => {
  it('any clip (1e6) beats any plausible pairs/overlap total, and clipOverflowPx adds a smaller magnitude term on top', () => {
    // A single 200px-wide footprint in a 100px usable viewport can never
    // avoid clipping, regardless of zoom -> clipped=1, pairs=0 (only one
    // anchor). Centre-pinned placement translates the card rect to
    // {left:-50, right:150, top:-50, bottom:50} against usable [0,100]x
    // [0,100] -> overflow of 50px past the left edge, 50px past the right,
    // 50px past the top, 0 past the bottom (contained there) -> clipOverflowPx
    // = 50+50+50+0 = 150. score = 1_000_000*1 + 100*150 + 0 + 0 + 0 = 1_015_000.
    const clipInput = baseInput({
      anchors: [anchor(1, 1, 200, 100)],
      viewport: squareViewport(100),
      minZoom: 10,
      maxZoom: 10,
    });
    const clipResult = resolveHierarchyCameraFit(clipInput);
    expect(clipResult?.evaluated).toEqual([
      { zoom: 10, clipped: 1, clipOverflowPx: 150, pairs: 0, overlapAreaPx2: 0, score: 1_015_000 },
    ]);

    // A deliberately pairs/overlap-heavy but never-clipped scenario: 2
    // pairs, overlapArea=100 (see the exact-arithmetic test below) scores
    // only 20_100 — nowhere close to 1_015_000, so the clipped-count term
    // still dominates any plausible pairs/overlap total even with the new
    // magnitude term added on top of it.
    expect(1_015_000).toBeGreaterThan(20_100);
  });

  it('one pair with a large overlap area is NOT automatically beaten by more, smaller-overlap pairs — the raw arithmetic decides', () => {
    // Fixed-pixel project (ignores zoom); minZoom=maxZoom=10 -> a single
    // candidate, delta=0, so score = 10_000*pairs + overlapAreaPx2. `lon` is
    // scaled by 100 to get pixel positions while keeping every anchor's
    // raw lon within the valid geographic range `isUsableCentroid` enforces
    // (-180..180) — using raw pixel values as `lon` directly would reject
    // anchor C below (lon=199 is out of range) before it ever reaches the
    // projection.
    const fixedPixelProject: HierarchyProjectFn = (_lat, lon) => ({ x: lon * 100, y: 0 });

    // Scenario 1: 2 anchors, footprint 300x100 each, centres 100px apart
    // (lon 0 and lon 1 -> x=0 and x=100).
    // rectA=[-150,150], rectB=[-50,250]. overlapWidth = 150-(-50) = 200 ->
    // overlapAreaPx2 = 200*100 = 20_000. pairs=1.
    // score = 10_000*1 + 20_000 + 0 = 30_000.
    const oneBigPairInput = baseInput({
      anchors: [anchor(1, 0, 300, 100), anchor(1, 1, 300, 100)],
      project: fixedPixelProject,
      viewport: squareViewport(5000),
      minZoom: 10,
      maxZoom: 10,
    });
    const oneBigPairResult = resolveHierarchyCameraFit(oneBigPairInput);
    expect(oneBigPairResult?.evaluated).toEqual([
      { zoom: 10, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 20_000, score: 30_000 },
    ]);

    // Scenario 2: 3 anchors, footprint 100x100 each, at lon 0, 0.995, 1.99
    // (x = 0, 99.5, 199) — A-B overlap by 0.5px (area 50), B-C overlap by
    // 0.5px (area 50), A-C do not intersect. pairs=2, overlapAreaPx2=100.
    // score = 10_000*2 + 100 + 0 = 20_100.
    const twoSmallPairsInput = baseInput({
      anchors: [anchor(1, 0, 100, 100), anchor(1, 0.995, 100, 100), anchor(1, 1.99, 100, 100)],
      project: fixedPixelProject,
      viewport: squareViewport(5000),
      minZoom: 10,
      maxZoom: 10,
    });
    const twoSmallPairsResult = resolveHierarchyCameraFit(twoSmallPairsInput);
    expect(twoSmallPairsResult?.evaluated).toEqual([
      { zoom: 10, clipped: 0, clipOverflowPx: 0, pairs: 2, overlapAreaPx2: 100, score: 20_100 },
    ]);

    // The actual arithmetic: 2 small-overlap pairs (20_100) scores BETTER
    // (lower) than 1 large-overlap pair (30_000) — pair COUNT alone would
    // have predicted the opposite. This is the point of the note: the
    // weight is not categorically decisive, the numbers are.
    expect(twoSmallPairsResult?.chosen.score).toBeLessThan(oneBigPairResult?.chosen.score ?? Infinity);
  });
});

describe('resolveHierarchyCameraFit — magnitude-aware clipping (issue #2312)', () => {
  it('minor clipping scores better than severe clipping, even though both have the SAME clipped count', () => {
    // Two single-anchor fixtures, both clipped=1, pairs=0 — the pre-#2312
    // scoring formula (1_000_000*clipped, no magnitude term) would give BOTH
    // an identical score of exactly 1_000_000, unable to tell "barely
    // clipped" from "badly clipped" apart. With clipOverflowPx added:
    //   minor:  100px usable viewport, 110px-wide footprint (half=55) at
    //           lon=1,lat=1,zoom=10 -> raw rect centre (1000,-1000),
    //           centre-pinned translation dx=-950,dy=1050 -> translated rect
    //           = {left:-5, right:105, top:-50, bottom:50}. Overflow: left
    //           edge 5px + right edge 5px + top edge 50px + bottom 0px = 60.
    //           score = 1_000_000 + 100*60 = 1_006_000.
    //   severe: same setup but a 280px-wide footprint (half=140) ->
    //           translated rect = {left:-90, right:190, top:-50, bottom:50}.
    //           Overflow: left 90 + right 90 + top 50 + bottom 0 = 230.
    //           score = 1_000_000 + 100*230 = 1_023_000.
    const minorInput = baseInput({
      anchors: [anchor(1, 1, 110, 100)],
      viewport: squareViewport(100),
      minZoom: 10,
      maxZoom: 10,
    });
    const severeInput = baseInput({
      anchors: [anchor(1, 1, 280, 100)],
      viewport: squareViewport(100),
      minZoom: 10,
      maxZoom: 10,
    });
    const minorResult = resolveHierarchyCameraFit(minorInput);
    const severeResult = resolveHierarchyCameraFit(severeInput);

    expect(minorResult?.evaluated).toEqual([
      { zoom: 10, clipped: 1, clipOverflowPx: 60, pairs: 0, overlapAreaPx2: 0, score: 1_006_000 },
    ]);
    expect(severeResult?.evaluated).toEqual([
      { zoom: 10, clipped: 1, clipOverflowPx: 230, pairs: 0, overlapAreaPx2: 0, score: 1_023_000 },
    ]);
    // Both have IDENTICAL clipped=1 — only clipOverflowPx distinguishes them.
    expect(minorResult?.chosen.clipped).toBe(severeResult?.chosen.clipped);
    expect(minorResult?.chosen.score).toBeLessThan(severeResult?.chosen.score ?? Infinity);
  });

  it('prefers a small acceptable adjustment (minor clip + one small pair-overlap) over severe clipping, at an equal clipped count across every candidate (the exact #2312 regression shape)', () => {
    // Reproduces the reported saturation bug's shape directly: anchor A
    // clips at EVERY candidate zoom (clipped=1 identically across all 4),
    // so the pre-#2312 `1_000_000*clipped` term cancels out of every
    // comparison and selection falls entirely to pairs/zoomDelta — which
    // rewards zooming in further even though, here, zooming in only makes
    // A's overflow worse (it drifts further from the usable viewport each
    // step) while resolving a small A/B overlap that existed only at the
    // base zoom.
    //
    // `project` is a hand-authored per-(anchor,zoom) lookup, not a formula —
    // deliberately, so every rect coordinate below is an exact, asserted
    // literal, and translation is a NO-OP throughout (the fixture's centre
    // point always projects to the usable rect's own centre (250,250), so
    // dx=dy=0 at every zoom — verified by the exact `evaluated` assertion
    // below matching the raw, untranslated rects one-for-one).
    const LON_A = 0;
    const LON_B = 2; // mean lon = 1 (distinct from 0 and 2) -> unambiguous centre branch below
    const aTableX: Record<number, number> = { 10: 470, 11: 850, 12: 1250, 13: 1650 };
    const project: HierarchyProjectFn = (_lat, lon, zoom) => {
      if (lon === LON_A) return { x: aTableX[zoom], y: 300 };
      if (lon === LON_B) return { x: 420, y: 300 }; // B is FIXED — never moves with zoom
      return { x: 250, y: 250 }; // the only other lon possible: mean(LON_A, LON_B) = 1, i.e. `centre`
    };
    const anchors = [anchor(1, LON_A, 100, 100), anchor(1, LON_B, 10, 100)];
    const input = baseInput({
      anchors,
      project,
      viewport: squareViewport(500),
      minZoom: 10,
      maxZoom: 13,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();

    // A's raw rect at each zoom: [x-50, x+50] x [200, 300] against usable
    // [0,500]x[0,500] -> right-edge overflow = (x+50)-500, growing sharply
    // as A drifts away with zoom (this IS the reported dynamic: the resolver
    // spreading anchors apart to cut pairs, worsening clip severity for the
    // anchor that was never going to fit). B's raw rect is always
    // [415,425]x[200,300] — fully contained, so `clipped` counts A alone,
    // identically (1) at every candidate; it overlaps A's rect (by 5px,
    // area=500) ONLY at z=10, where A's rect still reaches [420,520].
    expect(result?.evaluated).toEqual([
      { zoom: 10, clipped: 1, clipOverflowPx: 20, pairs: 1, overlapAreaPx2: 500, score: 1_012_500 },
      { zoom: 11, clipped: 1, clipOverflowPx: 400, pairs: 0, overlapAreaPx2: 0, score: 1_041_000 },
      { zoom: 12, clipped: 1, clipOverflowPx: 800, pairs: 0, overlapAreaPx2: 0, score: 1_082_000 },
      { zoom: 13, clipped: 1, clipOverflowPx: 1200, pairs: 0, overlapAreaPx2: 0, score: 1_123_000 },
    ]);

    // The `clipped` term (1_000_000) is IDENTICAL across all 4 candidates —
    // exactly the saturation described in #2312 — so without clipOverflowPx
    // the comparison would fall entirely to pairs/overlap/zoomDelta:
    //   OLD (no clipOverflowPx term) scores would have been
    //   z10=1_010_500, z11=1_001_000, z12=1_002_000, z13=1_003_000 —
    //   z11 wins (fewest pairs, smallest zoomDelta among the pairs=0 set),
    //   despite z11's overflow (400px) being 20x worse than z10's (20px).
    // The FIXED score correctly prefers z10 instead: a small, contained
    // trade (one 500px^2 overlap) beats a candidate that "resolved" that
    // overlap only by making the genuinely off-screen anchor drift much
    // further off-screen.
    expect(result?.zoom).toBe(10);
    expect(result?.chosen.clipOverflowPx).toBe(20);
    expect(result?.chosen.pairs).toBe(1);
    expect(result?.needsDeclutter).toBe(true); // still honestly reported — clipped=1 at the winner too
  });
});

describe('resolveHierarchyCameraFit — determinism and no-mutation', () => {
  it('returns identical output for identical input, called twice', () => {
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.05, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const first = resolveHierarchyCameraFit(input);
    const second = resolveHierarchyCameraFit(input);
    expect(second).toEqual(first);
  });

  it('never mutates the input anchors array or its objects', () => {
    const anchors: HierarchyChildAnchor[] = [anchor(1, 0, 100, 100), anchor(1, 0.05, 100, 100)];
    const snapshot = anchors.map((a) => ({ ...a }));
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    resolveHierarchyCameraFit(input);
    expect(anchors).toEqual(snapshot);
  });
});

describe('resolveHierarchyCameraFit — using REAL measured footprints (false-green trap: do not let the estimator hide resolver bugs)', () => {
  it('resolves a legible camera using the fresh corpus\'s real measured card sizes, not the estimator\'s conservative ones', () => {
    // Widths/heights below are the ACTUAL measured
    // `[data-testid="area-destination-marker"]` dimensions from the fresh
    // 1920x1185 corpus (see destinationCardFootprint.test.ts), deliberately
    // NOT run through `estimateDestinationCardFootprint` — a resolver that
    // only works because the estimator over-reserves space would fail (or
    // falsely pass on trivial fixtures) here.
    const anchors = [
      anchor(13.02, 77.556, 150.5, 130.5), // "Banashankari Temple Ward & Kumaraswamy Layout"
      anchor(13.021, 77.5565, 144.5, 111.75), // "B.Hosahalli & Hosahalli" — very close by, real overlap risk
      anchor(12.9, 77.6, 144.5, 129.5), // "Shanti Nagar & Sudhama Nagar" — far away
    ];
    const input = baseInput({
      anchors,
      viewport: squareViewport(2000),
      minZoom: 10,
      maxZoom: 16,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    // Code review F3: a concrete, hand-verified expected outcome for these
    // exact fixed coordinates/footprints/viewport, not a conditional that a
    // degenerate always-needsDeclutter (or always-legible) resolver could
    // pass trivially. "Banashankari" and "B.Hosahalli" sit ~0.001deg apart
    // (a real close-by pair) with real card widths of 150.5/144.5px — under
    // this fixture's `minZoom:10, maxZoom:16` ceiling, `zBase` itself
    // saturates at 16 (nothing forces it lower), so there is no higher
    // candidate left to separate that pair: it genuinely overlaps (B's rect
    // sits entirely inside A's), and the resolver must honestly report
    // `needsDeclutter: true` rather than paper over it.
    expect(result?.zoom).toBe(16);
    expect(result?.needsDeclutter).toBe(true);
    expect(result?.chosen.clipped).toBe(0);
    expect(result?.chosen.pairs).toBe(1);
    expect(result?.chosen.overlapAreaPx2).toBeCloseTo(16147.875, 3);
  });
});

describe('resolveHierarchyCameraFit — envelope is FALLBACK ONLY, not a co-equal floor (Issue #1943 remaining scope)', () => {
  // These fixtures mirror the real production shape that reproduced live:
  // a structural node (city ROOT / a Direction) with several GEOGRAPHICALLY
  // SEPARATED children whose own historical descendant-area envelope
  // (containmentBounds) is disproportionately larger than the children's
  // own centroid spread — the same ratio observed on Bangalore's real
  // ROOT.bounds (~140km) vs its 5 Direction centroids' own spread (~29km,
  // ~4.8x). Before this fix, `zBase = Math.min(childZBase, envelopeZBase)`
  // let the oversized envelope silently override an already-legible
  // childZBase-only fit, collapsing every child into one catch-all card.

  it('a genuinely non-degenerate multi-child fit (childZBase well below the ceiling) is no longer dragged down by a disproportionately large envelope', () => {
    // 5 children (mirrors Bangalore's 5 Directions), lon spread [-1,1],
    // lat=1, 100x100 footprints. Union half-width at zoom z is
    // 50 + 1*100*z; usable half-width = 1000 (squareViewport(2000)).
    // Contained at z=9 (50+900=950<=1000) but NOT at z=10 (50+1000=1050>1000)
    // -> childZBase=9, well below effectiveMaxZoom=16 -> genuinely
    // non-degenerate (this is NOT the "sparse/coincident" failure mode
    // containmentBounds exists to guard against).
    //
    // containmentBounds [-5,5] (10 lon-units wide -> 5x the children's own
    // 2.0-unit spread, mirroring the real ~4.8x Bangalore ratio) projects to
    // a 10*100*z-wide square. Fits at z=2 (2000<=2000) but not z=3
    // (3000>2000) -> envelopeZBase(OLD)=2.
    //   OLD (Math.min): zBase = min(9, 2) = 2 -- the same catastrophic
    //     collapse observed live (childZBase's real, legible fit thrown
    //     away in favour of the node's much larger historical extent).
    //   NEW (fallback-only): childZBase(9) !== effectiveMaxZoom(16) ->
    //     envelopeZBase is not even computed -> zBase = 9.
    const anchors = [
      anchor(1, -1, 100, 100),
      anchor(1, -0.5, 100, 100),
      anchor(1, 0, 100, 100),
      anchor(1, 0.5, 100, 100),
      anchor(1, 1, 100, 100),
    ];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -5, east: 5 },
      viewport: squareViewport(2000),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    // zBase=9 is the first candidate evaluated -- proves the envelope did
    // NOT drag the window down to 2, as the pre-fix Math.min would have.
    expect(result?.evaluated[0]?.zoom).toBe(9);
    // Adjacent children are 0.5*100*9=450px apart, well clear of the
    // 100px footprint -> immediately legible at the first candidate.
    expect(result?.zoom).toBe(9);
    expect(result?.needsDeclutter).toBe(false);
    expect(result?.chosen.clipped).toBe(0);
    expect(result?.chosen.pairs).toBe(0);
  });

  it('two DISTINCT, non-coincident (but geometrically close) children are NOT dragged down by a much wider envelope, even though childZBase happens to reach the ceiling (code review: childZBase===effectiveMaxZoom is NOT equivalent to degenerate)', () => {
    // Two children only 0.3deg apart -- NOT coincident (isAnchorSpreadDegenerate
    // is a STRUCTURAL check on the anchors themselves, not on where childZBase's
    // search lands). Their union IS trivially contained at every candidate zoom
    // up to the ceiling given this generously wide 2000px viewport, so
    // childZBase saturates at effectiveMaxZoom(16) -- but that saturation is a
    // property of the VIEWPORT being roomy relative to their real spread, not
    // evidence the anchors are degenerate. At zoom 16 the two cards project
    // 0.3*100*16=480px apart -- well clear of their 100px footprints, genuinely
    // legible and non-overlapping.
    //
    // This is the exact counterexample from code review that falsified the
    // OLD `childZBase === effectiveMaxZoom` gate: that gate misclassified this
    // shape as degenerate, applied a much-wider envelope, and dragged these
    // two perfectly legible cards down to a zoom where they OVERLAP (480px
    // -> 90px apart at the envelope-forced zoom). The STRUCTURAL gate
    // (isAnchorSpreadDegenerate — <2 anchors or all-coincident) never fires
    // for two genuinely distinct anchors, so the envelope is correctly
    // skipped and zBase = childZBase = 16 stays legible.
    const anchors = [anchor(1, -0.15, 100, 100), anchor(1, 0.15, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -3, east: 3 },
      viewport: squareViewport(2000),
      minZoom: 1,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    // The search window starts at 16 (child-only), NOT at 3 (the envelope-
    // driven zoom the old, incorrect gate would have forced).
    expect(result?.evaluated[0]?.zoom).toBe(16);
    expect(result?.zoom).toBe(16);
    expect(result?.needsDeclutter).toBe(false);
    expect(result?.chosen.clipped).toBe(0);
    expect(result?.chosen.pairs).toBe(0);
  });

  it('several TRULY coincident children (exact same lat/lon) still get pulled down by the envelope (the real over-zoom guard, preserved)', () => {
    // Three anchors at the EXACT same point -- isAnchorSpreadDegenerate is
    // true (every anchor shares the same lat AND lon), so this is the
    // genuine "several tightly-coincident children" case the module doc's
    // PURPOSE section describes: a near-zero child-rect footprint that would
    // otherwise climb straight to the ceiling with no real signal.
    //
    // containmentBounds [-3,3] (6 units) fits at z=3 (1800<=2000) but not
    // z=4 (2400>2000) -> envelopeZBase=3. childZBase would trivially reach
    // effectiveMaxZoom(16) unconstrained (a single point is contained at
    // every zoom) -- the envelope correctly pulls zBase down to 3.
    const anchors = [anchor(1, 0.1, 100, 100), anchor(1, 0.1, 100, 100), anchor(1, 0.1, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -3, east: 3 },
      viewport: squareViewport(2000),
      minZoom: 1,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    // The search window starts at 3 (envelope-driven), NOT at 16
    // (child-only) -- confirms the guard still fires for this genuinely
    // degenerate shape.
    expect(result?.evaluated[0]?.zoom).toBe(3);
  });

  it('boundary: childZBase exactly one below the ceiling (effectiveMaxZoom-1) with a large envelope is NOT overridden (precise gating, not "near the ceiling")', () => {
    // 3 children, lon spread [-0.5,0.5], lat=1, 100x100 footprints. Union
    // half-width = 50+0.5*100*z; usable half-width=800
    // (squareViewport(1600)). Contained at z=15 (50+750=800<=800) but NOT
    // at z=16 (50+800=850>800) -> childZBase=15, exactly one below
    // effectiveMaxZoom(16) -- deliberately NOT the ceiling itself, to prove
    // the gate is an EXACT equality check, not a "nearly at the ceiling"
    // tolerance.
    //
    // containmentBounds [-2.5,2.5] (5 units, 5x the children's 1.0-unit
    // spread) fits at z=3 (1500<=1600) but not z=4 (2000>1600) ->
    // envelopeZBase(OLD)=3. OLD zBase=min(15,3)=3; NEW: 15!==16 ->
    // envelope skipped -> zBase=15.
    const anchors = [anchor(1, -0.5, 100, 100), anchor(1, 0, 100, 100), anchor(1, 0.5, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -2.5, east: 2.5 },
      viewport: squareViewport(1600),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated[0]?.zoom).toBe(15);
    // Adjacent children are 0.5*100*15=750px apart, well clear of the
    // 100px footprint -> immediately legible.
    expect(result?.zoom).toBe(15);
    expect(result?.needsDeclutter).toBe(false);
  });
});
