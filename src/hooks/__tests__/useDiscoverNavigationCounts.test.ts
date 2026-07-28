/**
 * Issue #1956 PR 1 (FE-3, item 1) — useDiscoverNavigationCounts.
 *
 * Covers, by AC:
 *   AC1.11  one HTTP request per view, asserted by REQUEST COUNT
 *   AC1.12  ONE count identity owns both map and panel destination counts
 *   AC1.13  stale-response protection, all three required cases (a)/(b)/(c)
 *   AC1.17  count cache freshness <= listing cache freshness (directional)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(msg: string, status: number, body: unknown) {
      super(msg);
      this.status = status;
      this.body = body;
    }
  },
}));

import {
  useDiscoverNavigationCounts,
  buildNavigationCountsFingerprint,
  buildNavigationCountsRequestParams,
  readDestinationCounts,
  listingEligibilityAccessor,
  schoolEligibilityAccessor,
  NAVIGATION_COUNTS_QUERY_KEY_BASE,
  NAVIGATION_COUNTS_STALE_TIME_MS,
  DISCOVER_CITY_LISTINGS_STALE_TIME_MS,
  type DiscoverNavigationCountsFilters,
  type UseDiscoverNavigationCountsParams,
} from '../useDiscoverNavigationCounts';
import { computeNearbyAreaCount } from '@/features/discover/navigation/nearbyAreaArithmetic';
import type { NavigationCountsResponse } from '@/features/discover/navigation/types';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

/** A counts response with `childCount` direct children and `areaCount` areas. */
function makeResponse(
  overrides: Partial<NavigationCountsResponse> = {},
  childCount = 3,
  areaCount = 12,
): NavigationCountsResponse {
  const areaCounts: Record<string, number> = {};
  const areaSchoolCounts: Record<string, number> = {};
  for (let i = 0; i < areaCount; i += 1) {
    areaCounts[`bangalore|area-${i}`] = i + 1;
    // Deliberately a DIFFERENT distribution from the listing map, so a test that
    // reads schools but is silently served listings (or vice versa) fails on the
    // value rather than passing by coincidence.
    areaSchoolCounts[`bangalore|area-${i}`] = (i % 4) + 1;
  }
  return {
    nodeKey: 'd:e',
    count: 100,
    schoolCount: 7,
    areaCounts,
    areaSchoolCounts,
    children: Array.from({ length: childCount }, (_, i) => ({
      nodeKey: `a:bangalore|area-${i}`,
      count: i + 1,
      schoolCount: i,
    })),
    revisionId: 8,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const BASE: UseDiscoverNavigationCountsParams = { city: 'bangalore', nodeKey: 'd:e' };

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── request shape / fingerprint ──────────────────────────────────────────── */

describe('request params + fingerprint', () => {
  it('sends no filter params when no filters are supplied (server blended default)', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    const [url] = mockGet.mock.calls[0] as [string, unknown];
    expect(url).toBe('/api/discover/cities/bangalore/navigation/d%3Ae/counts');
  });

  // RULE CHANGE (#1956 PR 1 rework): this test previously also asserted
  // `params.get('priceMin') === '100'` and `params.get('priceMax') === '900'`,
  // with `priceMin: 100, priceMax: 900` in the filter literal. That is no longer
  // right: the counts endpoint DOES NOT ACCEPT a price band (removed backend-side
  // — price is continuous, and the only way to bound the cache-key cardinality
  // was to snap the band, which answers a different question than the shopper
  // asked). Asserting the hook serialises price would pin a param the server
  // silently ignores. The assertions are not dropped but INVERTED — see the
  // dedicated "price is on neither side" test below.
  it('serialises every supported filter param', () => {
    const filters: DiscoverNavigationCountsFilters = {
      purpose: 'sale',
      propertyTypes: ['villa', 'apartment'],
      bedrooms: [3, 2],
      sellerTypes: ['owner'],
      readyToMove: true,
      reraRegistered: false,
      newToMarket: true,
      backOnMarket: false,
    };
    const params = buildNavigationCountsRequestParams(filters);
    expect(params.get('purpose')).toBe('sale');
    // sorted, so selection ORDER cannot fork the cache
    expect(params.getAll('propertyTypes')).toEqual(['apartment', 'villa']);
    expect(params.getAll('bedrooms')).toEqual(['2', '3']);
    expect(params.getAll('sellerTypes')).toEqual(['owner']);
    expect(params.get('readyToMove')).toBe('true');
    expect(params.get('reraRegistered')).toBe('false');
    expect(params.get('newToMarket')).toBe('true');
    expect(params.get('backOnMarket')).toBe('false');
  });

  it('never sends a price band — the endpoint does not accept one', () => {
    // Guards against reintroducing price on the FRONTEND ALONE. Price comes back
    // on both ends together, in the PR that first renders these counts; until
    // then a `priceMin`/`priceMax` param here would be a filter the shopper sees
    // honoured and the server ignores.
    const params = buildNavigationCountsRequestParams({
      purpose: 'sale',
      bedrooms: [2],
    });
    expect(params.get('priceMin')).toBeNull();
    expect(params.get('priceMax')).toBeNull();
    expect(params.toString()).not.toMatch(/price/i);
    // The filter type itself carries no price field, so a caller cannot even
    // supply one. Passing an extra key must not smuggle it into the URL either.
    const withStrayPrice = buildNavigationCountsRequestParams({
      purpose: 'sale',
      bedrooms: [2],
      // Deliberately cast: proves the SERIALISER ignores price even if an
      // untyped/`any`-shaped filter object from a future caller carries one.
      ...({ priceMin: 100, priceMax: 900 } as unknown as DiscoverNavigationCountsFilters),
    });
    expect(withStrayPrice.toString()).not.toMatch(/price/i);
  });

  it('price is not part of the fingerprint, so it cannot fork the query key', () => {
    // The fingerprint IS the TanStack query key. If a removed field stayed in it,
    // cache entries would be keyed on a value that no longer affects the
    // response — two identical server requests landing in two cache entries.
    const base: DiscoverNavigationCountsFilters = { purpose: 'sale', bedrooms: [2] };
    const withPrice = {
      ...base,
      ...({ priceMin: 100, priceMax: 900 } as unknown as DiscoverNavigationCountsFilters),
    };
    expect(buildNavigationCountsFingerprint('bangalore', 'd:e', withPrice)).toBe(
      buildNavigationCountsFingerprint('bangalore', 'd:e', base),
    );
    expect(buildNavigationCountsFingerprint('bangalore', 'd:e', base)).not.toMatch(/price/i);
  });

  it('is order-insensitive but value-sensitive', () => {
    const a = buildNavigationCountsFingerprint('bangalore', 'd:e', {
      propertyTypes: ['villa', 'plot'],
    });
    const b = buildNavigationCountsFingerprint('bangalore', 'd:e', {
      propertyTypes: ['plot', 'villa'],
    });
    const c = buildNavigationCountsFingerprint('bangalore', 'd:e', {
      propertyTypes: ['plot'],
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes with the node key', () => {
    expect(buildNavigationCountsFingerprint('bangalore', 'd:e', {})).not.toBe(
      buildNavigationCountsFingerprint('bangalore', 'd:n', {}),
    );
  });

  it('forwards the AbortSignal so a superseded request is cancelled, not just ignored', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    const [, options] = mockGet.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not fetch without a resolved node key', () => {
    renderHook(() => useDiscoverNavigationCounts({ city: 'bangalore', nodeKey: null }), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not fetch when explicitly disabled', () => {
    renderHook(() => useDiscoverNavigationCounts({ ...BASE, enabled: false }), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

/* ── AC1.11 ───────────────────────────────────────────────────────────────── */

describe('AC1.11 — ONE request per view', () => {
  it('costs exactly one request for a level with 25 children and 300 areas', async () => {
    mockGet.mockResolvedValue(makeResponse({}, 25, 300));
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    expect(mockGet).toHaveBeenCalledTimes(1);
    // and the ONE response really did carry every child + area count, which is
    // what makes the single request sufficient (no follow-up round trip).
    expect(result.current.snapshot?.childCounts.size).toBe(25);
    expect(result.current.snapshot?.areaListingCounts.size).toBe(300);
    // The per-area SCHOOL map rides the same single response — adding the
    // Schools journey must not cost a second request per view.
    expect(result.current.snapshot?.areaSchoolCounts.size).toBe(300);
  });

  it('stays at one request across re-renders with unchanged inputs', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const { result, rerender } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    rerender();
    rerender();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

/* ── AC1.12 ───────────────────────────────────────────────────────────────── */

describe('AC1.12 — one identity owns both map and panel counts', () => {
  it('mapDestinationCounts and panelDestinationCounts are the SAME reference', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    expect(result.current.mapDestinationCounts).toBe(result.current.snapshot);
    expect(result.current.panelDestinationCounts).toBe(result.current.snapshot);
    expect(result.current.mapDestinationCounts).toBe(result.current.panelDestinationCounts);
  });

  it('exposes per-area listing counts and per-child rolled-up counts from that one identity', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    const snapshot = result.current.snapshot!;
    expect(snapshot.listingCountForArea('bangalore|area-0')).toBe(1);
    expect(snapshot.listingCountForArea('bangalore|not-in-response')).toBe(0);
    // Symmetric per-area school lookup off the SAME identity. `area-4` has 5
    // listings but 1 school — a distribution the listing map cannot produce, so
    // this cannot pass by accidentally reading `areaCounts`.
    expect(snapshot.schoolCountForArea('bangalore|area-4')).toBe(1);
    expect(snapshot.listingCountForArea('bangalore|area-4')).toBe(5);
    expect(snapshot.schoolCountForArea('bangalore|not-in-response')).toBe(0);
    expect(snapshot.countsForChild('a:bangalore|area-2')).toEqual({
      nodeKey: 'a:bangalore|area-2',
      count: 3,
      schoolCount: 2,
    });
    // `count` keeps its wire name; the snapshot's own field is the node total.
    expect(snapshot.listingCount).toBe(100);
    expect(snapshot.schoolCount).toBe(7);
    expect(snapshot.revisionId).toBe(8);
  });
});

/* ── AC1.13 ───────────────────────────────────────────────────────────────── */

describe('AC1.13 (a) — a filter-A response arriving AFTER filter B was applied is ignored', () => {
  it('keeps filter B numbers when the older filter-A request finally resolves', async () => {
    const slowA = deferred<NavigationCountsResponse>();
    mockGet.mockImplementationOnce(() => slowA.promise);
    mockGet.mockImplementationOnce(() =>
      Promise.resolve(makeResponse({ count: 2, nodeKey: 'd:e' })),
    );

    const filtersA: DiscoverNavigationCountsFilters = { purpose: 'sale' };
    const filtersB: DiscoverNavigationCountsFilters = { purpose: 'rent' };

    const { result, rerender } = renderHook(
      (filters: DiscoverNavigationCountsFilters) =>
        useDiscoverNavigationCounts({ ...BASE, filters }),
      { wrapper: makeWrapper(makeClient()), initialProps: filtersA },
    );

    const fingerprintB = buildNavigationCountsFingerprint('bangalore', 'd:e', filtersB);
    rerender(filtersB);
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.snapshot?.fingerprint).toBe(fingerprintB);
    expect(result.current.snapshot?.listingCount).toBe(2);

    // Filter A's response lands LATE, carrying wildly different numbers.
    slowA.resolve(makeResponse({ count: 999 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.snapshot?.fingerprint).toBe(fingerprintB);
    expect(result.current.snapshot?.listingCount).toBe(2);
  });
});

describe('AC1.13 (b) — navigation changing before an earlier response returns discards it', () => {
  it('never surfaces the previous node\'s counts once the node key changes', async () => {
    const slowEast = deferred<NavigationCountsResponse>();
    mockGet.mockImplementationOnce(() => slowEast.promise);
    mockGet.mockImplementationOnce(() =>
      Promise.resolve(makeResponse({ nodeKey: 'd:n', count: 5 })),
    );

    const { result, rerender } = renderHook(
      (nodeKey: string) => useDiscoverNavigationCounts({ ...BASE, nodeKey }),
      { wrapper: makeWrapper(makeClient()), initialProps: 'd:e' },
    );

    rerender('d:n');
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.snapshot?.nodeKey).toBe('d:n');

    slowEast.resolve(makeResponse({ nodeKey: 'd:e', count: 999 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.snapshot?.nodeKey).toBe('d:n');
    expect(result.current.snapshot?.listingCount).toBe(5);
  });

  it('never shows the PREVIOUS node\'s snapshot while the new one is in flight (no keepPreviousData)', async () => {
    mockGet.mockImplementationOnce(() => Promise.resolve(makeResponse({ nodeKey: 'd:e' })));
    const pendingNorth = deferred<NavigationCountsResponse>();
    mockGet.mockImplementationOnce(() => pendingNorth.promise);

    const { result, rerender } = renderHook(
      (nodeKey: string) => useDiscoverNavigationCounts({ ...BASE, nodeKey }),
      { wrapper: makeWrapper(makeClient()), initialProps: 'd:e' },
    );
    await waitFor(() => expect(result.current.snapshot?.nodeKey).toBe('d:e'));

    rerender('d:n');
    // The old snapshot must be GONE, not carried over — carrying it over is
    // exactly the half-updated state AC1.13 forbids.
    expect(result.current.snapshot).toBeNull();

    pendingNorth.resolve(makeResponse({ nodeKey: 'd:n' }));
    await waitFor(() => expect(result.current.snapshot?.nodeKey).toBe('d:n'));
  });

  it('reports (never silently serves) a cached response stamped with a different fingerprint', async () => {
    const client = makeClient();
    mockGet.mockResolvedValue(makeResponse());

    // Seed the CURRENT query key with a snapshot stamped by a DIFFERENT request.
    // This is the belt-and-braces third defence: even if a mismatched entry ever
    // reaches the current key, it must not be presented as the current counts.
    const fingerprint = buildNavigationCountsFingerprint('bangalore', 'd:e', {});
    client.setQueryData([...NAVIGATION_COUNTS_QUERY_KEY_BASE, fingerprint], {
      fingerprint: 'some other request',
      nodeKey: 'd:e',
      revisionId: 8,
      listingCount: 999,
      schoolCount: 0,
      areaListingCounts: new Map<string, number>(),
      areaSchoolCounts: new Map<string, number>(),
      childCounts: new Map(),
      listingCountForArea: () => 0,
      schoolCountForArea: () => 0,
      countsForChild: () => undefined,
    });

    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.snapshot).toBeNull();
    expect(result.current.isStaleResponseIgnored).toBe(true);
  });
});

/* ── `enabled` gates the READOUT, not just the fetch ──────────────────────── */

describe('enabled: false suppresses the snapshot, not merely the request', () => {
  it('drops an ALREADY-CACHED snapshot when the caller disables the hook', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const client = makeClient();

    const { result, rerender } = renderHook(
      (enabled: boolean) => useDiscoverNavigationCounts({ ...BASE, enabled }),
      { wrapper: makeWrapper(client), initialProps: true },
    );
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.mapDestinationCounts).not.toBeNull();

    // City and nodeKey are UNCHANGED, so the fingerprint still matches and the
    // cache entry is still warm. Disabling must still mean "no counts".
    rerender(false);

    expect(result.current.snapshot).toBeNull();
    expect(result.current.mapDestinationCounts).toBeNull();
    expect(result.current.panelDestinationCounts).toBeNull();
    // A caller decision is not a stale response.
    expect(result.current.isStaleResponseIgnored).toBe(false);
  });

  it('never fires a request while disabled, and restores the snapshot when re-enabled', async () => {
    mockGet.mockResolvedValue(makeResponse());
    const client = makeClient();

    const { result, rerender } = renderHook(
      (enabled: boolean) => useDiscoverNavigationCounts({ ...BASE, enabled }),
      { wrapper: makeWrapper(client), initialProps: false },
    );

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.snapshot).toBeNull();
    expect(result.current.fingerprint).not.toBeNull();

    rerender(true);
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.panelDestinationCounts).toBe(result.current.mapDestinationCounts);
  });
});

describe('AC1.13 (c) — map and panel update ATOMICALLY from the same response', () => {
  it('both destination readouts carry the same fingerprint at every observed step', async () => {
    mockGet.mockImplementationOnce(() => Promise.resolve(makeResponse({ nodeKey: 'd:e' })));
    const pending = deferred<NavigationCountsResponse>();
    mockGet.mockImplementationOnce(() => pending.promise);

    const members = ['bangalore|area-0', 'bangalore|area-1', 'bangalore|area-2'];
    const representatives = ['bangalore|area-0', 'bangalore|area-1'];

    const { result, rerender } = renderHook(
      (nodeKey: string) => useDiscoverNavigationCounts({ ...BASE, nodeKey }),
      { wrapper: makeWrapper(makeClient()), initialProps: 'd:e' },
    );
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    const readAtomically = () => {
      const map = result.current.mapDestinationCounts;
      const panel = result.current.panelDestinationCounts;
      if (map == null || panel == null) return null;
      return {
        mapReadout: readDestinationCounts(map, members, representatives, listingEligibilityAccessor(map)),
        panelReadout: readDestinationCounts(panel, members, representatives, listingEligibilityAccessor(panel)),
      };
    };

    const before = readAtomically()!;
    expect(before.mapReadout.fingerprint).toBe(before.panelReadout.fingerprint);

    // Mid-flight: both sides are null TOGETHER — never one updated, one stale.
    rerender('d:n');
    expect(result.current.mapDestinationCounts).toBeNull();
    expect(result.current.panelDestinationCounts).toBeNull();

    pending.resolve(makeResponse({ nodeKey: 'd:n' }));
    await waitFor(() => expect(result.current.snapshot?.nodeKey).toBe('d:n'));

    const after = readAtomically()!;
    expect(after.mapReadout.fingerprint).toBe(after.panelReadout.fingerprint);
  });

  it('makes NEGATIVE_HIDDEN_COUNT unreachable: displayed is always a subset of visible', async () => {
    mockGet.mockResolvedValue(
      makeResponse({
        areaCounts: {
          'bangalore|has-listings': 4,
          'bangalore|also-has': 2,
          // deliberately zero — a member the visibility rule must drop
          'bangalore|empty': 0,
        },
      }),
    );
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    // The adversarial case: the caller claims MORE representatives than there
    // are eligible members, including one with zero listings and one the
    // response never mentioned. A non-atomic pipeline would produce a negative
    // hiddenCount here.
    const readout = readDestinationCounts(
      result.current.snapshot!,
      ['bangalore|has-listings', 'bangalore|also-has', 'bangalore|empty'],
      [
        'bangalore|has-listings',
        'bangalore|also-has',
        'bangalore|empty',
        'bangalore|never-seen',
      ],
      listingEligibilityAccessor(result.current.snapshot!),
    );

    expect(readout.visibleMemberCount).toBe(2);
    expect(readout.displayedRepresentativeCount).toBe(2);
    expect(readout.displayedRepresentativeCount).toBeLessThanOrEqual(
      readout.visibleMemberCount,
    );

    const counted = computeNearbyAreaCount({
      visibleMemberCount: readout.visibleMemberCount,
      displayedRepresentativeCount: readout.displayedRepresentativeCount,
    });
    expect(counted.problems).toEqual([]);
    expect(counted.hiddenCount).toBe(0);
    expect(counted.label).toBe('2 areas with matches');
  });

  it('produces the +N form (still non-negative) when representatives are a strict subset', async () => {
    mockGet.mockResolvedValue(
      makeResponse({
        areaCounts: { a: 1, b: 1, c: 1, d: 1, e: 1 },
      }),
    );
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    const readout = readDestinationCounts(
      result.current.snapshot!,
      ['a', 'b', 'c', 'd', 'e'],
      ['a', 'b'],
      listingEligibilityAccessor(result.current.snapshot!),
    );
    const counted = computeNearbyAreaCount({
      visibleMemberCount: readout.visibleMemberCount,
      displayedRepresentativeCount: readout.displayedRepresentativeCount,
    });
    expect(counted.problems).toEqual([]);
    expect(counted.label).toBe('+3 areas with matches');
  });
});

/* ── AC1.9 ────────────────────────────────────────────────────────────────── */

describe('AC1.9 — journey-aware visibility selects on the JOURNEY\'s own dimension', () => {
  /**
   * Four areas spanning every listings/schools combination. The two maps are
   * deliberately NOT proportional: `listings-only` has listings and no schools,
   * `schools-only` has schools and no listings. An implementation that reads the
   * wrong map cannot produce the expected sets from this fixture.
   *
   * ── ADVERSARIAL BY DESIGN: THE SCHOOL MAP SUMS TO MORE THAN THE TOTAL ──
   * `areaSchoolCounts` sums to 9 while the node's own `schoolCount` is 7. That is
   * CORRECT, not a fixture bug: the server's parent rollup is a UNION-DISTINCT
   * over descendant areas, so a school sitting in two descendant areas counts
   * ONCE for the parent but appears under BOTH area keys. Anyone who "fixes" the
   * discrepancy by summing the map — or by making the fixture add up — breaks the
   * assertion below, which is exactly the point. Totals come from `schoolCount`;
   * the per-area map is a lookup only.
   */
  const MIXED = makeResponse({
    count: 5,
    schoolCount: 7,
    areaCounts: {
      'listings-only': 3,
      both: 2,
      'schools-only': 0,
      neither: 0,
    },
    areaSchoolCounts: {
      'listings-only': 0,
      both: 4,
      'schools-only': 5,
      neither: 0,
    },
  });

  const MEMBERS = ['listings-only', 'both', 'schools-only', 'neither'];

  async function snapshotOf(response: NavigationCountsResponse) {
    mockGet.mockResolvedValue(response);
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    return result.current.snapshot!;
  }

  it('the Areas journey includes members with eligibleListingCount > 0', async () => {
    const snapshot = await snapshotOf(MIXED);
    const readout = readDestinationCounts(
      snapshot,
      MEMBERS,
      MEMBERS,
      listingEligibilityAccessor(snapshot),
    );
    expect(readout.visibleAreaKeys).toEqual(['listings-only', 'both']);
    expect(readout.visibleMemberCount).toBe(2);
  });

  it('the Schools journey includes members with eligibleSchoolCount > 0', async () => {
    const snapshot = await snapshotOf(MIXED);
    const readout = readDestinationCounts(
      snapshot,
      MEMBERS,
      MEMBERS,
      schoolEligibilityAccessor(snapshot),
    );
    expect(readout.visibleAreaKeys).toEqual(['both', 'schools-only']);
    expect(readout.visibleMemberCount).toBe(2);
  });

  it('an area with schools but no listings is visible in Schools and hidden in Areas', async () => {
    const snapshot = await snapshotOf(MIXED);
    expect(snapshot.listingCountForArea('schools-only')).toBe(0);
    expect(snapshot.schoolCountForArea('schools-only')).toBe(5);

    const asSchools = readDestinationCounts(
      snapshot,
      ['schools-only'],
      ['schools-only'],
      schoolEligibilityAccessor(snapshot),
    );
    const asAreas = readDestinationCounts(
      snapshot,
      ['schools-only'],
      ['schools-only'],
      listingEligibilityAccessor(snapshot),
    );
    expect(asSchools.visibleAreaKeys).toEqual(['schools-only']);
    expect(asAreas.visibleAreaKeys).toEqual([]);
  });

  it('an area with listings but no schools is visible in Areas and hidden in Schools', async () => {
    const snapshot = await snapshotOf(MIXED);
    expect(snapshot.listingCountForArea('listings-only')).toBe(3);
    expect(snapshot.schoolCountForArea('listings-only')).toBe(0);

    const asAreas = readDestinationCounts(
      snapshot,
      ['listings-only'],
      ['listings-only'],
      listingEligibilityAccessor(snapshot),
    );
    const asSchools = readDestinationCounts(
      snapshot,
      ['listings-only'],
      ['listings-only'],
      schoolEligibilityAccessor(snapshot),
    );
    expect(asAreas.visibleAreaKeys).toEqual(['listings-only']);
    expect(asSchools.visibleAreaKeys).toEqual([]);
  });

  it('the per-area school map legitimately sums to MORE than the node total (union-distinct rollup)', async () => {
    const snapshot = await snapshotOf(MIXED);
    const perAreaSum = [...snapshot.areaSchoolCounts.values()].reduce((a, b) => a + b, 0);

    expect(perAreaSum).toBe(9);
    // The node total is the server's UNION-DISTINCT count, so it is SMALLER.
    // Never derive it from the map.
    expect(snapshot.schoolCount).toBe(7);
    expect(perAreaSum).toBeGreaterThan(snapshot.schoolCount);
    expect(snapshot.schoolCount).not.toBe(perAreaSum);
  });

  it('the two per-area maps are independent, not two views of one number', async () => {
    const snapshot = await snapshotOf(MIXED);
    const listings = MEMBERS.map((k) => snapshot.listingCountForArea(k));
    const schools = MEMBERS.map((k) => snapshot.schoolCountForArea(k));
    expect(listings).toEqual([3, 2, 0, 0]);
    expect(schools).toEqual([0, 4, 5, 0]);
    expect(schools).not.toEqual(listings);
  });
});

/* ── AC1.17 ───────────────────────────────────────────────────────────────── */

describe('AC1.17 / §2.8 — count cache freshness <= listing cache freshness', () => {
  it('counts are never staler than the listings they describe', () => {
    expect(NAVIGATION_COUNTS_STALE_TIME_MS).toBeLessThanOrEqual(
      DISCOVER_CITY_LISTINGS_STALE_TIME_MS,
    );
  });

  it('counts are STRICTLY fresher today (30s vs 60s) — inverting this must go red', () => {
    expect(NAVIGATION_COUNTS_STALE_TIME_MS).toBe(30_000);
    expect(DISCOVER_CITY_LISTINGS_STALE_TIME_MS).toBe(60_000);
    expect(NAVIGATION_COUNTS_STALE_TIME_MS).toBeLessThan(
      DISCOVER_CITY_LISTINGS_STALE_TIME_MS,
    );
  });
});

/* ── error handling ───────────────────────────────────────────────────────── */

describe('error handling', () => {
  it('surfaces the error without a snapshot (counts degrade, they do not block)', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDiscoverNavigationCounts(BASE), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.mapDestinationCounts).toBeNull();
    expect(result.current.panelDestinationCounts).toBeNull();
    expect(result.current.isStaleResponseIgnored).toBe(false);
  });
});
