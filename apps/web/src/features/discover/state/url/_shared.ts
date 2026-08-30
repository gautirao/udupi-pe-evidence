/**
 * Shared types for the useDiscoverUrlState domain-hook decomposition
 * (Issue #2001 Slice 2 PR2).
 *
 * Types only — no runtime logic, no runtime imports/exports. Every domain
 * hook (viewport/city/filters/school/area/agricultural) imports ONLY this
 * file plus externals (react, react-router-dom, @tanstack/react-query) and
 * `import type`s from the useDiscoverUrlState facade for the public field
 * types (DiscoverViewport, DiscoverUrlFilters, DiscoverJourney,
 * DiscoverIntent, DiscoverUrlState, DiscoverUrlActions) — never another
 * domain module. That keeps the domain graph a DAG with no cross-domain
 * reach-in; this file being type-only (isolatedModules) means it compiles
 * to no runtime module at all, so there is no bundler-level cycle risk
 * either, even though the type graph loops back through the facade.
 */
import type { MutableRefObject } from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { QueryClient } from '@tanstack/react-query';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

/** setUrlParams's exact type, derived structurally from useSearchParams's return tuple. */
export type SetDiscoverUrlParams = ReturnType<typeof useSearchParams>[1];

/**
 * Facade-owned debounce timer refs (Issue #1854 / qa-fast R1) — each domain
 * that needs to schedule or cancel a debounced write receives these via
 * ctx.timers rather than owning its own ref, so cross-domain cancellation
 * call sites (clearAllFiltersAndSearch in filters.ts; changeCity/deselectArea/
 * startOver in city.ts/area.ts) all cancel the SAME ref instance instead of a
 * domain-local copy that could go stale.
 */
export interface UrlDebounceTimers {
  viewport: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  filtersLive: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  search: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/** Read-only values one domain needs from another, threaded via the facade. */
export interface UrlCrossDomainReads {
  /** Current city slug — school.ts's setSchoolJourney bbox-fallback cache key (qa-fast R4). */
  city: string;
}

/** Everything a domain hook needs to read/write URL state. */
export interface UrlDomainCtx {
  urlParams: URLSearchParams;
  setUrlParams: SetDiscoverUrlParams;
  timers: UrlDebounceTimers;
  queryClient: QueryClient;
  reads: UrlCrossDomainReads;
  /**
   * Issue #2083 RC_A part 2 (stale-`prev`-closure fix) — a facade-owned ref that
   * always holds the CURRENT render's `urlParams`, updated synchronously in the
   * facade's render body (not in an effect, so it is current by the time any
   * `setTimeout` callback scheduled during this render fires).
   *
   * `setUrlParams` is react-router's `setSearchParams`; in react-router-dom
   * 6.30.1 the `prev` handed to its functional-updater form is NOT the live
   * URL — it is the `searchParams` closed over from the render that produced
   * that `setSearchParams` identity. A debounced flush (viewport.ts's
   * `reportViewport`) that reads `prev` can therefore navigate to an entire
   * STALE query string plus its own delta, reviving params the user cleared
   * in between. A domain that flushes a delayed write must read
   * `liveUrlParamsRef.current` instead of relying on `prev`.
   */
  liveUrlParamsRef: MutableRefObject<URLSearchParams>;
}

/** A domain hook's return shape: a slice of state + a slice of actions. */
export interface UrlDomainModule<
  S extends Partial<DiscoverUrlState>,
  A extends Partial<DiscoverUrlActions>,
> {
  state: S;
  actions: A;
}
