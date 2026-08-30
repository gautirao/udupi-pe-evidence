import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoverMapCountBadge, type DiscoverMapCountBadgeProps } from './DiscoverMapCountBadge';
import type { DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

/**
 * Issue #1824 Slice S8 — AC4/AC8 copy-fork guard test.
 *
 * DiscoverMapCountBadge is decoupled from '@/pages/MapDiscovery' at runtime
 * (option b2 in slice-s8-design.md FLAG-B): the page precomputes
 * formatDiscoverBadgeCopy() for the group-selected/fallback branches and
 * passes the strings in as props, and the area-first selected-area branch
 * renders `areaResultSummaryText` verbatim — this component never imports or
 * calls formatDiscoverBadgeCopy itself (only a type-only import of
 * DiscoverBadgeResult remains, which is erased at compile time). Because of
 * that, a `vi.spyOn`/`vi.mock` of formatDiscoverBadgeCopy is N/A here — there
 * is no import to spy on. The distinct-sentinel assertion below is therefore
 * the whole gate, per the plan's "if not feasible, the distinct-sentinel
 * assertion alone is the gate" fallback.
 */

const AREA_SELECTED: AreaPoint = {
  areaKey: 'IN|KA|Bengaluru|Whitefield',
  areaLabel: 'Whitefield',
  geo_center_lat: 12.97,
  geo_center_lon: 77.75,
  bbox: null,
  listingCount: 18,
};

const DISCOVER_BADGE: DiscoverBadgeResult = {
  visible: true,
  count: 5,
  loading: false,
  n: 18,
  m: 5,
  hasActiveFilters: true,
  hasPropertyFilters: true,
  state: 'ok',
};

const SENTINEL = 'SENTINEL_AREA_SUMMARY_9137';
// A string formatDiscoverBadgeCopy() COULD plausibly produce from DISCOVER_BADGE
// for the area-selected scope (design §6: "M of N match ... in {area}") — used
// to prove the rendered text is the injected sentinel, not a recomputed value.
const WOULD_BE_RECOMPUTED_COPY = '5 of 18 match in Whitefield';

function baseProps(): DiscoverMapCountBadgeProps {
  return {
    resolvedPanelContent: 'area-selected',
    isAreaFirstCityLanding: false,
    discoverBadge: DISCOVER_BADGE,
    isSelectedGroupState: false,
    isAreaFirstSelectedAreaState: true,
    selectedArea: AREA_SELECTED,
    focusedGroup: null,
    areaResultSummaryText: SENTINEL,
    groupSelectedBadgeCopy: WOULD_BE_RECOMPUTED_COPY,
    fallbackBadgeCopy: WOULD_BE_RECOMPUTED_COPY,
    journey: 'area-first',
    schoolRadiusActive: false,
    schoolRadiusPillNoun: 'homes',
    schoolFirstAreaSchoolCount: null,
    schoolFirstZoneSchoolCount: null,
    schoolFirstLandingSchoolCount: null,
    cityTotal: 100,
    city: 'bangalore',
  };
}

describe('DiscoverMapCountBadge', () => {
  it('copy-fork: area-first selected-area badge renders the injected areaResultSummaryText verbatim and does NOT recompute via formatDiscoverBadgeCopy', () => {
    render(<DiscoverMapCountBadge {...baseProps()} />);

    const badge = screen.getByTestId('discover-badge');
    expect(badge).toHaveTextContent(SENTINEL);
    expect(badge.textContent).not.toContain(WOULD_BE_RECOMPUTED_COPY);
  });

  it('renders "Filtered results" for the stale state (unaffected by the copy-fork props)', () => {
    render(
      <DiscoverMapCountBadge
        {...baseProps()}
        discoverBadge={{ ...DISCOVER_BADGE, state: 'stale' }}
      />,
    );
    expect(screen.getByTestId('discover-badge-stale')).toHaveTextContent('Filtered results');
  });

  // Issue #2169 Bug 2 — the footer badge must never show the residential
  // cityTotal while browsing the Agri journey. Agricultural land is a
  // separate model (parcels/corridors, not residential area counts) — see
  // DiscoverRightPanel's Agri intro copy. Mirrors the school-first pattern
  // of a distinct journey-aware branch, but agri suppresses the pill
  // entirely rather than showing a count (see useDiscoverMapCountBadge
  // wiring comment for the suppress-vs-total rationale).
  it('#2169: agri-first journey never renders the residential-cityTotal fallback badge', () => {
    render(
      <DiscoverMapCountBadge
        {...baseProps()}
        resolvedPanelContent="agri-landing"
        journey="agri-first"
        isAreaFirstSelectedAreaState={false}
        isSelectedGroupState={false}
        selectedArea={null}
        focusedGroup={null}
        areaResultSummaryText={null}
        cityTotal={100}
        fallbackBadgeCopy="100 properties in bangalore"
      />,
    );
    expect(screen.queryByTestId('discover-badge')).not.toBeInTheDocument();
    expect(screen.queryByText(/properties in bangalore/i)).not.toBeInTheDocument();
  });

  // Issue #2169 Bug 2 — the public-landing summary pill (bottom-center) is a
  // second, independent leak vector for the same residential cityTotal; the
  // guard must suppress this pill too, even if isAreaFirstCityLanding were
  // ever (incorrectly) true for an agri state.
  it('#2169: agri-first journey never renders the public-landing cityTotal pill even if isAreaFirstCityLanding is true', () => {
    render(
      <DiscoverMapCountBadge
        {...baseProps()}
        resolvedPanelContent="guided-entry"
        isAreaFirstCityLanding={true}
        journey="agri-first"
        discoverBadge={{ ...DISCOVER_BADGE, visible: false }}
        cityTotal={100}
      />,
    );
    expect(screen.queryByTestId('discover-badge')).not.toBeInTheDocument();
  });
});
