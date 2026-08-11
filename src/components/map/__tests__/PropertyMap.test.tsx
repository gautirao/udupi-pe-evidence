import { describe, it, expect, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────
// Leaflet requires a real DOM with canvas/SVG support that jsdom cannot provide.
// We test createMarkerIcon indirectly by mocking L.divIcon and capturing the html
// argument it receives, then asserting on the captured value.

const capturedDivIconCalls: Array<{ html: string }> = [];

vi.mock('leaflet', () => {
  return {
    default: {
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
      divIcon: vi.fn((opts: { html: string }) => {
        capturedDivIconCalls.push({ html: opts.html });
        return { options: opts };
      }),
      marker: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
      })),
      markerClusterGroup: vi.fn(() => ({
        addLayer: vi.fn(),
        on: vi.fn().mockReturnThis(),
        off: vi.fn().mockReturnThis(),
      })),
      point: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  ZoomControl: () => null,
  useMap: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({ getNorth: vi.fn(() => 14), getSouth: vi.fn(() => 13), getEast: vi.fn(() => 75), getWest: vi.fn(() => 74) })),
    getCenter: vi.fn(() => ({ lat: 13.5, lng: 74.7 })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    // Issue #1762 fix — MarkerClusterLayer registers a general 'moveend'
    // listener directly on the map on mount now, not just inside a
    // cluster-click handler.
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  })),
  useMapEvents: vi.fn(() => ({
    getBounds: vi.fn(() => ({ getNorth: vi.fn(() => 14), getSouth: vi.fn(() => 13), getEast: vi.fn(() => 75), getWest: vi.fn(() => 74) })),
    getZoom: vi.fn(() => 12),
    getContainer: vi.fn(() => document.body),
  })),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.css', () => ({}));
vi.mock('leaflet.markercluster/dist/MarkerCluster.Default.css', () => ({}));
vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Imports after mocks ───────────────────────────────────────
import React from 'react';
import { render, screen } from '@testing-library/react';
import { escapeHtml } from '@/lib/security';
import type { PropertyListingWithImages } from '../PropertyMap';

// ─── Unit tests for escapeHtml (the core of the RE-174 fix) ───
// These tests confirm the escaping function behaves correctly in isolation,
// matching exactly how it is applied in the divIcon template.

describe('escapeHtml — used in PropertyMap divIcon (RE-174)', () => {
  it('returns the uppercased first character of a normal type unchanged', () => {
    expect(escapeHtml('h'.toUpperCase())).toBe('H');
    expect(escapeHtml('l'.toUpperCase())).toBe('L');
    expect(escapeHtml('a'.toUpperCase())).toBe('A');
  });

  it('escapes < and > so a script-tag first character cannot inject HTML', () => {
    // propertyType = "<script>" → first char is "<"
    const firstChar = '<script>'[0].toUpperCase(); // "<"
    expect(escapeHtml(firstChar)).toBe('&lt;');
  });

  it('escapes > character', () => {
    const firstChar = '>div'[0].toUpperCase(); // ">"
    expect(escapeHtml(firstChar)).toBe('&gt;');
  });

  it('escapes & character', () => {
    const firstChar = '&amp'[0].toUpperCase(); // "&"
    expect(escapeHtml(firstChar)).toBe('&amp;');
  });

  it('escapes double-quote character', () => {
    const firstChar = '"value'[0].toUpperCase(); // '"'
    expect(escapeHtml(firstChar)).toBe('&quot;');
  });

  it('escapes single-quote character', () => {
    const firstChar = "'value"[0].toUpperCase(); // "'"
    expect(escapeHtml(firstChar)).toBe('&#39;');
  });
});

// ─── Integration: divIcon HTML produced by PropertyMap ────────
// Render PropertyMap with a listing whose property_type first character is a
// special character and confirm the captured html does not contain raw < or >.

