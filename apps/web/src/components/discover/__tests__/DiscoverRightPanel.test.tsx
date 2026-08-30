import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders, makeTestQueryClient } from '@/test/renderWithProviders';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthModalProvider } from '@/contexts/AuthModalContext';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Issue #2005 (Slice 2 PR6) — Category A: spy on emitPanelOpen so the
// PANEL_OPEN-on-mount-only regression test can assert call count without
// pulling in the real telemetry consent/localStorage machinery.
const mockEmitPanelOpen = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useDiscoverTelemetry', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDiscoverTelemetry')>(
    '@/hooks/useDiscoverTelemetry',
  );
  return { ...actual, useDiscoverTelemetry: () => ({ ...actual.useDiscoverTelemetry(), emitPanelOpen: mockEmitPanelOpen }) };
});

const makeArea = (areaKey: string, areaLabel: string, listingCount: number): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.3,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount,
});

// Required new props with no-op defaults so individual tests stay concise.
const baseProps = {
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

// Issue #1745 Batch A scope-change fix — GuidedEntryPanel now calls useDiscoverSummary
// (a useQuery hook), so every render in this file needs a QueryClientProvider ancestor.
// Matches the shared renderWithProviders() convention (fresh QueryClient per render).
// Issue #1953 (build step 2) — GuidedEntryPanel/school-journey panels now consume
// the DiscoverProvider facade instead of calling useDiscoverUrlState() directly,
// so every render needs a real DiscoverProvider ancestor (inside the Router
// renderWithProviders already mounts).
const renderPanel = (ui: React.ReactElement) =>
  renderWithProviders(<DiscoverProvider>{ui}</DiscoverProvider>);

describe('DiscoverRightPanel', () => {
  it('renders the panel with data-testid', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} />);
    expect(screen.getByTestId('discover-right-panel')).toBeInTheDocument();
  });

  it('shows guided-entry state when panelContent="guided-entry"', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />,
    );
    expect(screen.getByTestId('guided-entry-panel')).toBeInTheDocument();
    // Issue #2108 (shell fix) — the oversized city-specific hero was replaced
    // with the SAME compact eyebrow + heading pattern the area-first ROOT
    // state uses (NavigationLevelPanel's isCityRoot branch), so the heading
    // itself is no longer city-dynamic; the eyebrow (asserted below in the
    // city-dynamic test) still carries the city name.
    expect(screen.getByText('Where do you want to explore?')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.getByTestId('journey-card-school-first')).toBeInTheDocument();
  });

  it('guided-entry copy is city-dynamic — Bangalore selected shows Bangalore, not Udupi', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="bangalore" />,
    );
    expect(screen.getByText('Discover Bangalore')).toBeInTheDocument();
    // The mock's hardcoded Udupi copy must NOT leak into another city.
    expect(screen.queryByText('Discover Udupi')).not.toBeInTheDocument();
  });

  it('guided-entry shows a city-empty state when isCityEmpty (no fabricated copy/markers)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        city="bangalore"
        totalProperties={0}
        isCityEmpty
      />,
    );
    const empty = screen.getByTestId('guided-entry-empty-state');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent('No properties in Bangalore yet');
    // Journey cards remain available so farmland/school journeys are still reachable.
    expect(screen.getByTestId('journey-card-agri-first')).toBeInTheDocument();
  });

  it('guided-entry hides the empty state by default (e.g. while areas load)', () => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />,
    );
    expect(screen.queryByTestId('guided-entry-empty-state')).not.toBeInTheDocument();
  });

  it('shows the static agri-landing placeholder when panelContent="agri-landing"', () => {
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="agri-landing" areas={[]} />);
    // CorridorLandingPanel renders corridor-landing-empty when corridorGroups is empty (default).
    expect(screen.getByTestId('corridor-landing-empty')).toBeInTheDocument();
    // PanelHeader title is always present for agri-landing (h2 to avoid journey-pill duplicate).
    expect(screen.getByRole('heading', { name: 'Agricultural land' })).toBeInTheDocument();
  });

  it('agri-landing renders NO listing/marker/count content (static, no fetch)', () => {
    // Pass listing-ish props that the panel must ignore in agri-landing mode.
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[makeArea('k1', 'Manipal', 42)]}
        areaListings={[{ id: 'l1' } as unknown as DiscoverCityListingItem]}
        isLoadingListings={false}
      />,
    );
    // No listing cards, no skeletons — the placeholder is purely static.
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('listing-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('does not show quick-select chips (removed in A1)', () => {
    const areas = [
      makeArea('k1', 'Manipal', 42),
      makeArea('k2', 'Malpe', 7),
    ];
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={areas} />);
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick select:')).not.toBeInTheDocument();
  });

  it('switches to listings mode when panelContent="area-selected" and selectedArea is set', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        journey="area-first"
      />,
    );
    // 'Manipal' appears in both the breadcrumb area crumb and the area heading (a4 redesign).
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('quick-select-chip')).not.toBeInTheDocument();
  });

  it('#1953 regression — renders COMPACT journey tabs for a journey-less inferred panel state (areaKey with no journey= param)', () => {
    // Reproduces a real production URL this app constructs itself:
    // LandingPage/AreaCtaBlock/AreaGuide/AreaGuideHero/Trends all link to
    // /discover?...&areaKey=... WITHOUT a journey= param. derivePanelContent
    // still infers 'area-selected' from areaKey alone (see
    // discoverPanelState.ts's journey-less inference branches), so `journey`
    // itself is undefined here — exactly like those deep links.
    //
    // Before the fix, JourneySwitcher's density was `activeJourney != null`,
    // and DiscoverRightPanel passed `activeJourney={journey ?? null}` — so
    // with `journey` undefined, density fell back to FULL cards (the
    // "Recommended" badge and "Choose how you want to search" heading would
    // render) even though the panel is showing area results, not the
    // landing. This test fails on that old implementation and passes once
    // density is derived from `panelContent !== 'guided-entry'` instead.
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        // journey intentionally omitted.
      />,
    );
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
    // Task 1's aria-selected decision: a journey-less inferred single-journey
    // state still marks the equivalent tab selected (inferJourneyFromPanelContent),
    // rather than inheriting "nothing selected" just because the URL omitted journey=.
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'false');
  });

  it('#1953 regression — renders FULL journey cards on the guided-entry landing (the other direction of the density derivation)', () => {
    // COMPANION TO THE TEST ABOVE, AND IT EXISTS BECAUSE THAT ONE ALONE CANNOT FAIL
    // IN BOTH DIRECTIONS. The test above pins "non-landing must be compact". On its
    // own, a hardcoded `compact={true}` — or any change flattening every state to the
    // compact strip — would satisfy it, and would satisfy every other unit test in this
    // repository. That is the can't-fail-instrument class this issue has paid for
    // repeatedly: a canary that could not fail, a roster assertion blind to an
    // unreachable option, an ownership checker matching the wrong element.
    //
    // So this asserts the OPPOSITE direction: the Discover landing must keep the FULL
    // cards.
    //
    // WHAT THIS PAIR DOES AND DOES NOT BUY — corrected after review, because the
    // original wording here claimed more than the evidence supports and would have
    // stood as documentation. The two tests BRACKET the density function at its two
    // endpoints, so neither a blanket-compact nor a blanket-full implementation
    // survives. They do NOT pin the full derivation: a predicate keyed off
    // `selectedArea`, off `panelContent === 'area-selected'`, or off
    // `inferJourneyFromPanelContent(panelContent) != null` passes both endpoints while
    // breaking other panel states. The `it.each` below NARROWS that gap — it kills the
    // three predicates named there, and does not claim more. Five samples of a 16-valued
    // function do not pin it either. Claiming "pins the derivation" from two samples was
    // exactly the overstatement this file warns about, and "closes that gap" was a second,
    // smaller instance of the same thing caught by the same reviewer.
    renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" city="udupi" areas={[]} />);
    expect(screen.getByText('Choose how you want to search')).toBeInTheDocument();
    // getByText, not getAllByText(...).length >= 1: only one node can match, and getByText
    // THROWS on multiple matches — so it also catches a resurrected duplicate JourneySwitcher
    // mount, which is a live risk because build step 6 removed exactly such a second copy.
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    // The landing genuinely has no journey selected — no tab may claim otherwise.
    expect(screen.getByTestId('journey-card-area-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-school-first')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('journey-card-agri-first')).toHaveAttribute('aria-selected', 'false');
  });

  // Sampling the density function beyond its two endpoints. Each state here is one a
  // WRONG-but-endpoint-passing predicate diverges on:
  //   - `panelContent === 'area-selected'`                  breaks every journey landing
  //   - `selectedArea != null`                              breaks states with no selected area
  //
  // UPDATE (product-owner mode-tab invariant fix): `inferJourneyFromPanelContent`
  // now resolves 'area-school-combined' to 'school-first' — see discoverPanelState.ts
  // for why (the state is genuinely mixed; this only resolves the journey-less
  // cold-load path, and #1738's journey-explicit checks in useMarkerSelection.ts /
  // useDiscoverJourneyTransitions.ts remain load-bearing and must not be deleted).
  // As a result `inferJourneyFromPanelContent(panelContent) != null` is now
  // BEHAVIOURALLY IDENTICAL to the shipped `panelContent !== 'guided-entry'` —
  // 'guided-entry' is the sole state either maps to null. It is therefore no
  // longer a distinguishable wrong implementation at all, and nothing here
  // kills it: by construction, not by omission. Do not go hunting for the case
  // that "covers" it; there isn't one and there does not need to be.
  //
  // 'area-school-combined' stays in this array because it still exercises
  // COMPACT-tabs rendering for the mixed area+school state — do not read its
  // presence here as pinning any null/non-null distinction anymore.
  it.each([
    'area-selected',
    'area-groups-landing',
    'school-browse',
    'agri-landing',
    'area-school-combined',
  ] as const)('#1953 — panelContent="%s" renders COMPACT tabs, never the full cards', (panelContent) => {
    renderPanel(
      <DiscoverRightPanel {...baseProps} panelContent={panelContent} city="udupi" areas={[]} />,
    );
    // POSITIVE ANCHOR — LOAD-BEARING, DO NOT REMOVE. The two assertions below are pure
    // ABSENCE checks, and absence is satisfied trivially by a component that renders
    // NOTHING. Without this line all five cases pass green against a revert of build
    // step 6's persistence — i.e. `{panelContent === 'guided-entry' && <JourneySwitcher/>}`
    // — which is the exact inverse of the behaviour AC27 requires and precisely what that
    // step churned. That is the "a broken app makes negative assertions pass" class this
    // repository has been bitten by before, and THIS BLOCK was an instance of it until a
    // reviewer caught it. Not the whole suite: the journey-less test above already failed
    // against that revert independently, which is why the control produced 6 failures and
    // not 5 — a distinction worth keeping, since overstating scope is the thing this file
    // has now been corrected on three times. Mounted + no heading + no badge => compact.
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
    expect(screen.queryByText('Choose how you want to search')).not.toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('shows loading skeletons while isLoadingListings', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeletons (not stale cards) when isLoadingListings=true with previous areaListings', () => {
    // keepPreviousData means areaListings can be non-empty while a new fetch is in flight.
    // The panel must show skeletons, not stale listing cards, during this transition.
    const area = makeArea('k1', 'Manipal', 5);
    const staleListings: DiscoverCityListingItem[] = [{
      id: 'stale1',
      pricePaise: 1000000 * 100,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={staleListings}
        isLoadingListings={true}
      />,
    );
    expect(screen.getAllByTestId('listing-skeleton').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('listing-card')).not.toBeInTheDocument();
  });

  it('shows empty state when areaListings is empty and not loading', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    // Issue #1817 (AC7) — genuinely-empty cause now routes through the shared
    // cause-based copy ("No listings here yet"), replacing the old intent-only wording.
    expect(screen.getByText('No listings here yet')).toBeInTheDocument();
  });

  it('renders listing cards with price and locality', () => {
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{
      id: 'l1',
      pricePaise: 500000 * 100,
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={true}
      />,
    );
    expect(screen.getAllByTestId('listing-card').length).toBe(1);
    expect(screen.getAllByText('Manipal').length).toBeGreaterThanOrEqual(1);
    // pricePaise 500000*100 → Math.round(50_000_000/100)=500000 → formatPrice → '₹5 L'
    expect(screen.getByText('₹5 L')).toBeInTheDocument();
  });

  it('shows price band or request for anonymous users', () => {
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{
      id: 'l1',
      pricePaise: undefined,
      priceBand: '₹50L–1Cr',
      propertyType: 'apartment',
      locality: 'Manipal',
      primaryImageUrl: null,
    }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText('₹50L–1Cr')).toBeInTheDocument();
    expect(screen.queryByText('₹5 L')).not.toBeInTheDocument();
  });

  it('back button calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        onBack={onBack}
      />,
    );
    await user.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('listing card click navigates to /listing/:id', async () => {
    const user = userEvent.setup();
    const area = makeArea('k1', 'Manipal', 5);
    const listings: DiscoverCityListingItem[] = [{ id: 'l1', pricePaise: 5000000, propertyType: 'apartment', locality: 'Manipal', primaryImageUrl: null }];
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={listings}
        isLoadingListings={false}
      />,
    );
    await user.click(screen.getByTestId('listing-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/listing/l1');
  });

  it('shows Trends button in listings mode when trendsHref is provided', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        trendsHref="/trends?city=udupi&areaKey=k1"
      />,
    );
    expect(screen.getByText('Trends')).toBeInTheDocument();
  });

  it('does not show Trends button when trendsHref is absent', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — chip strip mount gate (Issue #1151)', () => {
  // AC5: seller/date/boolean chips must be visible even when no area or school is
  // selected. The top chip strip is rendered for panel states that don't already
  // embed chips in their own PanelHeader (guided-entry, area-groups-landing,
  // area-selection, school-browse).

  const chipNode = (
    <div data-testid="active-context-chips">
      <span data-testid="chip-seller">Owner</span>
    </div>
  );

  it('renders chip strip in guided-entry state when activeContextChips is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        activeContextChips={chipNode}
      />,
    );
    expect(screen.getByTestId('active-context-chips')).toBeInTheDocument();
    expect(screen.getByTestId('chip-seller')).toBeInTheDocument();
  });

  it('renders chip strip in area-groups-landing state when activeContextChips is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-groups-landing"
        areas={[]}
        activeContextChips={chipNode}
      />,
    );
    expect(screen.getByTestId('active-context-chips')).toBeInTheDocument();
  });

  it('does NOT render top chip strip in area-selected state (chips are in PanelHeader)', () => {
    const area = makeArea('k1', 'Manipal', 5);
    // area-selected passes activeContextChips to its own PanelHeader; the top
    // strip must not render a second instance.
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        activeContextChips={chipNode}
      />,
    );
    // Only one instance of active-context-chips in the DOM.
    expect(screen.getAllByTestId('active-context-chips')).toHaveLength(1);
  });

  it('renders no chip strip when activeContextChips is not provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
      />,
    );
    expect(screen.queryByTestId('active-context-chips')).not.toBeInTheDocument();
  });
});

