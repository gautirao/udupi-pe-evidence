/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-city-switch, assertion city-switch-5.
 *
 * city-switch-5 is "?city=kundapur -> the city control shows Kundapur" (the composed URL -> label hop for a
 * NON-default city). The sibling coverage drives only Udupi (a mocked nav) and a Udupi -> Mangalore switch.
 * Kundapur IS a selectable city at this base (CITY_CONFIG.kundapur, apps/web/src/lib/localityUtils.ts:13, which
 * DiscoverControlBar.tsx:51 derives CONTROL_BAR_CITIES from), so the claim is live.
 *
 * Harness copied from the composed it in DiscoverControlBar.test.tsx (REAL DiscoverProvider -> real
 * useDiscoverUrlState over a MemoryRouter -> real DiscoverControlBar), except that NOTHING in the discover
 * context is mocked here (the sibling file's context mock delegates to the real hooks only for its composed it).
 * Only the area list, the area-navigation-path resolver and the toast are stubbed (none touches the city label).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';

vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return { ...actual, useDiscoverAreas: vi.fn(() => ({ data: { city: 'kundapur', areas: [] } })) };
});
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { DiscoverControlBar } from '../DiscoverControlBar';

function renderControlAt(url: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <DiscoverProvider>
          <DiscoverControlBar />
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('#2859 B7 city-switch-5 — ?city=kundapur reaches the city control through the REAL DiscoverProvider', () => {
  it('?city=kundapur labels the control Kundapur (not Udupi, not the raw slug); a ?city=udupi remount labels it Udupi (not Kundapur)', () => {
    const kundapur = renderControlAt('/discover?city=kundapur');
    const kundapurLabel = screen.getByTestId('control-bar-city-select');
    expect(kundapurLabel).toHaveTextContent('Kundapur');
    expect(kundapurLabel).not.toHaveTextContent('Udupi');
    // the label is the CITY_CONFIG label ("Kundapur"), not the raw URL slug fallback ("kundapur", DiscoverControlBar.tsx:178)
    expect(kundapurLabel.textContent ?? '').not.toContain('kundapur');
    expect(screen.getByRole('button', { name: /kundapur/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /udupi/i })).not.toBeInTheDocument();
    kundapur.unmount();

    // Same-it positive control: the identical tree at ?city=udupi shows Udupi, so the Kundapur arm above is
    // discriminating (a control that ignored the URL city would show the same label for both arms).
    renderControlAt('/discover?city=udupi');
    const udupiLabel = screen.getByTestId('control-bar-city-select');
    expect(udupiLabel).toHaveTextContent('Udupi');
    expect(udupiLabel).not.toHaveTextContent('Kundapur');
    expect(screen.getByRole('button', { name: /udupi/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kundapur/i })).not.toBeInTheDocument();
  });
});
