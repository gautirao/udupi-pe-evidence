import { Plus } from 'lucide-react';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential single-page create flow (design-spec.md §prototype_only
// "photo_tiles"). PRESENTATIONAL ONLY: there is no real image-upload wiring on the
// create page. Clicking a tile is a CTA that (via onAddPhoto) saves the current draft
// and routes into the EXISTING photos step of EditListing — the only functional photo
// upload path today. Cover selection is not persisted on create. NO backend change.
// ---------------------------------------------------------------------------

const TILE_COUNT = 6;

interface PhotoTileGridProps {
  onAddPhoto: () => void;
}

export function PhotoTileGrid({ onAddPhoto }: PhotoTileGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5" data-testid="photo-tile-grid">
      {Array.from({ length: TILE_COUNT }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={onAddPhoto}
          aria-label={i === 0 ? 'Add cover photo' : `Add photo ${i + 1}`}
          className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
