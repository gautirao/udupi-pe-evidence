import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUploadImage = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => vi.fn());
const mockRetryUpload = vi.hoisted(() => vi.fn());
const mockRetryFinalize = vi.hoisted(() => vi.fn());
const mockDismissUpload = vi.hoisted(() => vi.fn());
// Mutable per-test upload progress map — tests set this before rendering to
// exercise the error / finalize_failed presentation (AC5).
const mockUploadsState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// useListingImages.ts is re-imported for real below (importOriginal) so the shared
// validateFileBatch/getFileSignature helpers stay the actual implementation. That
// pulls in its real top-level imports too, so stub them out here — neither is
// exercised by these tests since uploadImage itself is mocked.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } },
}));

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/useListingImages', async (importOriginal) => {
  // Only the `useListingImages` hook itself is mocked — validateFileBatch,
  // getFileSignature etc. must stay the REAL implementation, since ImageUploader
  // calls them directly for duplicate/overflow/format validation (issue #2041).
  const actual = (await importOriginal()) as typeof import('@/hooks/useListingImages');
  return {
    ...actual,
    useListingImages: () => ({
      images: [],
      isLoading: false,
      fetchError: null,
      uploads: mockUploadsState.current,
      isUploading: false,
      imageCount: 0,
      canSubmit: false,
      remainingSlots: 10,
      maxImages: 10,
      uploadImage: mockUploadImage,
      retryUpload: mockRetryUpload,
      retryFinalize: mockRetryFinalize,
      dismissUpload: mockDismissUpload,
      deleteImage: vi.fn(),
      isDeleting: false,
      reorderImages: vi.fn(),
      isReordering: false,
      refetch: vi.fn(),
    }),
  };
});

// Import after mocks
import { ImageUploader } from '../ImageUploader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderUploader() {
  return render(<ImageUploader listingId="listing-1" />);
}

function makeFile(name: string, sizeBytes: number, lastModified?: number): File {
  // File.size is read-only, so we create a Blob of the exact size and cast it.
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type: 'image/jpeg', ...(lastModified !== undefined ? { lastModified } : {}) });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadsState.current = {};
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

// Issue #2041 — duplicate identity + overflow feedback. Comprehensive AC1-AC8
// regression coverage is authored by the qa test-writing gate; these are a
// small smoke-level proof that the shared validateFileBatch helper is
// actually wired up through handleFiles (file picker + drag/drop both call it).
describe('ImageUploader — issue #2041 duplicate + overflow feedback', () => {
  it('AC1/AC2: blocks re-selecting the identical file but accepts two distinct files sharing a filename', async () => {
    renderUploader();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();

    const original = makeFile('photo.jpg', 100_000, 1_700_000_000_000);
    const sameSignature = makeFile('photo.jpg', 100_000, 1_700_000_000_000);
    const distinctFile = makeFile('photo.jpg', 250_000, 1_700_000_005_000); // same name, different size+lastModified

    await user.upload(input!, [original, sameSignature, distinctFile]);

    // Only the original and the genuinely-distinct file upload; the exact duplicate is blocked.
    expect(mockUploadImage).toHaveBeenCalledTimes(2);
    expect(mockUploadImage).toHaveBeenCalledWith(original);
    expect(mockUploadImage).toHaveBeenCalledWith(distinctFile);

    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('photo.jpg'),
      }),
    );
  });

  it('AC4: an overflow file beyond remaining slots is reported, not silently dropped', async () => {
    // Mock hook already fixes remainingSlots at 10; simulate the cap by uploading
    // 11 valid, distinct files in one batch — the 11th must be reported.
    renderUploader();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();

    const files = Array.from({ length: 11 }, (_, i) =>
      makeFile(`photo-${i}.jpg`, 50_000, 1_700_000_000_000 + i),
    );

    await user.upload(input!, files);

    expect(mockUploadImage).toHaveBeenCalledTimes(10);
    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('photo-10.jpg'),
      }),
    );
  });
});

