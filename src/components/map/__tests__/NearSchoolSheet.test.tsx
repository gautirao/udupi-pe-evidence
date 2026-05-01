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

// usePopularSchools hits the network — stub it for sheet-level rendering tests.
const usePopularSchoolsMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
);
vi.mock('@/hooks/usePopularSchools', () => ({
  usePopularSchools: usePopularSchoolsMock,
}));

// useTrendsOptions also fires a network query — stub it.
const useTrendsOptionsMock = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isLoading: false })),
);
vi.mock('@/hooks/useTrendsOptions', () => ({
  useTrendsOptions: useTrendsOptionsMock,
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
  city: 'udupi' as string | null,
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

describe('NearSchoolSheet — popular schools grid', () => {
  it('shows the "enter location first" placeholder when city is null', () => {
    renderSheet({ open: true, city: null });
    expect(screen.getByText(/enter a location first/i)).toBeInTheDocument();
  });

  it('renders the popular schools heading when a city is set', () => {
    renderSheet({ open: true, city: 'udupi' });
    expect(screen.getByRole('heading', { name: /popular schools/i })).toBeInTheDocument();
  });

  it('renders a popular school card when the hook returns results', () => {
    usePopularSchoolsMock.mockReturnValueOnce({
      data: [mockSchool],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSheet({ open: true, city: 'udupi' });
    // Both the autocomplete label area and the grid card render the school name when selected;
    // selectedSchool is null here so only the grid card shows it.
    expect(screen.getAllByText('Manipal Public School').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a popular school card fires onSchoolSelect, not any area mutation', async () => {
    const user = userEvent.setup();
    const onSchoolSelect = vi.fn();
    usePopularSchoolsMock.mockReturnValueOnce({
      data: [mockSchool],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSheet({ open: true, city: 'udupi', onSchoolSelect });

    await user.click(
      screen.getByRole('button', { name: /select manipal public school/i }),
    );
    expect(onSchoolSelect).toHaveBeenCalledTimes(1);
    expect(onSchoolSelect).toHaveBeenCalledWith(mockSchool);
  });

  it('renders the empty-state message when the hook returns an empty array', () => {
    usePopularSchoolsMock.mockReturnValueOnce({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    renderSheet({ open: true, city: 'udupi' });
    expect(screen.getByText(/no popular schools found near udupi/i)).toBeInTheDocument();
  });

  it('renders the error state with a Retry button that calls refetch()', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    usePopularSchoolsMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });
    renderSheet({ open: true, city: 'udupi' });
    const retry = screen.getByRole('button', { name: /retry/i });
    await user.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