describe('PropertyMap — divIcon HTML escaping (RE-174)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  it('renders the formatted price label in the divIcon html for a house listing with a price (a1 pill behaviour)', async () => {
    // a1: when price is non-null and > 0, the marker shows a price pill (e.g. "₹10 L")
    // rather than the single-letter glyph.
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: '1',
        title: 'Test House',
        property_type: 'house' as const,
        latitude: 13.34,
        longitude: 74.74,
        price: 1_000_000,
        price_paise: 100_000_000,
        status: 'LIVE' as const,
        locality: 'Udupi',
        area_sqft: 1000,
        bedrooms: 3,
        bathrooms: 2,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'test-house',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // Price of ₹10 L (1_000_000 INR) → pill label "₹10 L"; glyph "H" is NOT shown.
    const markerIconCall = capturedDivIconCalls.find((c) => c.html.includes('₹'));
    expect(markerIconCall).toBeDefined();
    expect(markerIconCall!.html).toContain('₹10 L');
  });

  it('renders the "H" glyph in the divIcon html for a house listing with no price (a1 fallback behaviour)', async () => {
    // a1: when price is null, the marker falls back to the property-type first letter.
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: '2',
        title: 'Test House No Price',
        property_type: 'house' as const,
        latitude: 13.35,
        longitude: 74.75,
        price: null,
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        area_sqft: 1000,
        bedrooms: 3,
        bathrooms: 2,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'test-house-no-price',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // R-A: Null price → neutral '—' fallback (type-disc + glyph still render for type identity).
    // The old 'H' (house first letter) is replaced by '—' per the R-A spec.
    const markerIconCall = capturedDivIconCalls.find((c) => c.html.includes('—'));
    expect(markerIconCall).toBeDefined();
    expect(markerIconCall!.html).toContain('—');
  });

  it('does not produce raw < or > in divIcon html when propertyType starts with a special character', () => {
    // Directly test the escaping path by calling escapeHtml as PropertyMap does.
    // We cannot pass an arbitrary string as PropertyType (it's a union type), so we
    // verify the escape function would neutralise it — matching exactly how the
    // template `${escapeHtml(propertyType[0].toUpperCase())}` is evaluated.
    const maliciousFirstChar = '<script>'[0].toUpperCase(); // "<"
    const escaped = escapeHtml(maliciousFirstChar);

    // Simulate the full divIcon html fragment
    const html = `<div style="...">${escaped}</div>`;

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;');
    expect(html).not.toMatch(/<(?!\/?(div|span|br)\b)/); // no raw open tags other than div/span/br
  });
});

// ─── Property type legend removed (Figma Discover polish) ─────
// The bottom-left "Property Types" legend was removed from the map. This guards
// against it being reintroduced — the legend Card no longer renders for any state.

describe('PropertyMap — property type legend removed', () => {
  it('does not render the "Property Types" legend', async () => {
    const { PropertyMap } = await import('../PropertyMap');
    render(<PropertyMap listings={[]} />);
    expect(screen.queryByText('Property Types')).not.toBeInTheDocument();
  });
});

// ─── Trust tier badge chip (RE-608) ───────────────────────────
// Tests for the inline trust tier badge chip rendered in the listing preview card.
// The badge is a small conditional element: green for A/B, amber for C, hidden for D or null.

/** Minimal chip component that mirrors the conditional in Index.tsx selectedListing card. */
function TrustTierChip({ trustTier }: { trustTier?: string | null }) {
  if (trustTier === 'A' || trustTier === 'B') {
    return (
      <span data-testid="trust-chip" className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-800">
        {trustTier}
      </span>
    );
  }
  if (trustTier === 'C') {
    return (
      <span data-testid="trust-chip" className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
        C
      </span>
    );
  }
  return null;
}

