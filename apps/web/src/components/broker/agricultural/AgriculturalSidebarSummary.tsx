import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';

interface AgriculturalSidebarSummaryProps {
  title: string;
  locality: string;
  priceRupees: number | null;
  landArea: number | null;
  specChips: BuyerPreviewSpecChip[];
  photoCount: number;
  coverImageUrl: string | null;
  locationConfirmed: boolean;
  listingId: string | null;
  strengthResult: ListingStrengthResult;
  checklist: ListingStrengthChecklist;
}

/**
 * #2398 — right column: buyer preview + listing strength. Verbatim
 * extraction, no behaviour change.
 *
 * Unlike ResidentialSidebarSummary (#2387), which shows exactly ONE
 * strength widget at a time (legacy checklist meter pre-draft OR the newer
 * StrengthMeter post-draft), the pre-decomposition Agricultural form always
 * renders the ListingStrengthMeter checklist AND additionally renders
 * StrengthMeter once a listingId exists — both simultaneously. That is
 * preserved here exactly; do not "fix" it into mutual exclusivity, that
 * would be a behaviour change out of this issue's scope.
 */
export function AgriculturalSidebarSummary({ title, locality, priceRupees, landArea, specChips, photoCount, coverImageUrl, locationConfirmed, listingId, strengthResult, checklist }: AgriculturalSidebarSummaryProps) {
  return (
    <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <BuyerPreviewCard
        title={title}
        locality={locality}
        priceRupees={priceRupees}
        monthlyRent={null}
        isRent={false}
        areaSqft={landArea}
        specChips={specChips}
        photoCount={photoCount}
        coverImageUrl={coverImageUrl}
        locationConfirmed={locationConfirmed}
      />
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <ListingStrengthMeter checklist={checklist} />
      </div>
      {listingId && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <StrengthMeter result={strengthResult} variant="sidebar" />
        </div>
      )}
    </div>
  );
}
