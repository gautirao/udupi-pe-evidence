/**
 * Issue #2459 — the contextual area bounds must be registered in MapFilters' `hasActiveFilters`
 * predicate, not merely rendered by a control inside it.
 *
 * The defect this locks down is quiet: a filter that IS applied to the results but is absent from
 * that predicate leaves the "Clear" affordance hidden, so the buyer has an active filter they can
 * neither see acknowledged nor undo from this panel. Rendering the control is not the same as
 * registering the filter, and only the second is observable here.
 *
 * Kept in its own file so the existing MapFilters suite is untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapFilters } from '../MapFilters';

// jsdom doesn't provide ResizeObserver (used by Radix primitives)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/usePropertyListings', () => ({
  usePriceRange: vi.fn(() => ({ data: { min: 0, max: 10_000_000 } })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

const defaultProps = {
  filters: {},
  onFiltersChange: vi.fn(),
  selectedSchool: null,
  onSchoolSelect: vi.fn(),
  schoolBoardFilter: [] as string[],
  onSchoolBoardFilterChange: vi.fn(),
  city: 'udupi',
};

function renderFilters(props: Partial<React.ComponentProps<typeof MapFilters>> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MapFilters {...defaultProps} {...props} />
    </QueryClientProvider>,
  );
}

const clearButton = () => screen.queryByRole('button', { name: 'Clear' });

beforeEach(() => vi.clearAllMocks());

describe('MapFilters — area bounds register as an active filter (#2459)', () => {
  it('shows no Clear affordance when nothing is filtered (control arm)', () => {
    renderFilters();
    expect(clearButton()).not.toBeInTheDocument();
  });

  it('shows Clear when only a lower area bound is set', () => {
    renderFilters({ filters: { areaMinSqft: 800 } });
    expect(clearButton()).toBeInTheDocument();
  });

  it('shows Clear when only an upper area bound is set', () => {
    renderFilters({ filters: { areaMaxSqft: 1200 } });
    expect(clearButton()).toBeInTheDocument();
  });

  it('renders the contextual area control alongside the other filters', () => {
    renderFilters({ filters: { propertyTypes: ['apartment'] } });
    expect(screen.getByTestId('area-filter-label')).toHaveTextContent('BUILT-UP AREA (SQ FT)');
  });
});
