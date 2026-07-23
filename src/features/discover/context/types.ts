import type { DiscoverUrlActions, DiscoverUrlState, DiscoverViewport } from '@/hooks/useDiscoverUrlState';

/**
 * DiscoverNavContext value — every canonical URL-derived field EXCEPT the
 * high-frequency `viewport`, which lives in its own context (see
 * DiscoverContext.tsx for the re-render-storm rationale). Using `Omit` over
 * urlState (rather than hand-picking a subset of keys) guarantees every
 * field consumers may need in a future prop-migration is present — nothing
 * is silently missing because it wasn't top-of-mind when this file was
 * written.
 */
export type DiscoverNavContextValue = Omit<DiscoverUrlState, 'viewport'>;

/**
 * Wrapped in an object (rather than exporting `DiscoverViewport | null`
 * directly) so the "no provider above me" case (missing context, a bug) can
 * be distinguished from the legitimate "provider present, no viewport in the
 * URL yet" case (`{ viewport: null }`).
 */
export interface DiscoverViewportContextValue {
  viewport: DiscoverViewport | null;
}

/** The full DiscoverUrlActions surface, exposed with a stable identity that never changes. */
export type DiscoverActionsContextValue = DiscoverUrlActions;

export type MobileView = 'LIST' | 'MAP';

export interface DiscoverShellContextValue {
  mobileView: MobileView;
  setMobileView: (view: MobileView) => void;
  /** True at <=820px — see the inclusive-boundary note on the useMediaQuery call site. */
  isMobileShell: boolean;
}
