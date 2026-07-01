import { ImageOff, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/formatters';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential single-page create flow (design-spec.md §right_column).
// D-FE4: PURE PRESENTATION derived from current form React state. NEVER fabricates
// real-looking data when a field is empty — falls back to honest placeholder copy.
// photo_tiles / map_pin (design-spec.md §prototype_only): photoCount/isPinned are
// always 0/false today since no real upload or pin flow is wired on the create page —
// see PhotoTileGrid.tsx and the "Pin location" button in ResidentialListingForm.tsx.
// ---------------------------------------------------------------------------

export interface BuyerPreviewSpecChip {
  label: string;
}

interface BuyerPreviewCardProps {
  title: string;
  locality: string;
  priceRupees: number | null;
  monthlyRent: number | null;
  isRent: boolean;
  areaSqft: number | null;
  specChips: readonly BuyerPreviewSpecChip[];
  photoCount: number;
}

export function BuyerPreviewCard({
  title,
  locality,
  priceRupees,
  monthlyRent,
  isRent,
  areaSqft,
  specChips,
  photoCount,
}: BuyerPreviewCardProps) {
  const displayTitle = title.trim() || 'Your title will appear here';
  const displayLocality = locality.trim() || 'Locality will appear here';

  const amount = isRent ? monthlyRent : priceRupees;
  const displayPrice = amount != null && amount > 0
    ? `${formatPrice(amount)}${isRent ? '/mo' : ''}`
    : 'Price will appear here';

  const perSqft = !isRent && priceRupees != null && priceRupees > 0 && areaSqft != null && areaSqft > 0
    ? Math.round(priceRupees / areaSqft)
    : null;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="buyer-preview-card">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {photoCount > 0 ? (
          <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            Cover photo
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs">No photos yet</span>
          </div>
        )}
        <Badge variant="secondary" className="absolute left-2 top-2 flex items-center gap-1 bg-card/95">
          <ShieldCheck className="h-3 w-3 text-primary" aria-hidden="true" />
          Verified broker
        </Badge>
      </div>

      <div className="mt-3 space-y-1">
        <p className="truncate text-[15px] font-semibold text-foreground">{displayTitle}</p>
        <p className="text-sm text-muted-foreground">{displayLocality}</p>
        <p className="font-mono text-[17px] font-bold text-foreground">{displayPrice}</p>
        {perSqft != null && (
          <p className="text-xs text-muted-foreground">₹{perSqft.toLocaleString('en-IN')}/sqft</p>
        )}
      </div>

      {specChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {specChips.map((chip) => (
            <span key={chip.label} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