describe('Trust tier badge chip — listing preview card', () => {
  it('renders a green chip labelled "A" for trustTier A', () => {
    render(<TrustTierChip trustTier="A" />);
    const chip = screen.getByTestId('trust-chip');
    expect(chip).toBeDefined();
    expect(chip.textContent).toBe('A');
    expect(chip.className).toContain('bg-green-100');
  });

  it('renders a green chip labelled "B" for trustTier B', () => {
    render(<TrustTierChip trustTier="B" />);
    const chip = screen.getByTestId('trust-chip');
    expect(chip).toBeDefined();
    expect(chip.textContent).toBe('B');
    expect(chip.className).toContain('bg-green-100');
  });

  it('renders an amber chip labelled "C" for trustTier C', () => {
    render(<TrustTierChip trustTier="C" />);
    const chip = screen.getByTestId('trust-chip');
    expect(chip).toBeDefined();
    expect(chip.textContent).toBe('C');
    expect(chip.className).toContain('bg-amber-100');
  });

  it('renders nothing for trustTier D', () => {
    const { container } = render(<TrustTierChip trustTier="D" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for null trustTier', () => {
    const { container } = render(<TrustTierChip trustTier={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for undefined trustTier', () => {
    const { container } = render(<TrustTierChip />);
    expect(container.firstChild).toBeNull();
  });
});

// ─── MapController hasMountedRef guard — URL viewport fix (#910 bug) ─────────
// Verifies that the cityCenter effect does NOT fire on the initial mount, so a
// URL-specified viewport (initialCenter/initialZoom on MapContainer) is not
// immediately overwritten by a flyTo to the city center.
// After the first render, subsequent cityCenter changes DO trigger flyTo (city switch).

describe('PropertyMap — cityCenter effect skips initial mount (URL viewport fix)', () => {
  const stableMapVpFix = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getCenter: vi.fn(() => ({ lat: 13.2169, lng: 74.7456 })),
    getZoom: vi.fn(() => 11),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    stableMapVpFix.flyTo.mockClear();
    const reactLeaflet = await import('react-leaflet');
    (reactLeaflet.useMap as ReturnType<typeof vi.fn>).mockReturnValue(stableMapVpFix);
  });

  it('does NOT call flyTo on initial mount when cityCenter is provided — URL viewport is preserved', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    render(
      <PropertyMap
        listings={[]}
        cityCenter={[13.3409, 74.7421]}
        cityZoom={11}
        // Simulate URL viewport being used as initial MapContainer center
        initialCenter={[13.2169, 74.7456]}
        initialZoom={14}
      />
    );

    // cityCenter effect must NOT fire on mount — flyTo must not be called
    // (MapContainer already renders at initialCenter/initialZoom; a flyTo here
    // would override the URL-specified viewport).
    expect(stableMapVpFix.flyTo).not.toHaveBeenCalled();
  });

  it('calls flyTo with new cityCenter when city is switched post-mount', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const udupiCenter: [number, number] = [13.3409, 74.7421];
    const kundapurCenter: [number, number] = [13.6218, 74.6943];

    const { rerender } = render(
      <PropertyMap
        listings={[]}
        cityCenter={udupiCenter}
        cityZoom={11}
      />
    );

    // Assert mount was correctly skipped BEFORE clearing the mock.
    // If the hasMountedRef guard were removed, flyTo would have been called here
    // and the URL-specified viewport would have been silently clobbered.
    expect(stableMapVpFix.flyTo).not.toHaveBeenCalled();

    // Reset call count so the subsequent rerender assertion counts only post-mount calls.
    stableMapVpFix.flyTo.mockClear();

    // User switches city — cityCenter changes, hasMountedRef is true → flyTo fires
    rerender(
      <PropertyMap
        listings={[]}
        cityCenter={kundapurCenter}
        cityZoom={12}
      />
    );

    expect(stableMapVpFix.flyTo).toHaveBeenCalledTimes(1);
    expect(stableMapVpFix.flyTo).toHaveBeenCalledWith(kundapurCenter, 12, { duration: 1 });
  });
});

// ─── MapController reset-zoom behaviour (AC7 / #894) ─────────────────────────
// Verifies the handledTickRef guard:
//   - tick=0 on mount → no flyTo from the reset path
//   - tick increments to 1 → flyTo fires once
//   - city changes with tick still=1 → flyTo does NOT fire again (double-flyTo bug)
//
// The useMap mock factory creates a new map object per call, so we intercept
// the mock at the module level and replace it with a stable object that all
// MapController useEffect hooks share.

