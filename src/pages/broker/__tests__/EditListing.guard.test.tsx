/**
 * EditListing route guard tests (Issue #1632)
 * Verifies access for user, broker, dealer, admin and redirect for unauthorized roles.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditListing from '../EditListing';

const mockRole = vi.hoisted(() => ({ current: 'broker' as string | null }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: mockRole.current,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useBrokerListings', () => ({
  useGetListing: () => ({
    data: { id: '123', status: 'DRAFT', propertyType: 'land' },
    isLoading: false,
    isError: false,
  }),
  useUpdateListing: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({ images: [], uploads: {} }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('@/components/broker/StepIndicator', () => ({
  StepIndicator: () => null,
}));

function renderEditListing() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/broker/listings/123/edit']}>
        <Routes>
          <Route path="/broker/listings/:id/edit" element={<EditListing />} />
          <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EditListing role guards (Issue #1632)', () => {
  it('allows modern broker role to access EditListing', () => {
    mockRole.current = 'broker';
    renderEditListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows standard user role to access EditListing', () => {
    mockRole.current = 'user';
    renderEditListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows legacy dealer role to access EditListing', () => {
    mockRole.current = 'dealer';
    renderEditListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('allows admin role to access EditListing', () => {
    mockRole.current = 'admin';
    renderEditListing();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  it('redirects unauthorized roles (e.g. guest or unknown) to /', () => {
    mockRole.current = 'guest';
    renderEditListing();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('app-layout')).not.toBeInTheDocument();
  });
});
