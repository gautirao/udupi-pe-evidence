/**
 * NewListing route guard tests (Issue #1632)
 * Verifies access for user, broker, dealer, admin and redirect for unauthorized roles.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NewListing from '../NewListing';

const mockRole = vi.hoisted(() => ({ current: 'broker' as string | null }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: mockRole.current,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useBrokerListings', () => ({
  useCreateListing: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

function renderNewListing() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/broker/listings/new']}>
        <Routes>
          <Route path="/broker/listings/new" element={<NewListing />} />
          <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('NewListing role guards (Issue #1632)', () => {
  it('allows modern broker role to access NewListing', () => {
    mockRole.current = 'broker';
    renderNewListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows standard user role to access NewListing', () => {
    mockRole.current = 'user';
    renderNewListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows legacy dealer role to access NewListing', () => {
    mockRole.current = 'dealer';
    renderNewListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows admin role to access NewListing', () => {
    mockRole.current = 'admin';
    renderNewListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('redirects unauthorized roles (e.g. guest or unknown) to /', () => {
    mockRole.current = 'guest';
    renderNewListing();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).not.toBeInTheDocument();
  });
});
