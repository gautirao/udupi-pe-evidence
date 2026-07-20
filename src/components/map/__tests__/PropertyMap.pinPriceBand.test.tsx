/**
 * Issue #1942 — pin price-band fallback.
 *
 * Bug: anonymous individual (non-clustered) listing pins rendered a bare '—'
 * because the pin-icon builders read only `listing.price` (null for anon) and
 * never `listing.priceBand` (already present on PropertyListing, shipped by
 * #1941). This suite covers deriveMarkerLabel's precedence (exact price > band
 * > residual '—'), the aria-label contract for each state (residual = "Price
 * unavailable" — under #1941's contract an anon response always carries a
 * priceBand when a price exists, so the residual branch means no price data
 * exists at all), XSS-safe escaping of a backend-supplied band string, and
 * selected/default marker parity.
 */

// ─── Mocks (must precede imports) ────────────────────────────────────────────

// vi.hoisted: vi.mock factories are hoisted above top-level const declarations,
// so capturedDivIconCalls must be created via vi.hoisted to be visible inside them.
const { capturedDivIconCalls } = vi.hoisted(() => ({
  capturedDivIconCalls: [] as Array<{ html: string }>,
}));

vi.mock('leaflet', () => {
  return {
    default: {
      Icon: {
        Default: {
          prototype: {},
          mergeOptions: vi.fn(),
        },
      },
      divIcon: vi.fn((opts: { html: string; className?: string }) => {
        capturedDivIconCalls.push({ html: opts.html ?? '' });
        return { options: opts };
      }),
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

// ─── Imports after mocks ──────────────────────────────────────────────────────
import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  deriveMarkerLabel,
  createMarkerIcon,
  createSelectedMarkerIcon,
} from '../PropertyMap';

/** Returns the html string from the most recently captured L.divIcon(...) call. */
function lastCapturedHtml(): string {
  return capturedDivIconCalls[capturedDivIconCalls.length - 1]?.html ?? '';
}

describe('PropertyMap — deriveMarkerLabel (#1942 price-band precedence)', () => {
  it('price=null, priceBand=null → residual "—"', () => {
    const result = deriveMarkerLabel('house', null, null);
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('price=null, priceBand=undefined → residual "—" (same as null)', () => {
    const result = deriveMarkerLabel('house', null, undefined);
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('price=null, priceBand="" → residual "—" (empty string trims to nothing)', () => {
    const result = deriveMarkerLabel('house', null, '');
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('price=null, priceBand="   " → residual "—" (whitespace-only trims to nothing)', () => {
    const result = deriveMarkerLabel('house', null, '   ');
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('price=null, priceBand="₹1–2Cr" → band label wins', () => {
    const result = deriveMarkerLabel('house', null, '₹1–2Cr');
    expect(result).toEqual({ label: '₹1–2Cr', isPricePill: true, isBand: true });
  });

  it('price=0, priceBand="₹1–2Cr" → band wins (0 is not treated as an exact price)', () => {
    const result = deriveMarkerLabel('house', 0, '₹1–2Cr');
    expect(result).toEqual({ label: '₹1–2Cr', isPricePill: true, isBand: true });
  });

  it('price=0, priceBand=null → residual "—" (0 with no band)', () => {
    const result = deriveMarkerLabel('house', 0, null);
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('price=15000000, priceBand="₹1–2Cr" → exact price wins, band ignored', () => {
    const result = deriveMarkerLabel('house', 15000000, '₹1–2Cr');
    expect(result).toEqual({ label: '₹1.50 Cr', isPricePill: true, isBand: false });
  });

  it('price=15000000, priceBand=null → authed exact-price path unchanged', () => {
    const result = deriveMarkerLabel('house', 15000000, null);
    expect(result).toEqual({ label: '₹1.50 Cr', isPricePill: true, isBand: false });
  });

  it('agri (agricultural_land), price=null, priceBand=null → residual "—" unchanged', () => {
    const result = deriveMarkerLabel('agricultural_land', null, null);
    expect(result).toEqual({ label: '—', isPricePill: false, isBand: false });
  });

  it('band-band precedence is trimmed before use as the label', () => {
    const result = deriveMarkerLabel('house', null, '  ₹1–2Cr  ');
    expect(result.label).toBe('₹1–2Cr');
    expect(result.isBand).toBe(true);
  });
});

describe('PropertyMap — createMarkerIcon / createSelectedMarkerIcon (#1942)', () => {
  // Every test below uses a distinct propertyType (and/or distinct price/band)
  // so each createMarkerIcon/createSelectedMarkerIcon call is guaranteed a
  // fresh, uncached L.divIcon(...) invocation — lastCapturedHtml() always
  // reflects the call this assertion cares about.

  it('residual state ("—"): aria-label is "Price unavailable" (default marker)', () => {
    createMarkerIcon('house', null, null);
    const html = lastCapturedHtml();
    expect(html).toContain('>—<');
    expect(html).toContain('aria-label="Price unavailable"');
  });

  it('residual state ("—"): aria-label is "Price unavailable" (selected marker)', () => {
    createSelectedMarkerIcon('condo', null, null);
    const html = lastCapturedHtml();
    expect(html).toContain('>—<');
    expect(html).toContain('aria-label="Price unavailable"');
  });

  it('agri residual state: same "Price unavailable" aria-label (FIRM decision)', () => {
    createMarkerIcon('agricultural_land', null, null);
    const html = lastCapturedHtml();
    expect(html).toContain('>—<');
    expect(html).toContain('aria-label="Price unavailable"');
  });

  it('band state: renders the escaped band label with an approximate-price aria-label', () => {
    createMarkerIcon('apartment', null, '₹1–2Cr');
    const html = lastCapturedHtml();
    expect(html).toContain('>₹1–2Cr<');
    expect(html).toContain('aria-label="Approximate price ₹1–2Cr"');
  });

  it('exact price wins over band and band is ignored entirely', () => {
    createMarkerIcon('villa', 15000000, '₹1–2Cr');
    const html = lastCapturedHtml();
    expect(html).toContain('>₹1.50 Cr<');
    expect(html).not.toContain('₹1–2Cr');
    // Exact price: no aria-label attribute is required (visible text is the accessible name).
    expect(html).not.toContain('aria-label="Approximate price');
    expect(html).not.toContain('aria-label="Price unavailable"');
  });

  it('R6 — XSS: a malicious priceBand is escaped, never rendered as raw markup', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    createMarkerIcon('plot', null, malicious);
    const html = lastCapturedHtml();
    // No raw, unescaped tag markup — the < and > that would form a real <img>
    // element are entity-escaped, so no element is ever created from this string.
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('R6 — XSS: malicious priceBand is also escaped in the aria-label', () => {
    const malicious = '"><script>alert(1)</script>';
    createMarkerIcon('other', null, malicious);
    const html = lastCapturedHtml();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toMatch(/aria-label="[^"]*"><script>/);
  });

  it('R6 — XSS: malicious priceBand is escaped on the SELECTED marker too', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    createSelectedMarkerIcon('layout', null, malicious);
    const html = lastCapturedHtml();
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('R5 — selected-marker parity: default and selected icons both carry the same escaped band', () => {
    createMarkerIcon('office', null, '₹80L–1Cr');
    const defaultHtml = lastCapturedHtml();
    createSelectedMarkerIcon('office', null, '₹80L–1Cr');
    const selectedHtml = lastCapturedHtml();

    expect(defaultHtml).toContain('>₹80L–1Cr<');
    expect(selectedHtml).toContain('>₹80L–1Cr<');
    expect(defaultHtml).toContain('aria-label="Approximate price ₹80L–1Cr"');
    expect(selectedHtml).toContain('aria-label="Approximate price ₹80L–1Cr"');
  });

  it('iconCache: two listings of the same type with distinct bands produce distinct icons (no stale merge)', () => {
    const iconA = createMarkerIcon('warehouse', null, '₹1–2Cr');
    const htmlA = lastCapturedHtml();
    const iconB = createMarkerIcon('warehouse', null, '₹3–4Cr');
    const htmlB = lastCapturedHtml();

    expect(iconA).not.toBe(iconB);
    expect(htmlA).toContain('>₹1–2Cr<');
    expect(htmlA).not.toContain('₹3–4Cr');
    expect(htmlB).toContain('>₹3–4Cr<');
    expect(htmlB).not.toContain('₹1–2Cr');
  });

  it('iconCache: same type + same band returns the cached (identical) icon instance', () => {
    const iconA = createMarkerIcon('studio', null, '₹50–60L');
    const iconB = createMarkerIcon('studio', null, '₹50–60L');
    expect(iconA).toBe(iconB);
  });
});
