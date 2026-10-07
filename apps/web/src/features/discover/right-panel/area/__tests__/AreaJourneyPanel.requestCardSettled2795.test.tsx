/**
 * Issue #2795 — the legacy `?areaKey=` 'area-selected' route hands ListingsBody its OWN settled
 * signal (view.results.settled), failing closed when the producer supplies none.
 *
 * AreaSelectedPanel is stubbed with a probe reading the context; ListingsBody's gating on the value
 * is covered by ListingsBody.requestCard.test.tsx and the producer's computation by
 * areaSelectedResults.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AreaJourneyPanel, type AreaJourneyPanelProps } from '../AreaJourneyPanel';
import { useRequestCardSettled } from '@/features/discover/areas-journey/results/requestCardSettledContext';

vi.mock('@/components/discover/panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: () => <div data-testid="probe" data-settled={String(useRequestCardSettled())} />,
}));
vi.mock('@/features/discover/components/AreaSetDraftPanel', () => ({
  AreaSetDraftPanel: () => <div data-testid="draft" />,
}));

// Test-boundary cast: only the fields AreaJourneyPanel reads for 'area-selected' are populated; the
// full RightPanelAreaView/Commands carry many unrelated slices that this routing spec does not touch.
function renderPanel(results: Record<string, unknown>, isDraftOpen = false) {
  const props = {
    panelContent: 'area-selected',
    view: {
      selection: { isDraftOpen, regionName: null, groupName: null },
      results: { listings: [], summaryText: null, isLoading: false, isError: false, isViewportScope: false, ...results },
      filters: { filters: {}, searchQuery: '', trendsHref: '/trends' },
    },
    commands: {
      navigation: { addSchool: vi.fn(), crumbCity: vi.fn(), crumbRegion: undefined },
      filters: { change: vi.fn(), changeSearch: vi.fn() },
      results: { retry: vi.fn() },
    },
    context: { city: 'udupi', cityLabel: 'Udupi', journey: 'area-first', intent: 'sale', isAuthenticated: false },
    area: { point: { areaKey: 'IN|KA|Udupi|manipal', areaLabel: 'Manipal', geo_center_lat: 1, geo_center_lon: 1 } },
    chrome: { activeContextChips: [] },
    cards: { selectedListingId: null, hoveredListingId: null },
    refresh: { isFetching: false, isInitialLoading: false },
    onStartOver: vi.fn(),
    onBack: vi.fn(),
    onSelectJourney: vi.fn(),
    onSelectResultListing: vi.fn(),
    onHoverResultListing: vi.fn(),
    onCityChange: vi.fn(),
    onIntentChange: vi.fn(),
  } as unknown as AreaJourneyPanelProps;
  return render(<>{AreaJourneyPanel(props)}</>);
}
const settled = () => screen.getByTestId('probe').getAttribute('data-settled');

describe('AreaJourneyPanel — request-card settled signal (#2795)', () => {
  it('passes a settled result through as settled', () => {
    renderPanel({ settled: true });
    expect(settled()).toBe('true');
  });

  it.each([
    ['initial load / error / placeholder (producer says not settled)', { settled: false }],
    ['producer supplies no signal: fails closed', {}],
  ])('not settled: %s', (_name, results) => {
    renderPanel(results);
    expect(settled()).toBe('false');
  });

  it('an open AREA_SET draft renders the draft panel, not the listings (no card host)', () => {
    renderPanel({ settled: true }, true);
    expect(screen.getByTestId('draft')).toBeInTheDocument();
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
  });
});
