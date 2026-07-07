/**
 * Table-driven stress tests for the pure area-marker bucketing algorithm.
 * Issue #1798 PR-B — design-spec-area-marker-ux.md §9 stress cases.
 *
 * Uses a FAKE linear projection (no Leaflet/browser) so the algorithm is
 * verified in complete isolation from the map.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAreaMarkers,
  computeBand,
  type RankableArea,
  type AreaMarkerGroupBounds,
  type ComputeAreaMarkersInput,
} from './areaMarkerBucketing';

// ─── Fixtures / helpers ──────────────────────────────────────────────────────

const BOUNDS: AreaMarkerGroupBounds = { minLat: 13.0, minLon: 77.5, maxLat: 13.2, maxLon: 77.7 };
const VIEWPORT = { width: 1000, height: 800 };
const SCALE = 4000; // deg -> px scale for the fake projection

/** Fake linear projection — matches the task brief's suggested shape. */
function makeProjection(bounds: AreaMarkerGroupBounds) {
  return (lat: number, lon: number) => ({
    x: (lon - bounds.minLon) * SCALE,
    y: (bounds.maxLat - lat) * SCALE,
  });
}

function area(id: string, count: number, lat: number, lon: number): RankableArea {
  return { id, name: id, count, lat, lon };
}

function baseInput(overrides: Partial<ComputeAreaMarkersInput>): ComputeAreaMarkersInput {
  return {
    areas: [],
    project: makeProjection(BOUNDS),
    viewport: VIEWPORT,
    zoom: 14,
    forced: {},
    groupBounds: BOUNDS,
    ...overrides,
  };
}

/** N areas evenly spread across the bounds on a roughly square grid. */
function spreadAreas(n: number, countFn: (i: number) => number = () => 5): RankableArea[] {
  const cols = Math.ceil(Math.sqrt(n));
  const areas: RankableArea[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const lat = BOUNDS.minLat + ((row + 0.5) / cols) * (BOUNDS.maxLat - BOUNDS.minLat);
    const lon = BOUNDS.minLon + ((col + 0.5) / cols) * (BOUNDS.maxLon - BOUNDS.minLon);
    areas.push(area(`area-${i}`, countFn(i), lat, lon));
  }
  return areas;
}

/**
 * K "hot spot" positions spread across an inset region of a box (so they stay
 * well clear of the box edges, leaving room for separately-placed fixtures).
 */
function spreadPositionsInBox(
  k: number,
  box: AreaMarkerGroupBounds,
  inset = 0.15,
): Array<{ lat: number; lon: number }> {
  const cols = Math.ceil(Math.sqrt(k));
  const latSpan = (box.maxLat - box.minLat) * (1 - 2 * inset);
  const lonSpan = (box.maxLon - box.minLon) * (1 - 2 * inset);
  const latStart = box.minLat + (box.maxLat - box.minLat) * inset;
  const lonStart = box.minLon + (box.maxLon - box.minLon) * inset;
  const positions: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < k; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const lat = latStart + (cols <= 1 ? latSpan / 2 : (row / (cols - 1)) * latSpan);
    const lon = lonStart + (cols <= 1 ? lonSpan / 2 : (col / (cols - 1)) * lonSpan);
    positions.push({ lat, lon });
  }
  return positions;
}

/** The NE quadrant of BOUNDS, relative to its own centroid. */
const NE_QUADRANT_BOX: AreaMarkerGroupBounds = {
  minLat: (BOUNDS.minLat + BOUNDS.maxLat) / 2,
  minLon: (BOUNDS.minLon + BOUNDS.maxLon) / 2,
  maxLat: BOUNDS.maxLat,
  maxLon: BOUNDS.maxLon,
};

/**
 * N areas clustered around a handful of "hot spot" centers confined to the
 * NE quadrant (default ~3 areas per center) — models a dense core where many
 * areas compete for a few grid cells (unlike `spreadAreas`, which places
 * every area in its own cell), while leaving the other three quadrants free
 * for separately-placed low-count edge fixtures in individual tests.
 */
