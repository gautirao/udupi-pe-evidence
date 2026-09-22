import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlinePhotos } from '@/components/broker/residential/InlinePhotos';
import { Section } from './CommercialFormPrimitives';

export interface CommercialPhotosLocationSectionProps {
  listingId: string | null;
  canSubmit: boolean;
  isCreatePending: boolean;
  onSaveDraft: () => void;
}

/**
 * #2388 — Section 6: inline photos (real system, no navigation away from the form).
 * #2655 — map-pin location moved out to Section 7 ("Location & Nearby Places"); this section
 * is photos-only now. Component/file name kept for minimal diff — only the rendered title and
 * props changed.
 */
export function CommercialPhotosLocationSection({ listingId, canSubmit, isCreatePending, onSaveDraft }: CommercialPhotosLocationSectionProps) {
  return (
    <Section number={6} title="Photos">
      {listingId ? (
        <InlinePhotos listingId={listingId} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Save your details to add photos.
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