// Issue #2041 AC5 — error vs finalize_failed must render distinct copy and
// wire the correct retry handler (retryUpload for a failed PUT, retryFinalize
// for a failed metadata registration after a successful storage upload).
describe('ImageUploader — issue #2041 AC5: distinct error copy + correct retry wiring', () => {
  it('renders distinct copy for error vs finalize_failed and wires retryUpload / retryFinalize to the correct entries', async () => {
    mockUploadsState.current = {
      'key-error': { fileName: 'err.jpg', progress: 0, status: 'error', error: 'PUT failed' },
      'key-finalize': { fileName: 'fin.jpg', progress: 0, status: 'finalize_failed', error: 'register failed' },
    };

    renderUploader();

    // Distinct, non-generic copy per status.
    expect(screen.getByText(/we couldn't upload this photo/i)).toBeInTheDocument();
    expect(screen.getByText(/photo uploaded, but saving it to the listing failed/i)).toBeInTheDocument();

    const retryButtons = screen.getAllByRole('button', { name: /retry/i });
    expect(retryButtons).toHaveLength(2);

    const user = userEvent.setup();

    // First row (object insertion order) is the 'error' entry -> retryUpload.
    await user.click(retryButtons[0]);
    expect(mockRetryUpload).toHaveBeenCalledWith('key-error');
    expect(mockRetryFinalize).not.toHaveBeenCalled();

    // Second row is the 'finalize_failed' entry -> retryFinalize.
    await user.click(retryButtons[1]);
    expect(mockRetryFinalize).toHaveBeenCalledWith('key-finalize');
    expect(mockRetryUpload).toHaveBeenCalledTimes(1); // unchanged by the second click
  });
});

// Issue #2041 AC8 — drag/drop and file-picker both route through handleFiles,
// so duplicate/overflow rules and the false-positive guard for unreliable
// lastModified must behave identically on both surfaces.
describe('ImageUploader — issue #2041 AC8: drag/drop parity with the file picker', () => {
  function getDropZone() {
    return screen.getByRole('button', { name: /drag & drop images here/i });
  }

  it('drag/drop applies the identical duplicate rule as the file picker', () => {
    renderUploader();

    const original = makeFile('dropped.jpg', 100_000, 1_700_000_000_000);
    const duplicate = makeFile('dropped.jpg', 100_000, 1_700_000_000_000); // identical signature

    fireEvent.drop(getDropZone(), { dataTransfer: { types: ['Files'], files: [original, duplicate] } });

    expect(mockUploadImage).toHaveBeenCalledTimes(1);
    expect(mockUploadImage).toHaveBeenCalledWith(original);
    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('dropped.jpg'),
      }),
    );
  });

  it('drag/drop applies the identical overflow rule as the file picker (11 files -> 10 accepted, 1 reported)', () => {
    renderUploader();

    const files = Array.from({ length: 11 }, (_, i) =>
      makeFile(`drop-${i}.jpg`, 50_000, 1_700_000_000_000 + i),
    );

    fireEvent.drop(getDropZone(), { dataTransfer: { types: ['Files'], files } });

    expect(mockUploadImage).toHaveBeenCalledTimes(10);
    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining('drop-10.jpg'),
      }),
    );
  });

  it('mobile-camera-style files with lastModified=0 (unreliable) are never falsely treated as duplicates via the file picker', async () => {
    renderUploader();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();

    const camA = makeFile('IMG_0001.jpg', 200_000, 0);
    const camB = makeFile('IMG_0001.jpg', 200_000, 0); // same name+size, both lastModified=0

    await user.upload(input!, [camA, camB]);

    expect(mockUploadImage).toHaveBeenCalledTimes(2);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('mobile-camera-style files with lastModified=undefined are never falsely treated as duplicates via drag/drop', () => {
    renderUploader();

    const camC = makeFile('IMG_0002.jpg', 200_000);
    Object.defineProperty(camC, 'lastModified', { value: undefined });
    const camD = makeFile('IMG_0002.jpg', 200_000);
    Object.defineProperty(camD, 'lastModified', { value: undefined });

    fireEvent.drop(getDropZone(), { dataTransfer: { types: ['Files'], files: [camC, camD] } });

    expect(mockUploadImage).toHaveBeenCalledTimes(2);
    expect(mockToast).not.toHaveBeenCalled();
  });
});

