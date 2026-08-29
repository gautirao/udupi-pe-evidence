import type { Ref } from 'react';
import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';
import { StrengthMeter } from './StrengthMeter';

interface ResidentialSidebarSummaryProps {
  title: string;
  locality: string;
  priceRupees: number | null;
  monthlyRent: number | null;
  isRent: boolean;
  areaSqft: number | null;
  specChips: BuyerPreviewSpecChip[];
  photoCount: number;
  coverImageUrl: string | null;
  locationConfirmed: boolean;
  listingId: string | null;
  strengthResult: ListingStrengthResult;
  checklist: ListingStrengthChecklist;
  strengthMeterRef: Ref<HTMLDivElement>;
}

/**
 * #2387 — right column: buyer preview + listing strength. Verbatim
 * extraction, no behaviour change.
 *
 * Issue #1727 — exactly ONE Listing strength widget at a time. Pre-draft (no
 * listingId): the legacy pre-draft meter is the only widget. Post-draft
 * (listingId): the newer StrengthMeter is authoritative and the legacy
 * meter must not render — the two must never co-render.
 */
export function ResidentialSidebarSummary({ title, locality, priceRupees, monthlyRent, isRent, areaSqft, specChips, photoCount, coverImageUrl, locationConfirmed, listingId, strengthResult, checklist, strengthMeterRef }: ResidentialSidebarSummaryProps) {
  return (
    <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <BuyerPreviewCard
        title={title}
        locality={locality}
        priceRupees={priceRupees}
        monthlyRent={monthlyRent}
        isRent={isRent}
        areaSqft={areaSqft}
        specChips={specChips}
        photoCount={photoCount}
        coverImageUrl={coverImageUrl}
        locationConfirmed={locationConfirmed}
      />
      <div ref={strengthMeterRef} className="rounded-2xl border bg-card p-4 shadow-sm">
        {listingId ? (
          <StrengthMeter result={strengthResult} variant="sidebar" />
        ) : (
          <ListingStrengthMeter checklist={checklist} />
        )}
      </div>
    </div>
  );
}
