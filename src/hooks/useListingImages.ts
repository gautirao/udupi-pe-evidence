import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'listing-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGES = 10;

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
  status: 'uploading' | 'registering' | 'done' | 'error' | 'finalize_failed';
  error?: string;
  file?: File;          // retained for retryUpload
  storagePath?: string; // retained for retryFinalize
  url?: string;         // retained for retryFinalize
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" exceeds 5 MB limit.`;
  }
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File "${file.name}" has unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
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

  // Upload: Storage first, then metadata (per IMAGE_UPLOAD_FAILURE_MODES.md section 2)
  const uploadImage = useCallback(
    async (file: File) => {
      if (!listingId) return;

      // Client-side validation
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

      // Get current user ID for storage path
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast({ title: 'Not authenticated', description: 'Please sign in.', variant: 'destructive' });
        return;
      }
      const userId = session.user.id;

      // Build unique file name to avoid collisions
      const ext = getFileExtension(file.name);
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storagePath = `listings/${userId}/${listingId}/${uniqueName}`;
      const uploadKey = storagePath;

      // Step 1: Upload bytes to Supabase Storage
      setUploads((prev) => ({
        ...prev,
        [uploadKey]: { fileName: file.name, progress: 30, status: 'uploading', file },
      }));

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false });

      if (storageError) {
        setUploads((prev) => ({
          ...prev,
          [uploadKey]: { fileName: file.name, progress: 0, status: 'error', error: storageError.message, file },
        }));
        toast({ title: 'Upload failed', description: storageError.message, variant: 'destructive' });
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      // Step 2: Register metadata with backend
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
        }, 1500);
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
          }, 1500);
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
        }, 1500);
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
          }, 1500);
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
    (u) => u.status === 'uploading' || u.status === 'registering',
  );

  return {
    images,
    isLoading,
    fetchError,
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
