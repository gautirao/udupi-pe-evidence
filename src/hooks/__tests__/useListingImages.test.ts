import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// ---------- Mocks ----------

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        remove: vi.fn().mockResolvedValue({ error: null }),
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

function fakeSession(userId = 'user-1') {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: userId }, access_token: 'tok' } },
  });
}

function fakeFile(name = 'photo.jpg', sizeKB = 100): File {
  const bytes = new Uint8Array(sizeKB * 1024);
  return new File([bytes], name, { type: 'image/jpeg' });
}

// ---------- Tests ----------

describe('useListingImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/file.jpg' } });
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

  // --- Retry upload flow ---

  describe('retryUpload', () => {
    it('retains file on storage failure and retries full upload', async () => {
      mockApiGet.mockResolvedValue([]);
      fakeSession();

      // First attempt: storage fails
      mockUpload.mockResolvedValueOnce({ error: { message: 'Network error' } });

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const file = fakeFile();

      await act(async () => {
        await result.current.uploadImage(file);
      });

      // Should have an error entry with file retained
      const entries = Object.entries(result.current.uploads);
      expect(entries).toHaveLength(1);
      const [key, upload] = entries[0];
      expect(upload.status).toBe('error');
      expect(upload.file).toBeDefined();

      // Second attempt: storage succeeds + metadata succeeds
      mockUpload.mockResolvedValueOnce({ error: null });
      mockApiPost.mockResolvedValueOnce({ id: 'img-1' });

      await act(async () => {
        result.current.retryUpload(key);
      });

      // Old error entry removed, new upload started
      await waitFor(() => {
        const currentUploads = Object.values(result.current.uploads);
        return currentUploads.length === 0 || currentUploads.some((u) => u.status === 'done');
      });
    });
  });

  // --- Retry finalize flow ---

  describe('retryFinalize', () => {
    it('keeps storagePath/url on metadata failure and retries only metadata POST', async () => {
      mockApiGet.mockResolvedValue([]);
      fakeSession();

      // Storage succeeds
      mockUpload.mockResolvedValueOnce({ error: null });
      // Metadata fails with 400
      mockApiPost.mockRejectedValueOnce(new ApiError('Bad request', 400));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // Should have finalize_failed entry with storagePath and url
      const entries = Object.entries(result.current.uploads);
      expect(entries).toHaveLength(1);
      const [key, upload] = entries[0];
      expect(upload.status).toBe('finalize_failed');
      expect(upload.storagePath).toBeDefined();
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

      // Storage upload should NOT have been called again (only metadata retried)
      expect(mockUpload).toHaveBeenCalledTimes(1);
      // Metadata POST called twice: initial failure + retry
      expect(mockApiPost).toHaveBeenCalledTimes(2);
    });
  });

  // --- 409 idempotency ---

  describe('409 idempotency', () => {
    it('treats 409 on metadata POST as success', async () => {
      mockApiGet.mockResolvedValue([]);
      fakeSession();

      mockUpload.mockResolvedValueOnce({ error: null });
      mockApiPost.mockRejectedValueOnce(new ApiError('Conflict', 409));

      const { result } = renderHook(() => useListingImages('listing-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.uploadImage(fakeFile());
      });

      // Should be treated as done, not error
      const entries = Object.values(result.current.uploads);
      const doneOrEmpty = entries.length === 0 || entries.some((u) => u.status === 'done');
      expect(doneOrEmpty).toBe(true);

      // No toast with "failed" for 409
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
      fakeSession();
      mockUpload.mockResolvedValueOnce({ error: { message: 'fail' } });

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