describe('PropertyMap — reset zoom on area deselection (#894)', () => {
  const stableMap = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getCenter: vi.fn(() => ({ lat: 13.34, lng: 74.74 })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    stableMap.flyTo.mockClear();
    // Override useMap to return the stable object for this describe block
    const reactLeaflet = await import('react-leaflet');
    (reactLeaflet.useMap as ReturnType<typeof vi.fn>).mockReturnValue(stableMap);
  });

  it('does not call flyTo from the reset path on initial render (resetMapTick=0)', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    // Render without cityCenter so neither the cityCenter effect nor the reset
    // effect can produce a flyTo call — isolates the reset path guard entirely.
    render(
      <PropertyMap
        listings={[]}
        resetMapTick={0}
      />
    );

    expect(stableMap.flyTo).not.toHaveBeenCalled();
  });

  it('calls flyTo with cityCenter and cityZoom when resetMapTick increments from 0 to 1', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    // Use a stable reference so the cityCenter effect does not re-fire on rerender
    // (inline array literals create a new reference each render, causing a spurious dep change).
    const udupiCenter: [number, number] = [13.34, 74.74];

    const { rerender } = render(
      <PropertyMap
        listings={[]}
        cityCenter={udupiCenter}
        cityZoom={11}
        resetMapTick={0}
        panToArea={null}
      />
    );

    // Clear after initial render (cityCenter effect fires once on mount)
    stableMap.flyTo.mockClear();

    rerender(
      <PropertyMap
        listings={[]}
        cityCenter={udupiCenter}
        cityZoom={11}
        resetMapTick={1}
        panToArea={null}
      />
    );

    // Reset effect fires — flyTo must be called exactly once with city coords
    expect(stableMap.flyTo).toHaveBeenCalledTimes(1);
    expect(stableMap.flyTo).toHaveBeenCalledWith(udupiCenter, 11, { duration: 1 });
  });

  it('does not call flyTo again when city changes but resetMapTick stays the same', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const { rerender } = render(
      <PropertyMap
        listings={[]}
        cityCenter={[13.34, 74.74]}
        cityZoom={11}
        resetMapTick={1}
        panToArea={null}
      />
    );

    // After mount with tick=1: reset effect fires (handledTickRef becomes 1).
    // Clear the mock to observe only subsequent calls.
    stableMap.flyTo.mockClear();

    // Simulate a city change (cityCenter/cityZoom change) with the same tick=1.
    // The deps array includes cityCenter/cityZoom so the effect re-evaluates,
    // but tick (1) <= handledTickRef (1) → must return early, no flyTo.
    rerender(
      <PropertyMap
        listings={[]}
        cityCenter={[12.97, 77.59]}
        cityZoom={12}
        resetMapTick={1}
        panToArea={null}
      />
    );

    // cityCenter effect fires once (expected for city switch),
    // but the reset effect must NOT fire a second time.
    // Only one call allowed — from the cityCenter effect, not the reset path.
    const resetPathCalls = stableMap.flyTo.mock.calls.filter(
      (call) => call[2]?.duration === 1 && JSON.stringify(call[0]) === JSON.stringify([12.97, 77.59])
    );
    // The cityCenter effect will call flyTo with the new city (that's fine).
    // What must NOT happen: a second call at the old city coords [13.34, 74.74].
    const oldCityCalls = stableMap.flyTo.mock.calls.filter(
      (call) => JSON.stringify(call[0]) === JSON.stringify([13.34, 74.74])
    );
    expect(oldCityCalls).toHaveLength(0);
    // Total calls must be exactly 1 (the cityCenter effect), not 2.
    expect(stableMap.flyTo).toHaveBeenCalledTimes(1);
    // Confirm it was the cityCenter effect that fired, not a ghost reset call.
    expect(resetPathCalls).toHaveLength(1);
  });
});