function tightCoreAreas(
  n: number,
  countFn: (i: number) => number = () => 3,
  centers: number = Math.max(1, Math.ceil(n / 3)),
): RankableArea[] {
  const positions = spreadPositionsInBox(centers, NE_QUADRANT_BOX);
  const areas: RankableArea[] = [];
  for (let i = 0; i < n; i++) {
    const pos = positions[i % positions.length];
    // Sub-cell jitter (a few px at SCALE=4000) so members of one hot spot
    // land in the same grid cell as their center, deterministically.
    const jLat = (((i * 13) % 5) - 2) * 0.0003;
    const jLon = (((i * 29) % 5) - 2) * 0.0003;
    areas.push(area(`core-${i}`, countFn(i), pos.lat + jLat, pos.lon + jLon));
  }
  return areas;
}

function allAreaIds(result: ReturnType<typeof computeAreaMarkers>): string[] {
  const ids = [
    ...result.representatives.map((a) => a.id),
    ...result.dots.map((a) => a.id),
    ...result.clusters.flatMap((c) => c.areas.map((a) => a.id)),
  ];
  return ids;
}

// ─── Band boundaries ─────────────────────────────────────────────────────────

describe('computeBand', () => {
  it.each([
    [1, '1-8'],
    [8, '1-8'],
    [9, '9-15'],
    [15, '9-15'],
    [16, '16-30'],
    [30, '16-30'],
    [31, '30+'],
  ] as const)('%i areas -> band %s', (count, expected) => {
    expect(computeBand(count)).toBe(expected);
  });
});

// ─── 1-8 band ─────────────────────────────────────────────────────────────────

describe('1-8 band', () => {
  it('renders all areas as full labelled representatives with no clusters/dots', () => {
    const areas = spreadAreas(8);
    const result = computeAreaMarkers(baseInput({ areas }));
    expect(result.band).toBe('1-8');
    expect(result.representatives).toHaveLength(8);
    expect(result.clusters).toHaveLength(0);
    expect(result.dots).toHaveLength(0);
    expect(allAreaIds(result).sort()).toEqual(areas.map((a) => a.id).sort());
  });
});

// ─── 9-15 band ────────────────────────────────────────────────────────────────

describe('9-15 band', () => {
  it('12-even: labels ~8 top-ranked areas, rest become dots, no clusters', () => {
    const areas = spreadAreas(12, (i) => 12 - i); // distinct counts so ranking is unambiguous
    const result = computeAreaMarkers(baseInput({ areas }));
    expect(result.band).toBe('9-15');
    expect(result.representatives).toHaveLength(8);
    expect(result.dots).toHaveLength(4);
    expect(result.clusters).toHaveLength(0);
    // Representatives are the 8 highest-count areas.
    const repIds = new Set(result.representatives.map((a) => a.id));
    for (let i = 0; i < 8; i++) expect(repIds.has(`area-${i}`)).toBe(true);
    expect(allAreaIds(result).sort()).toEqual(areas.map((a) => a.id).sort());
  });

  it('9 areas: caps representatives at 8, exactly 1 dot', () => {
    const areas = spreadAreas(9, (i) => 9 - i);
    const result = computeAreaMarkers(baseInput({ areas }));
    expect(result.representatives).toHaveLength(8);
    expect(result.dots).toHaveLength(1);
  });

  it('15 areas: caps representatives at 8, 7 dots', () => {
    const areas = spreadAreas(15, (i) => 15 - i);
    const result = computeAreaMarkers(baseInput({ areas }));
    expect(result.representatives).toHaveLength(8);
    expect(result.dots).toHaveLength(7);
  });
});

// ─── 16-30 band ───────────────────────────────────────────────────────────────

