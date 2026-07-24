/**
 * Tests for AreaGroupSelectedPanel (Issue #1595)
 *
 * Covers the area-first selected-group drill-down:
 * - University Belt context rendering (breadcrumb, heading, group card, stats, trust note)
 * - Locality cards with live properties are active and navigate (Manipal → results)
 * - Zero-property localities are muted/passive (no navigation, not "broken")
 * - "properties"/"listings" wording, never "homes"
 * - Back to all groups + Start over affordances
 * - Group/locality copy resolved via the data/config adapter (no hardcoded JSX)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AreaGroupSelectedPanel } from '../AreaGroupSelectedPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

const render = (ui: React.ReactElement, options = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...options });
};

const UNIVERSITY_BELT: AreaGroup = {
  id: 'university-belt',
  name: 'University Belt',
  // subtitle/region intentionally null → resolved via the config adapter fallback.
  subtitle: null,
  region_label: null,
  school_count: 0,
  area_keys: ['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Udyavara'],
};

const makeArea = (overrides: Partial<DiscoverArea> = {}): DiscoverArea => ({
  areaKey: 'IN|KA|Udupi|Manipal',
  name: 'Manipal',
  geoCenterLat: 13.35,
  geoCenterLon: 74.79,
  listingCount: 5,
  schoolCount: 0,
  ...overrides,
});

const MANIPAL = makeArea({ areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', listingCount: 5 });
const UDYAVARA = makeArea({ areaKey: 'IN|KA|Udupi|Udyavara', name: 'Udyavara', listingCount: 3 });

const baseProps = {
  group: UNIVERSITY_BELT,
  areas: [MANIPAL, UDYAVARA],
  cityLabel: 'Udupi',
  onSelectArea: vi.fn(),
};

describe('AreaGroupSelectedPanel — University Belt context', () => {
  it('shows the "Choose an area in {city}" heading + By area chip (breadcrumb lives on the map)', () => {
    render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(screen.getByRole('heading', { name: /choose an area in udupi/i })).toBeInTheDocument();
    expect(screen.getByText('By area')).toBeInTheDocument();
    // Issue #1595 Option A — the City › Group breadcrumb was moved to the map; the
    // panel header no longer renders a breadcrumb.
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument();
  });

  it('renders the selected-group card with adapter-resolved description, region, stats and trust note', () => {
    render(<AreaGroupSelectedPanel {...baseProps} />);
    const card = screen.getByTestId('area-group-selected-card');
    // Description + region come from the config adapter (group fields are null).
    expect(within(card).getByText(/student-heavy neighbourhoods/i)).toBeInTheDocument();
    expect(within(card).getByText('Central Udupi')).toBeInTheDocument();
    // Stats: 2 areas, 8 properties (5 + 3).
    expect(within(card).getByText('2')).toBeInTheDocument();
    expect(within(card).getByText('8')).toBeInTheDocument();
    expect(within(card).getByText('areas')).toBeInTheDocument();
    expect(within(card).getByText('properties')).toBeInTheDocument();
    // Trust / guidance note.
    expect(
      within(card).getByText(/choose an area below to see the properties inside it/i),
    ).toBeInTheDocument();
  });

  it('renders the "Areas inside {group}" section with member localities', () => {
    render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(screen.getByText(/areas inside university belt/i)).toBeInTheDocument();
    expect(screen.getByText('Manipal')).toBeInTheDocument();
    expect(screen.getByText('Udyavara')).toBeInTheDocument();
    // Locality descriptions come from the config adapter.
    expect(screen.getByText(/university core with student rentals/i)).toBeInTheDocument();
  });

  it('renders dynamic city copy (no hardcoded city) when another city is selected', () => {
    render(<AreaGroupSelectedPanel {...baseProps} cityLabel="Bangalore" />);
    // Heading follows the selected city, not a hardcoded "Udupi".
    expect(
      screen.getByRole('heading', { name: /choose an area in bangalore/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /choose an area in udupi/i }),
    ).not.toBeInTheDocument();
  });

  it('uses "properties"/"listings" wording and never "homes"', () => {
    const { container } = render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(container.textContent ?? '').not.toMatch(/homes?/i);
    expect(screen.getByTestId('area-group-view-all')).toHaveTextContent(
      'View all 8 properties across University Belt',
    );
  });
});

describe('AreaGroupSelectedPanel — locality navigation + zero-property treatment', () => {
  it('a live locality card is active and navigates to its results page (Manipal)', async () => {
    const onSelectArea = vi.fn();
    render(<AreaGroupSelectedPanel {...baseProps} onSelectArea={onSelectArea} />);
    const manipal = screen.getByTestId('browse-all-area-IN|KA|Udupi|Manipal');
    expect(manipal.tagName).toBe('BUTTON');
    expect(manipal).toHaveTextContent('5');
    expect(manipal).toHaveTextContent(/properties/i);
    await userEvent.click(manipal);
    expect(onSelectArea).toHaveBeenCalledWith('IN|KA|Udupi|Manipal');
    expect(onSelectArea).toHaveBeenCalledTimes(1);
  });

  it('a zero-property locality is muted, non-interactive and not broken', async () => {
    const onSelectArea = vi.fn();
    const katapadi = makeArea({
      areaKey: 'IN|KA|Udupi|Katapadi',
      name: 'Katapadi',
      listingCount: 0,
    });
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        areas={[MANIPAL, katapadi]}
        onSelectArea={onSelectArea}
      />,
    );
    const katapadiCard = screen.getByTestId('browse-all-area-IN|KA|Udupi|Katapadi');
    // Present and labelled, but not a button and explicitly disabled.
    expect(katapadiCard.tagName).not.toBe('BUTTON');
    expect(katapadiCard).toHaveAttribute('aria-disabled', 'true');
    expect(katapadiCard).toHaveTextContent('Katapadi');
    expect(katapadiCard).toHaveTextContent(/no properties yet/i);
    await userEvent.click(katapadiCard);
    expect(onSelectArea).not.toHaveBeenCalled();
  });
});

describe('AreaGroupSelectedPanel — navigation affordances', () => {
  it('renders "Back to all neighbourhood groups" and calls onBack', async () => {
    const onBack = vi.fn();
    render(<AreaGroupSelectedPanel {...baseProps} onBack={onBack} />);
    const back = screen.getByTestId('area-group-back-to-all');
    expect(back).toHaveTextContent('Back to all neighbourhood groups');
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the back affordance when onBack is not provided', () => {
    render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(screen.queryByTestId('area-group-back-to-all')).not.toBeInTheDocument();
  });

  // Issue #1817 (AC8) — a group is selected in this panel (deeper than a region), so
  // Start over always confirms first (design §8) rather than resetting immediately.
  it('renders Start over, confirms, and calls onStartOver only after confirming', async () => {
    const onStartOver = vi.fn();
    render(<AreaGroupSelectedPanel {...baseProps} onStartOver={onStartOver} />);
    await userEvent.click(screen.getByTestId('start-over-button'));
    expect(onStartOver).not.toHaveBeenCalled();
    expect(await screen.findByTestId('start-over-confirm-popover')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('start-over-confirm'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('prefers backend group copy over the adapter fallback when provided', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{
          ...UNIVERSITY_BELT,
          subtitle: 'Backend-supplied blurb',
          region_label: 'Backend Region',
        }}
      />,
    );
    const card = screen.getByTestId('area-group-selected-card');
    expect(within(card).getByText('Backend-supplied blurb')).toBeInTheDocument();
    expect(within(card).getByText('Backend Region')).toBeInTheDocument();
    expect(within(card).queryByText(/student-heavy neighbourhoods/i)).not.toBeInTheDocument();
  });

  it('renders 4-level breadcrumb and calls onBackToRegion when regionLabel is present', async () => {
    const onBack = vi.fn();
    const onBackToRegion = vi.fn();
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{ ...UNIVERSITY_BELT, region_label: 'North Udupi' }}
        onBack={onBack}
        onBackToRegion={onBackToRegion}
      />,
    );
    expect(screen.getByTestId('area-group-back-to-all')).toHaveTextContent('All zones');
    const regionBtn = screen.getByTestId('area-group-back-to-region');
    expect(regionBtn).toHaveTextContent('North Udupi');
    await userEvent.click(regionBtn);
    expect(onBackToRegion).toHaveBeenCalledWith('North Udupi');
  });
});


describe('AreaGroupSelectedPanel — empty member list', () => {
  it('shows a graceful "No areas found" state', () => {
    render(<AreaGroupSelectedPanel {...baseProps} areas={[]} />);
    expect(screen.getByText('No areas found')).toBeInTheDocument();
    // Heading + group card still render (not a crash).
    expect(screen.getByTestId('area-group-selected-card')).toBeInTheDocument();
  });
});

// ─── Issue #1597: "View all" CTA wiring ─────────────────────────────────────

describe('AreaGroupSelectedPanel — Issue #1597 View-all CTA (enterGroupResults)', () => {
  it('CTA click calls onViewAllResults when provided (group-results transition)', async () => {
    const onViewAllResults = vi.fn();
    render(<AreaGroupSelectedPanel {...baseProps} onViewAllResults={onViewAllResults} />);
    const cta = screen.getByTestId('area-group-view-all');
    await userEvent.click(cta);
    expect(onViewAllResults).toHaveBeenCalledTimes(1);
  });

  it('CTA click does NOT call onSelectArea (only onViewAllResults fires)', async () => {
    const onViewAllResults = vi.fn();
    const onSelectArea = vi.fn();
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        onSelectArea={onSelectArea}
        onViewAllResults={onViewAllResults}
      />,
    );
    await userEvent.click(screen.getByTestId('area-group-view-all'));
    expect(onViewAllResults).toHaveBeenCalledTimes(1);
    expect(onSelectArea).not.toHaveBeenCalled();
  });

  it('CTA count in "View all N properties" matches sum of member-area listingCounts', () => {
    // MANIPAL=5, UDYAVARA=3 → total=8
    render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(screen.getByTestId('area-group-view-all')).toHaveTextContent('View all 8 properties across University Belt');
  });

  it('when onViewAllResults is absent the CTA still renders (no crash; falls back to scroll)', () => {
    // No onViewAllResults prop — component must not crash and CTA must still be present.
    render(<AreaGroupSelectedPanel {...baseProps} />);
    expect(screen.getByTestId('area-group-view-all')).toBeInTheDocument();
  });
});

// ─── Issue #1597 (A2): DB description priority chain ─────────────────────────

describe('AreaGroupSelectedPanel — Issue #1597 description priority chain (A2)', () => {
  const AREA = makeArea({ areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', listingCount: 3 });

  it('renders DB description (group.description) over subtitle and adapter fallback when all three present', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{
          ...UNIVERSITY_BELT,
          description: 'DB-sourced long-form copy for University Belt.',
          subtitle: 'Short subtitle from backend',
        }}
        areas={[AREA]}
      />,
    );
    const card = screen.getByTestId('area-group-selected-card');
    expect(within(card).getByText('DB-sourced long-form copy for University Belt.')).toBeInTheDocument();
    // subtitle and adapter copy must NOT appear when DB description is present
    expect(within(card).queryByText('Short subtitle from backend')).not.toBeInTheDocument();
    expect(within(card).queryByText(/student-heavy neighbourhoods/i)).not.toBeInTheDocument();
  });

  it('falls back to subtitle when group.description is null', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{
          ...UNIVERSITY_BELT,
          description: null,
          subtitle: 'Subtitle-only fallback',
        }}
        areas={[AREA]}
      />,
    );
    const card = screen.getByTestId('area-group-selected-card');
    expect(within(card).getByText('Subtitle-only fallback')).toBeInTheDocument();
  });

  it('falls back to adapter description when both description and subtitle are null', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{
          ...UNIVERSITY_BELT,
          description: null,
          subtitle: null,
        }}
        areas={[AREA]}
      />,
    );
    const card = screen.getByTestId('area-group-selected-card');
    // The adapter content for 'university-belt' is the fallback
    expect(within(card).getByText(/student-heavy neighbourhoods/i)).toBeInTheDocument();
  });

  it('DB description is dynamic per group: different groupId renders different copy', () => {
    // Verify the description is sourced from the DTO and not hardcoded
    const { rerender } = render(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{ ...UNIVERSITY_BELT, description: 'Copy for group A', subtitle: null }}
        areas={[AREA]}
      />,
    );
    expect(screen.getByTestId('area-group-selected-card')).toHaveTextContent('Copy for group A');

    rerender(
      <AreaGroupSelectedPanel
        {...baseProps}
        group={{ ...UNIVERSITY_BELT, id: 'coastal-belt', name: 'Coastal Belt', description: 'Copy for group B', subtitle: null }}
        areas={[AREA]}
      />,
    );
    expect(screen.getByTestId('area-group-selected-card')).toHaveTextContent('Copy for group B');
    expect(screen.getByTestId('area-group-selected-card')).not.toHaveTextContent('Copy for group A');
  });
});

// ─── Issue #1806 (FIX-5e) — non-splittable cluster click highlight + scroll ──
//
// A non-splittable area-cluster chip click on the map holds the camera still
// (FIX-4/FIX-5) and instead highlights the cluster's member rows here, with
// the FIRST member scrolled into view. Traced path (DIRECTIVE 4):
// DiscoverRightPanel 'area-groups-landing' case → AreaGroupsLandingPanel's
// Level-2 (showLevel2) branch → THIS component.
describe('AreaGroupSelectedPanel — Issue #1806 FIX-5e: highlightedAreaKeys', () => {
  // jsdom does not implement scrollIntoView — stub it for every test in this
  // block so the FIX-5e effect never throws, regardless of whether the test
  // itself asserts on the call.
  const scrollIntoViewMock = vi.fn();
  beforeEach(() => {
    scrollIntoViewMock.mockClear();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it('applies a highlight treatment to member rows in highlightedAreaKeys, and none to rows not in the set', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        highlightedAreaKeys={['IN|KA|Udupi|Manipal']}
      />,
    );

    const manipalRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Manipal');
    const udyavaraRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Udyavara');
    expect(manipalRow.className).toMatch(/ring-copper/);
    expect(udyavaraRow.className).not.toMatch(/ring-copper/);
  });

  it('scrolls the FIRST highlighted member row into view', () => {
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        highlightedAreaKeys={['IN|KA|Udupi|Udyavara', 'IN|KA|Udupi|Manipal']}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    // Called on the FIRST key's row (Udyavara)'s <li> — registerRef is attached
    // to the row's <li>, not the inner <button> the data-testid lives on.
    const udyavaraRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Udyavara');
    expect(scrollIntoViewMock.mock.instances[0]).toBe(udyavaraRow.closest('li'));
  });

  it('regression: highlightedAreaKeys=undefined → no highlight treatment on any row, no scrollIntoView call', () => {
    render(<AreaGroupSelectedPanel {...baseProps} />);

    const manipalRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Manipal');
    const udyavaraRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Udyavara');
    expect(manipalRow.className).not.toMatch(/ring-copper/);
    expect(udyavaraRow.className).not.toMatch(/ring-copper/);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('highlight also applies to a zero-property (muted) row without breaking its disabled state', () => {
    const zeroArea = makeArea({ areaKey: 'IN|KA|Udupi|Zero', name: 'Zero Town', listingCount: 0 });
    render(
      <AreaGroupSelectedPanel
        {...baseProps}
        areas={[MANIPAL, zeroArea]}
        highlightedAreaKeys={['IN|KA|Udupi|Zero']}
      />,
    );

    const zeroRow = screen.getByTestId('browse-all-area-IN|KA|Udupi|Zero');
    expect(zeroRow.className).toMatch(/ring-copper/);
    expect(zeroRow).toHaveAttribute('aria-disabled', 'true');
  });

  // ── Issue #2005 (Slice 2 PR6) — Category B: [highlightedAreaKeys] trigger-key regression ──
  it('re-fires scrollIntoView when highlightedAreaKeys changes (a new cluster click)', () => {
    const { rerender } = render(
      <AreaGroupSelectedPanel {...baseProps} highlightedAreaKeys={['IN|KA|Udupi|Manipal']} />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    rerender(
      <AreaGroupSelectedPanel {...baseProps} highlightedAreaKeys={['IN|KA|Udupi|Udyavara']} />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
  });

  it('does not re-fire scrollIntoView on a re-render where highlightedAreaKeys is unchanged (same reference)', () => {
    const keys = ['IN|KA|Udupi|Manipal'];
    const { rerender } = render(
      <AreaGroupSelectedPanel {...baseProps} highlightedAreaKeys={keys} shownCount={5} />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // Unrelated prop (shownCount) changes; highlightedAreaKeys is the SAME array reference.
    rerender(
      <AreaGroupSelectedPanel {...baseProps} highlightedAreaKeys={keys} shownCount={9} />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});
