import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { Section } from './AgriculturalFormPrimitives';

interface AgriculturalPhotosLocationSectionProps {
  listingId: string | null;
  canSubmit: boolean;
  isCreatePending: boolean;
  onContinue: () => void;
}

/**
 * #2398 — Section 5: "Photos & location" (inline, real system, no navigation).
 * #2655 — map-pin location moved out to the "Location & Nearby Places" section; this section
 * is photos-only now. Component/file name kept for minimal diff — only the rendered title and
 * props changed.
 */
export function AgriculturalPhotosLocationSection({ listingId, canSubmit, isCreatePending, onContinue }: AgriculturalPhotosLocationSectionProps) {
  return (
    <Section number={5} title="Photos">
      {listingId ? (
        <InlinePhotos listingId={listingId} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Save your details to add photos.
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
