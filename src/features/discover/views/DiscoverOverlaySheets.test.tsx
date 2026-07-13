/**
 * Issue #1824 Slice S11a — render tests for DiscoverOverlaySheets (the
 * sheets/overlays group lifted out of MapDiscovery.tsx): NearSchoolSheet
 * (agri-first gated) + DiscoverConsentBanner + DiscoverPrivacyToggle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourneyTransitionsCommands } from '@/features/discover/state/useDiscoverJourneyTransitions';
import { DiscoverOverlaySheets, type DiscoverOverlaySheetsProps } from './DiscoverOverlaySheets';

// jsdom doesn't provide ResizeObserver (used by Radix primitives, e.g. the Sheet).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false })),
  useSchoolById: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

// Supabase client calls localStorage.getItem at module-load time in jsdom.
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

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const JOURNEY_COMMANDS: DiscoverJourneyTransitionsCommands = {
  startOver: vi.fn(),
  selectSchoolById: vi.fn(),
  clearSchool: vi.fn(),
  clearArea: vi.fn(),
  changeRadius: vi.fn(),
  backLevel2: vi.fn(),
  backLevel1: vi.fn(),
  backLevel0: vi.fn(),
  resetBoundedSearch: vi.fn(),
  wrappedSchoolSelect: vi.fn(),
};

const BASE_FILTERS: PropertyFilters = {};

function baseProps(overrides: Partial<DiscoverOverlaySheetsProps> = {}): DiscoverOverlaySheetsProps {
  return {
    isAgriJourney: false,
    nearSchoolOpen: false,
    setNearSchoolOpen: vi.fn(),
    selectedSchool: null,
    journeyCommands: JOURNEY_COMMANDS,
    filters: BASE_FILTERS,
    handleFiltersChange: vi.fn(),
    schoolBoardFilter: [],
    handleBoardFilterChange: vi.fn(),
    isCityValid: true,
    city: 'bangalore',
    ...overrides,
  };
}

function renderSheets(overrides: Partial<DiscoverOverlaySheetsProps> = {}) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <DiscoverOverlaySheets {...baseProps(overrides)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('DiscoverOverlaySheets', () => {
  it('mounts NearSchoolSheet when isAgriJourney is false', () => {
    renderSheets({ isAgriJourney: false, nearSchoolOpen: true });
    // NearSchoolSheet renders its SheetTitle "Near a school" when mounted+open.
    expect(screen.getByText('Near a school')).toBeInTheDocument();
  });

  it('does NOT mount NearSchoolSheet when isAgriJourney is true (MVP2 guard)', () => {
    renderSheets({ isAgriJourney: true, nearSchoolOpen: true });
    expect(screen.queryByText('Near a school')).not.toBeInTheDocument();
  });

  it('always renders DiscoverConsentBanner regardless of isAgriJourney', () => {
    renderSheets({ isAgriJourney: true });
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();
  });

  it('always renders DiscoverPrivacyToggle regardless of isAgriJourney', () => {
    renderSheets({ isAgriJourney: false });
    expect(screen.getByTestId('discover-privacy-toggle')).toBeInTheDocument();
  });
});
