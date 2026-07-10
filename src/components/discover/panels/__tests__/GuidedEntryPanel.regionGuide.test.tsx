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

vi.mock('@/hooks/useDiscoverUrlState', () => ({
  useDiscoverUrlState: () => mockUseDiscoverUrlState(),
}));

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({
    data: {
      regions: [
        { regionKey: 'north', regionLabel: 'North Bangalore', listingCount: 12 },
        { regionKey: 'south', regionLabel: 'South Bangalore', listingCount: 8 },
      ],
      totalActiveListings: 20,
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useAreaGroups', () => ({
  useAreaGroups: () => ({ data: { groups: [] }, isLoading: false }),
}));

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
  });

  it('decision q2 — the ring target is the EXISTING JourneySwitcher section; no new journey-choice row/component exists', () => {
    renderPanel({ regionGuideRingActive: true, regionGuideMarkerKind: 'zones', regionGuideNonce: 1 });
    const section = screen.getByTestId('journey-switcher-section');
    expect(section).toHaveClass('dp-attn-target');
    expect(section).toHaveClass('dp-attn-on');
    // The section must actually contain the pre-existing journey cards, not a
    // fresh sibling component.
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    // No new journey-choice row/component was added anywhere in the panel.
    expect(screen.queryByTestId('journey-choice-row')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/journey-choice/)).toHaveLength(0);
  });

  it('ring is OFF (no dp-attn-on) when regionGuideRingActive=false (e.g. deep-link source)', () => {
    renderPanel({ regionGuideRingActive: false, regionGuideMarkerKind: 'zones', regionGuideNonce: 1 });
    const section = screen.getByTestId('journey-switcher-section');
    expect(section).not.toHaveClass('dp-attn-on');
    expect(section).not.toHaveClass('dp-attn-static');
  });

  it('markerKind="zones" — aria-live helper mirrors the map card zones copy', () => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: 'north' }, { setScope: mockSetScope }]);
    renderPanel({ regionGuideRingActive: true, regionGuideMarkerKind: 'zones', regionGuideNonce: 1 });
    const helper = screen.getByTestId('region-guide-helper');
    expect(helper).toHaveAttribute('aria-live', 'polite');
    expect(helper).toHaveTextContent(
      "North Bangalore selected. The map shows this region's zones — choose how you want to continue below.",
    );
  });

  it('markerKind="areas" — aria-live helper mirrors the map card areas copy', () => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: 'south' }, { setScope: mockSetScope }]);
    renderPanel({ regionGuideRingActive: true, regionGuideMarkerKind: 'areas', regionGuideNonce: 1 });
    const helper = screen.getByTestId('region-guide-helper');
    expect(helper).toHaveTextContent(
      "South Bangalore selected. The map shows this region's areas — choose how you want to continue below.",
    );
  });

  it('no rendered string ever contains withholding language (q1 guard)', () => {
    mockUseDiscoverUrlState.mockReturnValue([{ scope: 'north' }, { setScope: mockSetScope }]);
    const { container } = renderPanel({
      regionGuideRingActive: true,
      regionGuideMarkerKind: 'zones',
      regionGuideNonce: 1,
    });
    expect(container.textContent).not.toMatch(WITHHOLDING_PHRASE);
  });

  it('helper is absent when the ring is not active (never fires on deep-link)', () => {
    renderPanel({ regionGuideRingActive: false, regionGuideMarkerKind: 'zones', regionGuideNonce: 0 });
    expect(screen.queryByTestId('region-guide-helper')).not.toBeInTheDocument();
  });

  it('prefers-reduced-motion → static ring class, not the animated pulse class', () => {
    renderPanel({
      regionGuideRingActive: true,
      regionGuideMarkerKind: 'zones',
      regionGuideNonce: 1,
      prefersReducedMotion: true,
    });
    const section = screen.getByTestId('journey-switcher-section');
    expect(section).toHaveClass('dp-attn-static');
    expect(section).not.toHaveClass('dp-attn-on');
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