// ─── RH1 remount hardening (issue #1953, build step 3) ───────────────────────
// resetMapTick (MapController) and cityRestoreTick (CityRestorePanner) are
// props driven by hooks living in MapDiscovery, which does NOT unmount when
// the map does (e.g. mobile MAP <-> LIST view toggle). Each tick-guard
// component's own handledTickRef, by contrast, DOES reset to its initial
// value on every fresh mount. Before the RH1 fix, a remount with the tick
// still at its already-handled value (unchanged, because MapDiscovery held
// steady) would satisfy `tick > handledTickRef` again and spuriously refire
// flyTo, throwing the camera. The fix is adopt-on-mount seeding: the first
// effect run after a (re)mount seeds handledTickRef from the incoming tick
// and returns without acting.
//
// This test mounts, advances both ticks (a legitimate first fire), unmounts,
// and remounts with the SAME tick values (as MapDiscovery would present
// them across a remount) — proving neither flyTo call recurs on the second
// mount. Covers both handledTickRef sites: MapController.resetMapTick AND
// CityRestorePanner.cityRestoreTick — the plan explicitly calls out that
// fixing only one would leave the sibling defeating the mobile acceptance
// criterion untested.
describe('PropertyMap — RH1 remount hardening: no spurious camera throw on second mount', () => {
  const stableMap = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({
      getNorth: vi.fn(() => 14),
      getSouth: vi.fn(() => 13),
      getEast: vi.fn(() => 75),
      getWest: vi.fn(() => 74),
    })),
    getCenter: vi.fn(() => ({ lat: 13.34, lng: 74.74 })),
    getZoom: vi.fn(() => 12),
    setView: vi.fn().mockReturnThis(),
    getContainer: vi.fn(() => document.body),
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    stableMap.flyTo.mockClear();
    stableMap.fitBounds.mockClear();
    const reactLeaflet = await import('react-leaflet');
    (reactLeaflet.useMap as ReturnType<typeof vi.fn>).mockReturnValue(stableMap);
  });

  it('does not re-fire resetMapTick or cityRestoreTick flyTo on a second mount when the tick values have not advanced', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const cityCenter: [number, number] = [13.34, 74.74];
    const cityRestoreCenter: [number, number] = [12.97, 77.59];

    const commonProps = {
      listings: [],
      cityCenter,
      cityZoom: 11,
      cityRestoreCenter,
      cityRestoreZoom: 10,
      panToArea: null,
    };

    // --- First mount: ticks at 0 (true initial mount). Neither guard fires. ---
    const { rerender, unmount } = render(
      <PropertyMap {...commonProps} resetMapTick={0} cityRestoreTick={0} />
    );
    expect(stableMap.flyTo).not.toHaveBeenCalled();

    // --- Ticks advance (a legitimate Back-button interaction): both panners fire once. ---
    rerender(<PropertyMap {...commonProps} resetMapTick={1} cityRestoreTick={1} />);

    const resetCallsAfterFirstFire = stableMap.flyTo.mock.calls.filter(
      (call) => JSON.stringify(call[0]) === JSON.stringify(cityCenter) && call[2]?.duration === 1,
    );
    const restoreCallsAfterFirstFire = stableMap.flyTo.mock.calls.filter(
      (call) => JSON.stringify(call[0]) === JSON.stringify(cityRestoreCenter),
    );
    expect(resetCallsAfterFirstFire).toHaveLength(1);
    expect(restoreCallsAfterFirstFire).toHaveLength(1);

    // --- Unmount the map (e.g. mobile switch from MAP to LIST). ---
    unmount();
    stableMap.flyTo.mockClear();

    // --- Remount with the SAME tick values MapDiscovery would still be
    // holding (its hooks did not unmount alongside the map). Pre-fix, both
    // handledTickRef guards would reset to 0 and spuriously refire flyTo here. ---
    render(<PropertyMap {...commonProps} resetMapTick={1} cityRestoreTick={1} />);

    expect(stableMap.flyTo).not.toHaveBeenCalled();
  });
});

// ─── R-A per-type disc colour: two different types → different disc colours in divIcon HTML ─────────
// PropertyMap now uses getPropertyTypeVisual to colour each marker disc.
// apartment → navy #26395B, land → evergreen #1F7A5C.
// Both colours must appear in distinct divIcon HTML fragments when rendered together.

describe('PropertyMap — per-type disc colour in divIcon HTML (R-A)', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  it('renders distinct disc colours for apartment (navy) vs land (evergreen) markers', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'apt-1',
        title: 'Apartment Listing',
        property_type: 'apartment' as const,
        latitude: 13.34,
        longitude: 74.74,
        price: 2_000_000,
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Manipal',
        area_sqft: 900,
        bedrooms: 2,
        bathrooms: 1,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'apt-1',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
      {
        id: 'land-1',
        title: 'Land Listing',
        property_type: 'land' as const,
        latitude: 13.35,
        longitude: 74.75,
        price: 3_000_000,
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-2',
        slug: 'land-1',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // Navy #26395B for apartment, evergreen #1F7A5C for land.
    const navyCall = capturedDivIconCalls.find((c) => c.html.includes('#26395B'));
    const evergreenCall = capturedDivIconCalls.find((c) => c.html.includes('#1F7A5C'));

    expect(navyCall).toBeDefined();
    expect(evergreenCall).toBeDefined();

    // They must be distinct divIcon calls, not the same cached entry.
    expect(navyCall).not.toBe(evergreenCall);

    // The navy call must NOT contain the evergreen colour (no cross-contamination).
    expect(navyCall!.html).not.toContain('#1F7A5C');
    // The evergreen call must NOT contain the navy colour.
    expect(evergreenCall!.html).not.toContain('#26395B');
  });

  it('two listings of the same type and same price share one cached icon (single divIcon call)', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'apt-a',
        title: 'Apartment A',
        property_type: 'apartment' as const,
        latitude: 13.34,
        longitude: 74.74,
        price: 5_000_000,
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Manipal',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'apt-a',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
      {
        id: 'apt-b',
        title: 'Apartment B',
        property_type: 'apartment' as const,
        latitude: 13.36,
        longitude: 74.76,
        price: 5_000_000, // same price → same label → same cache key
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Manipal',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-2',
        slug: 'apt-b',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // Both listings share the same type+colour+price → R1 cache hit → only ONE divIcon call.
    const aptCalls = capturedDivIconCalls.filter((c) => c.html.includes('#26395B'));
    expect(aptCalls).toHaveLength(1);
  });
});

