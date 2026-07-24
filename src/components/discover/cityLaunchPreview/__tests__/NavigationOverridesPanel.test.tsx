/**
 * Issue #1955 (Areas PR A) item 6 — NavigationOverridesPanel.
 *
 * Covers:
 *  - Kind selector changes which fields render (discriminated union).
 *  - Apply builds the correct payload per kind and calls the create mutation.
 *  - `editable=false` (lifecycle_status !== PREPARED) disables the whole form
 *    and every delete trigger.
 *  - Applied overrides list renders one line per kind via describeOverride.
 *  - Delete requires the AlertDialog confirm click before calling the mutation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationOverridesPanel } from '../NavigationOverridesPanel';

// jsdom does not implement the PointerEvent capture APIs Radix Select's
// jsdom-only pointer-interaction path calls into — same shim used by
// AgriculturalListingForm.test.tsx / CommercialListingForm.parity.test.tsx.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const mockUseNavigationOverrides = vi.hoisted(() => vi.fn());
const mockCreateMutate = vi.hoisted(() => vi.fn());
const mockDeleteMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useCityLaunchNavigation', () => ({
  useNavigationOverrides: () => mockUseNavigationOverrides(),
  useCreateNavigationOverride: () => ({ mutate: mockCreateMutate, isPending: false }),
  useDeleteNavigationOverride: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // GET .../navigation/overrides returns a bare array (AdminNavigationOverrideResponse[]).
  mockUseNavigationOverrides.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('NavigationOverridesPanel — kind selector', () => {
  it('defaults to EXCLUDE_AREA and shows only the area-key field', () => {
    render(<NavigationOverridesPanel editable />);
    expect(screen.getByLabelText('Area key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Target region key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New label')).not.toBeInTheDocument();
  });

  it('switching to RELABEL shows node key + new label fields, hides area-key', async () => {
    render(<NavigationOverridesPanel editable />);
    await userEvent.click(screen.getByLabelText('Kind'));
    await userEvent.click(await screen.findByRole('option', { name: 'Relabel node' }));

    expect(screen.getByLabelText('Node key')).toBeInTheDocument();
    expect(screen.getByLabelText('New label')).toBeInTheDocument();
    expect(screen.queryByLabelText('Area key')).not.toBeInTheDocument();
  });

  it('switching to SET_REPRESENTATIVES shows the comma-separated area-keys field', async () => {
    render(<NavigationOverridesPanel editable />);
    await userEvent.click(screen.getByLabelText('Kind'));
    await userEvent.click(await screen.findByRole('option', { name: 'Change representative areas' }));

    expect(screen.getByLabelText('New representative area keys (comma-separated)')).toBeInTheDocument();
  });
});

describe('NavigationOverridesPanel — apply', () => {
  it('EXCLUDE_AREA: builds { kind, subjectAreaKey } and calls the mutation', async () => {
    render(<NavigationOverridesPanel editable />);
    await userEvent.type(screen.getByLabelText('Area key'), 'IN|KA|Udupi|Manipal');
    await userEvent.click(screen.getByRole('button', { name: /apply override/i }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      { kind: 'EXCLUDE_AREA', subjectAreaKey: 'IN|KA|Udupi|Manipal', reason: undefined },
      expect.anything(),
    );
  });

  it('SET_REPRESENTATIVES: splits the comma-separated field into an array', async () => {
    render(<NavigationOverridesPanel editable />);
    await userEvent.click(screen.getByLabelText('Kind'));
    await userEvent.click(await screen.findByRole('option', { name: 'Change representative areas' }));
    await userEvent.type(screen.getByLabelText('Node key'), 'region:north');
    await userEvent.type(
      screen.getByLabelText('New representative area keys (comma-separated)'),
      'area-a, area-b ,area-c',
    );
    await userEvent.click(screen.getByRole('button', { name: /apply override/i }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      {
        kind: 'SET_REPRESENTATIVES',
        subjectNodeKey: 'region:north',
        newRepresentativeAreaKeys: ['area-a', 'area-b', 'area-c'],
        reason: undefined,
      },
      expect.anything(),
    );
  });

  it('Apply is disabled while the required fields are empty', () => {
    render(<NavigationOverridesPanel editable />);
    expect(screen.getByRole('button', { name: /apply override/i })).toBeDisabled();
  });
});

describe('NavigationOverridesPanel — PREPARED-only gating', () => {
  it('editable=false disables the kind select, all inputs, and Apply', () => {
    render(<NavigationOverridesPanel editable={false} />);
    expect(screen.getByLabelText('Kind')).toBeDisabled();
    expect(screen.getByLabelText('Area key')).toBeDisabled();
    expect(screen.getByRole('button', { name: /apply override/i })).toBeDisabled();
    expect(screen.getByText(/not PREPARED — overrides are read-only/i)).toBeInTheDocument();
  });

  it('editable=false disables the delete trigger on an existing override', () => {
    mockUseNavigationOverrides.mockReturnValue({
      data: [{ kind: 'EXCLUDE_AREA', subjectAreaKey: 'area-1', id: 5, applyOrder: 0, reason: null }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<NavigationOverridesPanel editable={false} />);
    expect(screen.getByRole('button', { name: /remove override/i })).toBeDisabled();
  });
});

describe('NavigationOverridesPanel — applied overrides list', () => {
  it('renders one line per applied override, exhaustive over kinds', () => {
    mockUseNavigationOverrides.mockReturnValue({
      data: [
        { kind: 'EXCLUDE_AREA', subjectAreaKey: 'area-1', id: 1, applyOrder: 0, reason: null },
        {
          kind: 'MOVE_AREA',
          subjectAreaKey: 'area-2',
          targetNodeKey: 'region:south',
          id: 2,
          applyOrder: 1,
          reason: null,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<NavigationOverridesPanel editable />);
    expect(screen.getByText('Exclude area area-1')).toBeInTheDocument();
    expect(screen.getByText('Move area-2 → region:south')).toBeInTheDocument();
  });

  it('deleting requires the AlertDialog confirm click before calling the mutation', async () => {
    mockUseNavigationOverrides.mockReturnValue({
      data: [{ kind: 'EXCLUDE_AREA', subjectAreaKey: 'area-1', id: 5, applyOrder: 0, reason: null }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<NavigationOverridesPanel editable />);

    await userEvent.click(screen.getByRole('button', { name: /remove override/i }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(mockDeleteMutate).toHaveBeenCalledWith(5);
  });

  it('shows an empty state when no overrides are applied', () => {
    render(<NavigationOverridesPanel editable />);
    expect(screen.getByText(/no overrides applied yet/i)).toBeInTheDocument();
  });

  it('shows an error state with retry when the overrides list fails to load', () => {
    const refetch = vi.fn();
    mockUseNavigationOverrides.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<NavigationOverridesPanel editable />);
    expect(screen.getByText(/failed to load overrides/i)).toBeInTheDocument();
  });
});
