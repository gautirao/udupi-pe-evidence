import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';
import { useEditListingNavigation } from '../useEditListingNavigation';
import type { PropertyType } from '@/lib/listing-constants';

// Issue #1838 slice-7 — useEditListingNavigation unit tests.
// useSearchParams requires Router context, so every render is wrapped in
// MemoryRouter. This file is .ts (not .tsx) per the approved slice-7 file
// glob, so the wrapper uses createElement instead of JSX.

function wrapperFor(initialEntries: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(MemoryRouter, { initialEntries }, children);
  };
}

describe('useEditListingNavigation', () => {
  describe('cameFromReview / advanceAfterSave', () => {
    it('advances sequentially when cameFromReview is false', () => {
      const { result } = renderHook(() => useEditListingNavigation(''), {
        wrapper: wrapperFor(['/edit/x']),
      });

      expect(result.current.cameFromReview).toBe(false);

      act(() => {
        result.current.advanceAfterSave(2);
      });

      expect(result.current.currentStep).toBe(2);
    });

    it('returns to the review step and clears cameFromReview when true (ignores sequentialNext)', () => {
      const { result } = renderHook(() => useEditListingNavigation(''), {
        wrapper: wrapperFor(['/edit/x']),
      });

      act(() => {
        result.current.setCameFromReview(true);
      });
      expect(result.current.cameFromReview).toBe(true);

      act(() => {
        result.current.advanceAfterSave(3);
      });

      // BASE_STEPS reviewStep === 4, NOT the passed sequentialNext (3)
      expect(result.current.currentStep).toBe(result.current.reviewStep);
      expect(result.current.currentStep).toBe(4);
      expect(result.current.cameFromReview).toBe(false);
    });
  });

  describe('wizardSteps branch', () => {
    it('agricultural_land: 5 steps, reviewStep=5, boundaryStep=4, isAgriListing=true', () => {
      const { result } = renderHook(
        () => useEditListingNavigation('agricultural_land' as PropertyType),
        { wrapper: wrapperFor(['/edit/x']) },
      );

      expect(result.current.wizardSteps.length).toBe(5);
      expect(result.current.reviewStep).toBe(5);
      expect(result.current.boundaryStep).toBe(4);
      expect(result.current.isAgriListing).toBe(true);
    });

    it('non-agri: 4 steps, boundaryStep=0, isAgriListing=false', () => {
      const { result } = renderHook(
        () => useEditListingNavigation('apartment' as PropertyType),
        { wrapper: wrapperFor(['/edit/x']) },
      );

      expect(result.current.wizardSteps.length).toBe(4);
      expect(result.current.boundaryStep).toBe(0);
      expect(result.current.isAgriListing).toBe(false);
    });
  });

  describe('latent clamp characterisation (KNOWN quirk — NOT correct behaviour, do not "fix")', () => {
    // The initialStep clamp is a one-shot LAZY useState initializer that reads
    // wizardSteps.length AS MEASURED AT MOUNT. propertyType starts as '' (BASE_STEPS,
    // length 4); a deep-link ?step=5 clamps to 4 and is NEVER re-expanded even after
    // propertyType later flips to 'agricultural_land' (AGRI_STEPS, length 5) on a
    // rerender (not a remount). If this test ever observes currentStep===5 after the
    // rerender, a forbidden refactor (useMemo/useEffect reseeding currentStep, or an
    // eager useState) was introduced — see useEditListingNavigation.ts's block comment.
    it('clamps ?step=5 to 4 at mount (propertyType="") and does NOT re-expand on rerender to agri', () => {
      const { result, rerender } = renderHook(
        ({ pt }: { pt: PropertyType | '' }) => useEditListingNavigation(pt),
        {
          wrapper: wrapperFor(['/edit/x?step=5']),
          initialProps: { pt: '' as PropertyType | '' },
        },
      );

      expect(result.current.currentStep).toBe(4);

      rerender({ pt: 'agricultural_land' as PropertyType });

      // Still 4 — the lazy initializer already ran and is never recomputed.
      expect(result.current.currentStep).toBe(4);
    });

    it('?step=abc (non-numeric) clamps to 1', () => {
      const { result } = renderHook(() => useEditListingNavigation(''), {
        wrapper: wrapperFor(['/edit/x?step=abc']),
      });

      expect(result.current.currentStep).toBe(1);
    });

    it('?step=999 clamps to the BASE_STEPS length (4) at mount', () => {
      const { result } = renderHook(() => useEditListingNavigation(''), {
        wrapper: wrapperFor(['/edit/x?step=999']),
      });

      expect(result.current.currentStep).toBe(4);
    });
  });
});
