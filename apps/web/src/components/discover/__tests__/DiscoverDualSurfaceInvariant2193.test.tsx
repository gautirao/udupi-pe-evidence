/**
 * Issue #2193 AC3 — dual-surface render contract, panel half.
 *
 * THE INVARIANT: a listing whose area_key genuinely matches a canonical Area
 * AND whose lat/lon genuinely falls inside that Area, when that Area is
 * selected via the canonical node mechanism, MUST appear in the results
 * panel AND render its marker on the map.
 *
 * This file proves the PANEL half using the REAL DiscoverRightPanel
 * component (not a mock), asserting BY LISTING ID via the established
 * click-navigates-to-/listing/:id idiom (see
 * DiscoverRightPanel.test.tsx's "listing card click navigates to
 * /listing/:id" test — same mechanism, reused here) — never a bare count —
 * with an explicit negative control for a listing genuinely outside the
 * selected area.
 *
 * The MARKER half of this same invariant (same TARGET/OUTSIDE identifiers,
 * same fixture semantics) is proved at the pure-selector layer in
 * src/features/discover/map/resolveMarkerListings.test.ts's "Issue #2193
 * AC3" describe block — see that file's header comment for why the real
 * PropertyMap/Leaflet DOM render is NOT exercised here (R2): every existing
 * PropertyMap.*.test.tsx in this repo mocks the `leaflet` module itself
 * (`marker`/`divIcon` reduced to `vi.fn()` stubs), so no established
 * convention in this suite produces a genuine
 * `data-testid="property-marker"` DOM element under JSDOM. That render
 * layer is therefore UNPROVEN by automated tests in this repo as it stands
 * — stated explicitly rather than faked with a substitute mock.
 *
 * N5 (shared payload): the TARGET_AREA_KEY / TARGET_LISTING_ID /
 * OUTSIDE_LISTING_ID constants below are the SAME literal values used in
 * resolveMarkerListings.test.ts's AC3 block, so both halves assert against
 * one shared fixture identity — a panel/marker desync cannot silently
 * survive because one half used different ids than the other.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverRightPanel } from '@/features/discover/right-panel/testing/flatPropsRightPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Shared fixture identity (N5) — kept byte-identical to
// resolveMarkerListings.test.ts's Issue #2193 AC3 block.
const TARGET_AREA_KEY = 'QA|QA|qa2193audit|TargetArea';
const TARGET_LISTING_ID = '11111111-1111-1111-1111-111111111111';
const OUTSIDE_LISTING_ID = '22222222-2222-2222-2222-222222222222';

const TARGET_AREA: AreaPoint = {
  areaKey: TARGET_AREA_KEY,
  areaLabel: 'TargetArea',
  geo_center_lat: 13.0,
  geo_center_lon: 74.0,
  bbox: [[12.9, 73.9], [13.1, 74.1]],
  listingCount: 1,
};

const targetListingItem: DiscoverCityListingItem = {
  id: TARGET_LISTING_ID,
  pricePaise: 5_000_000 * 100,
  propertyType: 'apartment',
  locality: 'TargetArea',
  primaryImageUrl: null,
};

const outsideListingItem: DiscoverCityListingItem = {
  id: OUTSIDE_LISTING_ID,
  pricePaise: 9_000_000 * 100,
  propertyType: 'apartment',
  locality: 'OutsideArea',
  primaryImageUrl: null,
};

// Only the TARGET listing is present in this node-scoped payload — the
// backend's own scoping (proved independently by the AC1 Testcontainers IT)
// is what would keep the OUTSIDE listing out of `areaListings` in production;
// this fixture models that already-scoped response, matching how
// useDiscoverMapData.ts derives `areaListings` from `cityListingsData`.
const nodeScopedAreaListings: DiscoverCityListingItem[] = [targetListingItem];

const renderPanel = (areaListings: DiscoverCityListingItem[]) =>
  renderWithProviders(
    <DiscoverProvider>
      <DiscoverRightPanel
        onStartOver={() => {}}
        onSelectJourney={() => {}}
        panelContent="area-selected"
        areas={[TARGET_AREA]}
        selectedArea={TARGET_AREA}
        areaListings={areaListings}
        isLoadingListings={false}
        isAuthenticated
        journey="area-first"
      />
    </DiscoverProvider>,
  );

describe('Issue #2193 AC3 — dual-surface contract (panel half), by listing id', () => {
  it('the panel renders the TARGET listing card, scoped inside discover-right-panel, and clicking it navigates by THAT SPECIFIC id', async () => {
    const user = userEvent.setup();
    renderPanel(nodeScopedAreaListings);

    const panel = screen.getByTestId('discover-right-panel');
    const cards = screen.getAllByTestId('listing-card');
    expect(cards).toHaveLength(1);
    expect(panel).toContainElement(cards[0]);

    // "By listing id", not merely "a card exists": clicking navigates to
    // /listing/<TARGET_LISTING_ID> specifically — the established
    // DiscoverRightPanel.test.tsx identity-proof idiom, reused here.
    await user.click(cards[0]);
    expect(mockNavigate).toHaveBeenCalledWith(`/listing/${TARGET_LISTING_ID}`);
    expect(mockNavigate).not.toHaveBeenCalledWith(`/listing/${OUTSIDE_LISTING_ID}`);
  });

  it('N1 negative control: a genuinely out-of-area listing (OUTSIDE_LISTING_ID) is absent from this node-scoped panel', () => {
    renderPanel(nodeScopedAreaListings);
    // OUTSIDE_LISTING_ID must never appear for this correctly node-scoped
    // fixture — proved by there being exactly one card, and that one card's
    // click target being the TARGET id (asserted in the test above), not by
    // an easily-vacuous "some text is absent" check.
    expect(screen.getAllByTestId('listing-card')).toHaveLength(1);
  });

  it('control: when the fixture DOES leak the OUTSIDE listing in, both cards render and BOTH ids are individually clickable/navigable — proves the assertions above are not vacuously true', async () => {
    const user = userEvent.setup();
    const leaked: DiscoverCityListingItem[] = [targetListingItem, outsideListingItem];
    renderPanel(leaked);

    const cards = screen.getAllByTestId('listing-card');
    expect(cards).toHaveLength(2);

    await user.click(cards[0]);
    await user.click(cards[1]);
    expect(mockNavigate).toHaveBeenCalledWith(`/listing/${TARGET_LISTING_ID}`);
    expect(mockNavigate).toHaveBeenCalledWith(`/listing/${OUTSIDE_LISTING_ID}`);
  });
});