describe('DiscoverRightPanel — search input (#952)', () => {
  const area = makeArea('k1', 'Manipal', 5);

  it('renders search input in listings mode when onSearchChange is provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery=""
        onSearchChange={vi.fn()}
      />,
    );
    // a4 redesign: placeholder is "Search properties in <area>" (not "Search listings by keyword")
    expect(screen.getByTestId('area-search-input')).toBeInTheDocument();
  });

  it('reflects searchQuery value in the input', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery="foo"
        onSearchChange={vi.fn()}
      />,
    );
    // a4 redesign: use data-testid selector (placeholder is now area-dynamic)
    expect(screen.getByTestId('area-search-input')).toHaveValue('foo');
  });

  it('typing in the input fires onSearchChange', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery=""
        onSearchChange={onSearchChange}
      />,
    );
    await user.type(screen.getByTestId('area-search-input'), 'a');
    // Each keystroke fires onSearchChange with the current input value.
    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('clear button appears when searchQuery is non-empty and clicking it calls onSearchChange("")', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        searchQuery="lakeside"
        onSearchChange={onSearchChange}
      />,
    );
    // Issue #1817 (AC7) — scoped to the search input's own inline × (data-testid
    // area-search-clear): with areaListings=[] + a search cause, the empty state
    // below also renders a "Clear search" action now, which would otherwise make a
    // bare role/name query ambiguous.
    const clearBtn = screen.getByTestId('area-search-clear');
    expect(clearBtn).toBeInTheDocument();
    await user.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('does not render search input when onSearchChange is not provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
      />,
    );
    expect(screen.queryByPlaceholderText('Search listings by keyword')).not.toBeInTheDocument();
  });
});

