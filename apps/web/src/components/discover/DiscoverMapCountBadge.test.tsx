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

  // Issue #2716 — the public-landing summary pill's bottom offset must switch
  // to clear the Leaflet zoom control's bottom-right footprint when rendered
  // inside the mobile Map overlay, while staying byte-identical on desktop
  // (AC4 — DiscoverMapSurface/#2714 own desktop bottom chrome, unaffected here).
  describe('#2716 public-landing pill mobile-overlay placement', () => {
    function publicLandingProps(): DiscoverMapCountBadgeProps {
      return {
        ...baseProps(),
        resolvedPanelContent: 'guided-entry',
        isAreaFirstCityLanding: false,
        isAreaFirstSelectedAreaState: false,
        isSelectedGroupState: false,
        selectedArea: null,
        areaResultSummaryText: null,
        journey: null,
        cityTotal: 42,
      };
    }

    // Issue #2714 — was bottom-5 with no width cap; that overlapped the bottom-left legend at
    // 1024x768 (live-measured). Raised to bottom-60 and capped to max-w-[220px], clearing the
    // legend, the zoom control and the bottom-right recenter column.
    // Issue #2724 (owner follow-up 3) — desktop's "Recenter on <city>" button
    // (DiscoverMapCanvas.tsx) now shares this exact row instead of sitting right-anchored at its
    // own bottom-48 (this is the same guided-entry/city-landing state as
    // DiscoverMapCanvas.tsx's `isDesktopBadgePaired`), so the pill no longer dead-centres here —
    // it flanks right of centre (`right-1/2 mr-2`) to pair with that button's `left-1/2 ml-2`.
    it('flanks right of centre (paired with the desktop "Recenter on <city>" button, #2724) when isMobileMapOverlay is omitted (default false)', () => {
      render(<DiscoverMapCountBadge {...publicLandingProps()} />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 right-1/2 z-[1000] mr-2 max-w-[220px]');
    });

    it('raises the pill to bottom-8 and constrains its width (clear of the zoom control) when isMobileMapOverlay is true', () => {
      render(<DiscoverMapCountBadge {...publicLandingProps()} isMobileMapOverlay />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe(
        'absolute bottom-8 left-1/2 z-[1000] w-[calc(100%-6rem)] max-w-[220px] -translate-x-1/2',
      );
    });
  });

  // Issue #2724 (owner follow-up 3, desktop/mobile parity) — the drill-down badge's OWN centred
  // variant (isSelectedGroupState, without an area selected) gets the same desktop flank-right
  // treatment as the public-landing pill above, for the same reason: DiscoverMapCanvas.tsx's
  // "Recenter on <city>" button now shares this row instead of its own bottom-48.
  describe('#2724 drill-down badge desktop pairing (isSelectedGroupState)', () => {
    function selectedGroupProps(): DiscoverMapCountBadgeProps {
      return {
        ...baseProps(),
        resolvedPanelContent: 'area-groups-landing',
        isAreaFirstCityLanding: false,
        isAreaFirstSelectedAreaState: false,
        isSelectedGroupState: true,
        selectedArea: null,
        areaResultSummaryText: null,
        journey: null,
      };
    }

    it('flanks right of centre on desktop (isMobileMapOverlay omitted/false), pairing with the "Recenter on <city>" button', () => {
      render(<DiscoverMapCountBadge {...selectedGroupProps()} />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 right-1/2 z-[1000] mr-2 max-w-[220px]');
    });

    it('stays dead-centred on the mobile Map (isMobileMapOverlay true) — unaffected by #2724', () => {
      render(<DiscoverMapCountBadge {...selectedGroupProps()} isMobileMapOverlay />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2');
    });

    it('the mutually-exclusive isAreaFirstSelectedAreaState branch stays dead-centred on desktop — unaffected by #2724 (no city-recenter counterpart on that row)', () => {
      render(
        <DiscoverMapCountBadge
          {...selectedGroupProps()}
          isSelectedGroupState={false}
          isAreaFirstSelectedAreaState
          selectedArea={AREA_SELECTED}
          areaResultSummaryText={SENTINEL}
        />,
      );
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2');
    });
  });

  // Issue #2724 (pass 3, area-selected desktop pairing) — the area-selected pill's OWN row-mate
  // is the portalled `areas-recenter-button` (DiscoverMapSurface.tsx), a DIFFERENT button from the
  // "Recenter on <city>" pairing above and gated by a DIFFERENT signal
  // (`isAreaRecenterButtonVisible`, computed in buildMapSurfaceModel.tsx from the same
  // `overlays.recenter.visible` that button itself renders from, so the two can never disagree).
  describe('#2724 pass 3 — area-selected desktop pairing with areas-recenter-button', () => {
    it('flanks left of centre on desktop when isAreaRecenterButtonVisible is true, pairing with the areas-recenter-button', () => {
      render(<DiscoverMapCountBadge {...baseProps()} isAreaRecenterButtonVisible />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 right-1/2 z-[1000] mr-2 max-w-[220px]');
    });

    it('stays dead-centred on desktop when isAreaRecenterButtonVisible is omitted/false (selected area already in view — no row-mate)', () => {
      render(<DiscoverMapCountBadge {...baseProps()} />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2');
    });

    it('stays dead-centred on the mobile Map even when isAreaRecenterButtonVisible is true — mobile is untouched by #2724', () => {
      render(<DiscoverMapCountBadge {...baseProps()} isAreaRecenterButtonVisible isMobileMapOverlay />);
      const badge = screen.getByTestId('discover-badge');
      expect(badge.className).toBe('absolute bottom-60 left-1/2 z-[1000] max-w-[220px] -translate-x-1/2');
    });
  });
});
