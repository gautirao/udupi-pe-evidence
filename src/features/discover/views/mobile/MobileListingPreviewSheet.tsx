/**
 * MobileListingPreviewSheet — Issue #1956 PR-5 (Slice 5, AC5.10/AC5.10c).
 *
 * Presentational-only mobile Map-mode preview sheet for a single selected
 * LISTING, opened by a marker tap (or a mobile LIST row selection carrying
 * over via the SAME URL-backed `listing=` peek — OQ6 ruling: KEEP the
 * existing peek, do not add a suppression seam). Mounted INSIDE
 * MapDiscovery's z-[60] full-screen mobile map overlay container (never
 * portalled), following the SAME position:absolute + high explicit z-index
 * pattern `MarkerPopoverCard` already uses inside that same container
 * (`MarkerPopoverCard.tsx` — `computePopoverStyle`'s `zIndex: 1100`) and
 * `MobileClusterSheet` reuses for the cluster member list — the shared
 * `src/components/ui/sheet.tsx` primitive cannot be used here (z-50,
 * Radix-portals to `document.body`, lands BELOW the z-[60] overlay; see
 * team-lead-plan-pr5.toml `[reuse_seams].sheet_stacking`).
 *
 * Owns NO state and issues NO query. `preview` is a `SelectedListingPreview`
 * already projected (via `toSelectedListingPreview`, PR-4's contract) by the
 * caller (`DiscoverAreasJourneyPanel`'s `AreaLeafListingsSurface`) from an
 * ALREADY-FETCHED `DiscoverCityListingItem` — this component never fetches,
 * never re-derives the preview, and never reads `listing.locality` (the
 * contract's `areaLabel` is always the canonical area label). `onDismiss`/
 * `onViewDetails` are the caller's concern; this component makes no URL or
 * history write of its own.
 *
 * Invariant 8 — renders no result-scope controls (Edit areas / Clear
 * selected areas / Add nearby areas / Draw search area / Search this area /
 * Create alert).
 */
import type React from 'react';
import { Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/formatters';
import { TRUST_BADGES } from '@/components/discover/PropertyCard';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  land: 'Land',
  house: 'House',
  apartment: 'Apartment',
  commercial: 'Commercial',
  commercial_building: 'Comm. Building',
  warehouse: 'Warehouse',
  commercial_land: 'Comm. Land',
  agricultural_land: 'Agri Land',
  other: 'Other',
};

export interface MobileListingPreviewSheetProps {
  preview: SelectedListingPreview;
  /** Closes the sheet. Callers route this through the SAME clearSelectedListing() writer every other peek-close affordance uses (a URL REPLACE — no new history entry, camera/filters/Map-mode unchanged). */
  onDismiss: () => void;
  /** Opens the EXISTING full listing detail (`navigate('/listing/:id')`) — never a new detail view. */
  onViewDetails: (id: string) => void;
}

export function MobileListingPreviewSheet({
  preview,
  onDismiss,
  onViewDetails,
}: MobileListingPreviewSheetProps) {
  const typeLabel = preview.propertyType
    ? (PROPERTY_TYPE_LABELS[preview.propertyType] ?? preview.propertyType)
    : 'Property';

  // Code-review fix (#1956 PR-5) — Escape must dismiss THIS sheet, not the
  // parent mobile Map overlay. `useMobileMapOverlayShell` binds its own
  // Escape listener at `document` level for as long as Map is open, so an
  // unguarded Escape here would bubble straight past the sheet and close the
  // whole overlay instead. Handling keydown on the sheet's own container and
  // calling stopPropagation() stops the native event before it ever reaches
  // that document-level listener — no separate document binding needed, and
  // nothing to clean up on unmount (React removes the handler with the node).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
    }
  };

  // Trust badge — reuse the SAME allow-list lookup PropertyCard.tsx uses for
  // the identical `trustBadge` field (Issue #1567: the backend never sends
  // the raw internal letter grade, but this guards the contract anyway).
  // Any value outside verified/trusted/listed (or null/absent) renders no
  // badge — never invent one.
  const trust = preview.trustBadge ? TRUST_BADGES[preview.trustBadge] : undefined;

  return (
    <div
      // Mounted INSIDE MapDiscovery's z-[60] mobile map overlay container —
      // a plain positioned element inheriting that stacking context, same
      // as MobileClusterSheet.
      className="absolute inset-x-3 bottom-3 z-[1100] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
      data-testid="mobile-listing-preview-sheet"
      // role="dialog" + aria-modal="false" mirrors MarkerPopoverCard's SAME
      // structural precedent for a non-modal overlay panel inside this map
      // container: it announces a dialog landmark without promising focus
      // containment or restoration (no focus trap here — that's #1960,
      // explicitly out of scope). Escape-to-close above makes the one
      // behaviour role="dialog" implies that this component DOES honour.
      role="dialog"
      aria-modal="false"
      aria-label={preview.propertyType ? `${typeLabel} preview` : 'Property preview'}
      onKeyDown={handleKeyDown}
    >
      <div className="relative h-32 w-full shrink-0 overflow-hidden bg-muted flex items-center justify-center">
        {preview.primaryImageUrl ? (
          <img
            src={preview.primaryImageUrl}
            alt={typeLabel}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <Building2 className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60"
          onClick={onDismiss}
          aria-label="Close property preview"
          data-testid="mobile-listing-preview-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {/* Issue #1616 three-way price render, mirrored from PropertyCard.tsx
            and MarkerPopoverCard.tsx: authed arm shows the exact price
            (pricePaise, structurally present only when kind==='authed');
            anon arm shows the coarse priceBand or a sign-in prompt. Never
            both — the union makes reading the wrong field a compile error. */}
        <p className="text-base font-semibold text-foreground" data-testid="mobile-listing-preview-price">
          {preview.kind === 'authed' ? (
            preview.pricePaise != null ? (
              formatPrice(Math.round(preview.pricePaise / 100), 'INR')
            ) : (
              <span className="text-sm italic text-muted-foreground">Price not available</span>
            )
          ) : preview.priceBand ? (
            <span data-testid="mobile-listing-preview-price-band">{preview.priceBand}</span>
          ) : (
            <span className="text-sm italic text-muted-foreground">Sign in to view price</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {typeLabel}
          </span>
          {preview.bedrooms != null && (
            <span className="text-xs text-muted-foreground" data-testid="mobile-listing-preview-bedrooms">
              {preview.bedrooms} BHK
            </span>
          )}
          {trust && (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${trust.className}`}
              data-testid="mobile-listing-preview-trust-badge"
            >
              <trust.icon className="h-2.5 w-2.5" aria-hidden="true" />
              {trust.label}
            </span>
          )}
          <span className="ml-auto truncate text-xs text-muted-foreground" data-testid="mobile-listing-preview-area-label">
            {preview.areaLabel}
          </span>
        </div>

        <Button
          className="mt-1 h-10 w-full text-sm"
          onClick={() => onViewDetails(preview.id)}
          data-testid="mobile-listing-preview-view-details"
        >
          View details
        </Button>
      </div>
    </div>
  );
}