// ─── Buy/Rent single-owner invariant (product-owner ruling, #1953 follow-up) ─
// The floating top-strip Buy/Rent control that used to live in this component's
// header (Issue #1494) was REMOVED entirely: the persistent DiscoverControlBar
// (a sibling of DiscoverRightPanel, not rendered by it) is now the SOLE Buy/Rent
// control on /discover. These tests lock in that DiscoverRightPanel itself never
// renders a Buy/Rent control at any panelContent, even when onIntentChange/intent
// are supplied — replacing the old "renders it in the header" assertions, which
// asserted exactly the duplicate this ruling retires. The click→onIntentChange
// state-behaviour coverage this describe block used to own is not lost: it is
// still exercised against the real control in DiscoverControlBar.test.tsx
// ("clicking Rent calls the facade's setIntent action").
describe('DiscoverRightPanel — Buy/Rent single-owner invariant', () => {
  it('never renders a Buy/Rent control at guided-entry, even when onIntentChange/intent are provided', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="guided-entry"
        areas={[]}
        intent="buy"
        onIntentChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('intent-selector-buy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('intent-selector-rent')).not.toBeInTheDocument();
    // Journey cards still render (unaffected by the Buy/Rent removal).
    expect(screen.getByTestId('journey-card-area-first')).toBeInTheDocument();
  });

  it('never renders a Buy/Rent control at area-selected, even when onIntentChange/intent are provided', () => {
    const area = makeArea('k1', 'Manipal', 5);
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-selected"
        areas={[area]}
        selectedArea={area}
        areaListings={[]}
        isLoadingListings={false}
        intent="buy"
        onIntentChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
  });

  it('does not render the removed top-strip intent selector at any other panel state either', () => {
    // Tested on a non-landing, non-area-selected panel (agri-landing) — this state used
    // to be exactly where the now-removed floating top-strip control appeared.
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        intent="buy"
        onIntentChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('intent-selector')).not.toBeInTheDocument();
  });
});

