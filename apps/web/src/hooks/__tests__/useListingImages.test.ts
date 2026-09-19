import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// ---------- Mocks ----------

const mockGetPublicUrl = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {},
    storage: {
      from: () => ({
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  },
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiDelete = vi.fn();
const mockApiPut = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  },
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock global fetch used for the PUT to the pre-signed URL
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
import { useListingImages, getFileSignature, validateFileBatch } from '@/hooks/useListingImages';
import { ApiError } from '@/lib/api';

// ---------- Helpers ----------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function fakeFile(name = 'photo.jpg', sizeKB = 100): File {
  const bytes = new Uint8Array(sizeKB * 1024);
  return new File([bytes], name, { type: 'image/jpeg' });
}

function fakeUploadUrlResponse(
  overrides?: Partial<{
    signedUrl: string;
    storagePath: string;
    expiresAt: string | null;
    requiredHeaders?: Record<string, string>;
  }>,
) {
  return {
    signedUrl:
      'https://storage.supabase.co/object/sign/listing-images/listings/user-1/listing-1/uuid.jpg?token=abc123',
    storagePath: 'listings/user-1/listing-1/uuid.jpg',
    expiresAt: null,
    requiredHeaders: { 'Content-Type': 'image/jpeg' },
    ...overrides,
  };
}

// ---------- Tests ----------

