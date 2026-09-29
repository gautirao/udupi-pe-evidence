/**
 * Issue #2166 — PublicHeader's top-nav links must stay scoped to the
 * previewed city inside an admin city-launch preview (no `city=` URL param
 * there), instead of leaking RoleAwareHeader's DEFAULT_CITY fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicHeader } from '../PublicHeader';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';

vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAdmin: true,
    isBroker: false,
  }),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

function renderHeader(source: { mode: 'live' } | { mode: 'preview'; cityId: number; revisionId: number }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/city-launch/3/preview/1']}>
        <DiscoverDataSourceProvider value={source}>
          {/* Matches production: CityLaunchPreview wraps MapDiscovery (and PublicHeader) in this same DiscoverProvider. */}
          <DiscoverProvider>
            <PublicHeader />
          </DiscoverProvider>
        </DiscoverDataSourceProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let matchMediaMock: { restore: () => void };
beforeEach(() => {
  mockApiGet.mockReset();
  // These tests assert the collapsed desktop header's own behaviour, which only builds once the viewport is wide enough to host it.
  matchMediaMock = mockMatchMediaWidth(1366);
});
afterEach(() => {
  matchMediaMock.restore();
});

describe('PublicHeader — preview city identity (Issue #2166)', () => {
  // This anon render has `showListProperty` true, so `zone3FoldsTrends` folds Trends into the "Menu" trigger rather than a standalone link.
  it('scopes the header journey tabs to the previewed city, not DEFAULT_CITY, on a preview route with no city= param', async () => {
    mockApiGet.mockResolvedValue([
      { cityId: 3, citySlug: 'udupi', cityName: 'Udupi' },
    ]);
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => {
      const areaTab = screen.getByRole('link', { name: /explore by area/i });
      expect(areaTab.getAttribute('href')).toContain('city=udupi');
    });
    expect(screen.getByRole('link', { name: /explore by area/i }).getAttribute('href')).not.toContain(
      'city=bangalore',
    );
    expect(screen.getByTestId('role-actions-overflow-trigger')).toHaveTextContent('Menu');
  });

  it('falls back to DEFAULT_CITY on a live route with no city= param (unchanged behaviour)', () => {
    mockApiGet.mockResolvedValue([]);
    renderHeader({ mode: 'live' });

    const areaTab = screen.getByRole('link', { name: /explore by area/i });
    expect(areaTab.getAttribute('href')).toContain('city=bangalore');
    // DiscoverControlBar also calls the same mocked `api.get` for its own autocomplete, so assert the SPECIFIC preview-lookup call is absent, not that `api.get` was never called.
    expect(mockApiGet).not.toHaveBeenCalledWith(
      expect.stringContaining('city-launch'),
      expect.anything(),
    );
  });

  it('never renders a Bangalore-scoped header journey tab while the preview city lookup is pending (fail closed)', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    expect(screen.queryByRole('link', { name: /explore by area/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
  });

  it('still shows the control bar at desktop width while the preview city is unresolved (regression: it must never drop to zero controls)', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    expect(screen.getByTestId('discover-control-bar')).toBeInTheDocument();
  });

  it('never renders a Bangalore-scoped header journey tab when the preview city lookup fails (fail closed)', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /explore by area/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
  });

  it('never renders a Bangalore-scoped header journey tab when the previewed cityId has no match in the list (fail closed)', async () => {
    mockApiGet.mockResolvedValue([{ cityId: 1, citySlug: 'bangalore', cityName: 'Bangalore' }]);
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /explore by area/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
  });
});