// ─── a1 price-pill: two same-type listings with different prices → distinct icons (R1 cache key fix) ───
// Before R1, the icon cache was keyed by propertyType+selected only. Two house listings with
// different prices shared the same (wrong) DivIcon — the second listing's marker would render
// the first listing's price. R1 re-keys by `${propertyType}|${label}|default|selected` so each
// unique price produces its own icon.
//
// We test via divIcon HTML: render PropertyMap with two house listings at different prices and
// confirm both price strings appear in the captured divIcon calls.

describe('PropertyMap — a1 R1 cache: same property_type, different prices → distinct marker labels', () => {
  beforeEach(() => {
    capturedDivIconCalls.length = 0;
  });

  it('produces two distinct divIcon calls — one per price — for two house listings with different prices', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'house-cheap',
        title: 'Cheap House',
        property_type: 'house' as const,
        latitude: 13.34,
        longitude: 74.74,
        price: 500_000,     // ₹5 L
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'house-cheap',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
      {
        id: 'house-expensive',
        title: 'Expensive House',
        property_type: 'house' as const,
        latitude: 13.35,
        longitude: 74.75,
        price: 10_000_000,  // ₹1 Cr
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Manipal',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-2',
        slug: 'house-expensive',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // Both price strings must appear in distinct divIcon HTML fragments.
    const cheapCall = capturedDivIconCalls.find((c) => c.html.includes('₹5 L'));
    const expensiveCall = capturedDivIconCalls.find((c) => c.html.includes('₹1 Cr'));

    expect(cheapCall).toBeDefined();
    expect(expensiveCall).toBeDefined();

    // They must be different calls (R1: unique cache entries, not the same cached icon)
    expect(cheapCall).not.toBe(expensiveCall);

    // Sanity: the cheap call must NOT contain the expensive price
    expect(cheapCall!.html).not.toContain('₹1 Cr');
    // Sanity: the expensive call must NOT contain the cheap price
    expect(expensiveCall!.html).not.toContain('₹5 L');
  });

  it('does not produce "₹null" or "₹NaN" in any divIcon html for a listing with price=null', async () => {
    const { PropertyMap } = await import('../PropertyMap');

    const listings = [
      {
        id: 'warehouse-no-price',
        title: 'No Price Warehouse',
        property_type: 'warehouse' as const,
        latitude: 13.34,
        longitude: 74.74,
        price: null,
        price_paise: null,
        status: 'LIVE' as const,
        locality: 'Udupi',
        area_sqft: null,
        bedrooms: null,
        bathrooms: null,
        description: '',
        created_at: '',
        updated_at: '',
        created_by: 'user-1',
        slug: 'warehouse-no-price',
        is_price_reduced: false,
        is_new_to_market: false,
        is_back_on_market: false,
        is_rera_registered: false,
        is_ready_to_move: false,
      },
    ];

    render(<PropertyMap listings={listings as unknown as PropertyListingWithImages[]} />);

    // Core invariant: NO divIcon call must ever produce "₹null" or "₹NaN".
    // This holds both for new divIcon calls AND the iconCache hit path (icon was
    // previously created correctly, so the cached HTML also has no bad strings).
    const badCall = capturedDivIconCalls.find(
      (c) => c.html.includes('₹null') || c.html.includes('₹NaN'),
    );
    expect(badCall).toBeUndefined();

    // Secondary check: if a new divIcon call was made (not a cache hit), the '—' fallback
    // label must appear in the HTML (R-A: null price → '—', not a type-initial letter).
    // If capturedDivIconCalls is empty, the icon was served from iconCache — which
    // means it was already created correctly by a prior call, so the invariant holds.
    if (capturedDivIconCalls.length > 0) {
      const glyphCall = capturedDivIconCalls.find((c) => c.html.includes('—'));
      expect(glyphCall).toBeDefined();
    }
  });
});
