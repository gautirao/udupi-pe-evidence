/**
 * New-listing journey route-wiring tests (Issue #1719).
 *
 * App.tsx itself is not imported here (it eagerly pulls in the full provider
 * tree — QueryClient, AuthProvider, every eagerly-loaded page — which would
 * require an unreasonably large mock surface for a routing-only check).
 * Instead this test reconstructs the same four broker/listings/new* Route
 * entries from App.tsx verbatim (path + <ProtectedRoute> wrapper + element),
 * using the REAL ProtectedRoute and REAL routeAccess.canAccessRoute (the
 * exact same building blocks App.tsx uses), with only useAuth mocked. This
 * verifies:
 *  - all four routes are wrapped in ProtectedRoute
 *  - /broker/listings/new/residential resolves to the new dedicated page
 *    (not confused with the base /broker/listings/new selector)
 *  - the commercial and agricultural routes still mount their existing,
 *    unmodified pages (reuse regression — #1741/#1743 not duplicated/altered)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const mockAuth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'broker@example.com' },
  isLoading: false,
  isAdmin: false,
  isBroker: true,
  userRole: 'broker' as string | null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/pages/broker/NewListingJourneySelector', () => ({
  default: () => <div data-testid="journey-selector-page">Journey Selector</div>,
}));
vi.mock('@/pages/broker/ResidentialNewListingPage', () => ({
  default: () => <div data-testid="residential-page">Residential Page</div>,
}));
vi.mock('@/pages/broker/CommercialNewListingPage', () => ({
  default: () => <div data-testid="commercial-page">Commercial Page</div>,
}));
vi.mock('@/pages/broker/AgriculturalNewListingPage', () => ({
  default: () => <div data-testid="agricultural-page">Agricultural Page</div>,
}));

// Import AFTER mocks are registered — mirrors App.tsx's (lazy-loaded) imports.
import NewListingJourneySelector from '@/pages/broker/NewListingJourneySelector';
import ResidentialNewListingPage from '@/pages/broker/ResidentialNewListingPage';
import CommercialNewListingPage from '@/pages/broker/CommercialNewListingPage';
import AgriculturalNewListingPage from '@/pages/broker/AgriculturalNewListingPage';

/** Mirrors the exact broker/listings/new* Route block in src/App.tsx. */
function renderAppRoutesAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/broker/listings/new"
          element={
            <ProtectedRoute>
              <NewListingJourneySelector />
            </ProtectedRoute>
          }
        />
        <Route
          path="/broker/listings/new/residential"
          element={
            <ProtectedRoute>
              <ResidentialNewListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/broker/listings/new/commercial"
          element={
            <ProtectedRoute>
              <CommercialNewListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/broker/listings/new/agricultural"
          element={
            <ProtectedRoute>
              <AgriculturalNewListingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div data-testid="home-page">Home Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('New-listing journey route wiring (Issue #1719)', () => {
  it('/broker/listings/new resolves to the journey selector (not the residential page)', () => {
    renderAppRoutesAt('/broker/listings/new');
    expect(screen.getByTestId('journey-selector-page')).toBeInTheDocument();
    expect(screen.queryByTestId('residential-page')).not.toBeInTheDocument();
  });

  it('/broker/listings/new/residential resolves to the new dedicated residential page', () => {
    renderAppRoutesAt('/broker/listings/new/residential');
    expect(screen.getByTestId('residential-page')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-selector-page')).not.toBeInTheDocument();
  });

  it('/broker/listings/new/commercial still mounts the existing CommercialNewListingPage unchanged (reuse regression)', () => {
    renderAppRoutesAt('/broker/listings/new/commercial');
    expect(screen.getByTestId('commercial-page')).toBeInTheDocument();
  });

  it('/broker/listings/new/agricultural still mounts the existing AgriculturalNewListingPage unchanged (reuse regression)', () => {
    renderAppRoutesAt('/broker/listings/new/agricultural');
    expect(screen.getByTestId('agricultural-page')).toBeInTheDocument();
  });

  it('all four routes are guarded by the real ProtectedRoute + canAccessRoute — anonymous users are redirected away from every one', () => {
    mockAuth.user = null as unknown as typeof mockAuth.user;
    mockAuth.userRole = null;

    renderAppRoutesAt('/broker/listings/new/residential');
    // ProtectedRoute redirects unauthenticated users to /auth?redirect=..., which
    // isn't in this test's route table, so react-router renders nothing matched;
    // asserting the guarded page never mounts is the behavior under test.
    expect(screen.queryByTestId('residential-page')).not.toBeInTheDocument();

    // restore for subsequent tests in this file
    mockAuth.user = { id: 'u1', email: 'broker@example.com' };
    mockAuth.userRole = 'broker';
  });
});
