import type { useUpdateListing } from '@/hooks/useBrokerListings';
import { validateVideoUrl } from '@/lib/editListing/valueMappers';

// Issue #1838 PR F — step-2 ("Add Photos") video-URL + continue commands,
// split out of the former useEditListingCommands.ts. VERBATIM logic move —
// no onError added to the step-2 mutate call (the hook-level onError in
// useUpdateListing already toasts; adding another would double-toast). Zero
// useCallback/useMemo — plain per-render closures.

export interface UseMediaStepCommandsParams {
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  setVideoUrlError: (v: string) => void;
  advanceAfterSave: (sequentialNext: number) => void;
  updateListing: ReturnType<typeof useUpdateListing>;
}

export interface MediaStepCommands {
  changeVideoUrl: (value: string) => void;
  continue: () => void;
}

export function useMediaStepCommands({
  videoUrl, setVideoUrl, setVideoUrlError, advanceAfterSave, updateListing,
}: UseMediaStepCommandsParams): MediaStepCommands {
  const handleVideoUrlChange = (value: string) => {
    setVideoUrl(value);
    const error = validateVideoUrl(value);
    setVideoUrlError(error ?? '');
  };

  const handleStep2Continue = () => {
    // Persist video URL before advancing; hook-level onError toast handles failures
    updateListing.mutate(
      { videoUrl: videoUrl.trim() || null, applyVideoUrl: true },
      {
        onSuccess: () => {
          advanceAfterSave(3);
        },
      },
    );
  };

  return {
    changeVideoUrl: handleVideoUrlChange,
    continue: handleStep2Continue,
  };
}
