/**
 * useReviewStepCommands — Issue #1838 PR F hook-level unit tests.
 *
 * Split out of the former useEditListingCommands.test.ts (PR C commit 3),
 * covering exactly the review-step resetTitleToLocality slice of that suite.
 * This hook calls useNavigate() internally (handleSubmitForReview redirects
 * to /broker/listings), so every render is wrapped in MemoryRouter.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';
import { useBaseFields } from '../useBaseFields';
import { useEditListingUiState } from '../useEditListingUiState';
import { useReviewStepCommands } from '../useReviewStepCommands';

function wrapperFor() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries: ['/edit/test-id'] }, children);
  };
}

function useTestHarness() {
  const base = useBaseFields();
  const ui = useEditListingUiState();

  const commands = useReviewStepCommands({
    confirmedLocality: ui.values.confirmedLocality,
    setTitle: base.setters.setTitle,
    setTitleManuallyEdited: ui.setters.setTitleManuallyEdited,
    setCameFromReview: vi.fn(),
    setCurrentStep: vi.fn(),
    boundaryStep: 4,
    // Cast justified: only mutate/isPending are read by this hook, matching
    // the mocking convention already used for the same type elsewhere.
    submitListing: { mutate: vi.fn(), isPending: false } as unknown as Parameters<
      typeof useReviewStepCommands
    >[0]['submitListing'],
    toast: vi.fn(),
  });

  return { base, ui, commands };
}

describe('useReviewStepCommands', () => {
  describe('commands.resetTitleToLocality', () => {
    it('produces "Property in Kaup" from confirmedLocality "Kaup, Udupi"', () => {
      const { result, rerender } = renderHook(() => useTestHarness(), { wrapper: wrapperFor() });

      act(() => {
        result.current.ui.setters.setConfirmedLocality('Kaup, Udupi');
      });
      rerender();
      act(() => {
        result.current.commands.resetTitleToLocality();
      });

      expect(result.current.base.values.title).toBe('Property in Kaup');
      expect(result.current.ui.values.titleManuallyEdited).toBe(false);
    });

    it('is a no-op when confirmedLocality is empty', () => {
      const { result } = renderHook(() => useTestHarness(), { wrapper: wrapperFor() });

      act(() => {
        result.current.commands.resetTitleToLocality();
      });

      expect(result.current.base.values.title).toBe('');
    });
  });
});