describe('16-30 band', () => {
  it('30-tight-core: yields ~10-12 representatives + clusters; quadrant guarantee keeps an edge area', () => {
    // A dense low-count core plus 4 distinct, high-count edge areas (one per quadrant)
    // so the quadrant coverage guarantee is exercised against count-driven ranking.
    const core = tightCoreAreas(26, () => 5);
    const edges: RankableArea[] = [
      area('edge-ne', 50, BOUNDS.maxLat - 0.005, BOUNDS.maxLon - 0.005),
      area('edge-nw', 1, BOUNDS.maxLat - 0.005, BOUNDS.minLon + 0.005),
      area('edge-se', 1, BOUNDS.minLat + 0.005, BOUNDS.maxLon - 0.005),
      area('edge-sw', 1, BOUNDS.minLat + 0.005, BOUNDS.minLon + 0.005),
    ];
    const areas = [...core, ...edges];
    const result = computeAreaMarkers(baseInput({ areas }));

    expect(result.band).toBe('16-30');
    expect(result.representatives.length).toBeGreaterThanOrEqual(10);
    expect(result.representatives.length).toBeLessThanOrEqual(12);
    expect(result.clusters.length).toBeGreaterThan(0);

    // Every non-empty quadrant contributes at least one representative, even
    // the low-count edge areas that would lose on a pure top-N-by-count sort.
    const repIds = new Set(result.representatives.map((a) => a.id));
    expect(repIds.has('edge-ne')).toBe(true); // wins on count anyway
    expect(repIds.has('edge-nw')).toBe(true); // wins on quadrant guarantee
    expect(repIds.has('edge-se')).toBe(true);
    expect(repIds.has('edge-sw')).toBe(true);

    expect(allAreaIds(result).sort()).toEqual(areas.map((a) => a.id).sort());
  });

  it('clusters never show a property-sum count, only member-area count', () => {
    const areas = tightCoreAreas(20, (i) => (i % 5) + 1);
    const result = computeAreaMarkers(baseInput({ areas }));
    for (const cluster of result.clusters) {
      expect(cluster.count).toBe(cluster.areas.length);
    }
  });
});

// ─── 30+ band ─────────────────────────────────────────────────────────────────

describe('30+ band', () => {
  it('40-dense-core+low-edges: quadrant guarantee ensures each low-count edge area keeps a pin', () => {
    // Dense core confined to the NE quadrant (tightCoreAreas); low-count edge
    // areas placed in the three quadrants the core never touches, so each is
    // the sole occupant of its quadrant and must survive purely on the
    // quadrant-coverage guarantee, not on count.
    const core = tightCoreAreas(36, () => 4);
    const edges: RankableArea[] = [
      area('edge-nw', 1, BOUNDS.maxLat - 0.002, BOUNDS.minLon + 0.002),
      area('edge-se', 1, BOUNDS.minLat + 0.002, BOUNDS.maxLon - 0.002),
      area('edge-sw', 1, BOUNDS.minLat + 0.002, BOUNDS.minLon + 0.002),
    ];
    const areas = [...core, ...edges];
    const result = computeAreaMarkers(baseInput({ areas, labelCap: 12 }));

    expect(result.band).toBe('30+');
    expect(result.representatives.length).toBeLessThanOrEqual(12);

    const repIds = new Set(result.representatives.map((a) => a.id));
    expect(repIds.has('edge-nw')).toBe(true);
    expect(repIds.has('edge-se')).toBe(true);
    expect(repIds.has('edge-sw')).toBe(true);

    expect(allAreaIds(result).sort()).toEqual(areas.map((a) => a.id).sort());
  });
});

// ─── Forced-always ────────────────────────────────────────────────────────────

