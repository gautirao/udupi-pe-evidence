import { useState, type Dispatch, type SetStateAction } from 'react';

// Issue #1838 PR B — pure state-ownership extraction of the 6
// never-hydrated UI-only fields from EditListingForm. Unlike
// useBaseFields.ts and the other domain slice hooks, this hook has NO
// hydrate() member — these fields must NOT reset when the listing id
// changes (they track in-session UI concerns, not server-sourced data):
//   - landAreaUnitError / builtAreaUnitError — inline unit-validation errors
//   - canSubmitImages — image uploader >= 3 images gate
//   - videoUrlError — inline video-URL validation error
//   - titleManuallyEdited — D1 hybrid title auto-regen guard
//   - confirmedLocality — last locality confirmed via AddressPicker pin confirm

export interface EditListingUiStateValues {
  landAreaUnitError: string;
  builtAreaUnitError: string;
  canSubmitImages: boolean;
  videoUrlError: string;
  titleManuallyEdited: boolean;
  confirmedLocality: string;
}

export interface EditListingUiStateSetters {
  setLandAreaUnitError: Dispatch<SetStateAction<string>>;
  setBuiltAreaUnitError: Dispatch<SetStateAction<string>>;
  setCanSubmitImages: Dispatch<SetStateAction<boolean>>;
  setVideoUrlError: Dispatch<SetStateAction<string>>;
  setTitleManuallyEdited: Dispatch<SetStateAction<boolean>>;
  setConfirmedLocality: Dispatch<SetStateAction<string>>;
}

export interface UseEditListingUiStateResult {
  values: EditListingUiStateValues;
  setters: EditListingUiStateSetters;
}

export function useEditListingUiState(): UseEditListingUiStateResult {
  // Inline unit-validation errors (only shown when area has a value but unit is missing)
  const [landAreaUnitError, setLandAreaUnitError] = useState('');
  const [builtAreaUnitError, setBuiltAreaUnitError] = useState('');
  // Tracks whether image uploader has >= 3 images (drives step 2 completion + submit gate)
  const [canSubmitImages, setCanSubmitImages] = useState(false);
  const [videoUrlError, setVideoUrlError] = useState('');
  /**
   * D1 hybrid — Title auto-regen from confirmed locality.
   * `titleManuallyEdited` is set the first time the broker manually types in
   * the title field. While false, onLocalityConfirmed auto-updates the title.
   */
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  /**
   * The last locality string that was confirmed via AddressPicker pin confirm
   * (AC5). Used in Step 4 to detect title/locality disagreement.
   */
  const [confirmedLocality, setConfirmedLocality] = useState('');

  return {
    values: {
      landAreaUnitError,
      builtAreaUnitError,
      canSubmitImages,
      videoUrlError,
      titleManuallyEdited,
      confirmedLocality,
    },
    setters: {
      setLandAreaUnitError,
      setBuiltAreaUnitError,
      setCanSubmitImages,
      setVideoUrlError,
      setTitleManuallyEdited,
      setConfirmedLocality,
    },
  };
}
