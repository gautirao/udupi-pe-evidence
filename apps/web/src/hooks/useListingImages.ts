import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGES = 10;
const COMPRESSION_THRESHOLD = 200 * 1024; // 200 KB — skip compression for small files
const COMPRESSION_MAX_SIZE_MB = 1; // target ≤ 1 MB after compression

export interface ListingImage {
  id: string;
  listingId: string;
  storagePath: string;
  url: string;
  position: number;
  createdAt: string;
}

export interface UploadProgress {
  fileName: string;
  progress: number; // 0-100
  status: 'compressing' | 'uploading' | 'registering' | 'done' | 'error' | 'finalize_failed';
  error?: string;
  file?: File;          // retained for retryUpload
  storagePath?: string; // retained for retryFinalize
  url?: string;         // retained for retryFinalize
  /** Original size in bytes (set when compression ran). */
  originalSize?: number;
  /** Compressed size in bytes (set when compression ran). */
  compressedSize?: number;
  /**
   * Composite identity signature of the ORIGINAL selected File (see
   * getFileSignature). Carried through every status transition so duplicate
   * detection can recognise "already selected / in-flight / uploaded this
   * session" without holding onto the File object itself.
   */
  signature?: string;
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

const BLOCKED_FORMAT_HINTS: Record<string, string> = {
  heic: 'HEIC is not supported. Please convert to JPEG or PNG first.',
  heif: 'HEIF is not supported. Please convert to JPEG or PNG first.',
  gif:  'GIF is not supported. Please upload a JPG, PNG, or WebP instead.',
  tiff: 'TIFF is not supported. Please upload a JPG, PNG, or WebP instead.',
  tif:  'TIFF is not supported. Please upload a JPG, PNG, or WebP instead.',
};

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (BLOCKED_FORMAT_HINTS[ext]) {
    return `"${file.name}" — ${BLOCKED_FORMAT_HINTS[ext]}`;
  }
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" has an unsupported format. Accepted: JPG, PNG, WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" is too large (max 5 MB). Please reduce the file size and try again.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Issue #2041 — shared duplicate-identity + batch-validation helper.
//
// Identity rule: name + size + lastModified. Filename alone is NEVER used —
// two distinct files sharing a name (differing size and/or lastModified) are
// always treated as distinct.
//
// `lastModified` is not reliably populated for every File source (some mobile
// camera captures report 0 / non-finite values). When it can't be trusted,
// getFileSignature returns null and the caller MUST treat the file as
// non-comparable — i.e. never reject it as a duplicate on the strength of
// name+size alone. A false "duplicate" rejection (blocking a genuinely
// different photo) is worse than an undetected duplicate slipping through,
// so uncertainty always resolves to ACCEPT.
// ---------------------------------------------------------------------------
function isReliableLastModified(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Returns the composite identity signature, or null if not reliably distinguishing. */
export function getFileSignature(file: File): string | null {
  if (!isReliableLastModified(file.lastModified)) return null;
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export interface FileRejection {
  fileName: string;
  message: string;
}

export interface FileBatchResult {
  accepted: File[];
  rejections: FileRejection[];
}

/**
 * Validates an incoming file selection (file picker, drag/drop, or mobile
 * camera/gallery input — all callers route through this same function) against:
 *   1. format/size (existing per-file rules)
 *   2. duplicate identity — against `activeSignatures` (already-selected /
 *      in-flight / uploaded-this-session, supplied by the caller) AND against
 *      other files within THIS SAME batch
 *   3. the effective remaining-slot cap actually available to the calling
 *      surface (NOT assumed to be the global MAX_IMAGES — InlinePhotos has a
 *      tighter composed cap)
 *
 * Every rejected file gets its own reason-specific, file-specific message;
 * the accepted list preserves selection order. Session-scoped only — a photo
 * already saved from an EARLIER session cannot be compared (ListingImage
 * carries no size/hash/original filename), which is an accepted, documented
 * limit (PR #2060), not a defect.
 */
export function validateFileBatch(
  files: FileList | File[],
  effectiveRemainingSlots: number,
  activeSignatures: ReadonlySet<string> = new Set(),
): FileBatchResult {
  const fileArray = Array.from(files);
  const cap = Math.max(0, effectiveRemainingSlots);
  const seen = new Set(activeSignatures);
  const accepted: File[] = [];
  const rejections: FileRejection[] = [];

  for (const file of fileArray) {
    const formatOrSizeError = validateFile(file);
    if (formatOrSizeError) {
      rejections.push({ fileName: file.name, message: formatOrSizeError });
      continue;
    }

    const signature = getFileSignature(file);
    if (signature && seen.has(signature)) {
      rejections.push({
        fileName: file.name,
        message: `"${file.name}" was skipped — it's already selected or already uploaded for this listing.`,
      });
      continue;
    }

    if (accepted.length >= cap) {
      // Room actually left AT THE MOMENT OF THIS REJECTION, not the static
      // pre-batch cap — a batch of 4 against a cap of 2 must tell the 3rd and
      // 4th file the true remaining room is 0, never restate the stale cap.
      const remaining = Math.max(0, cap - accepted.length);
      rejections.push({
        fileName: file.name,
        message: `"${file.name}" was not added — only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added right now.`,
      });
      continue;
    }

    if (signature) seen.add(signature);
    accepted.push(file);
  }

  return { accepted, rejections };
}

/**
 * Consolidates every rejection from a single file-selection batch into ONE
 * toast payload. `src/hooks/use-toast.ts` caps visible toasts at
 * TOAST_LIMIT=1, and its reducer collapses the toast queue on every dispatch
 * within the same synchronous handler — so calling `toast()` once per
 * rejection only ever shows the LAST one. Calling it once with every
 * rejection's file-specific, reason-specific message keeps that same
 * per-file detail (AC3/AC4) while respecting the one-toast primitive.
 */
export function buildRejectionToast(rejections: FileRejection[]): { title: string; description: string } {
  return {
    title: rejections.length > 1 ? `${rejections.length} photos not added` : 'Photo not added',
    description: rejections.map((r) => r.message).join('\n'),
  };
}

export function useListingImages(listingId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});

  const queryKey = ['listing-images', listingId];

  // Fetch existing images for the listing
  const {
    data: images = [],
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => api.get<ListingImage[]>(`/api/listings/${listingId}/images`),
    enabled: !!listingId,
    staleTime: 30_000,
    // Suppress the cold-start skeleton: treat the previous cache entry (or an
    // empty array on first mount) as placeholder data so isLoading is false
    // immediately. The real fetch still runs in the background.
    placeholderData: (prev) => prev ?? [],
  });

