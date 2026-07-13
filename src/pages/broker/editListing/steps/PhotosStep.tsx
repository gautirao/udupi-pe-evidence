import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from 'lucide-react';
import { ImageUploader } from '@/components/broker/ImageUploader';
import { SectionCard } from '@/components/broker/SectionCard';
import { extractYouTubeId, isInstagramUrl } from '@/lib/editListing/valueMappers';

/**
 * Issue #1838 slice 6a — extracted step-2 ("Add Photos") JSX block from
 * EditListingForm.tsx. STATELESS: all values/setters/handlers arrive as
 * props; EditListingForm remains the sole state owner. The parent keeps the
 * `data-testid="step-2-panel"` always-mounted `display:none` wrapper — see
 * CRITICAL comment there. This component must NOT be conditionally mounted
 * on `currentStep`, or ImageUploader's in-flight upload state is lost.
 */
interface PhotosStepProps {
  id: string | undefined;
  isSubmittable: boolean;
  videoUrl: string;
  videoUrlError: string;
  canSubmitImages: boolean;
  setCanSubmitImages: (canSubmit: boolean) => void;
  handleVideoUrlChange: (value: string) => void;
  handleStep2Continue: () => void;
}

export function PhotosStep({
  id,
  isSubmittable,
  videoUrl,
  videoUrlError,
  canSubmitImages,
  setCanSubmitImages,
  handleVideoUrlChange,
  handleStep2Continue,
}: PhotosStepProps) {
  return (
    <>
      {isSubmittable && (
        <div className="space-y-6">
          <SectionCard
            title="Listing images"
            description="A great set of photos helps buyers understand the property better."
          >
            {/* ImageUploader is always mounted (CSS visibility) so upload state is preserved */}
            <ImageUploader listingId={id!} onCanSubmitChange={setCanSubmitImages} />
          </SectionCard>

          <SectionCard
            title="Property video"
            description="Optional — add a YouTube or Instagram Reel link to give buyers a walkthrough."
          >
            <div className="space-y-2">
              <Label htmlFor="videoUrl" className="sr-only">Property video link</Label>
              <Input
                id="videoUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => handleVideoUrlChange(e.target.value)}
              />
              {videoUrlError && (
                <p className="text-sm text-destructive">{videoUrlError}</p>
              )}
              {/* YouTube thumbnail preview */}
              {videoUrl && !videoUrlError && extractYouTubeId(videoUrl) && (
                <img
                  src={`https://img.youtube.com/vi/${extractYouTubeId(videoUrl)}/mqdefault.jpg`}
                  alt="Video thumbnail"
                  className="rounded-md w-48 h-auto border"
                />
              )}
              {/* Instagram confirmed state */}
              {videoUrl && !videoUrlError && isInstagramUrl(videoUrl) && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Link className="h-4 w-4" />
                  <span>instagram.com</span>
                </div>
              )}
            </div>
          </SectionCard>

          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              onClick={handleStep2Continue}
              disabled={!canSubmitImages}
            >
              Save & Continue
            </Button>
            {!canSubmitImages && (
              <p className="text-sm text-muted-foreground">
                Add at least 3 photos to continue.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
