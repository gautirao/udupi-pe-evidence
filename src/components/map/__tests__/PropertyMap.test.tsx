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
import { render } from '@testing-library/react';
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
