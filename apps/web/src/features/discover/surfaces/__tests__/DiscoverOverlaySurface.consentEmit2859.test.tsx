/**
 * #2859 B6 (handoff 285906) AC7 — e2e/discover-telemetry-consent-1576.spec.ts row 6 (csv93, SEC):
 * the banner Accept / privacy-toggle Off drive the REAL same-session emit gate in ONE mounted tree.
 *
 * Real: DiscoverOverlaySurface -> DiscoverConsentBanner + DiscoverPrivacyToggle, the real
 * lib/discoverTelemetryConsent on jsdom localStorage / sessionStorage (NOT mocked), and a probe that
 * calls the real useDiscoverTelemetry emitter, whose real sendEvent POSTs through global fetch.
 * Stubbed: global fetch (the boundary; POSTs to /api/discover/events are counted from the captured
 * URL + method) and the Supabase client module (only so lib/api's import is inert; the emitter does
 * not use it). The probe is a sibling of the surface and does NOT re-render on Accept / Off, so the
 * consent must be read at emit time, not captured at render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

import { DiscoverOverlaySurface } from '../DiscoverOverlaySurface';
import type { DiscoverOverlaySurfaceView, DiscoverOverlaySurfaceCommands } from '../buildOverlaySurfaceModel';
import { useDiscoverTelemetry } from '@/hooks/useDiscoverTelemetry';

const CONSENT_KEY = 'discover_telemetry_consent';
const EVENTS_PATH = '/api/discover/events';

const view: DiscoverOverlaySurfaceView = {
  nearSchool: { visible: false, open: false, selectedSchool: null, filters: {}, boardFilter: [], city: null },
};
const commands = (): DiscoverOverlaySurfaceCommands => ({
  setNearSchoolOpen: vi.fn(),
  onSchoolSelect: vi.fn(),
  onFiltersChange: vi.fn(),
  onBoardFilterChange: vi.fn(),
});

function EmitProbe() {
  const { emitFilterApply } = useDiscoverTelemetry();
  return (
    <button type="button" data-testid="probe-emit" onClick={() => emitFilterApply({ property_type: 'agricultural_land' })}>
      emit
    </button>
  );
}

function Tree() {
  return (
    <>
      <EmitProbe />
      <DiscoverOverlaySurface view={view} commands={commands()} />
    </>
  );
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
const eventPosts = () =>
  fetchSpy.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://x');
    return url.pathname === EVENTS_PATH && (init as RequestInit | undefined)?.method === 'POST';
  });

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

describe('#2859 B6 AC7 DiscoverOverlaySurface consent UI -> real same-session emit gate (fetch-stubbed)', () => {
  it('1576-6.accept (L93): undecided -> emit sends 0 POSTs; banner Accept -> the next emit sends exactly 1 POST to /api/discover/events', async () => {
    const user = userEvent.setup();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    render(<Tree />);
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();

    await user.click(screen.getByTestId('probe-emit'));
    expect(eventPosts()).toHaveLength(0);
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    await user.click(screen.getByRole('button', { name: /accept anonymous usage data collection/i }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
    // The banner itself sends nothing (1576-2); the stub is live — the emit below is captured.
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    await user.click(screen.getByTestId('probe-emit'));
    expect(eventPosts()).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((eventPosts()[0][1] as RequestInit).body)) as { events: { event_type: string }[] };
    expect(body.events.map((e) => e.event_type)).toEqual(['FILTER_APPLY']);
  });

  it('1576-6.off (L93): granted at mount -> emit sends 1 POST; toggle Off -> label "Off" and key removed -> the next emit sends no new POST', async () => {
    const user = userEvent.setup();
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<Tree />);
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-privacy-toggle')).toHaveTextContent('On');

    await user.click(screen.getByTestId('probe-emit'));
    expect(eventPosts()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /turn off anonymous usage data collection/i }));
    expect(screen.getByTestId('discover-privacy-toggle')).toHaveTextContent('Off');
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();

    await user.click(screen.getByTestId('probe-emit'));
    expect(eventPosts()).toHaveLength(1);
  });

  it('1576-4 (L93): a granted visit mounts the toggle ("On") and NO banner; control in the same it: an undecided visit of the same surface mounts the banner (only the stored consent varies)', () => {
    const undecided = render(<Tree />);
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();
    expect(screen.getByTestId('discover-privacy-toggle')).toHaveTextContent('Off');
    undecided.unmount();

    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<Tree />);
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-privacy-toggle')).toHaveTextContent('On');
  });
});
