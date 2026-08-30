/**
 * Issue #2088 QA-FIX (step 3, approved CTA fix) — regression coverage for
 * "Explore on Map" surviving the default-journey flip.
 *
 * Before this fix, `handleExplore` hand-navigated to
 * `/discover?city=&areaKey=` with no `journey` param. Since a bare
 * `/discover` now defaults to `journey=area-first` (Issue #2088 item 3,
 * area.ts), DiscoverRightPanelContainer's documented A1-MINIMAL behaviour
 * silently ignores a stale `areaKey=` on an area-first URL — it mounts at
 * the city root instead, dropping the user's chosen area. This suite pins
 * that the panel now resolves the area through the SAME canonical
 * navigation-path seam DiscoverControlBar's area search uses
 * (`useDiscoverAreaNavigationPathResolver`) before navigating, landing on
 * `journey=area-first&node=<resolved>` instead — the shape the canonical
 * panel actually reads.
 *
 * Mocking convention mirrors DiscoverControlBar.test.tsx's `mockResolveMutate`
 * spy over the SAME `useDiscoverAreaNavigationPathResolver` module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HomepageFilterPanel } from './HomepageFilterPanel';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockResolveMutate = vi.hoisted(() => vi.fn());
vi.mock('@/features/discover/navigation/useDiscoverAreaNavigationPath', () => ({
  useDiscoverAreaNavigationPathResolver: () => ({
    mutate: mockResolveMutate,
  }),
}));

vi.mock('@/hooks/useTrendingAreas', () => ({
  useTrendingAreas: () => ({
    areas: [{ areaKey: 'IN|KA|Bengaluru|Koramangala', areaLabel: 'Koramangala' }],
    isLoading: false,
  }),
}));

function renderPanel(areaKey: string) {
  return render(
    <MemoryRouter>
      <HomepageFilterPanel
        city="bangalore"
        areaKey={areaKey}
        onCityChange={vi.fn()}
        onAreaKeyChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('HomepageFilterPanel — Issue #2088 QA-FIX: "Explore on Map" area survival', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockResolveMutate.mockReset();
  });

  it('a selected area resolves through the navigation-path seam and navigates with journey=area-first&node=, never the legacy areaKey=', async () => {
    const user = userEvent.setup();
    renderPanel('IN|KA|Bengaluru|Koramangala');

    await user.click(screen.getByRole('button', { name: /explore on map/i }));

    expect(mockResolveMutate).toHaveBeenCalledTimes(1);
    const [params, callbacks] = mockResolveMutate.mock.calls[0];
    expect(params).toEqual({ city: 'bangalore', areaKey: 'IN|KA|Bengaluru|Koramangala' });

    callbacks.onSuccess({ nodeKey: 'a:IN|KA|Bengaluru|Koramangala' });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const destination = mockNavigate.mock.calls[0][0] as string;
    const destParams = new URLSearchParams(destination.split('?')[1]);
    expect(destParams.get('journey')).toBe('area-first');
    expect(destParams.get('node')).toBe('a:IN|KA|Bengaluru|Koramangala');
    expect(destParams.get('areaKey')).toBeNull();
  });

  it('on resolution failure, degrades to the city view rather than writing a legacy areaKey= that the area-first default would silently ignore', async () => {
    const user = userEvent.setup();
    renderPanel('IN|KA|Bengaluru|Koramangala');

    await user.click(screen.getByRole('button', { name: /explore on map/i }));
    const [, callbacks] = mockResolveMutate.mock.calls[0];
    callbacks.onError(new Error('404'));

    expect(mockNavigate).toHaveBeenCalledWith('/discover?city=bangalore');
  });

  it('no area selected (sentinel) — navigates straight to the city view without touching the resolver', async () => {
    const user = userEvent.setup();
    renderPanel('__any_area__');

    await user.click(screen.getByRole('button', { name: /explore on map/i }));

    expect(mockResolveMutate).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/discover?city=bangalore');
  });
});
