import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import {
  isCommercialFromFilters,
  isFamilyUnset,
  resolveActiveFamily,
  type PropertyFamily,
} from '../selectors/familyResolution';
import {
  computeSwitchToCommercialPatch,
  computeSwitchToResidentialPatch,
} from '../selectors/familySwitchTransitions';

/**
 * Issue #2658 (C2) — the ONLY state holder for the Residential/Commercial
 * family: the override, the two per-family memory refs, and the banking
 * effect that keeps them in step with `filters`. Extracted from
 * `usePropertyFilterGroups` (Issues #2450, #2552, #2555 item 1), which now
 * delegates to this controller as a thin facade (see that hook's own
 * comment for why it must still be called exactly once per
 * (filters, onFiltersChange) pair — the same constraint applies here:
 * calling this controller twice for the same filters/onFiltersChange pair
 * creates two independent `familyOverride` states free to disagree).
 *
 * `residentialMemoryRef`/`commercialMemoryRef`/`setFamilyOverride` are
 * exposed raw (not just through `commit`) because AreaSelectedPanel's
 * zero-result relaxation wrapper replicates the exact override + memory
 * write `commit` performs, without a second `useState` instance — see this
 * controller's own `commit` for the shape that wrapper mirrors.
 */
export function useBuyerFamilyController(
  filters: PropertyFilters,
  isCommercialSubtypeSupported: boolean,
) {
  const commercialFromFilters = isCommercialFromFilters(filters);
  const familyIsUnset = isFamilyUnset(filters);

  // A click must switch the visible family before the emitted filters round-trip back as props:
  // on the FIRST Commercial click there is no subtype yet, so derivation alone would leave the row
  // closed and the chip unpressed. `null` means "no click yet — trust the filters".
  const [familyOverride, setFamilyOverride] = useState<PropertyFamily | null>(null);

  const residentialMemoryRef = useRef<PropertyFilters['propertyTypes']>(undefined);
  const commercialMemoryRef = useRef<PropertyFilters['commercialSubtypes']>(undefined);

  const activeFamily: PropertyFamily = resolveActiveFamily({
    commercialFromFilters,
    familyIsUnset,
    familyOverride,
  });

  // Issue #2555 item 1 — keep each family's memory in step with what it currently holds. An
  // EFFECT, not a write during render or inside each handler: see usePropertyFilterGroups' own
  // (now-superseded) doc comment for the full reasoning this controller inherits verbatim,
  // including the FIVE past incidents of a handler forgetting to bank a clear.
  useEffect(() => {
    if (activeFamily === 'residential') {
      residentialMemoryRef.current = filters.propertyTypes;
    }
    if (activeFamily === 'commercial') {
      commercialMemoryRef.current = filters.commercialSubtypes;
    }
  }, [activeFamily, filters.propertyTypes, filters.commercialSubtypes]);

  /**
   * Issue #2552 — the family-switch commit: records the override and returns the next filters
   * patch for the caller to emit. Returns `null` when the capability is off (no-op), mirroring
   * `handleSelectFamily`'s early return.
   *
   * The override write happens BEFORE the capability-off check would matter to a caller — no,
   * precisely mirroring the source: the capability guard is checked FIRST and returns null before
   * any state changes, exactly like `handleSelectFamily`'s `if (!isCommercialSubtypeSupported) return;`.
   */
  const commit = useCallback(
    (family: PropertyFamily): PropertyFilters | null => {
      if (!isCommercialSubtypeSupported) return null;
      setFamilyOverride(family);
      return family === 'commercial'
        ? computeSwitchToCommercialPatch(filters, commercialMemoryRef.current)
        : computeSwitchToResidentialPatch(filters, residentialMemoryRef.current);
    },
    [filters, isCommercialSubtypeSupported],
  );

  /**
   * Issue #2555 item 1 / #2552 — "Clear filters" promises an unfiltered state, so both the
   * override and both memories reset with it. Callers combine this with
   * `clearPropertyFilters(filters)` (the pure selector) to reproduce
   * `handleClearPropertyFilters`'s full effect.
   */
  const resetForClear = useCallback(() => {
    setFamilyOverride(null);
    residentialMemoryRef.current = undefined;
    commercialMemoryRef.current = undefined;
  }, []);

  return {
    activeFamily,
    commercialFromFilters,
    familyIsUnset,
    setFamilyOverride,
    residentialMemoryRef,
    commercialMemoryRef,
    commit,
    resetForClear,
  };
}

export type BuyerFamilyController = ReturnType<typeof useBuyerFamilyController>;
