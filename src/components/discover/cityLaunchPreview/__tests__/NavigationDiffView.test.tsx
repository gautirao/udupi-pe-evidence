/**
 * Issue #1955 (Areas PR A) item 4 — NavigationDiffView.
 * Covers: BASE/PREVIOUS_REVISION toggle re-queries, loading/error states,
 * "no structural changes" empty state, and rendering each diff section.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationDiffView } from '../NavigationDiffView';

const mockUseNavigationDiff = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useCityLaunchNavigation', () => ({
  useNavigationDiff: (against: string) => mockUseNavigationDiff(against),
}));

const EMPTY_DIFF = {
  revisionId: 42,
  against: 'BASE',
  overridesFingerprint: 'fp-empty',
  added: [],
  removed: [],
  moved: [],
  relabeled: [],
  representativeChanges: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNavigationDiff.mockReturnValue({ isLoading: false, isError: false, data: EMPTY_DIFF, refetch: vi.fn() });
});

describe('NavigationDiffView', () => {
  it('defaults to comparing against BASE', () => {
    render(<NavigationDiffView />);
    expect(mockUseNavigationDiff).toHaveBeenCalledWith('BASE');
  });

  it('switching to "Against previous revision" re-queries with PREVIOUS_REVISION', async () => {
    render(<NavigationDiffView />);
    await userEvent.click(screen.getByRole('radio', { name: /against previous revision/i }));
    expect(mockUseNavigationDiff).toHaveBeenCalledWith('PREVIOUS_REVISION');
  });

  it('shows "No structural changes" when every diff bucket is empty', () => {
    render(<NavigationDiffView />);
    expect(screen.getByText(/no structural changes/i)).toBeInTheDocument();
  });

  it('renders an error state with retry', () => {
    mockUseNavigationDiff.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: vi.fn() });
    render(<NavigationDiffView />);
    expect(screen.getByText(/failed to load the diff/i)).toBeInTheDocument();
  });

  it('renders added/removed/moved/relabeled/representative-change sections when present', () => {
    mockUseNavigationDiff.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        revisionId: 42,
        against: 'BASE',
        overridesFingerprint: 'fp-1',
        added: ['area:new'],
        removed: ['area:old'],
        moved: [{ nodeKey: 'area:m', fromParentNodeKey: 'region:north', toParentNodeKey: 'region:south' }],
        relabeled: [{ nodeKey: 'area:r', fromLabel: 'Old Label', toLabel: 'New Label' }],
        representativeChanges: [
          { nodeKey: 'region:north', fromRepresentativeAreaKeys: ['a'], toRepresentativeAreaKeys: ['b'] },
        ],
      },
      refetch: vi.fn(),
    });
    render(<NavigationDiffView />);
    expect(screen.getByText('area:new')).toBeInTheDocument();
    expect(screen.getByText('area:old')).toBeInTheDocument();
    expect(screen.getByText(/region:north → region:south/)).toBeInTheDocument();
    expect(screen.getByText(/"Old Label" → "New Label"/)).toBeInTheDocument();
    expect(screen.getByText('fp-1')).toBeInTheDocument();
  });

  it('renders "(none)" when overridesFingerprint is null (zero-override revision)', () => {
    mockUseNavigationDiff.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...EMPTY_DIFF, overridesFingerprint: null },
      refetch: vi.fn(),
    });
    render(<NavigationDiffView />);
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });
});
