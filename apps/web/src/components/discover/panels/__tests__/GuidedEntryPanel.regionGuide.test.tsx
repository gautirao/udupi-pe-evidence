/**
 * Issue #1808 — GuidedEntryPanel region-overview guidance (panel side).
 *
 * GuidedEntryPanel is the panel ACTUALLY mounted at the region-overview state
 * (scope set, journey null) — derivePanelContent does not read `scope`, so
 * AreaGroupsLandingPanel (referenced by the design doc / approved-plan
 * evidence) is never reachable there; see MapDiscovery.tsx's isRegionOverview
 * comment for the full trace. These tests cover decision q2
 * (RING_EXISTING_SECTION — ring the EXISTING JourneySwitcher "choose how to
 * continue" section, no new journey-choice row), the aria-live helper copy,
 * reduced-motion, focus-no-theft, and the panel-click arm/deselect callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GuidedEntryPanel } from '../GuidedEntryPanel';

const WITHHOLDING_PHRASE = /top areas only|not the full list|not all areas|preview/i;

const mockSetScope = vi.fn();
const { mockUseDiscoverUrlState } = vi.hoisted(() => ({
  mockUseDiscoverUrlState: vi.fn(),
}));

// Issue #1953 (build step 2) — GuidedEntryPanel now consumes the
// DiscoverProvider facade (useDiscoverNav/useDiscoverActions) instead of
// calling useDiscoverUrlState() directly. Mocking the facade module instead
// of the underlying hook keeps every existing
// mockUseDiscoverUrlState.mockReturnValue([state, actions]) call below
// unchanged.
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => mockUseDiscoverUrlState()[0],
  useDiscoverActions: () => mockUseDiscoverUrlState()[1],
}));

// ADVISORY-1 rework — hoisted spy so tests can assert the (city, listingPurpose)
// args GuidedEntryPanel calls the hook with, and vary the mocked response per
// purpose to prove region cards display the purpose-filtered count.
const mockUseDiscoverRegionSummary = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useDiscoverRegionSummary', () => ({
  useDiscoverRegionSummary: (...args: unknown[]) => mockUseDiscoverRegionSummary(...args),
}));

const SALE_REGIONS = {
  cityId: 1,
  citySlug: 'bangalore',
  regions: [
    { key: 'north', label: 'North Bangalore', listingCount: 12 },
    { key: 'south', label: 'South Bangalore', listingCount: 8 },
  ],
};
const RENT_REGIONS = {
  cityId: 1,
  citySlug: 'bangalore',
  regions: [
    { key: 'north', label: 'North Bangalore', listingCount: 5 },
    { key: 'south', label: 'South Bangalore', listingCount: 3 },
  ],
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const baseProps = {
  onSelectJourney: vi.fn(),
  city: 'bangalore',
  onCityChange: vi.fn(),
  intent: 'buy' as const,
  onIntentChange: vi.fn(),
  totalProperties: 20,
  areasCount: 10,
};

const renderPanel = (extraProps: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={makeQueryClient()}>
        <GuidedEntryPanel {...baseProps} {...extraProps} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

describe('GuidedEntryPanel — Issue #1808 region-overview guidance', () => {
  beforeEach(() => {
    mockSetScope.mockClear();
    mockUseDiscoverUrlState.mockReturnValue([
      { scope: null },
      { setScope: mockSetScope },
    ]);
    mockUseDiscoverRegionSummary.mockReset();
    mockUseDiscoverRegionSummary.mockReturnValue({
      data: SALE_REGIONS,
      isLoading: false,
      isError: false,
    });
  });

  // Issue #1953 build step 6 (AC27, A1 retirement) — the ring-target/
  // ring-off/markerKind-helper-copy/reduced-motion tests that used to live
  // here (against GuidedEntryPanel's "journey-switcher-section" wrapper)
  // moved to src/components/discover/__tests__/JourneySwitcher.test.tsx,
  // since the ring + aria-live helper now render on JourneySwitcher's own
  // persistent tablist container (mounted once in DiscoverRightPanel, not
  // per-panel) — GuidedEntryPanel no longer renders that DOM at all. The
  // "no new journey-choice row" assertion also moved there. This file keeps
  // only the assertions that are still genuinely GuidedEntryPanel's own
  // behaviour: the macro-region card click/deselect/focus wiring below, and
  // the withholding-language guard (still checks this panel's own rendered
  // strings).

  it('no rendered string ever contains withholding language (q1 guard)', () => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: 'north' }, { setScope: mockSetScope }]);
    const { container } = renderPanel({
      regionGuideRingActive: true,
      regionGuideMarkerKind: 'zones',
      regionGuideNonce: 1,
    });
    expect(container.textContent).not.toMatch(WITHHOLDING_PHRASE);
  });

  it('selecting a NEW region calls onRegionSelectFromPanel exactly once (arms the pulse with source=panel)', async () => {
    const onRegionSelectFromPanel = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onRegionSelectFromPanel });
    await user.click(screen.getByRole('button', { name: /North Bangalore/i }));
    expect(mockSetScope).toHaveBeenCalledWith('north');
    expect(onRegionSelectFromPanel).toHaveBeenCalledTimes(1);
  });

  it('re-clicking the ALREADY-selected region (deselect) does NOT call onRegionSelectFromPanel', async () => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: 'north' }, { setScope: mockSetScope }]);
    const onRegionSelectFromPanel = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onRegionSelectFromPanel });
    await user.click(screen.getByRole('button', { name: /North Bangalore/i }));
    expect(mockSetScope).toHaveBeenCalledWith(null);
    expect(onRegionSelectFromPanel).not.toHaveBeenCalled();
  });

  it('no focus theft — focus stays on the clicked region card, not moved to the dismiss/journey area', async () => {
    const user = userEvent.setup();
    renderPanel({ onRegionSelectFromPanel: vi.fn() });
    const regionButton = screen.getByRole('button', { name: /North Bangalore/i });
    await user.click(regionButton);
    expect(document.activeElement).toBe(regionButton);
  });
});

// ─── ADVISORY-1 rework — buy/rent purpose scoping ──────────────────────────
describe('GuidedEntryPanel — purpose-scoped region counts (ADVISORY-1)', () => {
  beforeEach(() => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: null }, { setScope: mockSetScope }]);
    mockUseDiscoverRegionSummary.mockReset();
  });

  it('reuses the existing intent→listingPurpose mapping — intent="buy" calls the hook with listingPurpose="sale"', () => {
    mockUseDiscoverRegionSummary.mockReturnValue({ data: SALE_REGIONS, isLoading: false, isError: false });
    renderPanel({ intent: 'buy' });
    expect(mockUseDiscoverRegionSummary).toHaveBeenCalledWith('bangalore', 'sale');
  });

  it('intent="rent" calls the hook with listingPurpose="rent"', () => {
    mockUseDiscoverRegionSummary.mockReturnValue({ data: RENT_REGIONS, isLoading: false, isError: false });
    renderPanel({ intent: 'rent' });
    expect(mockUseDiscoverRegionSummary).toHaveBeenCalledWith('bangalore', 'rent');
  });

  it('region cards display the selected-purpose count (sale)', () => {
    mockUseDiscoverRegionSummary.mockReturnValue({ data: SALE_REGIONS, isLoading: false, isError: false });
    renderPanel({ intent: 'buy' });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('region cards display the selected-purpose count (rent) — a different total than sale, proving purpose scoping is applied', () => {
    mockUseDiscoverRegionSummary.mockReturnValue({ data: RENT_REGIONS, isLoading: false, isError: false });
    renderPanel({ intent: 'rent' });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });
});
