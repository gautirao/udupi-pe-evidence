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
import { useListingImages } from '@/hooks/useListingImages';
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
  overrides?: Partial<{ signedUrl: string; storagePath: string; expiresAt: string | null }>,
) {
  return {
    signedUrl:
      'https://storage.supabase.co/object/sign/listing-images/listings/user-1/listing-1/uuid.jpg?token=abc123',
    storagePath: 'listings/user-1/listing-1/uuid.jpg',
    expiresAt: null,
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

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.canSubmit).toBe(false);
      expect(result.current.imageCount).toBe(2);
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

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.canSubmit).toBe(true);
      expect(result.current.imageCount).toBe(3);
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
      expect(upload.url).toBeDefined();

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
});
