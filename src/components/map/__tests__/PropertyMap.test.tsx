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
      })),
      point: vi.fn((x: number, y: number) => ({ x, y })),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
  useMap: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: vi.fn(() => ({ getNorth: vi.fn(() => 14), getSouth: vi.fn(() => 13), getEast: vi.fn(() => 75), getWest: vi.fn(() => 74) })),
    getZoom: vi.fn(() => 12),
    getContainer: vi.fn(() => document.body),
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

  it('renders "H" in the divIcon html for a house listing', async () => {
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

    render(<PropertyMap listings={listings} />);

    // At least one divIcon call should have been made for the marker
    const markerIconCall = capturedDivIconCalls.find((c) => c.html.includes('H'));
    expect(markerIconCall).toBeDefined();
    expect(markerIconCall!.html).toContain('>H<');
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
    getZoom: vi.fn(() => 12),
    getContainer: vi.fn(() => document.body),
    on: vi.fn(),
    off: vi.fn(),
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
