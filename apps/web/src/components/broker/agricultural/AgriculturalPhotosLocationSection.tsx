import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { MapPin } from '@/components/broker/residential/MapPin';
import type { UseResidentialLocationResult } from '@/components/broker/residential/useResidentialLocation';
import { Section } from './AgriculturalFormPrimitives';

interface AgriculturalPhotosLocationSectionProps {
  listingId: string | null;
  residentialLocation: UseResidentialLocationResult;
  canSubmit: boolean;
  isCreatePending: boolean;
  onContinue: () => void;
}

/** #2398 — Section 5: "Photos & location" (inline, real system, no navigation). Verbatim extraction, no behaviour change. */
export function AgriculturalPhotosLocationSection({ listingId, residentialLocation, canSubmit, isCreatePending, onContinue }: AgriculturalPhotosLocationSectionProps) {
  return (
    <Section number={5} title="Photos & location">
      {listingId ? (
        <>
          <InlinePhotos listingId={listingId} />
          <div className="h-px bg-border" />
          <MapPin location={residentialLocation} />
          <p className="text-xs text-muted-foreground">
            The pin marks the location only — it is not a legal or survey boundary.
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Save your details to add photos and pin the location.
          </p>
          <Button type="button" variant="outline" onClick={onContinue} disabled={!canSubmit || isCreatePending}>
            {isCreatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      )}
    </Section>
  );
}
