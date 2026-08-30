/**
 * ResidentialListingForm — issue #2039 (revision 4, finding 2): a FAILED
 * update (PUT) of an EXISTING draft must surface a persistent, actionable
 * `draftSaveError` banner (not just a toast), and a successful Retry must
 * clear it. #2387 review follow-up: this exact state transition — existing
 * draft, update fails, banner appears, Retry succeeds, banner clears — had
 * no dedicated executed-assertion test before this file (the logic itself
 * is a byte-for-byte unmodified move into useResidentialListingDraft.ts).
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

function renderWithDraft(draftId: string) {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType="apartment"
        initialDraftId={draftId}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockListingData.current = {
    id: 'draft-retry-1',
    title: 'Test listing',
    propertyType: 'apartment',
    listingPurpose: 'sale',
    price: 5000000,
    addressConfirmed: true,
    latitude: 13.34,
    longitude: 74.74,
    locality: 'Manipal',
    bedrooms: 2,
    builtArea: 1200,
    builtAreaUnit: 'sqft',
  };
});

describe('ResidentialListingForm — failed-save persistent banner + successful retry (issue #2039, revision 4, finding 2)', () => {
  it('a failed update shows the persistent draftSaveError banner with the server message, and a successful Retry clears it', async () => {
    mockUpdateMutate.mockImplementationOnce(
      (_payload: unknown, opts?: { onError?: (e: Error) => void }) => {
        opts?.onError?.(new Error('Could not reach the server'));
      },
    );

    const user = userEvent.setup();
    renderWithDraft('draft-retry-1');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Test listing'));

    // "Save draft" on an existing draft (listingId already set) always routes
    // to the update branch, never create.
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    const banner = await screen.findByTestId('draft-save-error');
    expect(banner).toHaveTextContent('Could not reach the server');
    expect(banner).toHaveTextContent('draft-retry-1');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    // The form must NOT be locked during an update failure — only initial
    // draft recovery disables it.
    expect(screen.getByLabelText('Listing title *')).not.toBeDisabled();

    // A successful retry clears the banner.
    mockUpdateMutate.mockImplementationOnce(
      (_payload: unknown, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.queryByTestId('draft-save-error')).not.toBeInTheDocument());
    expect(mockUpdateMutate).toHaveBeenCalledTimes(2);
  });

  it('"Continue editing" dismisses the banner without retrying', async () => {
    mockUpdateMutate.mockImplementationOnce(
      (_payload: unknown, opts?: { onError?: (e: Error) => void }) => {
        opts?.onError?.(new Error('Server unavailable'));
      },
    );

    const user = userEvent.setup();
    renderWithDraft('draft-retry-1');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Test listing'));
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await screen.findByTestId('draft-save-error');

    await user.click(screen.getByRole('button', { name: /continue editing/i }));

    expect(screen.queryByTestId('draft-save-error')).not.toBeInTheDocument();
    // Dismissing must not itself trigger another update call.
    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
  });
});
