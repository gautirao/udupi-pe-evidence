/**
 * Issue #2166 — PublicHeader's top-nav links must stay scoped to the
 * previewed city inside an admin city-launch preview (no `city=` URL param
 * there), instead of leaking RoleAwareHeader's DEFAULT_CITY fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicHeader } from '../PublicHeader';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

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
          <PublicHeader />
        </DiscoverDataSourceProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('PublicHeader — preview city identity (Issue #2166)', () => {
  it('scopes nav links to the previewed city, not DEFAULT_CITY, on a preview route with no city= param', async () => {
    mockApiGet.mockResolvedValue([
      { cityId: 3, citySlug: 'udupi', cityName: 'Udupi' },
    ]);
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => {
      const discoverLink = screen.getByRole('link', { name: /^discover$/i });
      expect(discoverLink.getAttribute('href')).toContain('city=udupi');
    });
    expect(screen.getByRole('link', { name: /^discover$/i }).getAttribute('href')).not.toContain(
      'city=bangalore',
    );
  });

  it('falls back to DEFAULT_CITY on a live route with no city= param (unchanged behaviour)', () => {
    mockApiGet.mockResolvedValue([]);
    renderHeader({ mode: 'live' });

    const discoverLink = screen.getByRole('link', { name: /^discover$/i });
    expect(discoverLink.getAttribute('href')).toContain('city=bangalore');
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('never renders a Bangalore-scoped nav link while the preview city lookup is pending (fail closed)', () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    expect(screen.queryByRole('link', { name: /^discover$/i })).not.toBeInTheDocument();
  });

  it('never renders a Bangalore-scoped nav link when the preview city lookup fails (fail closed)', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /^discover$/i })).not.toBeInTheDocument();
  });

  it('never renders a Bangalore-scoped nav link when the previewed cityId has no match in the list (fail closed)', async () => {
    mockApiGet.mockResolvedValue([{ cityId: 1, citySlug: 'bangalore', cityName: 'Bangalore' }]);
    renderHeader({ mode: 'preview', cityId: 3, revisionId: 1 });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /^discover$/i })).not.toBeInTheDocument();
  });
});
