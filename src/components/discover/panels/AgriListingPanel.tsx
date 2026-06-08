/**
 * AgriListingPanel — Issue #1374
 *
 * Renders full agriculture listing details when an agri polygon is selected on
 * the Discover map (agri-first journey). Fetches the full DTO from the public
 * endpoint GET /api/public/listings/{id} via useAgriListingDetail.
 *
 * Design constraints (from qa-fast boundary findings):
 * - ALL 10+ agri fields are optional/nullable — every row is null-guarded (omit
 *   the row rather than showing a blank value).
 * - Price-per-acre: only shown when BOTH price > 0 AND computedAreaAcres > 0.
 * - Back navigation clears the selected listing only — areaKey/URL state intact.
 * - boundary disclaimer: only when boundary is a non-null, non-empty string.
 */

import React from 'react';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgriListingDetail } from '@/hooks/useAgriListingDetail';
import { formatPrice } from '@/lib/formatters';

interface AgriListingPanelProps {
  listingId: string;
  onBack: () => void;
}

// ------------------------------------------------------------------
// Field row: renders nothing when value is null/undefined/empty string
// ------------------------------------------------------------------
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between items-start gap-2 py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

export function AgriListingPanel({ listingId, onBack }: AgriListingPanelProps) {
  const { data, isLoading, isError, refetch } = useAgriListingDetail(listingId);

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="agri-detail-loading"
        className="flex flex-col h-full"
      >
        {/* Skeleton header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        {/* Skeleton rows */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div
        data-testid="agri-detail-error"
        className="flex flex-col h-full"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to area listings"
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Plot details</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Could not load plot details.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // ── Populated ────────────────────────────────────────────────────
  const {
    locality,
    surveyNumber,
    landArea,
    landAreaUnit,
    computedAreaAcres,
    price,
    waterSource,
    soilType,
    roadAccess,
    cultivationStatus,
    ownershipType,
    boundary,
  } = data;

  // Price-per-acre: only when both price and computedAreaAcres are positive numbers
  const showPricePerAcre =
    typeof price === 'number' &&
    price > 0 &&
    typeof computedAreaAcres === 'number' &&
    computedAreaAcres > 0;

  const pricePerAcreValue = showPricePerAcre
    ? `${formatPrice(Math.round(price! / computedAreaAcres!))}/acre`
    : null;

  // Land area: e.g. "2.5 acres"
  const landAreaValue =
    landArea != null && landAreaUnit
      ? `${landArea} ${landAreaUnit}`
      : landArea != null
        ? String(landArea)
        : null;

  // Approx area from computed boundary: e.g. "≈ 1.23 acres"
  const computedAreaValue =
    computedAreaAcres != null ? `≈ ${computedAreaAcres.toFixed(2)} acres` : null;

  // Formatted price — treat 0 same as null (no meaningful price to display)
  const priceValue = price != null && price > 0 ? formatPrice(price) : null;

  // Boundary disclaimer: non-null AND non-empty string
  const showBoundaryDisclaimer =
    typeof boundary === 'string' && boundary.length > 0;

  const title = data.title ?? locality ?? 'Agricultural plot';

  return (
    <div
      data-testid="agri-detail-panel"
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to area listings"
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <h2
          className="text-sm font-semibold text-foreground truncate"
          data-testid="agri-detail-title"
        >
          {title}
        </h2>
      </div>

      {/* Detail rows */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div>
          <FieldRow label="Locality" value={locality} />
          <FieldRow label="Survey number" value={surveyNumber} />
          <FieldRow label="Land area" value={landAreaValue} />
          <FieldRow label="Approx. area" value={computedAreaValue} />
          <FieldRow label="Price" value={priceValue} />
          <FieldRow label="Price per acre" value={pricePerAcreValue} />
          <FieldRow label="Water source" value={waterSource} />
          <FieldRow label="Soil type" value={soilType} />
          <FieldRow label="Road access" value={roadAccess} />
          <FieldRow label="Cultivation status" value={cultivationStatus} />
          <FieldRow label="Ownership type" value={ownershipType} />
        </div>

        {showBoundaryDisclaimer && (
          <p
            data-testid="agri-boundary-disclaimer"
            className="mt-4 text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/40"
          >
            The boundary drawn on the map is approximate and should be legally
            verified before purchase.
          </p>
        )}
      </div>
    </div>
  );
}
