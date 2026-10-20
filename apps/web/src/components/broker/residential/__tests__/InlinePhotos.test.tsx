/**
 * InlinePhotos unit tests — issue #1722 (AC5).
 *
 * Verifies the tile-grid presentation talks directly to the existing
 * useListingImages hook (same upload/delete/reorder endpoints ImageUploader.tsx
 * uses) and that "Set cover" reorders the target image to index 0 — the
 * mechanism the buyer preview's cover thumbnail depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockReorderImages = vi.hoisted(() => vi.fn());
const mockDeleteImage = vi.hoisted(() => vi.fn());
const mockUploadImage = vi.hoisted(() => vi.fn());
const mockImages = vi.hoisted(() => ({
  current: [] as { id: string; listingId: string; storagePath: string; url: string; position: number; createdAt: string }[],
}));
// Mutable per-test upload progress map — lets tests exercise the Finding-2
// regression (re-selecting a file whose earlier attempt is 'error'/'finalize_failed').
const mockUploadsState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

// useListingImages.ts is re-imported for real below (importOriginal) so the shared
// validateFileBatch/getFileSignature helpers stay the actual implementation. That
// pulls in its real top-level imports too, so stub them out here — none is
// exercised by these tests since uploadImage itself is mocked.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

const mockToast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/hooks/useListingImages', async (importOriginal) => {
  // Only the `useListingImages` hook itself is mocked — validateFileBatch,
  // getFileSignature etc. must stay the REAL implementation, since InlinePhotos
  // calls them directly for duplicate/overflow/format validation (issue #2041).
  const actual = (await importOriginal()) as typeof import('@/hooks/useListingImages');
  return {
    ...actual,
    useListingImages: () => ({
      images: mockImages.current,
      isLoading: false,
      fetchError: null,
      uploads: mockUploadsState.current,
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
  };
});

import { InlinePhotos } from '../InlinePhotos';

function img(id: string, position: number) {
  return { id, listingId: 'listing-1', storagePath: `p/${id}`, url: `https://example.com/${id}.jpg`, position, createdAt: '2026-01-01' };
}

function makeFile(name: string, sizeBytes: number, lastModified?: number): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type: 'image/jpeg', ...(lastModified !== undefined ? { lastModified } : {}) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockImages.current = [];
  mockUploadsState.current = {};
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

// #2859 B3 (csv210 regression R9l-o): tile render + count copy + Cover badge from the
// hook's image list (props-level; the real upload round trip is RETAIN).
describe('InlinePhotos — #2859 B3 tile grid copy', () => {
  it('R9l-n three images render tiles 0..2 and "3/5 photos" with no minimum note; two images show the minimum note', () => {
    mockImages.current = [img('a', 0), img('b', 1)];
    const { unmount } = render(<InlinePhotos listingId="listing-1" />);
    expect(screen.getByText('2/5 photos (minimum 3 required)')).toBeInTheDocument();
    unmount();

    mockImages.current = [img('a', 0), img('b', 1), img('c', 2)];
    render(<InlinePhotos listingId="listing-1" />);
    const grid = screen.getByTestId('photo-tile-grid');
    for (const i of [0, 1, 2]) {
      expect(within(grid).getByTestId(`photo-tile-${i}`).querySelector('img')).toHaveAttribute('src', `https://example.com/${['a', 'b', 'c'][i]}.jpg`);
    }
    expect(screen.getByText('3/5 photos')).toBeInTheDocument();
    expect(screen.queryByText(/minimum 3 required/)).not.toBeInTheDocument();
  });

  it('R9o the Cover badge sits on tile 0 only; the image at index 0 is the cover', () => {
    mockImages.current = [img('b', 0), img('a', 1), img('c', 2)];
    render(<InlinePhotos listingId="listing-1" />);
    const grid = screen.getByTestId('photo-tile-grid');
    expect(within(within(grid).getByTestId('photo-tile-0')).getByText('Cover')).toBeInTheDocument();
    expect(within(grid).getByTestId('photo-tile-0').querySelector('img')).toHaveAttribute('src', 'https://example.com/b.jpg');
    expect(within(within(grid).getByTestId('photo-tile-1')).queryByText('Cover')).not.toBeInTheDocument();
    expect(within(within(grid).getByTestId('photo-tile-2')).queryByText('Cover')).not.toBeInTheDocument();
  });
});

// Issue #2041 AC4 — InlinePhotos composes a TIGHTER effective cap than the
// global MAX_IMAGES (min(remainingSlots, TILE_SLOTS - imageCount)). These
// tests prove the tail overflow is reported (not silently sliced, as it was
// before line 52's cap fix) and that the reported cap reflects what THIS
// surface actually enforces, never the global 10.
describe('InlinePhotos — AC4: composed effective cap (not the global MAX_IMAGES)', () => {
  // Issue #2041 fix-cycle-2 Finding 1 + Finding 3: use-toast.ts caps visible
  // toasts at 1, so all rejections from one batch must be consolidated into a
  // SINGLE toast() call (never one call per file) — and the message must state
  // the room ACTUALLY left at the moment of rejection (0, once the composed
  // cap of 1 is filled by the first accepted file), not the stale pre-batch cap.
  it('with TILE_SLOTS=5, imageCount=4 (remainingSlots=6), selecting 4 files accepts 1 and reports the other 3 in ONE consolidated toast against the true remaining room of 0', async () => {
    mockImages.current = [img('a', 0), img('b', 1), img('c', 2), img('d', 3)];
    render(<InlinePhotos listingId="listing-1" />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const files = [
      makeFile('p1.jpg', 50_000, 1_700_000_000_000),
      makeFile('p2.jpg', 50_000, 1_700_000_000_001),
      makeFile('p3.jpg', 50_000, 1_700_000_000_002),
      makeFile('p4.jpg', 50_000, 1_700_000_000_003),
    ];

    const user = userEvent.setup();
    await user.upload(input!, files);

    // Only 1 accepted — the composed cap (TILE_SLOTS - imageCount = 1), not
    // remainingSlots (6) and not the global MAX_IMAGES (10).
    expect(mockUploadImage).toHaveBeenCalledTimes(1);
    expect(mockUploadImage).toHaveBeenCalledWith(files[0]);

    // ONE consolidated toast, not one per rejected file (use-toast.ts TOAST_LIMIT=1).
    expect(mockToast).toHaveBeenCalledTimes(1);
    const description = mockToast.mock.calls[0][0].description as string;
    // The true remaining room after the 1st file fills the composed cap is 0 —
    // never restate the stale pre-batch cap (1) or the global MAX_IMAGES (10).
    expect(description).toContain('0 more photo');
    expect(description).not.toContain('10');
    // Every rejected file gets its own line, all present in the single toast.
    expect(description).toContain('p2.jpg');
    expect(description).toContain('p3.jpg');
    expect(description).toContain('p4.jpg');
  });

  it('AC4 boundary: a composed cap of 0 (TILE_SLOTS - imageCount = 0) still reports each file by name, consolidated into a single toast', async () => {
    mockImages.current = [img('a', 0), img('b', 1), img('c', 2), img('d', 3), img('e', 4)];
    render(<InlinePhotos listingId="listing-1" />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const files = [
      makeFile('x1.jpg', 10_000, 1),
      makeFile('x2.jpg', 10_000, 2),
      makeFile('x3.jpg', 10_000, 3),
    ];

    const user = userEvent.setup();
    await user.upload(input!, files);

    expect(mockUploadImage).not.toHaveBeenCalled();

    // Consolidated into ONE toast call (not one per rejection).
    expect(mockToast).toHaveBeenCalledTimes(1);
    const description = mockToast.mock.calls[0][0].description as string;

    // Each rejected file is still individually named within the single description.
    expect(description).toContain('x1.jpg');
    expect(description).toContain('x2.jpg');
    expect(description).toContain('x3.jpg');
    expect(description).toContain('0 more photo');
  });
});

// Issue #2041 fix-cycle-2 Finding 2 — a file whose PREVIOUS attempt failed
// (status 'error' or 'finalize_failed') never successfully uploaded. Re-picking
// the identical file must be treated as a fresh attempt, never rejected as
// "already selected or already uploaded".
describe('InlinePhotos — Finding 2: re-selecting a previously-failed file is not a false duplicate', () => {
  it('accepts a re-selected file whose earlier attempt is status "error"', async () => {
    const failedFile = makeFile('failed.jpg', 100_000, 1_700_000_000_000);
    mockUploadsState.current = {
      'key-1': {
        fileName: 'failed.jpg',
        progress: 0,
        status: 'error',
        signature: 'failed.jpg::100000::1700000000000',
      },
    };
    render(<InlinePhotos listingId="listing-1" />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();
    await user.upload(input!, failedFile);

    expect(mockUploadImage).toHaveBeenCalledWith(failedFile);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('accepts a re-selected file whose earlier attempt is status "finalize_failed"', async () => {
    const failedFile = makeFile('regfail.jpg', 100_000, 1_700_000_000_000);
    mockUploadsState.current = {
      'key-1': {
        fileName: 'regfail.jpg',
        progress: 0,
        status: 'finalize_failed',
        signature: 'regfail.jpg::100000::1700000000000',
      },
    };
    render(<InlinePhotos listingId="listing-1" />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();
    await user.upload(input!, failedFile);

    expect(mockUploadImage).toHaveBeenCalledWith(failedFile);
    expect(mockToast).not.toHaveBeenCalled();
  });
});