// Issue #2041 fix-cycle-2 Finding 2 — a file whose PREVIOUS attempt failed
// (status 'error' or 'finalize_failed') never successfully uploaded. Re-picking
// the identical file must be treated as a fresh attempt, never rejected as
// "already selected or already uploaded".
describe('ImageUploader — Finding 2: re-selecting a previously-failed file is not a false duplicate', () => {
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
    renderUploader();

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
    renderUploader();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const user = userEvent.setup();
    await user.upload(input!, failedFile);

    expect(mockUploadImage).toHaveBeenCalledWith(failedFile);
    expect(mockToast).not.toHaveBeenCalled();
  });
});

// Issue #2041 fix-cycle-2 Finding 1 (BLOCKING) — this is the regression test the
// reviewer required: exercising the REAL useToast/Toaster stack (not the mocked
// vi.fn() used everywhere else in this file), which is the only way to prove
// every rejected file's feedback actually reaches the DOM. use-toast.ts caps
// visible toasts at TOAST_LIMIT=1 and collapses the queue on every dispatch
// within the same synchronous handler, so calling toast() once per rejection
// (the original, reintroduced bug) would leave only the LAST rejection visible.
describe('ImageUploader — issue #2041 Finding 1: real toast stack shows every rejection', () => {
  it('renders every rejected file from a single batch via the real toast/Toaster stack, not just the last one', async () => {
    vi.resetModules();
    vi.doUnmock('@/hooks/use-toast');

    const { Toaster } = await import('@/components/ui/toaster');
    const { ImageUploader: RealImageUploader } = await import('../ImageUploader');

    const user = userEvent.setup();
    render(
      <>
        <RealImageUploader listingId="listing-1" />
        <Toaster />
      </>,
    );

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    // Two files that both get rejected in the SAME synchronous batch (same
    // duplicate signature) plus one that's accepted — proves multiple
    // rejections from one handler both reach the DOM despite TOAST_LIMIT=1.
    const original = makeFile('real-a.jpg', 50_000, 1_700_000_000_000);
    const duplicateOfA = makeFile('real-a.jpg', 50_000, 1_700_000_000_000);
    const tooBig = makeFile('real-big.jpg', 6 * 1024 * 1024);

    await user.upload(input!, [original, duplicateOfA, tooBig]);

    // Scope to the visible toast viewport (role="region", the Radix
    // ToastPrimitives.Viewport wrapper). Radix also portals a separate,
    // visually-hidden `role="status" aria-live` announcement region straight
    // to document.body for screen readers, which duplicates the same text
    // outside the viewport — querying unscoped can match both and throw a
    // "multiple elements" error depending on unrelated toast-singleton state
    // left over by other tests in the run. Scoping to the viewport ensures
    // this only ever asserts against the actual rendered toast, not the a11y
    // announcer, while still proving BOTH rejected files reach the real DOM —
    // not just whichever would have been dispatched last in a
    // per-rejection-call loop.
    const toastViewport = screen.getByRole('region', { name: /notifications/i });
    expect(await within(toastViewport).findByText(/real-a\.jpg/)).toBeInTheDocument();
    expect(within(toastViewport).getByText(/real-big\.jpg/)).toBeInTheDocument();

    // Restore the mock for any tests that run after this one in the file.
    vi.doMock('@/hooks/use-toast', () => ({
      useToast: () => ({ toast: mockToast }),
    }));
  });
});
