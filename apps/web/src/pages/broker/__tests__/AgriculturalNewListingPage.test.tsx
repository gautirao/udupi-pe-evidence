/**
 * AgriculturalNewListingPage — deep-link route tests.
 *
 * Mirrors {Residential,Commercial}NewListingPage.test.tsx. Agricultural seeds no
 * fields from prefill (fixed type, sale-only), but per Issue #1748 the visible
 * "Switch flow" action must still carry the demand-gap prefill context back to
 * the journey selector so its recommendation/params survive a switch-away/back.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockRole = vi.hoisted(() => ({ current: 'broker' as string | null }));
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: mockRole.current,
    isLoading: false,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock('@/components/broker/AgriculturalListingForm', () => ({
  AgriculturalListingForm: ({ onSwitchToGenericFlow }: { onSwitchToGenericFlow: () => void }) => (
    <div data-testid="agricultural-listing-form">
      <button type="button" onClick={onSwitchToGenericFlow}>
        Switch flow
      </button>
    </div>
  ),
}));

// Import AFTER mocks are registered.
import AgriculturalNewListingPage from '../AgriculturalNewListingPage';

function renderPage(entry = '/broker/listings/new/agricultural') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/broker/listings/new/agricultural" element={<AgriculturalNewListingPage />} />
        <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgriculturalNewListingPage', () => {
  it('direct-link / refresh-safe: mounts AgriculturalListingForm for an allowed role', () => {
    mockRole.current = 'broker';
    renderPage();
    expect(screen.getByTestId('agricultural-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('redirects disallowed roles (e.g. guest/unknown) to /', () => {
    mockRole.current = 'guest';
    renderPage();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('agricultural-listing-form')).not.toBeInTheDocument();
  });

  it('Switch flow with no prefill returns to the bare selector (unchanged behaviour)', async () => {
    mockRole.current = 'broker';
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new');
  });

  it('Switch flow returns to the selector WITH the prefill context preserved (areaKey/propertyType/listingPurpose)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/agricultural?areaKey=brahmavar&propertyType=agricultural_land&listingPurpose=sale');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/broker/listings/new?areaKey=brahmavar&propertyType=agricultural_land&listingPurpose=sale',
    );
  });
});
