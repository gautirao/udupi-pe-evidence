/**
 * ResidentialListingForm — AC11 (issue #2040): moving apartment builtArea
 * from the collapsed "More details" section into core Section 3 must not
 * change buildPayload()'s actual request body. Asserted directly against
 * the body captured from the mocked useCreateListing `mutate` call — never
 * inferred from the rendered form, never re-implemented from buildPayload's
 * own source (a regression here would be silent data loss at submit, per
 * the approved plan's risk #3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockCreateMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useBrokerListings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBrokerListings')>();
  return {
    ...actual,
    useCreateListing: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateListing: () => ({ mutate: vi.fn(), isPending: false }),
    useSubmitListing: () => ({ mutate: vi.fn(), isPending: false }),
    useGetListing: () => ({ data: undefined }),
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

function renderForm(initialPropertyType: 'apartment' | 'house' | 'villa' | 'residential_plot') {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType={initialPropertyType}
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** Only price gates persistDraft's canSubmit — sufficient to trigger a save. */
async function fillPrice(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/price \(inr\)/i), '5000000');
}

async function clickSaveDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Save draft' })[0]);
}

beforeEach(() => {
  mockCreateMutate.mockReset();
});

describe('ResidentialListingForm — AC11 buildPayload parity (builtArea section-placement move)', () => {
  it('apartment with builtArea entered: request body includes builtArea + builtAreaUnit', async () => {
    const user = userEvent.setup();
    renderForm('apartment');
    await fillPrice(user);
    await user.type(document.getElementById('builtArea') as HTMLInputElement, '1200');
    await clickSaveDraft(user);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const body = mockCreateMutate.mock.calls[0][0];
    expect(body.builtArea).toBe(1200);
    expect(body.builtAreaUnit).toBe('sqft');
  });

  it('apartment with builtArea left empty: request body OMITS builtArea and builtAreaUnit (undefined, not null/0)', async () => {
    const user = userEvent.setup();
    renderForm('apartment');
    await fillPrice(user);
    await clickSaveDraft(user);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const body = mockCreateMutate.mock.calls[0][0];
    expect(body.builtArea).toBeUndefined();
    expect(body.builtAreaUnit).toBeUndefined();
    // Explicitly rule out the two dangerous near-misses.
    expect(body.builtArea).not.toBeNull();
    expect(body.builtArea).not.toBe(0);
  });

  it('house with builtArea entered: request body includes builtArea + builtAreaUnit', async () => {
    const user = userEvent.setup();
    renderForm('house');
    await fillPrice(user);
    await user.type(document.getElementById('builtArea') as HTMLInputElement, '1800');
    await clickSaveDraft(user);

    const body = mockCreateMutate.mock.calls[0][0];
    expect(body.builtArea).toBe(1800);
    expect(body.builtAreaUnit).toBe('sqft');
  });

  it('villa with builtArea entered: request body includes builtArea + builtAreaUnit', async () => {
    const user = userEvent.setup();
    renderForm('villa');
    await fillPrice(user);
    await user.type(document.getElementById('builtArea') as HTMLInputElement, '2400');
    await clickSaveDraft(user);

    const body = mockCreateMutate.mock.calls[0][0];
    expect(body.builtArea).toBe(2400);
    expect(body.builtAreaUnit).toBe('sqft');
  });

  it('residential_plot: request body omits builtArea/builtAreaUnit entirely, and still carries landArea + landAreaUnit', async () => {
    const user = userEvent.setup();
    renderForm('residential_plot');
    await fillPrice(user);
    await user.type(document.getElementById('plotArea') as HTMLInputElement, '5');
    await clickSaveDraft(user);

    const body = mockCreateMutate.mock.calls[0][0];
    expect(body.builtArea).toBeUndefined();
    expect(body.builtAreaUnit).toBeUndefined();
    expect(body.landArea).toBe(5);
    expect(body.landAreaUnit).toBe('cent');
  });
});
