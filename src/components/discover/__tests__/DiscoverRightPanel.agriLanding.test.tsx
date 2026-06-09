/**
 * Regression test for Issue #1409 Fix 1 — DiscoverRightPanel agri-landing crash.
 *
 * Before the fix: the four props regionalGroups, isLoadingRegionalGroups,
 * selectedGroup, onSelectRegionalGroup were declared in the interface and consumed
 * in the 'agri-landing' render branch, but were NOT included in the function
 * parameter destructuring. Rendering with panelContent="agri-landing" threw:
 *   ReferenceError: regionalGroups is not defined
 * which crashed the whole panel into the ErrorBoundary.
 *
 * After the fix: all four props are destructured; this test verifies the panel
 * renders normally and the regional group rows appear (or the empty state when
 * no groups are provided).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import type { RegionalAreaGroup } from '@/hooks/useRegionalAreaGroups';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_GROUP: RegionalAreaGroup = {
  label: 'North — 10–25 km',
  directionKey: 'N',
  distanceBandKey: '10_25',
  listingCount: 7,
  agriAcreage: 12.4,
  areaKeys: ['IN|KA|Udupi|Hebri', 'IN|KA|Udupi|Karkala'],
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderLanding(props: {
  regionalGroups?: RegionalAreaGroup[];
  isLoadingRegionalGroups?: boolean;
}) {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={makeQueryClient()}>
        <DiscoverRightPanel
          panelContent="agri-landing"
          city="udupi"
          areas={[]}
          onStartOver={vi.fn()}
          onSelectJourney={vi.fn()}
          journey="agri-first"
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DiscoverRightPanel agri-landing — Fix 1 regression (Issue #1409)', () => {
  it('renders regional group rows when regionalGroups has entries (would crash before fix)', () => {
    // This test FAILED before Fix 1 with:
    //   ReferenceError: regionalGroups is not defined
    // because the props were not destructured from the function parameters.
    renderLanding({ regionalGroups: [SAMPLE_GROUP] });

    // The panel container and at least one row must be present.
    expect(screen.getByTestId('agri-regional-groups')).toBeInTheDocument();
    expect(screen.getAllByTestId('agri-regional-group-row')).toHaveLength(1);
    expect(screen.getByTestId('agri-regional-group-label')).toHaveTextContent(
      'North — 10–25 km',
    );
  });

  it('renders empty fallback when regionalGroups is empty (would crash before fix)', () => {
    // Same crash would occur — the fix ensures groups=[] reaches AgriRegionalGroupsPanel
    // and the empty-state branch renders.
    renderLanding({ regionalGroups: [] });

    expect(screen.getByTestId('agri-regional-groups-empty')).toBeInTheDocument();
    expect(
      screen.getByText(/No regional groupings found/i),
    ).toBeInTheDocument();
  });

  it('renders loading skeleton when isLoadingRegionalGroups is true', () => {
    renderLanding({ regionalGroups: [], isLoadingRegionalGroups: true });

    expect(screen.getByTestId('agri-regional-groups-loading')).toBeInTheDocument();
    // Neither groups list nor empty state should appear while loading
    expect(screen.queryByTestId('agri-regional-groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agri-regional-groups-empty')).not.toBeInTheDocument();
  });
});
