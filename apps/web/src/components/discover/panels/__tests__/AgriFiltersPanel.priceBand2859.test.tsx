/**
 * #2859 B6 (handoff 285906) — e2e/discover-telemetry-consent-1531.spec.ts row 8 (csv92, SEC),
 * R_control_existing replacement: "anon gets NO price_band" with the authed coarse band in the SAME it
 * (AgriFiltersPanel.test.tsx 1531-N3 / 1531-N4 split them over two its). REAL AgriFiltersPanel, REAL
 * useDiscoverTelemetry, REAL consent util on jsdom storage; global fetch is the stubbed boundary.
 * Only isAuthenticated varies between the arms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { AgriFiltersPanel } from '../AgriFiltersPanel';

const CONSENT_KEY = 'discover_telemetry_consent';
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 202 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
  localStorage.clear();
  sessionStorage.clear();
});

function events(): Array<{ raw: string; event: Record<string, unknown> }> {
  return fetchSpy.mock.calls
    .filter(([input]) => new URL(String(input), 'http://x').pathname === '/api/discover/events')
    .map(([, init]) => {
      const raw = String((init as RequestInit).body);
      return { raw, event: (JSON.parse(raw) as { events: Array<Record<string, unknown>> }).events[0] };
    });
}

describe('#2859 B6 AgriFiltersPanel FILTER_APPLY price_band by viewer, same it', () => {
  it('1531-8 (L92): with consent granted the anon Apply POSTs a FILTER_APPLY with NO price_band key and no raw price; the authed Apply in the same it POSTs price_band "5L_20L" and no raw price', async () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const user = userEvent.setup();

    const anon = render(<AgriFiltersPanel isAuthenticated={false} onApply={vi.fn()} onClear={vi.fn()} priceMinRupees={1_500_000} />);
    await user.click(screen.getByTestId('agri-filters-apply'));
    expect(events()).toHaveLength(1);
    expect(events()[0].event.event_type).toBe('FILTER_APPLY');
    expect('price_band' in events()[0].event).toBe(false);
    expect(events()[0].raw).not.toContain('1500000');
    anon.unmount();

    render(<AgriFiltersPanel isAuthenticated onApply={vi.fn()} onClear={vi.fn()} priceMinRupees={1_500_000} />);
    await user.click(screen.getByTestId('agri-filters-apply'));
    expect(events()).toHaveLength(2);
    expect(events()[1].event.price_band).toBe('5L_20L');
    expect(events()[1].raw).not.toContain('1500000');
  });
});
