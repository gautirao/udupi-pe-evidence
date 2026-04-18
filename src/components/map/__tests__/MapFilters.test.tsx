import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MapFilters } from '../MapFilters';
import { isNew } from '@/pages/Index';

// jsdom doesn't provide ResizeObserver (used by Radix primitives)
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Mocks ────────────────────────────────────────────────────

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/usePropertyListings', () => ({
  useLocalities: vi.fn(() => ({ data: ['Udupi', 'Karkala'], isLoading: false })),
  usePriceRange: vi.fn(() => ({ data: { min: 0, max: 10_000_000 } })),
}));

vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/lib/formatters', () => ({
  formatPrice: (v: number) => `₹${v}`,
}));

// ─── Helpers ──────────────────────────────────────────────────

const defaultProps = {
  filters: {},
  onFiltersChange: vi.fn(),
  searchQuery: '',
  onSearchChange: vi.fn(),
  selectedSchool: null,
  onSchoolSelect: vi.fn(),
  schoolBoardFilter: [] as string[],
  onSchoolBoardFilterChange: vi.fn(),
  city: 'udupi',
  onCityChange: vi.fn(),
  allListings: [],
};

function renderFilters(props: React.ComponentProps<typeof MapFilters> = defaultProps) {
  return render(<MapFilters {...props} />);
}

// ─── Tests ────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

describe('MapFilters — property type checkboxes', () => {
  it('renders all 5 property type labels including Apartment', () => {
    renderFilters();
    expect(screen.getByText('Land')).toBeInTheDocument();
    expect(screen.getByText('House')).toBeInTheDocument();
    expect(screen.getByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders checkbox with id type-apartment', () => {
    renderFilters();
    expect(document.querySelector('#type-apartment')).not.toBeNull();
  });

  it('renders checkboxes for all 5 types by id', () => {
    renderFilters();
    for (const type of ['land', 'house', 'apartment', 'commercial', 'other']) {
      expect(document.querySelector(`#type-${type}`)).not.toBeNull();
    }
  });

  it('Apartment label is linked to type-apartment checkbox via htmlFor', () => {
    renderFilters();
    const label = document.querySelector('label[for="type-apartment"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Apartment');
  });
});

describe('MapFilters — search input', () => {
  it('renders search input with correct placeholder', () => {
    renderFilters();
    expect(screen.getByPlaceholderText('Search listings...')).toBeInTheDocument();
  });

  it('reflects searchQuery value', () => {
    renderFilters({ ...defaultProps, searchQuery: 'udupi' });
    expect(screen.getByPlaceholderText('Search listings...')).toHaveValue('udupi');
  });
});

describe('MapFilters — BHK buttons (PR-11/12 regression)', () => {
  it('renders all 4 BHK buttons', () => {
    renderFilters();
    // Label is present
    expect(screen.getByText('Bedrooms (BHK)')).toBeInTheDocument();
    // Buttons with exact labels
    expect(screen.getByRole('button', { name: '1', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4+', exact: true })).toBeInTheDocument();
  });
});

describe('MapFilters — Listing Status buttons (RE-169)', () => {
  it('renders the 4 working status filter buttons', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: 'New to Market' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back on Market' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RERA Registered' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ready to Move' })).toBeInTheDocument();
  });

  it('does NOT render a "Price Reduced" button', () => {
    renderFilters();
    expect(screen.queryByRole('button', { name: 'Price Reduced' })).not.toBeInTheDocument();
  });
});

describe('MapFilters — clear button visibility', () => {
  it('does not show Clear button when no active filters', () => {
    renderFilters();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('shows Clear button when a property type is active', () => {
    renderFilters({
      ...defaultProps,
      filters: { propertyTypes: ['apartment'] },
    });
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('shows Clear button when searchQuery is set', () => {
    renderFilters({ ...defaultProps, searchQuery: 'test' });
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });
});

describe('MapFilters — View Trends button (F3)', () => {
  it('does not render the button when trendsAreaKeys is empty', () => {
    renderFilters({ ...defaultProps, trendsAreaKeys: [] });
    expect(screen.queryByRole('button', { name: /view trends/i })).not.toBeInTheDocument();
  });

  it('does not render the button when trendsAreaKeys is undefined', () => {
    renderFilters({ ...defaultProps, trendsAreaKeys: undefined });
    expect(screen.queryByRole('button', { name: /view trends/i })).not.toBeInTheDocument();
  });

  it('renders the button and navigates with city + encoded areaKeys when trendsAreaKeys is set', async () => {
    const user = userEvent.setup();
    render(
      <MapFilters
        filters={{}}
        onFiltersChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        selectedSchool={null}
        onSchoolSelect={vi.fn()}
        schoolBoardFilter={[]}
        onSchoolBoardFilterChange={vi.fn()}
        city="udupi"
        onCityChange={vi.fn()}
        allListings={[]}
        trendsAreaKeys={['IN|KA|Udupi|Manipal']}
      />
    );
    const btn = screen.getByRole('button', { name: /view trends/i });
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal'
    );
  });

  it('includes all keys in URL when multiple trendsAreaKeys provided', async () => {
    const user = userEvent.setup();
    render(
      <MapFilters
        filters={{}}
        onFiltersChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        selectedSchool={null}
        onSchoolSelect={vi.fn()}
        schoolBoardFilter={[]}
        onSchoolBoardFilterChange={vi.fn()}
        city="udupi"
        onCityChange={vi.fn()}
        allListings={[]}
        trendsAreaKeys={['IN|KA|Udupi|Manipal', 'IN|KA|Udupi|Karkala']}
      />
    );
    const btn = screen.getByRole('button', { name: /view trends/i });
    await user.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/trends?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal&areaKey=IN%7CKA%7CUdupi%7CKarkala'
    );
  });
});

// ─── isNew unit tests (F5) ────────────────────────────────────

describe('isNew', () => {
  it('returns false for null', () => {
    expect(isNew(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isNew('')).toBe(false);
  });

  it('returns true for a date 6 days ago', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString();
    expect(isNew(sixDaysAgo)).toBe(true);
  });

  it('returns true at exactly the 7-day boundary (inclusive)', () => {
    const now = 1_700_000_000_000; // fixed epoch — eliminates flakiness from real Date.now() drift
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const exactlySevenDays = new Date(now - 7 * 86400_000).toISOString();
    expect(isNew(exactlySevenDays)).toBe(true);
    vi.useRealTimers();
  });

  it('returns false for a date 8 days ago', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400_000).toISOString();
    expect(isNew(eightDaysAgo)).toBe(false);
  });
});
