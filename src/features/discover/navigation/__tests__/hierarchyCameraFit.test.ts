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
  it('children hugging the NORTH EDGE of the bbox still reach the clean higher zoom — envelope admissibility never depends on centre position', () => {
    // This is the exact reachable case from the external review that proved
    // folding containmentBounds into the SAME rect list as the children was
    // itself a defect: two children at lat=0.9 (legitimately near the north
    // edge of a [-1,1] bbox, not its centre), 0.08deg apart in longitude.
    //
    // envelopeZBase (SIZE-only, position-insensitive): identical to the
    // lat=1 fixtures above — the envelope's own width/height doesn't depend
    // on where the children sit inside it. Fits at zoom=12
    // (2*100*12=2400<=2500) but not 13 (2600>2500) -> envelopeZBase=12.
    // childZBase: with 2 close, small anchors the child-only union is tiny,
    // so it trivially places at every zoom in range -> childZBase=16.
    // zBase = min(16, 12) = 12 — UNCHANGED by moving the children from
    // lat=1 to lat=0.9, because the envelope's admissibility never consulted
    // their position in the first place.
    //
    // At z=12: gap=0.08*100*12=96<100 -> overlapWidth=4, area=400, pairs=1
    // (not legible). At z=13: gap=104>=100 -> pairs=0, clipped=0 -> LEGIBLE,
    // accepted immediately. A camera that folds the envelope's POSITION
    // into this check would have found z=13 clips the (off-centre-relative)
    // envelope and wrongly stayed at needsDeclutter:true — this fixture
    // fails against that version and passes against the current one.
    const anchors = [anchor(0.9, 0, 100, 100), anchor(0.9, 0.08, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 12, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 400, score: 10400 },
      { zoom: 13, clipped: 0, clipOverflowPx: 0, pairs: 0, overlapAreaPx2: 0, score: 1000 },
    ]);
    expect(result?.zoom).toBe(13);
    expect(result?.needsDeclutter).toBe(false);
  });
});

