/**
 * useLocationStepCommands — Issue #1838 PR F hook-level unit tests.
 *
 * Split out of the former useEditListingCommands.test.ts (PR C commit 3),
 * covering exactly the location-step (step 3) slice of that suite:
 * confirmLocality's title auto-regen and the isPending mutate guard on
 * confirmAddress/unconfirmAddress.
 *
 * Unlike useReviewStepCommands, this hook calls no router hook itself (its
 * nav dependencies — setCameFromReview/setCurrentStep/reviewStep — are
 * passed in as plain values/functions), so no Router wrapper is needed here.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBaseFields } from '../useBaseFields';
import { useEditListingUiState } from '../useEditListingUiState';
import { useLocationStepCommands } from '../useLocationStepCommands';

function useTestHarness(mockUpdateMutate: ReturnType<typeof vi.fn>, updateIsPending: boolean) {
  const base = useBaseFields();
  const ui = useEditListingUiState();

  const commands = useLocationStepCommands({
    titleManuallyEdited: ui.values.titleManuallyEdited,
    setTitle: base.setters.setTitle,
    setConfirmedLocality: ui.setters.setConfirmedLocality,
    setCameFromReview: vi.fn(),
    setCurrentStep: vi.fn(),
    isAgriListing: false,
    reviewStep: 4,
    // Cast justified: only mutate/isPending are read by this hook, matching
    // the mocking convention already used for the same type elsewhere.
    updateListing: { mutate: mockUpdateMutate, isPending: updateIsPending } as unknown as Parameters<
      typeof useLocationStepCommands
    >[0]['updateListing'],
  });

  return { base, ui, commands };
}

describe('useLocationStepCommands', () => {
  describe('commands.confirmLocality', () => {
    it('regenerates the title from the confirmed locality when the title has not been manually edited', () => {
      const { result } = renderHook(() => useTestHarness(vi.fn(), false));

      act(() => {
        result.current.commands.confirmLocality('Manipal, Udupi', 13.35, 74.75);
      });

      expect(result.current.ui.values.confirmedLocality).toBe('Manipal, Udupi');
      expect(result.current.base.values.title).toBe('Property in Manipal');
    });

    it('updates confirmedLocality but does NOT overwrite the title once it has been manually edited', () => {
      const { result } = renderHook(() => useTestHarness(vi.fn(), false));

      act(() => {
        result.current.ui.setters.setTitleManuallyEdited(true);
        result.current.base.setters.setTitle('My custom title');
      });

      act(() => {
        result.current.commands.confirmLocality('Kaup, Udupi', 13.36, 74.76);
      });

      expect(result.current.ui.values.confirmedLocality).toBe('Kaup, Udupi');
      expect(result.current.base.values.title).toBe('My custom title');
    });
  });

  describe('isPending guard', () => {
    it('does not call updateListing.mutate from confirmAddress/unconfirmAddress while a save is already pending', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(() => useTestHarness(mockUpdateMutate, true));

      act(() => {
        result.current.commands.confirmAddress({
          address_line1: '',
          lat: 13.35,
          lng: 74.75,
          address_confirmed: true,
        });
        result.current.commands.unconfirmAddress();
      });

      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });

    it('calls updateListing.mutate from confirmAddress when no save is pending', () => {
      const mockUpdateMutate = vi.fn();
      const { result } = renderHook(() => useTestHarness(mockUpdateMutate, false));

      act(() => {
        result.current.commands.confirmAddress({
          address_line1: '',
          lat: 13.35,
          lng: 74.75,
          address_confirmed: true,
        });
      });

      expect(mockUpdateMutate).toHaveBeenCalledWith({
        latitude: 13.35,
        longitude: 74.75,
        addressConfirmed: true,
      });
    });
  });
});
