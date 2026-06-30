import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/integrations/supabase/client';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'listing-images';
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
    return BLOCKED_FORMAT_HINTS[ext];
  }
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" has an unsupported format. Accepted: JPG, PNG, WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" is too large (max 5 MB). Please reduce the file size and try again.`;
  }
  return null;
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

      // Step 0: Compress if above threshold
      let fileToUpload: File = file;
      let originalSize: number | undefined;
      let compressedSize: number | undefined;

      if (file.size > COMPRESSION_THRESHOLD) {
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 10, status: 'compressing', file },
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
        [uploadKey]: { fileName: file.name, progress: 20, status: 'uploading', file, originalSize, compressedSize },
      }));

      let signedUrl: string;
      let storagePath: string;

      try {
        const urlResp = await api.post<{ signedUrl: string; storagePath: string; expiresAt: string | null }>(
          `/api/listings/${listingId}/images/upload-url`,
          { fileName: fileToUpload.name, contentType, sizeBytes },
        );
        signedUrl = urlResp.signedUrl;
        storagePath = urlResp.storagePath;
        // expiresAt is informational only; null is valid — no countdown shown
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        const message = apiErr?.message ?? 'Failed to get upload URL.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      // Step 2: PUT bytes directly to the pre-signed URL
      // The URL already carries its own auth token — do NOT add an Authorization header.
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 40, status: 'uploading', file, originalSize, compressedSize },
      }));

      let putResponse: Response;
      try {
        putResponse = await fetch(signedUrl, {
          method: 'PUT',
          body: fileToUpload,
          headers: { 'Content-Type': contentType },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error during upload.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      if (!putResponse.ok) {
        const message = `Storage upload failed (${putResponse.status}).`;
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: message, file },
        }));
        toast({ title: 'Upload failed', description: message, variant: 'destructive' });
        return;
      }

      // Derive public display URL from server-returned storagePath (bucket is public)
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Step 3: Register metadata with backend using the SERVER-returned storagePath
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 70, status: 'registering' },
      }));

      try {
        await api.post(`/api/listings/${listingId}/images`, {
          storagePath,
          url: publicUrl,
        });

        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 100, status: 'done' },
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
            [uploadKey]: { fileName: file.name, progress: 100, status: 'done' },
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

        // Keep storagePath/url for retry — orphan cleanup handles eventual removal (section 5)
        const message = apiErr?.message ?? 'Failed to register image metadata.';
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: {
            fileName: file.name,
            progress: 0,
            status: 'finalize_failed',
            error: message,
            storagePath,
            url: publicUrl,
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
      if (!entry?.storagePath || !entry?.url || !listingId) return;

      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { ...prev[uploadKey], progress: 70, status: 'registering', error: undefined },
      }));

      try {
        await api.post(`/api/listings/${listingId}/images`, {
          storagePath: entry.storagePath,
          url: entry.url,
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
