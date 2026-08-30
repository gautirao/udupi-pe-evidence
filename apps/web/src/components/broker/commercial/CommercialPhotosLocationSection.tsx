import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { MapPin } from '@/components/broker/residential/MapPin';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';
import { Section } from './CommercialFormPrimitives';

export interface CommercialPhotosLocationSectionProps {
  listingId: string | null;
  residentialLocationValue: UseResidentialLocationResult | null;
  canSubmit: boolean;
  isCreatePending: boolean;
  onSaveDraft: () => void;
}

/** #2388 — Section 6: inline photos and map-pin location (real system, no navigation away from the form). */
export function CommercialPhotosLocationSection({ listingId, residentialLocationValue, canSubmit, isCreatePending, onSaveDraft }: CommercialPhotosLocationSectionProps) {
  return (
    <Section number={6} title="Photos & location">
      {listingId ? (
        <>
          <InlinePhotos listingId={listingId} />
          <div className="h-px bg-border" />
          {residentialLocationValue && <MapPin location={residentialLocationValue} />}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Save your details to add photos and pin the location.
          </p>
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={!canSubmit || isCreatePending}>
            {isCreatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      )}
    </Section>
  );
}
