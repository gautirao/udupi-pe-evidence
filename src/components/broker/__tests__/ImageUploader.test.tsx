import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUploadImage = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

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
    uploadImage: mockUploadImage,
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

// Import after mocks
import { ImageUploader } from '../ImageUploader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderUploader() {
  return render(<ImageUploader listingId="listing-1" />);
}

function makeFile(name: string, sizeBytes: number): File {
  // File.size is read-only, so we create a Blob of the exact size and cast it.
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type: 'image/jpeg' });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageUploader — 5 MB file size validation', () => {
  it('does not call uploadImage and shows a toast error for a file exceeding 5 MB', async () => {
    renderUploader();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const oversizedFile = makeFile('big-photo.jpg', 5 * 1024 * 1024 + 1);

    const user = userEvent.setup();
    await user.upload(input!, oversizedFile);

    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('big-photo.jpg'),
      }),
    );
  });

  it('calls uploadImage for a file at exactly 5 MB (boundary — valid)', async () => {
    renderUploader();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const exactFile = makeFile('exact-size.jpg', 5 * 1024 * 1024);

    const user = userEvent.setup();
    await user.upload(input!, exactFile);

    expect(mockUploadImage).toHaveBeenCalledOnce();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('filters oversized files out while uploading valid ones in a mixed batch', async () => {
    renderUploader();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const validFile = makeFile('small.jpg', 1 * 1024 * 1024);
    const tooBig = makeFile('too-big.jpg', 6 * 1024 * 1024);

    const user = userEvent.setup();
    await user.upload(input!, [validFile, tooBig]);

    // Only the valid file proceeds
    expect(mockUploadImage).toHaveBeenCalledOnce();
    expect(mockUploadImage).toHaveBeenCalledWith(validFile);

    // One toast for the oversized file
    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('too-big.jpg'),
      }),
    );
  });
});
