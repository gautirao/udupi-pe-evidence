import { ImageUploader } from '@/components/broker/ImageUploader';

// ---------------------------------------------------------------------------
// Issue #1718 — residential single-page create parity. Thin inline wrapper
// around the EXISTING ImageUploader (src/components/broker/ImageUploader.tsx),
// which already implements: upload, delete, and drag-to-reorder where
// position 0 is rendered with a "Cover" badge — i.e. cover selection is
// ALREADY the existing reorder endpoint (PUT /api/listings/{id}/images/reorder),
// no backend change needed (design-spec.md AC2).
// ---------------------------------------------------------------------------

interface InlinePhotosProps {
  listingId: string;
  onCanSubmitChange?: (canSubmit: boolean) => void;
}

export function InlinePhotos({ listingId, onCanSubmitChange }: InlinePhotosProps) {
  return (
    <div className="space-y-2">
      <ImageUploader listingId={listingId} onCanSubmitChange={onCanSubmitChange} />
      <p className="text-xs text-muted-foreground">
        Drag a photo to the first position to make it the cover photo buyers see first.
      </p>
    </div>
  );
}