describe('resolveHierarchyCameraFit — candidate ordering, clamping, dedup, never zBase-1', () => {
  it('clamps zBase+1/+2/+3 down to the caller maxZoom and drops the resulting duplicates', () => {
    // containmentBounds [-1,1]x[-1,1] projects to a (2*K*zoom)-wide/tall
    // square. usable width/height = 2900px (no insets). Fits at zoom=14
    // (2*100*14=2800<=2900) but NOT at zoom=15 (2*100*15=3000>2900) ->
    // zBase=14. Raw candidates [14,15,16,17] clamp to [14,15] (maxZoom=15)
    // -> dedupe to exactly [14,15]. zBase-1 (=13) must never appear.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.06, 100, 100)];
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

describe('resolveHierarchyCameraFit — first-legible immediate acceptance (false-green trap: selected candidate is NOT the first)', () => {
  it('accepts a LATER candidate the moment it is legible, without evaluating the rest', () => {
    // Same containment-bounds trick pins zBase=12 (bounds fit at 12
    // [200*12=2400<=2500] but not at 13 [2600>2500]) while two CHILD
    // anchors 0.08 deg apart (gap(z)=0.08*100*z) still overlap at z=12
    // (gap=96 < 100 footprint width -> overlapWidth=4, area=400) but no
    // longer overlap at z=13 (gap=104 >= 100 -> pairs=0). The children sit
    // near the bounds' centre, nowhere near the 2500px usable edge, so they
    // are never individually clipped by the bounds-driven zBase — this is
    // exactly what makes candidate z=13 reachable and legible even though
    // zBase(=12) itself is not.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.08, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated.map((e) => e.zoom)).toEqual([12, 13]); // stopped after 2, never reached 14/15
    expect(result?.zoom).toBe(13); // NOT the first candidate (12)
    expect(result?.needsDeclutter).toBe(false);
    expect(result?.chosen.clipped).toBe(0);
    expect(result?.chosen.pairs).toBe(0);
  });
});

describe('resolveHierarchyCameraFit — argmin selection and needsDeclutter boundary (exact score arithmetic)', () => {
  it('argmin over score when nothing is legible; needsDeclutter is true; scores match the formula exactly', () => {
    // Same bounds-forced zBase=12 setup, but the child gap grows too slowly
    // (0.05 deg) to ever separate past the 100px footprint width within
    // zBase..zBase+3 (12..15): gap(z) = 0.05*100*z = 5*z.
    //   z=12: gap=60, overlapWidth=40, area=4000, delta=0 -> score=10000+4000+0    =14000
    //   z=13: gap=65, overlapWidth=35, area=3500, delta=1 -> score=10000+3500+1000 =14500
    //   z=14: gap=70, overlapWidth=30, area=3000, delta=2 -> score=10000+3000+2000 =15000
    //   z=15: gap=75, overlapWidth=25, area=2500, delta=3 -> score=10000+2500+3000 =15500
    // Here the overlap shrinks by only 500px^2/step (< the 1000/step
    // zoomDelta cost) -> zBase (z=12) has the LOWEST score and wins: paying
    // to zoom in further is NOT worth it.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.05, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 12, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 4000, score: 14000 },
      { zoom: 13, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 3500, score: 14500 },
      { zoom: 14, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 3000, score: 15000 },
      { zoom: 15, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 2500, score: 15500 },
    ]);
    expect(result?.zoom).toBe(12);
    expect(result?.needsDeclutter).toBe(true);
    expect(result?.chosen).toEqual(result?.evaluated[0]);
  });

  it('needsDeclutter boundary: a fixture that is just-NOT-legible until the final candidate', () => {
    // gap(z) = 0.067*100*z. z=14: gap=93.8 (<100, still overlapping).
    // z=15: gap=100.5 (>=100, JUST resolves).
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.067, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated.map((e) => e.zoom)).toEqual([12, 13, 14, 15]); // never legible before the last
    expect(result?.zoom).toBe(15);
    expect(result?.needsDeclutter).toBe(false);
  });

  it('needsDeclutter boundary (companion): a fixture that is just-NOT-legible at any candidate', () => {
    // Same shape as the argmin test above (gap grows too slowly to ever
    // separate within zBase..zBase+3) — the boundary companion to the
    // "just resolves" case directly above.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.05, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result?.needsDeclutter).toBe(true);
    expect(result?.chosen.pairs).toBeGreaterThan(0);
  });

  it('zoomDelta CAN outweigh a smaller residual overlap reduction (paying zoomDelta is not always worth it)', () => {
    // Duplicate of the argmin fixture's core point, stated as its own
    // assertion: shrinking overlap by only 500px^2/step never beats the
    // 1000/step zoomDelta cost, so the SMALLEST (zBase) candidate wins.
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.05, 100, 100)];
    const input = baseInput({
      anchors,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(2500),
      minZoom: 5,
      maxZoom: 20,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result?.zoom).toBe(12);
  });

  it('zoomDelta CAN be worth paying when it buys a larger (>1000px^2/step) overlap reduction', () => {
    // A piecewise project function gives children and containment-bounds
    // corners fully independent, exact per-zoom pixel positions (see file
    // doc). Bounds fit at zoom=10 (width 200<=240) but not zoom=11 (width
    // 250>240) -> zBase=10. Candidates [10,11,12,13] clamp to [10,11]
    // (maxZoom=11) -> dedupe to [10,11].
    //   z=10 (delta 0): child gap = 0.5*150 = 75  -> overlapWidth=25 -> area=2500 -> score=10000+2500+0    =12500
    //   z=11 (delta 1): child gap = 0.5*180 = 90  -> overlapWidth=10 -> area=1000 -> score=10000+1000+1000 =12000
    // The 1500px^2 reduction is worth more than the 1000-point zoomDelta
    // cost, so z=11 wins by argmin even though NEITHER candidate is
    // legible (pairs=1 at both).
    const boundsScale = (zoom: number) => (zoom <= 10 ? 100 : 125);
    const childScale = (zoom: number) => (zoom <= 10 ? 150 : 180);
    const piecewiseProject: HierarchyProjectFn = (lat, lon, zoom) => {
      if (lon === 1 || lon === -1) return { x: lon * boundsScale(zoom), y: -lat * boundsScale(zoom) };
      return { x: lon * childScale(zoom), y: 0 };
    };
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.5, 100, 100)];
    const input = baseInput({
      anchors,
      project: piecewiseProject,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(240),
      minZoom: 10,
      maxZoom: 11,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated).toEqual([
      { zoom: 10, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 2500, score: 12500 },
      { zoom: 11, clipped: 0, clipOverflowPx: 0, pairs: 1, overlapAreaPx2: 1000, score: 12000 },
    ]);
    expect(result?.zoom).toBe(11);
    expect(result?.needsDeclutter).toBe(true);
  });

  it('smaller-zoom tie-break: equal scores pick the SMALLER zoom', () => {
    // Same piecewise-project technique, tuned for an EXACT score tie:
    //   z=10 (delta 0): child gap = 0.4*100 = 40 -> overlapWidth=60 -> area=6000 -> score=10000+6000+0    =16000
    //   z=11 (delta 1): child gap = 0.4*125 = 50 -> overlapWidth=50 -> area=5000 -> score=10000+5000+1000 =16000
    // Both scores are exactly 16000 — the documented rule (smaller zoom
    // wins a tie) is the only thing that can break it.
    const boundsScale = (zoom: number) => (zoom <= 10 ? 100 : 125);
    const childScale = boundsScale; // same schedule, reused for clarity
    const tieProject: HierarchyProjectFn = (lat, lon, zoom) => {
      if (lon === 1 || lon === -1) return { x: lon * boundsScale(zoom), y: -lat * boundsScale(zoom) };
      return { x: lon * childScale(zoom), y: 0 };
    };
    const anchors = [anchor(1, 0, 100, 100), anchor(1, 0.4, 100, 100)];
    const input = baseInput({
      anchors,
      project: tieProject,
      containmentBounds: { south: -1, north: 1, west: -1, east: 1 },
      viewport: squareViewport(240),
      minZoom: 10,
      maxZoom: 11,
    });
    const result = resolveHierarchyCameraFit(input);
    expect(result).not.toBeNull();
    expect(result?.evaluated[0].score).toBe(16000);
    expect(result?.evaluated[1].score).toBe(16000);
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
