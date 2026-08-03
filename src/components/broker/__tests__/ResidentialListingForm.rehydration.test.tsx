/**
 * ResidentialListingForm — AC12 (issue #2040): draft rehydration for the
 * relocated apartment builtArea control.
 *
 * Radix Collapsible never mounts collapsed children, so before this PR moved
 * builtArea out of "More details" into the always-mounted Section 3, there
 * was NO rehydration code path to exercise for this field on initial
 * render — the pre-#2040 suite could not have caught a regression here even
 * if one existed. This spec is the new positive coverage the PLAN_REVIEW
 * self_critic flagged as missing. Deliberately NOT added to the read-only
 * ResidentialListingForm.draftRecovery.repro.test.tsx lock (per the approved
 * plan's forbidden-files list).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateListing: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: mockListingData.current }),
  };
});

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({
    images: [],
    isLoading: false,
    fetchError: null,
    uploads: {},
    isUploading: false,
    imageCount: 0,
    canSubmit: false,
    remainingSlots: 10,
    maxImages: 10,
    uploadImage: vi.fn(),
    retryUpload: vi.fn(),
    retryFinalize: vi.fn(),
    dismissUpload: vi.fn(),
    deleteImage: vi.fn(),
    isDeleting: false,
    reorderImages: vi.fn(),
    isReordering: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/broker/residential/InlineNearby', () => ({
  InlineNearby: () => <div data-testid="mock-inline-nearby" />,
}));

import { ResidentialListingForm } from '../ResidentialListingForm';

function renderWithDraft(initialPropertyType: 'apartment' | 'residential_plot', draftId: string) {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType={initialPropertyType}
        initialDraftId={draftId}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

async function openMoreDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /more details.*ownership/i }));
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockListingData.current = undefined;
});

describe('ResidentialListingForm — AC12 draft rehydration of the relocated builtArea control', () => {
  it('apartment draft with builtArea + builtAreaUnit already saved: on INITIAL render, without expanding "More details", #builtArea holds the persisted value and the unit control shows the persisted unit', async () => {
    mockListingData.current = {
      id: 'draft-ac12-1',
      title: 'Existing Draft',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      price: 5000000,
      addressConfirmed: false,
      latitude: null,
      longitude: null,
      locality: 'Manipal',
      bedrooms: 2,
      builtArea: 1250,
      builtAreaUnit: 'sqft',
    };

    renderWithDraft('apartment', 'draft-ac12-1');

    // Sanity — hydration actually ran (title reflects the persisted draft).
    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Existing Draft'));

    // The load-bearing assertion: builtArea's persisted value shows up in its
    // NEW (Section 3) location, without ever clicking "More details".
    await waitFor(() => {
      const builtAreaInput = document.getElementById('builtArea') as HTMLInputElement;
      expect(builtAreaInput).not.toBeNull();
      expect(builtAreaInput.value).toBe('1250');
    });
    expect(screen.getByText('Sq Ft')).toBeInTheDocument();

    // "More details" was never opened for this assertion to hold.
    expect(screen.queryByText('Super built-up area (sqft)')).not.toBeInTheDocument();
  });

  it('that rehydrated builtArea value survives a persistDraft round-trip unchanged (rehydrate then save must not blank or alter it)', async () => {
    mockListingData.current = {
      id: 'draft-ac12-2',
      title: 'Existing Draft',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      price: 5000000,
      addressConfirmed: false,
      latitude: null,
      longitude: null,
      locality: 'Manipal',
      bedrooms: 2,
      builtArea: 1250,
      builtAreaUnit: 'sqft',
    };
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    const user = userEvent.setup();
    renderWithDraft('apartment', 'draft-ac12-2');

    await waitFor(() => {
      const builtAreaInput = document.getElementById('builtArea') as HTMLInputElement;
      expect(builtAreaInput.value).toBe('1250');
    });

    await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const body = mockUpdateMutate.mock.calls[0][0];
    expect(body.builtArea).toBe(1250);
    expect(body.builtAreaUnit).toBe('sqft');

    // Field state itself is untouched by the round-trip.
    expect((document.getElementById('builtArea') as HTMLInputElement).value).toBe('1250');
  });

  it('residential_plot draft fixture: landArea rehydrates correctly on the plot control, and NO builtArea control is rendered or populated', async () => {
    mockListingData.current = {
      id: 'draft-ac12-3',
      title: 'Existing Plot Draft',
      propertyType: 'residential_plot',
      listingPurpose: 'sale',
      price: 2000000,
      addressConfirmed: false,
      latitude: null,
      longitude: null,
      locality: 'Manipal',
      landArea: 8,
      landAreaUnit: 'cent',
    };

    renderWithDraft('residential_plot', 'draft-ac12-3');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Existing Plot Draft'));

    await waitFor(() => {
      const plotAreaInput = document.getElementById('plotArea') as HTMLInputElement;
      expect(plotAreaInput).not.toBeNull();
      expect(plotAreaInput.value).toBe('8');
    });

    expect(document.getElementById('builtArea')).toBeNull();
  });

  it('EXACTLY ONE #builtArea input exists in the DOM after expanding "More details" (apartment) — proves the field was MOVED, not duplicated', async () => {
    mockListingData.current = {
      id: 'draft-ac12-4',
      title: 'Existing Draft',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      price: 5000000,
      addressConfirmed: false,
      latitude: null,
      longitude: null,
      locality: 'Manipal',
      bedrooms: 2,
      builtArea: 1250,
      builtAreaUnit: 'sqft',
    };

    const user = userEvent.setup();
    renderWithDraft('apartment', 'draft-ac12-4');

    await waitFor(() => {
      expect((document.getElementById('builtArea') as HTMLInputElement).value).toBe('1250');
    });

    await openMoreDetails(user);

    expect(document.querySelectorAll('#builtArea')).toHaveLength(1);
    // The persisted value is still the one shown — no stale duplicate control
    // silently reset to blank/default.
    expect((document.getElementById('builtArea') as HTMLInputElement).value).toBe('1250');
  });
});
