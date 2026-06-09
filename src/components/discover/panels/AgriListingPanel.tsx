/**
 * AgriListingPanel — Issue #1374 (refactored #1406)
 *
 * Renders full agriculture listing details when an agri polygon is selected on
 * the Discover map (agri-first journey). Fetches the full DTO from the public
 * endpoint GET /api/public/listings/{id} via useAgriListingDetail.
 *
 * Field rendering delegated to shared AgriSpecRows (Issue #1406).
 * Panel retains: title, back button, loading/error states, locality row (panel-specific).
 */

import React from 'react';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgriListingDetail } from '@/hooks/useAgriListingDetail';
import { AgriSpecRows } from '@/components/listing/AgriSpecRows';

interface AgriListingPanelProps {
  listingId: string;
  onBack: () => void;
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
        {/* Locality row: panel-specific (detail page shows locality in header) */}
        {locality && (
          <div className="flex justify-between items-start gap-2 py-2 border-b border-border">
            <span className="text-sm text-muted-foreground shrink-0">Locality</span>
            <span className="text-sm text-foreground text-right">{locality}</span>
          </div>
        )}
        <AgriSpecRows
          surveyNumber={surveyNumber}
          landArea={landArea}
          landAreaUnit={landAreaUnit}
          computedAreaAcres={computedAreaAcres}
          price={price}
          waterSource={waterSource}
          soilType={soilType}
          roadAccess={roadAccess}
          cultivationStatus={cultivationStatus}
          ownershipType={ownershipType}
          boundary={boundary}
        />
      </div>
    </div>
  );
}
