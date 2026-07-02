import { Check, ImageOff } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';

// ---------------------------------------------------------------------------
// M38-13A (#1626) — residential single-page create flow (design-spec.md §right_column).
// D-FE4: PURE PRESENTATION derived from current form/listing state. NEVER fabricates
// real-looking data when a field is empty — falls back to honest placeholder copy.
//
// Issue #1722 (honesty guardrail): the cover photo renders from the REAL cover
// image URL (image[0], the same "cover" the reorder-to-index-0 mechanism
// produces) instead of a text placeholder, and the always-on "Verified broker"
// badge has been REMOVED — no broker-verification/KYC signal exists anywhere
// in this codebase, so claiming one would be a fabricated trust signal.
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
  /** Real cover image URL (image[0]) — null until at least one photo is uploaded. */
  coverImageUrl: string | null;
  /** Reflects the persisted addressConfirmed flag — true only after a pin is confirmed. */
  locationConfirmed: boolean;
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
  coverImageUrl,
  locationConfirmed,
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
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt="Cover photo"
            className="h-full w-full object-cover"
            data-testid="buyer-preview-cover-image"
          />
        ) : photoCount > 0 ? (
          <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            Cover photo
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs">No photos yet</span>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <p className="truncate text-[15px] font-semibold text-foreground">{displayTitle}</p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="truncate">{displayLocality}</span>
          {locationConfirmed && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-green-700"
              data-testid="buyer-preview-location-confirmed"
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              Pinned
            </span>
          )}
        </p>
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
