import { useRef, useState, useCallback, type DragEvent } from 'react';
import { useListingImages, type ListingImage } from '@/hooks/useListingImages';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Upload, X, GripVertical, ImageOff, Loader2, RotateCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  listingId: string;
  /** Called whenever the submittable state changes (>= 3 images). */
  onCanSubmitChange?: (canSubmit: boolean) => void;
}

export function ImageUploader({ listingId, onCanSubmitChange }: ImageUploaderProps) {
  const {
    images,
    isLoading,
    fetchError,
    uploads,
    isUploading,
    imageCount,
    canSubmit,
    remainingSlots,
    maxImages,
    uploadImage,
    retryUpload,
    retryFinalize,
    dismissUpload,
    deleteImage,
    isDeleting,
    reorderImages,
    isReordering,
    refetch,
  } = useListingImages(listingId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Notify parent of canSubmit changes
  const prevCanSubmitRef = useRef(canSubmit);
  if (prevCanSubmitRef.current !== canSubmit) {
    prevCanSubmitRef.current = canSubmit;
    onCanSubmitChange?.(canSubmit);
  }

  // --- File selection ---
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const toUpload = fileArray.slice(0, remainingSlots);
      for (const file of toUpload) {
        uploadImage(file);
      }
    },
    [uploadImage, remainingSlots],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
        e.target.value = ''; // reset so same file can be selected again
      }
    },
    [handleFiles],
  );

  // --- Drop zone ---
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Only handle external file drops (not reorder drags)
      if (e.dataTransfer.types.includes('text/x-image-index')) return;

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  // --- Reorder via drag within grid ---
  const handleReorderDragStart = useCallback(
    (e: DragEvent, index: number) => {
      e.dataTransfer.setData('text/x-image-index', String(index));
      e.dataTransfer.effectAllowed = 'move';
      setDragIndex(index);
    },
    [],
  );

  const handleReorderDragOver = useCallback(
    (e: DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropIndex(index);
    },
    [],
  );

  const handleReorderDrop = useCallback(
    (e: DragEvent, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceIndexStr = e.dataTransfer.getData('text/x-image-index');
      if (!sourceIndexStr) return;

      const sourceIndex = parseInt(sourceIndexStr, 10);
      if (sourceIndex === targetIndex) {
        setDragIndex(null);
        setDropIndex(null);
        return;
      }

      // Reorder the array
      const ordered = [...images];
      const [moved] = ordered.splice(sourceIndex, 1);
      ordered.splice(targetIndex, 0, moved);

      const imageIds = ordered.map((img) => img.id);
      reorderImages(imageIds);

      setDragIndex(null);
      setDropIndex(null);
    },
    [images, reorderImages],
  );

  const handleReorderDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  // --- Broken image fallback ---
  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      e.currentTarget.style.display = 'none';
      const placeholder = e.currentTarget.nextElementSibling;
      if (placeholder instanceof HTMLElement) {
        placeholder.style.display = 'flex';
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to load images.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RotateCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const uploadEntries = Object.entries(uploads);

  return (
    <div className="space-y-4">
      {/* Count display */}
      <p className="text-sm text-muted-foreground">
        {imageCount}/{maxImages} images
        {imageCount < 3 && ' (minimum 3 required)'}
      </p>

      {/* Drop zone */}
      {remainingSlots > 0 && (
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop images here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP up to 5 MB each
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* Upload progress indicators */}
      {uploadEntries.length > 0 && (
        <div className="space-y-2">
          {uploadEntries.map(([key, upload]) => (
            <div key={key} className="flex items-center gap-3 text-sm">
              <span className="truncate max-w-[200px]">{upload.fileName}</span>
              <div className="flex-1">
                <Progress
                  value={upload.progress}
                  className="h-2"
                />
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                {upload.status === 'compressing' && (
                  <span className="text-xs text-muted-foreground">Compressing…</span>
                )}
                {upload.status === 'uploading' && (
                  <>
                    <span className="text-xs text-muted-foreground">Uploading…</span>
                    {upload.originalSize != null && upload.compressedSize != null && (
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(upload.originalSize / 1024)} KB → {Math.round(upload.compressedSize / 1024)} KB)
                      </span>
                    )}
                  </>
                )}
                {upload.status === 'registering' && (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                )}
                {upload.status === 'done' && (
                  <span className="text-xs text-muted-foreground">Done</span>
                )}
                {(upload.status === 'error' || upload.status === 'finalize_failed') && (
                  <>
                    <span className="text-xs text-destructive">
                      We couldn't finish uploading your photo. Please try again.
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() =>
                        upload.status === 'finalize_failed'
                          ? retryFinalize(key)
                          : retryUpload(key)
                      }
                    >
                      <RotateCw className="mr-1 h-3 w-3" />
                      Retry
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => dismissUpload(key)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((image: ListingImage, index: number) => (
            <div
              key={image.id}
              draggable
              className={cn(
                'group relative aspect-square rounded-lg border bg-muted overflow-hidden',
                dragIndex === index && 'opacity-50',
                dropIndex === index && dragIndex !== null && dragIndex !== index && 'ring-2 ring-primary',
              )}
              onDragStart={(e) => handleReorderDragStart(e, index)}
              onDragOver={(e) => handleReorderDragOver(e, index)}
              onDrop={(e) => handleReorderDrop(e, index)}
              onDragEnd={handleReorderDragEnd}
            >
              {/* Image */}
              <img
                src={image.url}
                alt={`Listing image ${index + 1}`}
                className="h-full w-full object-cover"
                onError={handleImageError}
              />
              {/* Broken image placeholder (hidden by default) */}
              <div
                className="absolute inset-0 items-center justify-center bg-muted"
                style={{ display: 'none' }}
              >
                <ImageOff className="h-8 w-8 text-muted-foreground" />
              </div>

              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />

              {/* Drag handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-5 w-5 text-white drop-shadow" />
              </div>

              {/* Position badge */}
              {index === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}

              {/* Delete button — always visible on mobile, hover-only on sm+ */}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                onClick={() => deleteImage(image.id)}
                disabled={isDeleting}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {images.length === 0 && uploadEntries.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          No images yet. Upload at least 3 to submit your listing.
        </p>
      )}

      {/* Status bar */}
      {(isUploading || isReordering) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isUploading && 'Processing…'}
          {isReordering && 'Saving order…'}
        </div>
      )}
    </div>
  );
}
