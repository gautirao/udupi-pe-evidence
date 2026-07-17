/**
 * ResidentialNewListingPage — deep-link route tests (Issue #1719).
 *
 * Mirrors CommercialNewListingPage.test.tsx (#1741 follow-up). Verifies:
 *  - the page mounts the EXISTING ResidentialListingForm directly with a
 *    valid residential initialPropertyType ('apartment')
 *  - direct-link / refresh-safety: mounting fresh at
 *    /broker/listings/new/residential (no prior navigation) renders the form
 *  - onSwitchToGenericFlow is a real callback that navigates to
 *    /broker/listings/new (now the journey selector, per #1719)
 *  - auth/role parity with the commercial/agricultural siblings: allowed
 *    roles render the form, disallowed roles redirect to "/"
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

vi.mock('@/components/broker/ResidentialListingForm', () => ({
  ResidentialListingForm: ({
    initialPropertyType,
    initialListingPurpose,
    onSwitchToGenericFlow,
  }: {
    initialPropertyType: string;
    initialListingPurpose?: string;
    onSwitchToGenericFlow: () => void;
  }) => (
    <div
      data-testid="residential-listing-form"
      data-initial-property-type={initialPropertyType}
      data-initial-listing-purpose={initialListingPurpose ?? ''}
    >
      <button type="button" onClick={onSwitchToGenericFlow}>
        Switch flow
      </button>
    </div>
  ),
}));

// Import AFTER mocks are registered.
import ResidentialNewListingPage from '../ResidentialNewListingPage';

function renderPage(entry = '/broker/listings/new/residential') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/broker/listings/new/residential" element={<ResidentialNewListingPage />} />
        <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResidentialNewListingPage (Issue #1719)', () => {
  it('direct-link / refresh-safe: mounts ResidentialListingForm with a valid residential property type on first render at the route', () => {
    mockRole.current = 'broker';
    renderPage();

    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    const form = screen.getByTestId('residential-listing-form');
    expect(form).toBeInTheDocument();
    expect(form.getAttribute('data-initial-property-type')).toBe('apartment');
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('onSwitchToGenericFlow navigates to /broker/listings/new (real callback, not a no-op)', async () => {
    mockRole.current = 'broker';
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));

    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new');
  });

  it('allows user role to access the residential deep link (parity with commercial/agricultural siblings)', () => {
    mockRole.current = 'user';
    renderPage();
    expect(screen.getByTestId('residential-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('allows dealer role to access the residential deep link (parity with commercial/agricultural siblings)', () => {
    mockRole.current = 'dealer';
    renderPage();
    expect(screen.getByTestId('residential-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('allows admin role to access the residential deep link (parity with commercial/agricultural siblings)', () => {
    mockRole.current = 'admin';
    renderPage();
    expect(screen.getByTestId('residential-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('redirects disallowed roles (e.g. guest/unknown) to / — same as the commercial/agricultural siblings', () => {
    mockRole.current = 'guest';
    renderPage();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('residential-listing-form')).not.toBeInTheDocument();
  });
});

describe('ResidentialNewListingPage demand-gap prefill (Issue #1748)', () => {
  it('seeds a valid residential subtype and listingPurpose from forwarded prefill params', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?areaKey=brahmavar&propertyType=villa&listingPurpose=rent');
    const form = screen.getByTestId('residential-listing-form');
    expect(form.getAttribute('data-initial-property-type')).toBe('villa');
    expect(form.getAttribute('data-initial-listing-purpose')).toBe('rent');
  });

  it('ignores an incompatible propertyType (commercial) — keeps the apartment default', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?propertyType=commercial_land&listingPurpose=sale');
    const form = screen.getByTestId('residential-listing-form');
    expect(form.getAttribute('data-initial-property-type')).toBe('apartment');
    expect(form.getAttribute('data-initial-listing-purpose')).toBe('sale');
  });

  it('ignores an invalid listingPurpose (lease) — leaves the form default (no purpose forwarded)', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?propertyType=house&listingPurpose=lease');
    const form = screen.getByTestId('residential-listing-form');
    expect(form.getAttribute('data-initial-property-type')).toBe('house');
    expect(form.getAttribute('data-initial-listing-purpose')).toBe('');
  });

  it('Switch flow returns to the selector WITH the prefill context preserved (areaKey/propertyType/listingPurpose)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?areaKey=brahmavar&propertyType=villa&listingPurpose=rent');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/broker/listings/new?areaKey=brahmavar&propertyType=villa&listingPurpose=rent',
    );
  });
});