describe('forced-always overrides', () => {
  it('promotes selected/search-matched/hovered areas to representatives, bypassing the cap', () => {
    const core = tightCoreAreas(30, () => 1);
    // Pick three low-count, non-competitive core areas to force-promote.
    const [selected, searched, hovered] = [core[10], core[15], core[20]];
    const areas = core;

    const withoutForce = computeAreaMarkers(baseInput({ areas }));
    const capWithoutForce = withoutForce.representatives.length;

    const result = computeAreaMarkers(
      baseInput({
        areas,
        forced: {
          selectedId: selected.id,
          searchMatchIds: new Set([searched.id]),
          hoveredOrFocusedId: hovered.id,
        },
      }),
    );

    const repIds = new Set(result.representatives.map((a) => a.id));
    expect(repIds.has(selected.id)).toBe(true);
    expect(repIds.has(searched.id)).toBe(true);
    expect(repIds.has(hovered.id)).toBe(true);
    // Forced areas bypass the cap — representative count can exceed the
    // unforced cap by up to the number of newly-promoted forced areas.
    expect(result.representatives.length).toBeGreaterThanOrEqual(capWithoutForce);
    expect(result.representatives.length).toBeLessThanOrEqual(capWithoutForce + 3);

    // Forced areas are never left in a cluster or dot.
    for (const cluster of result.clusters) {
      expect(cluster.areas.some((a) => [selected.id, searched.id, hovered.id].includes(a.id))).toBe(false);
    }
    expect(result.dots.some((a) => [selected.id, searched.id, hovered.id].includes(a.id))).toBe(false);
  });

  it('a searched 1-property area anywhere in the group is promoted regardless of rank', () => {
    const areas = spreadAreas(20, (i) => (i === 19 ? 1 : 10));
    const target = areas[19];
    const result = computeAreaMarkers(
      baseInput({ areas, forced: { searchMatchIds: new Set([target.id]) } }),
    );
    expect(result.representatives.some((a) => a.id === target.id)).toBe(true);
  });
});

// ─── Invariants ───────────────────────────────────────────────────────────────

describe('cluster.count invariant', () => {
  it('cluster.count always equals cluster.areas.length (never a property-count sum)', () => {
    for (const n of [18, 25, 40, 80]) {
      const areas = tightCoreAreas(n, (i) => (i % 7) + 1);
      const result = computeAreaMarkers(baseInput({ areas }));
      for (const cluster of result.clusters) {
        expect(cluster.count).toBe(cluster.areas.length);
        const propertySum = cluster.areas.reduce((sum, a) => sum + a.count, 0);
        if (cluster.areas.some((a) => a.count !== 1)) {
          expect(cluster.count).not.toBe(propertySum);
        }
      }
    }
  });

  it('every input area appears in exactly one of representatives/dots/clusters', () => {
    const areas = tightCoreAreas(45, (i) => (i % 9) + 1);
    const result = computeAreaMarkers(baseInput({ areas }));
    const ids = allAreaIds(result);
    expect(ids.length).toBe(areas.length);
    expect(new Set(ids).size).toBe(areas.length);
  });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('identical input produces deep-equal output across repeated calls', () => {
    const areas = tightCoreAreas(29, (i) => (i * 7) % 11);
    const input = baseInput({
      areas,
      forced: { selectedId: areas[3].id, searchMatchIds: new Set([areas[9].id, areas[12].id]) },
    });
    const first = computeAreaMarkers(input);
    const second = computeAreaMarkers(input);
    expect(second).toEqual(first);
  });

  it('is unaffected by input array order (same Set of areas -> same result)', () => {
    const areas = tightCoreAreas(29, (i) => (i * 7) % 11);
    const shuffled = [...areas].reverse();
    const a = computeAreaMarkers(baseInput({ areas }));
    const b = computeAreaMarkers(baseInput({ areas: shuffled }));
    expect(a.representatives.map((x) => x.id).sort()).toEqual(b.representatives.map((x) => x.id).sort());
    expect(a.dots.map((x) => x.id).sort()).toEqual(b.dots.map((x) => x.id).sort());
    expect(a.clusters.length).toEqual(b.clusters.length);
  });
});
