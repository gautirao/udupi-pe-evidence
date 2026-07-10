/**
 * Issue #1812 — group-scoped school search "outside {scopeLabel}" indicator.
 *
 * ScopedSearch renders school results in the order useSchoolSearch returns them
 * (server-ranked; in-scope first when areaKeys is sent). This suite mocks
 * useSchoolSearch directly so the indicator/order logic is exercised without any
 * network or React Query plumbing, and proves:
 *   - a mixed-inScope result set labels only inScope === false rows,
 *   - no areaKeys => no label anywhere (even if inScope happens to be present),
 *   - inScope === true / null / undefined rows are never labelled,
 *   - results render in the order the hook returns (no client re-sort),
 *   - the Level-1 city-landing usage (no areaKeys) keeps direct-jump
 *     (handlePickSchool -> onSelectSchool) unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScopedSearch, type ScopedSearchProps } from '../ScopedSearch';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const mockUseSchoolSearch = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSchoolSearch', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSchoolSearch')>(
    '@/hooks/useSchoolSearch',
  );
  return { ...actual, useSchoolSearch: mockUseSchoolSearch };
});

function school(overrides: Partial<SchoolResult>): SchoolResult {
  return {
    id: overrides.id ?? 's1',
    name: overrides.name ?? 'Sample School',
    board: null,
    boardType: null,
    latitude: 13.3,
    longitude: 74.7,
    address: overrides.address ?? '123 Main Rd',
    distanceKm: 1,
    ...overrides,
  };
}

function mockSchools(data: SchoolResult[], isLoading = false) {
  mockUseSchoolSearch.mockReturnValue({ data, isLoading });
}

function renderScopedSearch(props: ScopedSearchProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ScopedSearch {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSchoolSearch.mockReturnValue({ data: [], isLoading: false });
});

async function openSchoolMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('search-mode-school'));
  await user.type(screen.getByTestId('scoped-search-input'), 'heb');
}

describe('ScopedSearch — school result "outside scope" indicator (#1812)', () => {
  it('labels only inScope === false rows when areaKeys + scopeLabel are active', async () => {
    const user = userEvent.setup();
    mockSchools([
      school({ id: 'in-1', name: 'In Scope School', inScope: true }),
      school({ id: 'out-1', name: 'Out Of Scope School', inScope: false }),
    ]);

    renderScopedSearch({ areaKeys: ['area-a', 'area-b'], scopeLabel: 'Manipal' });
    await openSchoolMode(user);

    const inRow = screen.getByTestId('search-result-school-in-1');
    const outRow = screen.getByTestId('search-result-school-out-1');
    expect(inRow).not.toHaveTextContent('outside Manipal');
    expect(outRow).toHaveTextContent('outside Manipal');
  });

  it('renders no label anywhere when areaKeys is absent, even if inScope is present', async () => {
    const user = userEvent.setup();
    mockSchools([
      school({ id: 'x1', inScope: false }),
      school({ id: 'x2', inScope: true }),
    ]);

    renderScopedSearch({ scopeLabel: 'Manipal' });
    await openSchoolMode(user);

    expect(screen.getByTestId('search-result-school-x1')).not.toHaveTextContent('outside');
    expect(screen.getByTestId('search-result-school-x2')).not.toHaveTextContent('outside');
  });

  it('renders no label when scopeLabel is absent, even with areaKeys + inScope=false', async () => {
    const user = userEvent.setup();
    mockSchools([school({ id: 'y1', inScope: false })]);

    renderScopedSearch({ areaKeys: ['area-a'] });
    await openSchoolMode(user);

    expect(screen.getByTestId('search-result-school-y1')).not.toHaveTextContent('outside');
  });

  it('never labels rows with inScope null or undefined', async () => {
    const user = userEvent.setup();
    mockSchools([
      school({ id: 'n1', inScope: null }),
      school({ id: 'n2', inScope: undefined }),
    ]);

    renderScopedSearch({ areaKeys: ['area-a'], scopeLabel: 'Manipal' });
    await openSchoolMode(user);

    expect(screen.getByTestId('search-result-school-n1')).not.toHaveTextContent('outside');
    expect(screen.getByTestId('search-result-school-n2')).not.toHaveTextContent('outside');
  });

  it('renders results in the order the hook returns them (no client re-sort)', async () => {
    const user = userEvent.setup();
    mockSchools([
      school({ id: 'z-last', name: 'Z Last', inScope: true }),
      school({ id: 'a-first', name: 'A First', inScope: false }),
    ]);

    renderScopedSearch({ areaKeys: ['area-a'], scopeLabel: 'Manipal' });
    await openSchoolMode(user);

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Z Last');
    expect(rows[1]).toHaveTextContent('A First');
  });

  it('passes areaKeys through to useSchoolSearch as the 3rd argument', async () => {
    const user = userEvent.setup();
    mockSchools([]);

    renderScopedSearch({ citySlug: 'bangalore', areaKeys: ['area-a', 'area-b'], scopeLabel: 'Manipal' });
    await openSchoolMode(user);

    expect(mockUseSchoolSearch).toHaveBeenLastCalledWith('heb', 'bangalore', ['area-a', 'area-b']);
  });
});

describe('ScopedSearch — Level-1 city-landing direct-jump preserved (no areaKeys)', () => {
  it('sends no areaKeys to the hook when the prop is omitted', async () => {
    const user = userEvent.setup();
    mockSchools([]);

    renderScopedSearch({ citySlug: 'udupi' });
    await openSchoolMode(user);

    expect(mockUseSchoolSearch).toHaveBeenLastCalledWith('heb', 'udupi', undefined);
  });

  it('handlePickSchool still calls onSelectSchool unchanged and clears the query', async () => {
    const user = userEvent.setup();
    const onSelectSchool = vi.fn();
    mockSchools([school({ id: 'direct-1', name: 'Direct Jump School' })]);

    renderScopedSearch({ onSelectSchool });
    await openSchoolMode(user);

    await user.click(screen.getByTestId('search-result-school-direct-1'));

    expect(onSelectSchool).toHaveBeenCalledWith('direct-1');
    expect(screen.getByTestId('scoped-search-input')).toHaveValue('');
  });
});
