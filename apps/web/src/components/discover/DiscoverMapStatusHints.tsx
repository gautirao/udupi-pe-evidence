import { Loader2 } from 'lucide-react';

/**
 * Issue #1824 Slice S8 — the map-loading overlay (~L2757-2764) and the
 * school-radius "showing first N" hint (~L3231-3251), unified into one
 * PURE presentation component per the S8 design. The two regions sit at
 * DIFFERENT positions in MapDiscovery's render tree (the loader immediately
 * precedes the error/PropertyMap ternary; the hint sits much later, beside
 * the count badge) so this component is called TWICE — once per region,
 * each call passing only that region's props — to preserve the exact
 * pre-extraction sibling order/DOM position (AC2/AC10). Each prop bundle is
 * optional/undefined for the call that doesn't own that region.
 *
 * The error-card overlay (previously the `error ? errorCard : <PropertyMap/>`
 * ternary) is DELIBERATELY NOT moved here: its false-branch is PropertyMap,
 * a forbidden/already-wired child that must stay page-owned verbatim, and
 * splitting a single ternary across a page/component boundary would risk
 * DOM-order or paint-order drift for no real decoupling benefit (documented
 * per OQ2 — this region proved entangled, per its own "trim if entangled"
 * allowance). It stays inline in MapDiscovery.tsx.
 *
 * FLAG-A (S8 design) — hasActiveAnonFilter is a BOOLEAN computed by the page
 * via hasActiveAnonPropertyFilter(filters); this component never calls that
 * helper itself, keeping it free of any data/URL-shaped dependency.
 */
export interface DiscoverMapStatusHintsProps {
  /** Map-loading overlay (~L2757-2764). Omit/false to render nothing for this call. */
  showLoader?: boolean;
  /** School-radius "showing first N" hint (~L3231-3251). Omit to render nothing for this call. */
  schoolRadiusHint?: {
    isAuthenticated: boolean;
    schoolRadiusActive: boolean;
    schoolRadiusHasMore: boolean;
    schoolListingsCount: number;
    /** FLAG-A — precomputed hasActiveAnonPropertyFilter(filters) boolean. */
    hasActiveAnonFilter: boolean;
  } | null;
  /**
   * Issue #2698 — true only on the full-screen mobile Map. There the right-hand
   * column holds the Leaflet zoom (≈0–90px from the bottom), "Recenter on
   * <city>" (100–130px) and "Recenter on <area>" (144–182px); the desktop
   * `bottom-28 right-4` hint box sat across both buttons and, at `z-[1000]`,
   * swallowed their taps. Mobile lifts it above the whole column. Defaults to
   * false, so desktop is unchanged.
   */
  isMobileMapOverlay?: boolean;
}

export function DiscoverMapStatusHints({
  showLoader = false,
  schoolRadiusHint = null,
  isMobileMapOverlay = false,
}: DiscoverMapStatusHintsProps) {
  return (
    <>
      {showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}

      {/* Issue #1261 — non-blocking "showing first N" hint for the anonymous
          school-radius result. The public endpoint returns a single page (size=50)
          with no total count; hasMore signals more listings exist beyond it.
          DECISION-2: no load-more UI in this slice — only this advisory hint.
          FINDING 1: hasMore reflects the UNFILTERED server probe but the shown
          count is post-filter; when any client-side PropertyFilter is active the
          extra server rows may not match, so suppress the hint to avoid promising
          more *matching* homes than exist (AC8 truthfulness). */}
      {schoolRadiusHint &&
        !schoolRadiusHint.isAuthenticated &&
        schoolRadiusHint.schoolRadiusActive &&
        schoolRadiusHint.schoolRadiusHasMore &&
        !schoolRadiusHint.hasActiveAnonFilter && (
        <div
          className={
            isMobileMapOverlay
              ? 'absolute bottom-[192px] right-[10px] z-[1000]'
              : 'absolute bottom-28 right-4 z-[1000]'
          }
          data-testid="school-radius-more-hint"
        >
          <div
            className="bg-card/95 rounded-lg px-4 py-2 shadow-sm text-xs text-muted-foreground border border-border max-w-[16rem]"
            aria-live="polite"
          >
            Showing the first {schoolRadiusHint.schoolListingsCount} homes near this school. Zoom or refine your search to narrow results.
          </div>
        </div>
      )}
    </>
  );
}
