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

vi.mock('@/components/broker/AgriculturalListingForm', () => ({
  AgriculturalListingForm: ({
    initialDraftId,
    onDraftPersisted,
    onSwitchToGenericFlow,
  }: {
    initialDraftId?: string | null;
    onDraftPersisted?: (id: string) => void;
    onSwitchToGenericFlow: () => void;
  }) => (
    <div
      data-testid="agricultural-listing-form"
      data-initial-draft-id={initialDraftId ?? ''}
    >
      <button type="button" onClick={onSwitchToGenericFlow}>
        Switch flow
      </button>
      <button type="button" onClick={() => onDraftPersisted?.('agri-draft-xyz')}>
        Simulate draft persisted
      </button>
    </div>
  ),
}));

// Import AFTER mocks are registered.
import AgriculturalNewListingPage from '../AgriculturalNewListingPage';

function LocationSearchProbe() {
  const location = useLocation();
  return <div data-testid="location-search-probe">{location.search}</div>;
}

function renderPage(entry = '/broker/listings/new/agricultural') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/broker/listings/new/agricultural"
          element={(
            <>
              <AgriculturalNewListingPage />
              <LocationSearchProbe />
            </>
          )}
        />
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

  it('onDraftPersisted merges draftId into the URL via REPLACE and preserves demand-gap prefill params (#2811)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/agricultural?areaKey=brahmavar&propertyType=agricultural_land&listingPurpose=sale');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Simulate draft persisted' }));

    const search = screen.getByTestId('location-search-probe').textContent ?? '';
    const params = new URLSearchParams(search);
    expect(params.get('draftId')).toBe('agri-draft-xyz');
    expect(params.get('areaKey')).toBe('brahmavar');
    expect(params.get('propertyType')).toBe('agricultural_land');
    expect(params.get('listingPurpose')).toBe('sale');
  });

  it('draftId persists with no prior prefill params present on bare create route (#2811)', async () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/agricultural');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Simulate draft persisted' }));

    const search = screen.getByTestId('location-search-probe').textContent ?? '';
    expect(new URLSearchParams(search).get('draftId')).toBe('agri-draft-xyz');
  });

  it('a draftId already in the URL at mount is forwarded to AgriculturalListingForm as initialDraftId (#2811)', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/agricultural?draftId=existing-agri-1');

    const form = screen.getByTestId('agricultural-listing-form');
    expect(form.getAttribute('data-initial-draft-id')).toBe('existing-agri-1');
  });

  it('no draftId in the URL: initialDraftId is forwarded as empty (#2811)', () => {
    mockRole.current = 'broker';
    renderPage('/broker/listings/new/agricultural');

    const form = screen.getByTestId('agricultural-listing-form');
    expect(form.getAttribute('data-initial-draft-id')).toBe('');
  });
});
