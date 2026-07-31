import { useEffect, useRef } from 'react';
import { AlertCircle, ImageOff, Loader2, Plus, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useListingImages, validateFileBatch, buildRejectionToast, type ListingImage } from '@/hooks/useListingImages';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Issue #1722 — photo tile grid matching the residential create-listing mock
// (up to five tiles; empty '+' tiles open the file picker; inline "Set cover"
// on non-cover tiles). Talks directly to the EXISTING useListingImages hook
// (upload/delete/reorder — same endpoints ImageUploader.tsx uses) instead of
// wrapping ImageUploader.tsx, so EditListing.tsx's ImageUploader usage is
// completely untouched. "Set cover" == reorder the chosen image to index 0,
// which is the SAME mechanism ImageUploader's existing drag-to-reorder uses
// (PUT /api/listings/{id}/images/reorder) — cover is genuinely image[0].
// ---------------------------------------------------------------------------

const TILE_SLOTS = 5;

interface InlinePhotosProps {
  listingId: string;
  onCanSubmitChange?: (canSubmit: boolean) => void;
}

export function InlinePhotos({ listingId, onCanSubmitChange }: InlinePhotosProps) {
  const {
    images,
    isLoading,
    fetchError,
    uploads,
    isUploading,
    imageCount,
    canSubmit,
    remainingSlots,
    uploadImage,
    deleteImage,
    isDeleting,
    reorderImages,
    isReordering,
    refetch,
  } = useListingImages(listingId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Session-scoped record of successfully-uploaded file signatures — same shared
  // duplicate-identity mechanism as ImageUploader.tsx (see validateFileBatch in
  // useListingImages.ts). Cross-session duplicates are not detected (accepted,
  // documented limit — issue #2041, PR #2060).
  // Invariant this ref relies on: one mounted InlinePhotos instance per listingId
  // (PhotosStep mounts a single fixed instance). It is never reset on listingId
  // change — a future caller swapping listingId on an already-mounted instance
  // would leak signatures across listings.
  const uploadedSignaturesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const upload of Object.values(uploads)) {
      if (upload.status === 'done' && upload.signature) {
        uploadedSignaturesRef.current.add(upload.signature);
      }
    }
  }, [uploads]);

  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // Effective cap is the tighter of the two limits this surface composes —
      // never assume the global MAX_IMAGES (10) when TILE_SLOTS (5) is smaller.
      const effectiveRemainingSlots = Math.max(0, Math.min(remainingSlots, TILE_SLOTS - imageCount));

      const activeSignatures = new Set(uploadedSignaturesRef.current);
      for (const upload of Object.values(uploads)) {
        // A file that FAILED (storage PUT or metadata registration) never
        // successfully uploaded — it must not read as "already selected or
        // already uploaded". Only in-flight/succeeded entries count as active.
        if (upload.signature && upload.status !== 'error' && upload.status !== 'finalize_failed') {
          activeSignatures.add(upload.signature);
        }
      }

      const { accepted, rejections } = validateFileBatch(e.target.files, effectiveRemainingSlots, activeSignatures);

      if (rejections.length > 0) {
        const { title, description } = buildRejectionToast(rejections);
        toast({ variant: 'destructive', title, description });
      }
      for (const file of accepted) uploadImage(file);
      e.target.value = '';
    }
  };

  const handleSetCover = (imageId: string) => {
    const target = images.find((img) => img.id === imageId);
    if (!target) return;
    const ordered = [target, ...images.filter((img) => img.id !== imageId)];
    reorderImages(ordered.map((img) => img.id));
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
    const placeholder = e.currentTarget.nextElementSibling;
    if (placeholder instanceof HTMLElement) placeholder.style.display = 'flex';
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {Array.from({ length: TILE_SLOTS }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm text-destructive">Failed to load images.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  const canAddMore = imageCount < TILE_SLOTS && remainingSlots > 0;
  const slotCount = Math.max(TILE_SLOTS, images.length);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">Photos</p>
        <p className="text-xs text-muted-foreground">
          {Math.min(imageCount, TILE_SLOTS)}/{TILE_SLOTS} photos{imageCount < 3 && ' (minimum 3 required)'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5" data-testid="photo-tile-grid">
        {Array.from({ length: slotCount }).map((_, i) => {
          const image: ListingImage | undefined = images[i];
          if (image) {
            const isCover = i === 0;
            return (
              <div
                key={image.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                data-testid={`photo-tile-${i}`}
              >
                <img
                  src={image.url}
                  alt={isCover ? 'Cover photo' : `Listing photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  onError={handleImageError}
                />
                <div
                  className="absolute inset-0 items-center justify-center bg-muted"
                  style={{ display: 'none' }}
                >
                  <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>

                {isCover ? (
                  <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Cover
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-1 left-1 h-6 px-1.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100"
                    onClick={() => handleSetCover(image.id)}
                    disabled={isReordering}
                  >
                    Set cover
                  </Button>
                )}

                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 sm:opacity-100"
                  onClick={() => deleteImage(image.id)}
                  disabled={isDeleting}
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            );
          }

          if (i >= TILE_SLOTS) return null;

          return (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAddMore}
              aria-label={i === 0 ? 'Add cover photo' : `Add photo ${i + 1}`}
              className={cn(
                'flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 text-muted-foreground transition-colors',
                canAddMore && 'hover:border-primary hover:text-primary',
                !canAddMore && 'cursor-not-allowed opacity-50',
              )}
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileInput}
      />

      {Object.entries(uploads).length > 0 && (
        <div className="space-y-1">
          {Object.entries(uploads).map(([key, upload]) => (
            <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
              {(upload.status === 'compressing' || upload.status === 'uploading' || upload.status === 'registering') && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              )}
              <span className="truncate">{upload.fileName}</span>
              <span>
                {upload.status === 'finalize_failed'
                  ? 'uploaded — saving failed'
                  : upload.status === 'error'
                    ? "couldn't upload"
                    : upload.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {isUploading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Processing…
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Tap a filled photo&apos;s &quot;Set cover&quot; to make it the first photo buyers see.
      </p>
    </div>
  );
}
