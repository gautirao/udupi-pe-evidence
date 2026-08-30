/**
 * ListingEditorDrawer — issue #2370.
 *
 * Coverage contract:
 *  - Validation: required title/property_type/locality block save, focus first error field
 *  - Publish/Unpublish gating: the visibility Switch is disabled unless status === 'LIVE'
 *  - #2369 boundary: Save on a PENDING_REVIEW listing never includes `status` in the update payload
 *  - Publish/unpublish toggle requires confirmation before mutating
 *  - Unsaved-changes: closing with a dirty form prompts to discard
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ListingEditorDrawer } from '../ListingEditorDrawer';
import type { AdminListingRow } from '@/hooks/useAdminData';

const mockMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockToast = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockPost = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@/hooks/usePropertyListings', () => ({
  useUpdateListing: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/lib/api', () => ({
  api: { get: mockGet, post: mockPost },
}));

vi.mock('@/hooks/useListingActivity', () => ({
  useListingActivity: () => ({ entries: [], isLoading: false, isError: false, windowMayBeIncomplete: false }),
}));

vi.mock('@/hooks/useAdminListingContact', () => ({
  useAdminListingContact: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock('@/components/broker/AddressPicker', () => ({
  AddressPicker: () => <div data-testid="address-picker-stub" />,
}));

function makeListing(overrides: Partial<AdminListingRow> = {}): AdminListingRow {
  return {
    id: 'listing-1',
    title: 'Nice villa',
    property_type: 'villa',
    locality: 'Manipal',
    latitude: 13.34,
    longitude: 74.74,
    price: 5000000,
    price_unit: 'INR',
    land_area: null,
    land_area_unit: null,
    built_area: null,
    built_area_unit: null,
    carpet_area: null,
    carpet_area_unit: null,
    super_built_area: null,
    super_built_area_unit: null,
    bedrooms: 3,
    bathrooms: 2,
    description: 'A lovely villa',
    seller_type: 'owner',
    status: 'LIVE',
    is_valid: true,
    is_duplicate: false,
    confidence_score: 90,
    quality_score: 85,
    quality_breakdown: null,
    quality_computed_at: null,
    listing_number: 101,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    raw_post_id: null,
    raw_posts: null,
    listing_purpose: 'sale',
    language_detected: null,
    price_per_cent_paise: null,
    updated_by: null,
    ...overrides,
  } as unknown as AdminListingRow;
}

function renderDrawer(listing: AdminListingRow, onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingEditorDrawer listing={listing} open onOpenChange={onOpenChange} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  mockMutateAsync.mockClear();
  mockToast.mockClear();
  mockGet.mockClear();
  mockPost.mockClear();
});

describe('ListingEditorDrawer — validation', () => {
  it('blocks save and shows an error summary when title is cleared', async () => {
    const user = userEvent.setup();
    renderDrawer(makeListing());

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    // Dirty the form (empty title differs from initial) so Save is enabled.
    await user.type(titleInput, 'x');
    await user.clear(titleInput);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

describe('ListingEditorDrawer — publish/unpublish LIVE-only gating', () => {
  it('enables the visibility switch for a LIVE listing', () => {
    renderDrawer(makeListing({ status: 'LIVE' }));
    const toggle = screen.getByRole('switch', { name: /toggle public visibility/i });
    expect(toggle).not.toBeDisabled();
  });

  it('disables the visibility switch for a non-LIVE listing', () => {
    renderDrawer(makeListing({ status: 'DRAFT', is_valid: false }));
    const toggle = screen.getByRole('switch', { name: /toggle public visibility/i });
    expect(toggle).toBeDisabled();
  });

  it('requires confirmation before the publish toggle actually mutates', async () => {
    const user = userEvent.setup();
    renderDrawer(makeListing({ status: 'LIVE', is_valid: true }));

    const toggle = screen.getByRole('switch', { name: /toggle public visibility/i });
    await user.click(toggle);

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText(/unpublish this listing/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'listing-1',
          updates: expect.objectContaining({ is_valid: false }),
        }),
      );
    });
  });
});

describe('ListingEditorDrawer — #2369 PENDING_REVIEW no-implicit-approval guard', () => {
  it('never includes `status` in the update payload when saving a PENDING_REVIEW listing', async () => {
    const user = userEvent.setup();
    renderDrawer(makeListing({ status: 'PENDING_REVIEW', is_valid: false }));

    expect(screen.getByText(/awaiting moderation/i)).toBeInTheDocument();

    const titleInput = screen.getByLabelText('Title');
    await user.type(titleInput, ' updated');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [[callArg]] = mockMutateAsync.mock.calls;
    expect(callArg.updates).not.toHaveProperty('status');
  });
});

describe('ListingEditorDrawer — publish-toggle race (code-reviewer delta finding #1)', () => {
  it('re-checks canTogglePublish at confirm-time and refuses to mutate if the listing left LIVE while the dialog was open', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const listing = makeListing({ status: 'LIVE', is_valid: true });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingEditorDrawer listing={listing} open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('switch', { name: /toggle public visibility/i }));
    expect(await screen.findByText(/unpublish this listing/i)).toBeInTheDocument();

    // Simulate a background refetch moving this listing off LIVE while the
    // confirm dialog is still open (e.g. it was archived from another tab).
    const staleListing = { ...listing, status: 'ARCHIVED' } as AdminListingRow;
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingEditorDrawer listing={staleListing} open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no longer available/i) }),
    );
  });
});

describe('ListingEditorDrawer — unresolvable deep-link (code-reviewer delta finding #3)', () => {
  it('shows a loading spinner while the dataset is still resolving', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingEditorDrawer listing={undefined} isResolvingListing open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/listing not found/i)).not.toBeInTheDocument();
  });

  it('shows a "Listing not found" state with a Close control once resolution finishes and the id is unresolvable', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ListingEditorDrawer
            listing={undefined}
            isResolvingListing={false}
            open
            onOpenChange={onOpenChange}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/listing not found/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close panel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false, { skipUnsavedCheck: true });
  });
});

describe('ListingEditorDrawer — unsaved changes', () => {
  it('prompts before closing when the form is dirty', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawer(makeListing(), onOpenChange);

    const titleInput = screen.getByLabelText('Title');
    await user.type(titleInput, ' updated');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByText(/discard unsaved changes/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes immediately when the form is not dirty', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawer(makeListing(), onOpenChange);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
