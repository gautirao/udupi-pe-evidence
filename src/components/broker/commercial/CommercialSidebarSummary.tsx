import { BuyerPreviewCard, type BuyerPreviewSpecChip } from '@/components/broker/BuyerPreviewCard';
import { ListingStrengthMeter, type ListingStrengthChecklist } from '@/components/broker/ListingStrengthMeter';
import { StrengthMeter } from '@/components/broker/residential/StrengthMeter';
import type { ListingStrengthResult } from '@/lib/listingStrength';

export interface CommercialSidebarSummaryProps {
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
  checklist: ListingStrengthChecklist;
  listingId: string | null;
  strengthResult: ListingStrengthResult;
}

/** #2388 — right column: buyer preview card + listing strength meters. */
export function CommercialSidebarSummary(props: CommercialSidebarSummaryProps) {
  return (
    <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <BuyerPreviewCard
        title={props.title}
        locality={props.locality}
        priceRupees={props.priceRupees}
        monthlyRent={props.monthlyRent}
        isRent={props.isRent}
        areaSqft={props.areaSqft}
        specChips={props.specChips}
        photoCount={props.photoCount}
        coverImageUrl={props.coverImageUrl}
        locationConfirmed={props.locationConfirmed}
      />
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <ListingStrengthMeter checklist={props.checklist} />
      </div>
      {props.listingId && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <StrengthMeter result={props.strengthResult} variant="sidebar" />
        </div>
      )}
    </div>
  );
}
