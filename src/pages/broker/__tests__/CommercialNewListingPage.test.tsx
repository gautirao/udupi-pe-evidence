/**
 * CommercialNewListingPage — deep-link route tests (#1741 follow-up).
 *
 * Verifies:
 *  - the page mounts the EXISTING CommercialListingForm directly with a valid
 *    commercial initialPropertyType (not the journey selector, not an error state)
 *  - direct-link / refresh-safety: mounting fresh at
 *    /broker/listings/new/commercial (no prior navigation) renders the form
 *  - onSwitchToGenericFlow is a real callback that navigates to /broker/listings/new
 *  - auth/role parity with /broker/listings/new: allowed roles render the form,
 *    disallowed roles (and unauthenticated-equivalent unknown role) redirect to "/"
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

vi.mock('@/components/broker/CommercialListingForm', () => ({
  CommercialListingForm: ({
    initialPropertyType,
    initialListingPurpose,
    onSwitchToGenericFlow,
  }: {
    initialPropertyType: string;
    initialListingPurpose?: string;
    onSwitchToGenericFlow: () => void;
  }) => (
    <div
      data-testid="commercial-listing-form"
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
import CommercialNewListingPage from '../CommercialNewListingPage';

function renderPage(entry = '/broker/listings/new/commercial') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/broker/listings/new/commercial" element={<CommercialNewListingPage />} />
        <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CommercialNewListingPage (#1741 follow-up)', () => {
  it('direct-link / refresh-safe: mounts CommercialListingForm with a valid commercial property type on first render at the route', () => {
    mockRole.current = 'broker';
    renderPage();

    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    const form = screen.getByTestId('commercial-listing-form');
    expect(form).toBeInTheDocument();
    expect(form.getAttribute('data-initial-property-type')).toBe('commercial');
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('onSwitchToGenericFlow navigates to /broker/listings/new (real callback, not a no-op)', async () => {
    mockRole.current = 'broker';
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));

    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new');
  });

  it('allows user role to access the commercial deep link (parity with /broker/listings/new)', () => {
    mockRole.current = 'user';
    renderPage();
    expect(screen.getByTestId('commercial-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('allows dealer role to access the commercial deep link (parity with /broker/listings/new)', () => {
    mockRole.current = 'dealer';
    renderPage();
    expect(screen.getByTestId('commercial-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('allows admin role to access the commercial deep link (parity with /broker/listings/new)', () => {
    mockRole.current = 'admin';
    renderPage();
    expect(screen.getByTestId('commercial-listing-form')).toBeInTheDocument();
    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
  });

  it('redirects disallowed roles (e.g. guest/unknown) to / — same as /broker/listings/new', () => {
    mockRole.current = 'guest';
    renderPage();
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('commercial-listing-form')).not.toBeInTheDocument();
  });
});

describe('CommercialNewListingPage demand-gap prefill (Issue #1748)', () => {
  it('seeds a valid commercial type and listingPurpose from forwarded prefill params', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/commercial?areaKey=kaup&propertyType=warehouse&listingPurpose=rent');
    const form = screen.getByTestId('commercial-listing-form');
    expect(form.getAttribute('data-initial-property-type')).toBe('warehouse');
    expect(form.getAttribute('data-initial-listing-purpose')).toBe('rent');
  });

  it('ignores an incompatible propertyType (residential) — keeps the commercial default', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/commercial?propertyType=apartment&listingPurpose=sale');
    const form = screen.getByTestId('commercial-listing-form');
    expect(form.getAttribute('data-initial-property-type')).toBe('commercial');
    expect(form.getAttribute('data-initial-listing-purpose')).toBe('sale');
  });

  it('Switch flow returns to the selector WITH the prefill context preserved (areaKey/propertyType/listingPurpose)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/commercial?areaKey=kaup&propertyType=warehouse&listingPurpose=rent');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch flow' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/broker/listings/new?areaKey=kaup&propertyType=warehouse&listingPurpose=rent',
    );
  });
});
