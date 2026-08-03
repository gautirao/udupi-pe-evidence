/**
 * ResidentialListingForm — AC5 (blocked-Review scroll+focus) and AC6
 * (honest sticky-footer copy) real assertions, issue #2040.
 *
 * The frontend-engineer's diff already implements these; this spec proves
 * it with executed assertions rather than a diff read-through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockUpdateMutate = vi.hoisted(() => vi.fn());
const mockListingData = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));
const mockImageCount = vi.hoisted(() => ({ current: 0 }));

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
    imageCount: mockImageCount.current,
    canSubmit: mockImageCount.current >= 3,
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

function renderFresh() {
  render(
    <MemoryRouter>
      <ResidentialListingForm
        initialPropertyType="apartment"
        onSwitchToGenericFlow={vi.fn()}
        navigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUpdateMutate.mockReset();
  mockListingData.current = undefined;
  mockImageCount.current = 0;
});

describe('ResidentialListingForm — AC5 blocked-Review scroll+focus (issue #2040)', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;
  });

  afterEach(() => {
    delete HTMLElement.prototype.scrollIntoView;
  });

  it('with an existing draft and builtArea empty: Review does NOT enter review mode, focuses #builtArea, calls scrollIntoView, and still persists (no data loss)', async () => {
    mockListingData.current = {
      id: 'draft-5',
      title: 'Test listing',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      price: 5000000,
      addressConfirmed: true,
      latitude: 13.34,
      longitude: 74.74,
      locality: 'Manipal',
      bedrooms: 2,
      // builtArea intentionally omitted — the one and only unmet gate.
    };
    mockImageCount.current = 3;
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    const user = userEvent.setup();
    renderWithDraft('draft-5');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Test listing'));

    await user.click(screen.getByRole('button', { name: 'Review' }));

    // Data-loss guard: the save still happens exactly once (persist-then-block shape).
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));

    // Navigation into review mode is BLOCKED.
    expect(screen.queryByText('Review your listing')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Listing title *')).toBeInTheDocument();

    // Focus + scroll land on the unmet gate's mapped control.
    await waitFor(() => expect(document.activeElement?.id).toBe('builtArea'));
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });

  it('with an existing draft and bedrooms empty (builtArea filled): Review does NOT enter review mode and focuses an actual focusable control inside the #bedrooms group, not document.body', async () => {
    // Regression for code-reviewer finding (cycle 5): #bedrooms resolves to
    // the SingleChipGroup's ToggleGroup root — a plain role="group" div with
    // no tabIndex — so a naive target.focus() is a silent no-op and
    // document.activeElement never leaves document.body, even though
    // scrollIntoView still fires and makes the no-op easy to miss.
    mockListingData.current = {
      id: 'draft-7',
      title: 'Test listing',
      propertyType: 'apartment',
      listingPurpose: 'sale',
      price: 5000000,
      addressConfirmed: true,
      latitude: 13.34,
      longitude: 74.74,
      locality: 'Manipal',
      builtArea: 1200,
      builtAreaUnit: 'sqft',
      // bedrooms intentionally omitted — the one and only unmet gate.
    };
    mockImageCount.current = 3;
    mockUpdateMutate.mockImplementation((_payload: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());

    const user = userEvent.setup();
    renderWithDraft('draft-7');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Test listing'));

    await user.click(screen.getByRole('button', { name: 'Review' }));

    // Data-loss guard: the save still happens exactly once (persist-then-block shape).
    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1));

    // Navigation into review mode is BLOCKED.
    expect(screen.queryByText('Review your listing')).not.toBeInTheDocument();

    const bedroomsGroup = document.getElementById('bedrooms');
    expect(bedroomsGroup).not.toBeNull();

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).not.toBeNull();
      expect(bedroomsGroup?.contains(document.activeElement)).toBe(true);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalled();
  });
});

describe('ResidentialListingForm — AC6 sticky-footer honesty (issue #2040)', () => {
  it('never renders "Good listing" while a real submit gate is unmet, even once price (canSubmit) is satisfied', async () => {
    const user = userEvent.setup();
    renderFresh();

    await user.type(screen.getByLabelText(/price \(inr\)/i), '5000000');

    expect(screen.queryByText(/Good listing/)).not.toBeInTheDocument();
    expect(screen.getByText(/left before you can submit/)).toBeInTheDocument();
  });

  it('renders "Good listing" once every real submit gate is met', async () => {
    mockListingData.current = {
      id: 'draft-6',
      title: 'Complete listing',
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
    mockImageCount.current = 3;
    renderWithDraft('draft-6');

    await waitFor(() => expect(screen.getByLabelText('Listing title *')).toHaveValue('Complete listing'));
    expect(await screen.findByText(/Good listing/)).toBeInTheDocument();
  });
});
