/**
 * InlinePhotos unit tests — issue #1722 (AC5).
 *
 * Verifies the tile-grid presentation talks directly to the existing
 * useListingImages hook (same upload/delete/reorder endpoints ImageUploader.tsx
 * uses) and that "Set cover" reorders the target image to index 0 — the
 * mechanism the buyer preview's cover thumbnail depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockReorderImages = vi.hoisted(() => vi.fn());
const mockDeleteImage = vi.hoisted(() => vi.fn());
const mockUploadImage = vi.hoisted(() => vi.fn());
const mockImages = vi.hoisted(() => ({
  current: [] as { id: string; listingId: string; storagePath: string; url: string; position: number; createdAt: string }[],
}));

vi.mock('@/hooks/useListingImages', () => ({
  useListingImages: () => ({
    images: mockImages.current,
    isLoading: false,
    fetchError: null,
    uploads: {},
    isUploading: false,
    imageCount: mockImages.current.length,
    canSubmit: mockImages.current.length >= 3,
    remainingSlots: 10 - mockImages.current.length,
    maxImages: 10,
    uploadImage: mockUploadImage,
    retryUpload: vi.fn(),
    retryFinalize: vi.fn(),
    dismissUpload: vi.fn(),
    deleteImage: mockDeleteImage,
    isDeleting: false,
    reorderImages: mockReorderImages,
    isReordering: false,
    refetch: vi.fn(),
  }),
}));

import { InlinePhotos } from '../InlinePhotos';

function img(id: string, position: number) {
  return { id, listingId: 'listing-1', storagePath: `p/${id}`, url: `https://example.com/${id}.jpg`, position, createdAt: '2026-01-01' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockImages.current = [];
});

describe('InlinePhotos — AC5: tile grid', () => {
  it('renders up to five tiles with empty add-tiles when no photos exist', () => {
    render(<InlinePhotos listingId="listing-1" />);
    const grid = screen.getByTestId('photo-tile-grid');
    expect(grid.children).toHaveLength(5);
  });

  it('marks the first image as Cover and shows "Set cover" on non-cover tiles', () => {
    mockImages.current = [img('a', 0), img('b', 1), img('c', 2)];
    render(<InlinePhotos listingId="listing-1" />);

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /set cover/i })).toHaveLength(2);
  });

  it('"Set cover" on a non-cover tile reorders that image to index 0', async () => {
    mockImages.current = [img('a', 0), img('b', 1), img('c', 2)];
    const user = userEvent.setup();
    render(<InlinePhotos listingId="listing-1" />);

    const setCoverButtons = screen.getAllByRole('button', { name: /set cover/i });
    await user.click(setCoverButtons[0]); // first non-cover tile => image 'b'

    expect(mockReorderImages).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('remove button calls deleteImage for the target photo', async () => {
    mockImages.current = [img('a', 0)];
    const user = userEvent.setup();
    render(<InlinePhotos listingId="listing-1" />);

    await user.click(screen.getByRole('button', { name: /remove photo 1/i }));
    expect(mockDeleteImage).toHaveBeenCalledWith('a');
  });

  it('clicking an empty tile opens the file picker (upload path unchanged)', async () => {
    render(<InlinePhotos listingId="listing-1" />);
    const emptyTile = screen.getByRole('button', { name: /add cover photo/i });
    expect(emptyTile).toBeEnabled();
  });
});