// ─── Issue #1456 — Cumulative distance hint text ──────────────────────────────

describe('DiscoverRightPanel — cumulative distance hint (Issue #1456)', () => {
  it('renders hint text when distance tiers are shown (region selected with tiers)', () => {
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="agri-landing"
        areas={[]}
        selectedRegion="NORTH"
        selectedMaxKm={25}
        corridorGroups={[
          {
            directionCode: 'NORTH',
            groupName: 'North towards Hebri',
            availableMaxDistances: [
              { maxKm: 25, distanceLabel: 'Up to 25 km', includedBandCodes: [], listingCount: 3, areaKeys: [] },
              { maxKm: 50, distanceLabel: 'Up to 50 km', includedBandCodes: [], listingCount: 5, areaKeys: [] },
            ],
          },
        ]}
        onClearRegionAndMaxKm={vi.fn()}
        onSetMaxKm={vi.fn()}
        onSetRegionWithMaxKm={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Includes parcels at closer distances too.'),
    ).toBeInTheDocument();
  });
});

// ─── Issue #1745 — 4-level residential Discover hierarchy ──────────────────────

describe('DiscoverRightPanel — 4-level residential hierarchy (Issue #1745)', () => {
  // Issue #1956 PR-6 (final cutover, Step 3) — AreaGroupsLandingPanel (and its
  // scope-filter-banner Level-1 UI this test used to exercise) is deleted.
  // 'area-groups-landing' now renders the safe AreaSelectionPanel fallback —
  // see DiscoverRightPanel.tsx's renderPanel switch. `scope`/`onClearScope`
  // remain valid props (still consumed by the 'area-selected' case) but no
  // longer drive any Level-1 scope-filtering UI for this panelContent value.
  it('renders the AreaSelectionPanel fallback for area-groups-landing, not the deleted scope-filter UI', () => {
    const onClearScope = vi.fn();
    renderPanel(
      <DiscoverRightPanel
        {...baseProps}
        panelContent="area-groups-landing"
        areas={[]}
        areaGroups={[
          {
            id: 'north-zone',
            name: 'North Zone',
            subtitle: '',
            region_label: 'North Bangalore',
            area_keys: [],
            school_count: 0,
            focus_lat: null,
            focus_lon: null,
            region_key: 'north-belt',
          },
          {
            id: 'south-zone',
            name: 'South Zone',
            subtitle: '',
            region_label: 'South Bangalore',
            area_keys: [],
            school_count: 0,
            focus_lat: null,
            focus_lon: null,
            region_key: 'south-belt',
          },
        ]}
        scope="north-belt"
        onClearScope={onClearScope}
      />,
    );

    expect(screen.getByText('Explore by neighbourhood')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-region-filter-banner')).not.toBeInTheDocument();
    expect(screen.queryByText('North Zone')).not.toBeInTheDocument();
    expect(screen.queryByText('South Zone')).not.toBeInTheDocument();
  });

  // ── Issue #2005 (Slice 2 PR6) — Category A: useMountEffect regression ──────
  // PANEL_OPEN telemetry emits once, on mount, and never again on prop updates.
  describe('PANEL_OPEN telemetry (Issue #1531) — mount-only', () => {
    beforeEach(() => {
      mockEmitPanelOpen.mockClear();
    });

    it('emits once on mount', () => {
      renderPanel(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />);
      expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);
    });

    it('does not re-emit when props change on a later re-render', () => {
      // RTL's `rerender` replaces the WHOLE tree it was given each call, so — unlike
      // renderPanel()'s one-shot renderWithProviders() — every call here re-supplies
      // the full provider stack (same instances) so context isn't torn down mid-test.
      const client = makeTestQueryClient();
      const fullTree = (ui: React.ReactElement) => (
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <MemoryRouter>
              <AuthProvider>
                <AuthModalProvider>
                  <DiscoverProvider>{ui}</DiscoverProvider>
                </AuthModalProvider>
              </AuthProvider>
            </MemoryRouter>
          </TooltipProvider>
        </QueryClientProvider>
      );

      const { rerender } = render(
        fullTree(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="udupi" />),
      );
      expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);

      rerender(
        fullTree(<DiscoverRightPanel {...baseProps} panelContent="guided-entry" areas={[]} city="bangalore" />),
      );
      rerender(
        fullTree(
          <DiscoverRightPanel
            {...baseProps}
            panelContent="area-selected"
            areas={[makeArea('k1', 'Manipal', 5)]}
            selectedArea={makeArea('k1', 'Manipal', 5)}
            areaListings={[]}
          />,
        ),
      );

      // Still just the one mount-time emission — never re-fired on prop updates.
      expect(mockEmitPanelOpen).toHaveBeenCalledTimes(1);
    });
  });
});
