import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlinePhotos } from './InlinePhotos';
import { MapPin } from './MapPin';
import type { UseResidentialLocationResult } from './useResidentialLocation';
import { Field, Section } from './ResidentialFormPrimitives';

interface ResidentialPhotosLocationSectionProps {
  listingId: string | null;
  residentialLocationValue: UseResidentialLocationResult | null;
  canSubmit: boolean;
  isCreatePending: boolean;
  onContinue: () => void;
  videoLinkDraft: string;
  onVideoLinkDraftChange: (value: string) => void;
}

/** #2387 — Section 6: Photos & location (issue #1718 — inline, real system, no navigation). Verbatim extraction, no behaviour change. */
export function ResidentialPhotosLocationSection({ listingId, residentialLocationValue, canSubmit, isCreatePending, onContinue, videoLinkDraft, onVideoLinkDraftChange }: ResidentialPhotosLocationSectionProps) {
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
          <Button type="button" variant="outline" onClick={onContinue} disabled={!canSubmit || isCreatePending}>
            {isCreatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      )}

      {/* design-spec.md §prototype_only "video_link" — no create-payload field exists;
          rendered disabled so the value is never wired into buildPayload(). */}
      <Field id="videoLink" label="Video link" hint="Add a video after creating the draft — coming soon on this page.">
        <Input id="videoLink" placeholder="YouTube or Instagram Reel URL" value={videoLinkDraft} onChange={(e) => onVideoLinkDraftChange(e.target.value)} className="h-11" disabled />
      </Field>
    </Section>
  );
}