describe('useListingImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/file.jpg' } });
    // Default: successful PUT to pre-signed URL
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  // --- canSubmit gating ---

  describe('canSubmit gating', () => {
    it('returns canSubmit=false when fewer than 3 images', async () => {
      mockApiGet.mockResolvedValue([
        { id: '1', storagePath: 'a', url: 'u', position: 0 },
        { id: '2', storagePath: 'b', url: 'u', position: 1 },
      ]);

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.imageCount).toBe(2));
      expect(result.current.canSubmit).toBe(false);
    });

    it('returns canSubmit=true when 3 or more images', async () => {
      mockApiGet.mockResolvedValue([
        { id: '1', storagePath: 'a', url: 'u', position: 0 },
        { id: '2', storagePath: 'b', url: 'u', position: 1 },
        { id: '3', storagePath: 'c', url: 'u', position: 2 },
      ]);

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.imageCount).toBe(3));
      expect(result.current.canSubmit).toBe(true);
    });
  });

  // --- Happy path ---

  describe('happy path upload', () => {
    it('calls POST /upload-url, PUTs bytes to signedUrl with Content-Type only, then registers with server storagePath', async () => {
      mockApiGet.mockResolvedValue([]);
      const urlResp = fakeUploadUrlResponse();
      // First api.post = /upload-url, second = /images register
      mockApiPost.mockResolvedValueOnce(urlResp).mockResolvedValueOnce({ id: 'img-1' });

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const file = fakeFile();
      await act(async () => {
        await result.current.uploadImage(file);
      });

      // 1. upload-url was called with the right body
      expect(mockApiPost).toHaveBeenNthCalledWith(
        1,
        '/api/listings/listing-1/images/upload-url',
        expect.objectContaining({ contentType: 'image/jpeg' }),
      );

      // 2. fetch PUT was called with the signedUrl, correct Content-Type, NO Authorization header
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [putUrl, putInit] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(putUrl).toBe(urlResp.signedUrl);
      expect(putInit.method).toBe('PUT');
      expect(putInit.headers['Content-Type']).toBe('image/jpeg');
      expect((putInit.headers as Record<string, string>)['Authorization']).toBeUndefined();

      // 3. register was called with the SERVER-returned storagePath (not a client-built path)
      expect(mockApiPost).toHaveBeenNthCalledWith(
        2,
        '/api/listings/listing-1/images',
        expect.objectContaining({ storagePath: urlResp.storagePath }),
      );
    });

    it('handles expiresAt: null in upload-url response without crashing', async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost
        .mockResolvedValueOnce(fakeUploadUrlResponse({ expiresAt: null }))
        .mockResolvedValueOnce({ id: 'img-1' });

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Must not throw
      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // No error entries remain
      const errorEntry = Object.values(result.current.uploads).find(
        (u) => u.status === 'error' || u.status === 'finalize_failed',
      );
      expect(errorEntry).toBeUndefined();
    });
  });

  // --- Non-owner: upload-url returns 403 ---

  describe('upload-url 403 non-owner', () => {
    it('surfaces error, does not PUT to any signed URL, does not call register', async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost.mockRejectedValueOnce(new ApiError('Forbidden', 403, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // Error toast shown
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );

      // No PUT to any signed URL
      expect(mockFetch).not.toHaveBeenCalled();

      // Only the upload-url call was made; no register call
      expect(mockApiPost).toHaveBeenCalledTimes(1);

      // Upload entry in error state with file retained for retry
      const uploads = Object.values(result.current.uploads);
      expect(uploads).toHaveLength(1);
      expect(uploads[0].status).toBe('error');
      expect(uploads[0].file).toBeDefined();
    });
  });

  // --- Invalid type/size: upload-url returns 400 ---

  describe('upload-url 400 bad request', () => {
    it('surfaces error, no PUT, no register', async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost.mockRejectedValueOnce(new ApiError('Bad content type', 400, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockApiPost).toHaveBeenCalledTimes(1);

      const uploads = Object.values(result.current.uploads);
      expect(uploads[0].status).toBe('error');
    });
  });

  // --- Storage disabled: upload-url returns 503 ---

  describe('upload-url 503 storage disabled', () => {
    it('surfaces error gracefully, no PUT', async () => {
      mockApiGet.mockResolvedValue([]);
      mockApiPost.mockRejectedValueOnce(new ApiError('Storage unavailable', 503, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
      expect(mockFetch).not.toHaveBeenCalled();

      const uploads = Object.values(result.current.uploads);
      expect(uploads[0].status).toBe('error');
    });
  });

  // --- Retry upload flow ---

  describe('retryUpload', () => {
    it('retains file on upload-url failure and re-runs the full signed-URL flow on retry', async () => {
      mockApiGet.mockResolvedValue([]);

      // First attempt: upload-url fails
      mockApiPost.mockRejectedValueOnce(new ApiError('Service error', 503, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const file = fakeFile();
      await act(async () => {
        await result.current.uploadImage(file);
      });

      // Error entry with file retained
      const entries = Object.entries(result.current.uploads);
      expect(entries).toHaveLength(1);
      const [key, upload] = entries[0];
      expect(upload.status).toBe('error');
      expect(upload.file).toBeDefined();

      // Second attempt: everything succeeds
      mockApiPost
        .mockResolvedValueOnce(fakeUploadUrlResponse())
        .mockResolvedValueOnce({ id: 'img-1' });

      await act(async () => {
        result.current.retryUpload(key);
      });

      await waitFor(() => {
        const currentUploads = Object.values(result.current.uploads);
        return currentUploads.length === 0 || currentUploads.some((u) => u.status === 'done');
      });

      // fetch PUT was called exactly once (the retry)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --- Retry finalize flow ---

  describe('retryFinalize', () => {
    it('keeps server storagePath on metadata failure and retries only the metadata POST (no re-PUT)', async () => {
      mockApiGet.mockResolvedValue([]);

      const urlResp = fakeUploadUrlResponse();
      // upload-url succeeds, then register fails
      mockApiPost
        .mockResolvedValueOnce(urlResp)
        .mockRejectedValueOnce(new ApiError('Bad request', 400, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // finalize_failed entry with the SERVER-returned storagePath retained
      const entries = Object.entries(result.current.uploads);
      expect(entries).toHaveLength(1);
      const [key, upload] = entries[0];
      expect(upload.status).toBe('finalize_failed');
      expect(upload.storagePath).toBe(urlResp.storagePath);

      // Retry finalize: metadata succeeds this time
      mockApiPost.mockResolvedValueOnce({ id: 'img-1' });

      await act(async () => {
        await result.current.retryFinalize(key);
      });

      await waitFor(() => {
        const current = result.current.uploads[key];
        return !current || current.status === 'done';
      });

      // fetch PUT was NOT called again — only metadata retried
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // api.post calls: upload-url(1) + register-fail(2) + register-retry(3)
      expect(mockApiPost).toHaveBeenCalledTimes(3);
    });
  });

  // --- 409 idempotency ---

  describe('409 idempotency', () => {
    it('treats 409 on metadata POST as success and shows no destructive toast', async () => {
      mockApiGet.mockResolvedValue([]);

      mockApiPost
        .mockResolvedValueOnce(fakeUploadUrlResponse())
        .mockRejectedValueOnce(new ApiError('Conflict', 409, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // Treated as done
      const entries = Object.values(result.current.uploads);
      const doneOrEmpty = entries.length === 0 || entries.some((u) => u.status === 'done');
      expect(doneOrEmpty).toBe(true);

      // No destructive toast for 409
      const failToasts = mockToast.mock.calls.filter(
        (call) => call[0]?.variant === 'destructive',
      );
      expect(failToasts).toHaveLength(0);
    });
  });

  // --- dismissUpload ---

  describe('dismissUpload', () => {
    it('removes entry from uploads state', async () => {
      mockApiGet.mockResolvedValue([]);
      // upload-url fails → error entry
      mockApiPost.mockRejectedValueOnce(new ApiError('Forbidden', 403, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      const entries = Object.entries(result.current.uploads);
      expect(entries).toHaveLength(1);
      const [key] = entries[0];

      act(() => {
        result.current.dismissUpload(key);
      });

      expect(Object.keys(result.current.uploads)).toHaveLength(0);
    });
  });

  // --- Issue #2041: duplicate-identity signature reliability ---

  describe('getFileSignature — lastModified reliability', () => {
    it('returns a stable signature when lastModified is a reliable positive finite number', () => {
      const file = fakeFile('photo.jpg', 100);
      Object.defineProperty(file, 'lastModified', { value: 1_700_000_000_000 });
      expect(getFileSignature(file)).toBe('photo.jpg::102400::1700000000000');
    });

    it('returns null (non-comparable) when lastModified is 0 — never used as a false-duplicate signal', () => {
      const file = fakeFile('photo.jpg', 100);
      Object.defineProperty(file, 'lastModified', { value: 0 });
      expect(getFileSignature(file)).toBeNull();
    });

    it('returns null when lastModified is NaN', () => {
      const file = fakeFile('photo.jpg', 100);
      Object.defineProperty(file, 'lastModified', { value: NaN });
      expect(getFileSignature(file)).toBeNull();
    });
  });

  describe('validateFileBatch — AC1-AC4 helper contract', () => {
    it('AC1: rejects an exact re-selection (same name+size+lastModified) with a file-specific message', () => {
      const file = fakeFile('a.jpg', 50);
      Object.defineProperty(file, 'lastModified', { value: 1_700_000_000_000 });
      const dup = fakeFile('a.jpg', 50);
      Object.defineProperty(dup, 'lastModified', { value: 1_700_000_000_000 });

      const { accepted, rejections } = validateFileBatch([file, dup], 10);
      expect(accepted).toEqual([file]);
      expect(rejections).toHaveLength(1);
      expect(rejections[0].fileName).toBe('a.jpg');
      expect(rejections[0].message).toContain('a.jpg');
    });

    it('AC2: never rejects on filename alone — two files sharing a name but differing size are both accepted', () => {
      const fileA = fakeFile('same-name.jpg', 50);
      Object.defineProperty(fileA, 'lastModified', { value: 1_700_000_000_000 });
      const fileB = fakeFile('same-name.jpg', 90);
      Object.defineProperty(fileB, 'lastModified', { value: 1_700_000_000_001 });

      const { accepted, rejections } = validateFileBatch([fileA, fileB], 10);
      expect(accepted).toEqual([fileA, fileB]);
      expect(rejections).toHaveLength(0);
    });

    it('AC1 false-positive guard: two distinct files sharing name+size but with unreliable lastModified are NOT collapsed into a duplicate', () => {
      const fileA = fakeFile('img.jpg', 50);
      Object.defineProperty(fileA, 'lastModified', { value: 0 }); // unreliable — e.g. some mobile captures
      const fileB = fakeFile('img.jpg', 50);
      Object.defineProperty(fileB, 'lastModified', { value: 0 });

      const { accepted, rejections } = validateFileBatch([fileA, fileB], 10);
      // Uncertainty resolves to ACCEPT, never to a false duplicate rejection.
      expect(accepted).toEqual([fileA, fileB]);
      expect(rejections).toHaveLength(0);
    });

    it('AC4: remainingSlots=0 yields one overflow message per selected file, referencing the effective cap', () => {
      const fileA = fakeFile('a.jpg', 50);
      Object.defineProperty(fileA, 'lastModified', { value: 1_700_000_000_000 });
      const fileB = fakeFile('b.jpg', 50);
      Object.defineProperty(fileB, 'lastModified', { value: 1_700_000_000_001 });

      const { accepted, rejections } = validateFileBatch([fileA, fileB], 0);
      expect(accepted).toEqual([]);
      expect(rejections).toHaveLength(2);
      expect(rejections[0].fileName).toBe('a.jpg');
      expect(rejections[1].fileName).toBe('b.jpg');
      expect(rejections.every((r) => r.message.includes('0 more'))).toBe(true);
    });

    it('AC2 reinforcement: same name AND same size but different lastModified are still both accepted (never collapsed on name+size alone)', () => {
      const fileA = fakeFile('twin.jpg', 60);
      Object.defineProperty(fileA, 'lastModified', { value: 1_700_000_000_000 });
      const fileB = fakeFile('twin.jpg', 60);
      Object.defineProperty(fileB, 'lastModified', { value: 1_700_000_050_000 });

      const { accepted, rejections } = validateFileBatch([fileA, fileB], 10);
      expect(accepted).toEqual([fileA, fileB]);
      expect(rejections).toHaveLength(0);
    });

    it('False-positive guard: two distinct files sharing name+size with lastModified=undefined are never collapsed into a duplicate', () => {
      const fileA = fakeFile('mobile.jpg', 80);
      Object.defineProperty(fileA, 'lastModified', { value: undefined });
      const fileB = fakeFile('mobile.jpg', 80);
      Object.defineProperty(fileB, 'lastModified', { value: undefined });

      const { accepted, rejections } = validateFileBatch([fileA, fileB], 10);
      expect(accepted).toEqual([fileA, fileB]);
      expect(rejections).toHaveLength(0);
    });

    it('AC3: unsupported-type, oversized, duplicate, and overflow each produce their own distinct, file-specific message', () => {
      const badFormat = fakeFile('photo.heic', 50);
      Object.defineProperty(badFormat, 'lastModified', { value: 1_700_000_000_000 });

      const oversized = fakeFile('big.jpg', 6000); // > 5 MB
      Object.defineProperty(oversized, 'lastModified', { value: 1_700_000_000_001 });

      const ok1 = fakeFile('ok1.jpg', 50);
      Object.defineProperty(ok1, 'lastModified', { value: 1_700_000_000_002 });
      const ok2 = fakeFile('ok2.jpg', 50);
      Object.defineProperty(ok2, 'lastModified', { value: 1_700_000_000_003 });

      // Exact re-selection of ok1 within the same batch — duplicate.
      const dup = fakeFile('ok1.jpg', 50);
      Object.defineProperty(dup, 'lastModified', { value: 1_700_000_000_002 });

      // Cap is 2: ok1 + ok2 fill it, so this one is an overflow (not a duplicate, not format/size).
      const overflow = fakeFile('overflow.jpg', 50);
      Object.defineProperty(overflow, 'lastModified', { value: 1_700_000_000_004 });

      const { accepted, rejections } = validateFileBatch(
        [badFormat, oversized, ok1, ok2, dup, overflow],
        2,
      );

      expect(accepted).toEqual([ok1, ok2]);
      expect(rejections).toHaveLength(4);

      const [formatRej, sizeRej, dupRej, overflowRej] = rejections;

      expect(formatRej.fileName).toBe('photo.heic');
      expect(formatRej.message).toContain('"photo.heic"');
      expect(formatRej.message).toContain('HEIC is not supported');

      expect(sizeRej.fileName).toBe('big.jpg');
      expect(sizeRej.message).toContain('too large');

      expect(dupRej.fileName).toBe('ok1.jpg');
      expect(dupRej.message).toContain('already selected or already uploaded');

      expect(overflowRej.fileName).toBe('overflow.jpg');
      expect(overflowRej.message).toContain('more photo');

      // Every message is distinguishable from the others (no generic shared string).
      const messages = [formatRej.message, sizeRej.message, dupRej.message, overflowRej.message];
      expect(new Set(messages).size).toBe(4);
    });

    // Issue #2041 — blocked-format rejections must be file-specific (AC3) even
    // when multiple blocked formats appear together in ONE batch. Before this
    // fix, two HEIC files (or any mix of blocked formats) produced identical,
    // unnamed toast lines a broker could not tell apart.
    it('AC3: a mixed batch of every blocked format each identifies its own filename while keeping the original reason text, and valid files still proceed', () => {
      const heic = fakeFile('beach.heic', 50);
      Object.defineProperty(heic, 'lastModified', { value: 1_700_000_000_010 });
      const heif = fakeFile('sunset.heif', 50);
      Object.defineProperty(heif, 'lastModified', { value: 1_700_000_000_011 });
      const gif = fakeFile('banner.gif', 50);
      Object.defineProperty(gif, 'lastModified', { value: 1_700_000_000_012 });
      const tiff = fakeFile('scan.tiff', 50);
      Object.defineProperty(tiff, 'lastModified', { value: 1_700_000_000_013 });
      const tif = fakeFile('old.tif', 50);
      Object.defineProperty(tif, 'lastModified', { value: 1_700_000_000_014 });
      const validFile = fakeFile('front.jpg', 50);
      Object.defineProperty(validFile, 'lastModified', { value: 1_700_000_000_015 });

      const { accepted, rejections } = validateFileBatch(
        [heic, heif, gif, tiff, tif, validFile],
        10,
      );

      // Point 3: the valid file in the same batch is unaffected.
      expect(accepted).toEqual([validFile]);
      expect(rejections).toHaveLength(5);

      const [heicRej, heifRej, gifRej, tiffRej, tifRej] = rejections;

      // Point 1: each rejection names its own file.
      expect(heicRej.fileName).toBe('beach.heic');
      expect(heifRej.fileName).toBe('sunset.heif');
      expect(gifRej.fileName).toBe('banner.gif');
      expect(tiffRej.fileName).toBe('scan.tiff');
      expect(tifRej.fileName).toBe('old.tif');

      // Point 1 (message text): filename appears in the message itself, so a
      // broker reading two lines in one consolidated toast can tell them apart.
      expect(heicRej.message).toContain('"beach.heic"');
      expect(heifRej.message).toContain('"sunset.heif"');
      expect(gifRej.message).toContain('"banner.gif"');
      expect(tiffRej.message).toContain('"scan.tiff"');
      expect(tifRej.message).toContain('"old.tif"');

      // Point 2: the original reason text is preserved verbatim for each format.
      expect(heicRej.message).toContain('HEIC is not supported. Please convert to JPEG or PNG first.');
      expect(heifRej.message).toContain('HEIF is not supported. Please convert to JPEG or PNG first.');
      expect(gifRej.message).toContain('GIF is not supported. Please upload a JPG, PNG, or WebP instead.');
      expect(tiffRej.message).toContain('TIFF is not supported. Please upload a JPG, PNG, or WebP instead.');
      expect(tifRej.message).toContain('TIFF is not supported. Please upload a JPG, PNG, or WebP instead.');

      // No two rejection messages collapse into the same string.
      const messages = rejections.map((r) => r.message);
      expect(new Set(messages).size).toBe(5);
    });
  });

  // --- Issue #2041 AC6: finalize retry reuses the server storagePath ---
  // (Existing 409-idempotency + retryFinalize describe blocks above already
  // prove storagePath retention and no re-PUT; this extends around them with
  // an explicit assertion that the retried register call and the upload-url
  // call counts never duplicate.)
  describe('AC6: finalize retry never requests a new signed URL and reuses the same storagePath', () => {
    it('retryFinalize posts the identical storagePath and the upload-url endpoint is called exactly once total', async () => {
      mockApiGet.mockResolvedValue([]);
      const urlResp = fakeUploadUrlResponse({ storagePath: 'listings/user-1/listing-1/original.jpg' });
      mockApiPost
        .mockResolvedValueOnce(urlResp)
        .mockRejectedValueOnce(new ApiError('Bad request', 400, null));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      const [key] = Object.keys(result.current.uploads);

      mockApiPost.mockResolvedValueOnce({ id: 'img-1' });

      await act(async () => {
        await result.current.retryFinalize(key);
      });

      await waitFor(() => {
        const current = result.current.uploads[key];
        return !current || current.status === 'done';
      });

      const uploadUrlCalls = mockApiPost.mock.calls.filter(([url]) => String(url).includes('/upload-url'));
      expect(uploadUrlCalls).toHaveLength(1);

      const registerCalls = mockApiPost.mock.calls.filter(([url]) => String(url).endsWith('/images'));
      expect(registerCalls).toHaveLength(2); // initial failed register + retry
      expect(registerCalls[0][1]).toMatchObject({ storagePath: urlResp.storagePath });
      expect(registerCalls[1][1]).toMatchObject({ storagePath: urlResp.storagePath });

      // No new PUT to storage on the finalize-only retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --- Issue #2041 AC7: full lifecycle sequence ---
  describe('AC7: full lifecycle sequence — upload success, PUT failure, finalize failure, dismiss, retry-finalize, delete', () => {
    it('keeps imageCount, remainingSlots, canSubmit and the min-3 guidance correct at every step', async () => {
      const savedImages = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          id: `img-${i + 1}`,
          listingId: 'listing-1',
          storagePath: `p${i + 1}`,
          url: 'https://storage.example.com/u.jpg',
          position: i,
          createdAt: '2026-01-01',
        }));

      mockApiGet
        .mockResolvedValueOnce(savedImages(2)) // initial: 2 saved images
        .mockResolvedValueOnce(savedImages(3)) // after step-1 upload success
        .mockResolvedValueOnce(savedImages(4)) // after step-5 retryFinalize success
        .mockResolvedValueOnce(savedImages(3)); // after step-6 delete

      mockApiDelete.mockResolvedValue({});

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.imageCount).toBe(2));
      expect(result.current.imageCount).toBe(2);
      expect(result.current.remainingSlots).toBe(8);
      expect(result.current.canSubmit).toBe(false); // min-3 guidance: not yet met

      // Step 1: upload succeeds -> 3 images
      mockApiPost
        .mockResolvedValueOnce(fakeUploadUrlResponse({ storagePath: 'p3' }))
        .mockResolvedValueOnce({ id: 'img-3' });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await act(async () => {
        await result.current.uploadImage(fakeFile('a.jpg', 50));
      });

      await waitFor(() => expect(result.current.imageCount).toBe(3));
      expect(result.current.remainingSlots).toBe(7);
      expect(result.current.canSubmit).toBe(true); // min-3 guidance: now met

      // Step 2: another upload fails at PUT
      mockApiPost.mockResolvedValueOnce(fakeUploadUrlResponse({ storagePath: 'p-putfail' }));
      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      await act(async () => {
        await result.current.uploadImage(fakeFile('putfail.jpg', 50));
      });

      // Note: the step-1 'done' entry auto-clears after a real 2s setTimeout, which
      // has not elapsed yet at this point in the test, so it may still be present
      // alongside the new error entry — find by status rather than asserting a
      // total count that depends on that timer.
      let entries = Object.entries(result.current.uploads);
      const putFailFound = entries.find(([, u]) => u.status === 'error');
      expect(putFailFound).toBeDefined();
      const [putFailKey, putFailEntry] = putFailFound!;
      expect(putFailEntry.status).toBe('error');
      // Saved-image state is unaffected by an in-flight failure.
      expect(result.current.imageCount).toBe(3);
      expect(result.current.remainingSlots).toBe(7);
      expect(result.current.canSubmit).toBe(true);

      // Step 3: another upload fails at finalize (PUT ok, register rejects)
      mockApiPost
        .mockResolvedValueOnce(fakeUploadUrlResponse({ storagePath: 'p-finalizefail' }))
        .mockRejectedValueOnce(new ApiError('Bad request', 400, null));
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await act(async () => {
        await result.current.uploadImage(fakeFile('finalizefail.jpg', 50));
      });

      entries = Object.entries(result.current.uploads);
      const finalizeFailEntry = entries.find(([, u]) => u.status === 'finalize_failed');
      expect(finalizeFailEntry).toBeDefined();
      const [finalizeFailKey] = finalizeFailEntry!;
      expect(result.current.imageCount).toBe(3);
      expect(result.current.remainingSlots).toBe(7);
      expect(result.current.canSubmit).toBe(true);

      // Step 4: dismiss the PUT-failed entry
      act(() => {
        result.current.dismissUpload(putFailKey);
      });
      expect(result.current.uploads[putFailKey]).toBeUndefined();
      expect(result.current.uploads[finalizeFailKey]).toBeDefined();
      expect(result.current.imageCount).toBe(3);
      expect(result.current.canSubmit).toBe(true);

      // Step 5: retry the finalize -> succeeds -> 4 images
      mockApiPost.mockResolvedValueOnce({ id: 'img-4' });

      await act(async () => {
        await result.current.retryFinalize(finalizeFailKey);
      });

      await waitFor(() => expect(result.current.imageCount).toBe(4));
      expect(result.current.remainingSlots).toBe(6);
      expect(result.current.canSubmit).toBe(true);

      // Step 6: delete one image -> back to 3
      await act(async () => {
        result.current.deleteImage('img-1');
      });

      await waitFor(() => expect(result.current.imageCount).toBe(3));
      expect(result.current.remainingSlots).toBe(7);
      expect(result.current.canSubmit).toBe(true); // min-3 guidance: still met at exactly 3
    });
  });
});