  const imageCount = images.length;
  const canSubmit = imageCount >= 3;
  const remainingSlots = MAX_IMAGES - imageCount;

  // Upload: backend-issued signed URL first, then PUT bytes, then metadata
  // (fixes RLS 42501: the browser never touches storage with a user JWT)
  const uploadImage = useCallback(
    async (file: File) => {
      if (!listingId) return;

      // Client-side validation (fast UX feedback; backend is authoritative)
      const validationError = validateFile(file);
      if (validationError) {
        toast({ title: 'Invalid file', description: validationError, variant: 'destructive' });
        return;
      }

      if (imageCount >= MAX_IMAGES) {
        toast({
          title: 'Limit reached',
          description: `Maximum ${MAX_IMAGES} images allowed.`,
          variant: 'destructive',
        });
        return;
      }

      // Stable upload key generated upfront (independent of server-assigned storagePath)
      const uploadKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Identity signature of the ORIGINAL file (not the post-compression copy) — carried
      // through every status transition below so duplicate detection survives compression.
      const signature = getFileSignature(file) ?? undefined;

      // Step 0: Compress if above threshold
      let fileToUpload: File = file;
      let originalSize: number | undefined;
      let compressedSize: number | undefined;

      if (file.size > COMPRESSION_THRESHOLD) {
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 10, status: 'compressing', file, signature },
        }));
        try {
          const compressed = await imageCompression(file, {
            maxSizeMB: COMPRESSION_MAX_SIZE_MB,
            useWebWorker: true,
          });
          originalSize = file.size;
          compressedSize = compressed.size;
          // Keep original filename on the File object for display
          fileToUpload = new File([compressed], file.name, { type: compressed.type });
        } catch {
          // If compression fails, fall back to original file
          fileToUpload = file;
        }
      }

      // Use the ACTUAL post-compression file's type and size for the signed-URL request
      const contentType = fileToUpload.type;
      const sizeBytes = fileToUpload.size;

      // Step 1: Request a pre-signed upload URL from the backend
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 20, status: 'uploading', file, originalSize, compressedSize, signature },
      }));

      let signedUrl: string;
      let storagePath: string;
      let requiredHeaders: Record<string, string> | undefined;

      try {
        const urlResp = await api.post<{
          signedUrl: string;
          storagePath: string;
          expiresAt: string | null;
          requiredHeaders?: Record<string, string>;
        }>(
          `/api/listings/${listingId}/images/upload-url`,
          { fileName: fileToUpload.name, contentType, sizeBytes },
        );
        signedUrl = urlResp.signedUrl;
        storagePath = urlResp.storagePath;
        requiredHeaders = urlResp.requiredHeaders;
        // expiresAt is informational only; null is valid — no countdown shown
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        const message = apiErr?.message ?? 'Failed to get upload URL.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file, signature },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      // Step 2: PUT bytes directly to the pre-signed URL
      // Use provider-supplied requiredHeaders (or default to Content-Type)
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 40, status: 'uploading', file, originalSize, compressedSize, signature },
      }));

      let putResponse: Response;
      try {
        putResponse = await fetch(signedUrl, {
          method: 'PUT',
          body: fileToUpload,
          headers: requiredHeaders ?? { 'Content-Type': contentType },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error during upload.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file, signature },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      if (!putResponse.ok) {
        const message = `Storage upload failed (${putResponse.status}).`;
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file, signature },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      // Step 3: Register metadata with backend using the SERVER-returned storagePath
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 70, status: 'registering', signature },
      }));

      try {
        await api.post(`/api/listings/${listingId}/images`, {
          storagePath,
        });

        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 100, status: 'done', signature },
        }));

        // Refresh image list
        queryClient.invalidateQueries({ queryKey });

        // Clear completed upload after a short delay
        setTimeout(() => {
          setUploads((prev) => {
            const next = { ...prev };
            delete next[uploadKey];
            return next;
          });
        }, 2000);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        const status = apiErr?.status;

        // 409 = duplicate storage_path => treat as success (idempotent)
        if (status === 409) {
          setUploads((prev) => ({
            ...prev,
            [uploadKey]: { fileName: file.name, progress: 100, status: 'done', signature },
          }));
          queryClient.invalidateQueries({ queryKey });
          setTimeout(() => {
            setUploads((prev) => {
              const next = { ...prev };
              delete next[uploadKey];
              return next;
            });
          }, 2000);
          return;
        }

        // Keep storagePath for retry — orphan cleanup handles eventual removal
        const message = apiErr?.message ?? 'Failed to register image metadata.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: {
            fileName: file.name,
            progress: 0,
            status: 'finalize_failed',
            error: message,
            storagePath,
            signature,
          },
        }));
        toast({ title: 'Finalize failed', description: 'Image uploaded but registration failed. You can retry.', variant: 'destructive' });
      }
    },
    [listingId, imageCount, queryClient, queryKey, toast],
  );

  // Retry a failed storage upload using the stored File reference
  const retryUpload = useCallback(
    (uploadKey: string) => {
      const entry = uploads[uploadKey];
      if (!entry?.file) return;
      // Remove old entry and re-run full upload
      setUploads((prev) => {
        const next = { ...prev };
        delete next[uploadKey];
        return next;
      });
      uploadImage(entry.file);
    },
    [uploads, uploadImage],
  );

  // Retry only the metadata POST for a file that uploaded to Storage but failed registration
  const retryFinalize = useCallback(
    async (uploadKey: string) => {
      const entry = uploads[uploadKey];
      if (!entry?.storagePath || !listingId) return;

      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { ...prev[uploadKey], progress: 70, status: 'registering', error: undefined },
      }));

      try {
        await api.post(`/api/listings/${listingId}/images`, {
          storagePath: entry.storagePath,
        });

        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 100, status: 'done' },
        }));
        queryClient.invalidateQueries({ queryKey });
        setTimeout(() => {
          setUploads((prev) => {
            const next = { ...prev };
            delete next[uploadKey];
            return next;
          });
        }, 2000);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        // 409 = already registered, treat as success
        if (apiErr?.status === 409) {
          setUploads((prev) => ({
            ...prev,
            [uploadKey]: { ...prev[uploadKey], progress: 100, status: 'done' },
          }));
          queryClient.invalidateQueries({ queryKey });
          setTimeout(() => {
            setUploads((prev) => {
              const next = { ...prev };
              delete next[uploadKey];
              return next;
            });
          }, 2000);
          return;
        }
        const message = apiErr?.message ?? 'Finalize retry failed.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { ...prev[uploadKey], progress: 0, status: 'finalize_failed', error: message },
        }));
        toast({ title: 'Finalize failed', description: message, variant: 'destructive' });
      }
    },
    [uploads, listingId, queryClient, queryKey, toast],
  );

  // Dismiss a failed upload entry from the progress list
  const dismissUpload = useCallback(
    (uploadKey: string) => {
      setUploads((prev) => {
        const next = { ...prev };
        delete next[uploadKey];
        return next;
      });
    },
    [],
  );

  // Delete image
  const deleteMutation = useMutation({
    mutationFn: (imageId: string) =>
      api.delete(`/api/listings/${listingId}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  // Reorder images — send complete ordered list of image IDs
  const reorderMutation = useMutation({
    mutationFn: (imageIds: string[]) =>
      api.put(`/api/listings/${listingId}/images/reorder`, { imageIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast({ title: 'Reorder failed', description: error.message, variant: 'destructive' });
    },
  });

  const isUploading = Object.values(uploads).some(
    (u) => u.status === 'compressing' || u.status === 'uploading' || u.status === 'registering',
  );

  return {
    images,
    isLoading,
    fetchError,
    refetch,
    uploads,
    isUploading,
    imageCount,
    canSubmit,
    remainingSlots,
    maxImages: MAX_IMAGES,
    uploadImage,
    retryUpload,
    retryFinalize,
    dismissUpload,
    deleteImage: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    reorderImages: reorderMutation.mutate,
    isReordering: reorderMutation.isPending,
  };
}
