/**
 * Issue #2596 — the `area-selected` call site must enable Commercial and must
 * NOT mount the legacy filter drawer.
 *
 * WHY THIS FILE EXISTS. This defect went dark twice in silence, and the second
 * time it survived two gates. `AreaSelectedPanel` has THREE production render
 * sites; #2572 enabled `isCommercialSubtypeSupported` on two of them and the
 * panel's own comments then asserted there were only two. The third —
 * `DiscoverRightPanel`'s `area-selected` case — is the one the live buyer route
 * actually renders, so the approved TYPE -> Residential | Commercial row
 * rendered for nobody while every test that passed the prop explicitly stayed
 * green. Nothing failed, because nothing asserted what the CALLER passes.
 *
 * That same call site was the only one passing `filtersContent` (which is
 * `<MapFilters/>`), which made the legacy right-hand drawer reachable — and, in
 * that broken state, the only place a buyer could select Commercial at all.
 * #2596: "Do not mount MapFilters as a second buyer filter system."
 *
 * So these assertions are on the PROPS THE CALLER PASSES, not on what the panel
 * renders given props. A panel-level test cannot catch this class: it supplies
 * the prop itself and therefore always passes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
}));

/** Captures the props the CALLER hands the panel, which is the thing under test. */
const captured: Record<string, unknown>[] = [];
vi.mock('../panels/AreaSelectedPanel', () => ({
  AreaSelectedPanel: (props: Record<string, unknown>) => {
    captured.push(props);
    return <div data-testid="stub-area-selected-panel" />;
  },
}));

const AREA_KEY = 'IN|KA|Udupi|Manipal';
const area: AreaPoint = {
  areaKey: AREA_KEY,
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.8,
  bbox: null,
  listingCount: 4,
};

const renderAreaSelected = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DiscoverProvider>
          <DiscoverRightPanel
            onStartOver={vi.fn()}
            onSelectJourney={vi.fn()}
            panelContent="area-selected"
            areas={[area]}
            selectedArea={area}
            urlAreaKey={AREA_KEY}
            isLoadingAreas={false}
            // Deliberately SUPPLIED by the caller-of-the-caller. The assertion
            // below is that DiscoverRightPanel does not forward it to the
            // selected-area panel — not that it is absent from the tree.
            filtersContent={<div data-testid="legacy-map-filters" />}
          />
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('#2596 — DiscoverRightPanel area-selected call site', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('ENABLES the Commercial family on the selected-area panel', () => {
    renderAreaSelected();
    expect(captured.length).toBeGreaterThan(0);
    // Truthy, not just "not false" — an omitted prop would read as undefined
    // and silently fall back to the panel's `= false` default, which is exactly
    // how this shipped dark.
    expect(captured[0].isCommercialSubtypeSupported).toBe(true);
  });

  it('does NOT forward filtersContent, so the legacy drawer is not a second filter owner here', () => {
    renderAreaSelected();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].filtersContent).toBeUndefined();
  });

  it('still forwards the props the surface genuinely needs (guards against a blanket prop drop)', () => {
    renderAreaSelected();
    const props = captured[0];
    // If someone "fixes" the assertion above by deleting the whole prop block,
    // these fail — so the test pins a narrow removal, not an indiscriminate one.
    expect(props.selectedArea).toBeDefined();
    expect(props.journey !== undefined || props.intent !== undefined).toBe(true);
  });
});
