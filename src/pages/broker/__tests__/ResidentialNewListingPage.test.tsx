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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
    initialDraftId,
    onDraftPersisted,
    onSwitchToGenericFlow,
  }: {
    initialPropertyType: string;
    initialListingPurpose?: string;
    initialDraftId?: string | null;
    onDraftPersisted?: (id: string) => void;
    onSwitchToGenericFlow: () => void;
  }) => (
    <div
      data-testid="residential-listing-form"
      data-initial-property-type={initialPropertyType}
      data-initial-listing-purpose={initialListingPurpose ?? ''}
      data-initial-draft-id={initialDraftId ?? ''}
    >
      <button type="button" onClick={onSwitchToGenericFlow}>
        Switch flow
      </button>
      {/* AC1 — simulates createListing.onSuccess firing inside the real form. */}
      <button type="button" onClick={() => onDraftPersisted?.('draft-xyz')}>
        Simulate draft persisted
      </button>
    </div>
  ),
}));

// Import AFTER mocks are registered.
import ResidentialNewListingPage from '../ResidentialNewListingPage';

function LocationSearchProbe() {
  const location = useLocation();
  return <div data-testid="location-search-probe">{location.search}</div>;
}

function renderPage(entry = '/broker/listings/new/residential') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/broker/listings/new/residential"
          element={(
            <>
              <ResidentialNewListingPage />
              <LocationSearchProbe />
            </>
          )}
        />
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

describe('ResidentialNewListingPage draft recovery (Issue #2039)', () => {
  it('AC1 — onDraftPersisted merges draftId into the URL via REPLACE and PRESERVES areaKey/propertyType/listingPurpose (a naive setSearchParams({draftId}) would drop them and fail this test)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?areaKey=brahmavar&propertyType=villa&listingPurpose=rent');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Simulate draft persisted' }));

    const search = screen.getByTestId('location-search-probe').textContent ?? '';
    const params = new URLSearchParams(search);
    expect(params.get('draftId')).toBe('draft-xyz');
    expect(params.get('areaKey')).toBe('brahmavar');
    expect(params.get('propertyType')).toBe('villa');
    expect(params.get('listingPurpose')).toBe('rent');
  });

  it('AC1 — draftId persists with no prior prefill params present (bare create route)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Simulate draft persisted' }));

    const search = screen.getByTestId('location-search-probe').textContent ?? '';
    expect(new URLSearchParams(search).get('draftId')).toBe('draft-xyz');
  });

  it('AC2/AC7 — a draftId already in the URL at mount is forwarded to the form as initialDraftId (hydration path wins over prefill wiring)', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential?draftId=existing-draft-1&propertyType=villa');

    const form = screen.getByTestId('residential-listing-form');
    expect(form.getAttribute('data-initial-draft-id')).toBe('existing-draft-1');
  });

  it('no draftId in the URL: initialDraftId is forwarded as empty (never a stray literal "null"/"undefined" string)', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/residential');

    const form = screen.getByTestId('residential-listing-form');
    expect(form.getAttribute('data-initial-draft-id')).toBe('');
  });
});
