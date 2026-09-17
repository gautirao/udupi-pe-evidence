/**
 * City URL domain — Issue #2001 Slice 2 PR2 (updated #2002 Slice 2 PR3).
 *
 * Owns: `city`, `intent` (#1494) reads + changeCity / setCity / setIntent /
 * setScope writes. The `scope` (#1745 P2) read has been lifted to
 * compatibility.ts by #2002; this module still owns the setScope writer
 * (canonical writer stays here). See useDiscoverUrlState.ts's module doc for
 * the full param contract.
 */
import { useCallback } from 'react';
import { isValidScope } from '@/hooks/discoverUrlNormalize';
import {
  applyCityChangeReset,
  applyLayerSelectionToParams,
  paramsToLayerInput,
} from '@/utils/discoverLayerRegistry';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type {
  DiscoverIntent,
  DiscoverUrlActions,
  DiscoverUrlState,
} from '@/hooks/useDiscoverUrlState';
import { clearNodeParam } from './navigation';
import { applyResultScopeCommit } from './resultScope';

type CityState = Pick<DiscoverUrlState, 'city' | 'intent'>;
type CityActions = Pick<DiscoverUrlActions, 'changeCity' | 'setCity' | 'setIntent' | 'setScope'>;

export function useCityUrlDomain(ctx: UrlDomainCtx): UrlDomainModule<CityState, CityActions> {
  const { urlParams, setUrlParams, timers, reads } = ctx;

  // city is computed once by the facade (shared with school.ts's bbox-fallback
  // read via ctx.reads) and re-surfaced here as this domain's own state slice.
  const city = reads.city;

  // Issue #1494 — intent param: 'rent' is the only non-default value. Anything else
  // (absent, 'buy', or invalid) maps to the default 'buy'.
  const rawIntent = urlParams.get('intent');
  const intent: DiscoverIntent = rawIntent === 'rent' ? 'rent' : 'buy';

  const setCity = useCallback(
    (newCity: string) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('city', newCity);
          // City change clears area selection and viewport (new city = new context)
          next.delete('areaKey');
          next.delete('lat');
          next.delete('lon');
          next.delete('zoom');
          clearNodeParam(next);
          applyResultScopeCommit(next, null);
          next.delete('rprev');
          return next;
        },
        { replace: false }, // PUSH — city is a major navigation destination
      );
    },
    [setUrlParams],
  );

  /**
   * Atomic city switch — single PUSH, clears journey, groupId, areaKey, and viewport.
   * Property filters (type, beds, price, seller, booleans, dates) are preserved.
   */
  const changeCity = useCallback(
    (newCity: string) => {
      // Cancel any pending viewport debounce so it cannot restore stale coords after the switch.
      if (timers.viewport.current) {
        clearTimeout(timers.viewport.current);
        timers.viewport.current = null;
      }
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // Issue #1745 P3 — delegates the journey/selection reset + the 12
          // layer-param deletes to discoverLayerRegistry's pure reducer, rather
          // than re-listing them inline here.
          applyLayerSelectionToParams(next, applyCityChangeReset(paramsToLayerInput(prev)));
          next.set('city', newCity);
          // Clear viewport — new city has its own default zoom/center
          next.delete('lat');
          next.delete('lon');
          next.delete('zoom');
          clearNodeParam(next);
          applyResultScopeCommit(next, null);
          next.delete('rprev');
          return next;
        },
        { replace: false }, // PUSH — city switch is a major navigation destination
      );
    },
    [setUrlParams, timers],
  );

  // Issue #1494 — buy/rent intent. REPLACE (preference change, not navigation).
  // 'buy' is the default — omit from URL; only emit 'rent'.
  const setIntent = useCallback(
    (newIntent: DiscoverIntent) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newIntent === 'rent') {
            next.set('intent', 'rent');
          } else {
            next.delete('intent');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setUrlParams],
  );

  // Issue #1745 P2/P8 — residential scope axis. Orthogonal to the agri-only region/maxKm
  // corridor model (agricultural.ts); mirrors setRegion's canonical omission of
  // invalid/null values, but does not touch region/maxKm. Issue #1745 P8 — REPLACE
  // (not PUSH): a scope selection is a landing-level refinement, not a navigational
  // destination, so selecting/switching/clearing scope must not stack browser history.
  const setScope = useCallback(
    (newScope: string | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newScope != null && isValidScope(newScope)) {
            next.set('scope', newScope);
          } else {
            // Silently discard invalid/null scope values (canonical omission)
            next.delete('scope');
          }
          return next;
        },
        { replace: true }, // REPLACE — scope refinement, not a navigational destination
      );
    },
    [setUrlParams],
  );

  return {
    state: { city, intent },
    actions: { changeCity, setCity, setIntent, setScope },
  };
}
