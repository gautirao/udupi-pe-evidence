import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NearSchoolSheet } from '../NearSchoolSheet';
import { SchoolResult } from '@/hooks/useSchoolSearch';

// jsdom doesn't provide ResizeObserver (used by Radix primitives)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false })),
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

// ─── Helpers ──────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const mockSchool: SchoolResult = {
  id: 'school-1',
  name: 'Manipal Public School',
  latitude: 13.35,
  longitude: 74.79,
  board: 'CBSE',
  boardType: 'CBSE',
  address: 'Manipal, Udupi',
  distanceKm: 1.2,
};

const defaultProps = {
  open: false,
  onOpenChange: vi.fn(),
  selectedSchool: null,
  onSchoolSelect: vi.fn(),
  radiusKm: 2,
  onRadiusChange: vi.fn(),
  boardFilter: [] as string[],
  onBoardFilterChange: vi.fn(),
};

function renderSheet(props: Partial<React.ComponentProps<typeof NearSchoolSheet>> = {}) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <NearSchoolSheet {...defaultProps} {...props} />
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe('NearSchoolSheet — open/close', () => {
  it('does not render sheet content when closed', () => {
    renderSheet({ open: false });
    expect(screen.queryByText('Near a school')).not.toBeInTheDocument();
  });

  it('renders sheet content when open=true', () => {
    renderSheet({ open: true });
    expect(screen.getByText('Near a school')).toBeInTheDocument();
  });

  it('renders SchoolSearchFilter inside the sheet when open', () => {
    renderSheet({ open: true });
    // SchoolSearchFilter renders a search input with this placeholder when no school is selected
    expect(screen.getByPlaceholderText(/type a school name/i)).toBeInTheDocument();
  });

  it('renders board type filter chips inside the sheet when open', () => {
    renderSheet({ open: true });
    expect(screen.getByText('CBSE')).toBeInTheDocument();
    expect(screen.getByText('ICSE')).toBeInTheDocument();
  });
});

describe('NearSchoolSheet — selected school display', () => {
  it('shows selected school name when one is provided', () => {
    renderSheet({ open: true, selectedSchool: mockSchool });
    expect(screen.getByText('Manipal Public School')).toBeInTheDocument();
  });

  it('shows radius buttons when a school is selected', () => {
    renderSheet({ open: true, selectedSchool: mockSchool, radiusKm: 2 });
    expect(screen.getByRole('button', { name: '1 km' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 km' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 km' })).toBeInTheDocument();
  });

  it('calls onSchoolSelect(null) when the clear button is clicked', async () => {
    const user = userEvent.setup();
    const onSchoolSelect = vi.fn();
    renderSheet({ open: true, selectedSchool: mockSchool, onSchoolSelect });
    await user.click(screen.getByRole('button', { name: /clear school selection/i }));
    expect(onSchoolSelect).toHaveBeenCalledWith(null);
  });
});

describe('NearSchoolSheet — radius change', () => {
  it('calls onRadiusChange when a different radius is selected', async () => {
    const user = userEvent.setup();
    const onRadiusChange = vi.fn();
    renderSheet({ open: true, selectedSchool: mockSchool, radiusKm: 2, onRadiusChange });
    await user.click(screen.getByRole('button', { name: '5 km' }));
    expect(onRadiusChange).toHaveBeenCalledWith(5);
  });
});
