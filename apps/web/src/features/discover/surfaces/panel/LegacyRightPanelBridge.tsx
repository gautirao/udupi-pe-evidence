import { useEffect, useMemo } from 'react';
import { DiscoverRightPanel } from '@/components/discover/DiscoverRightPanel';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CITY_CONFIG } from '@/lib/localityUtils';
import { toSelectedListingPreviewFromMarkerListing } from '@/features/discover/navigation/selectedListingPreview';
import type { SelectedListingPreview } from '@/features/discover/navigation/selectedListingPreview';
import { buildRightPanelView, buildRightPanelCommands } from './rightPanelContract';
import type {
  DiscoverPanelSurfaceView,
  DiscoverPanelSurfaceCommands,
} from '../buildPanelSurfaceModel';

export interface LegacyRightPanelBridgeProps {
  view: DiscoverPanelSurfaceView;
  commands: DiscoverPanelSurfaceCommands;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — the LEGACY `DiscoverRightPanel`
 * branch, moved VERBATIM out of `DiscoverPanelSurface.tsx`.
 *
 * Issue #2657 C8 — `DiscoverRightPanel`'s public contract flipped to
 * `{view, commands}`; this bridge no longer flattens `DiscoverPanelSurfaceView`/
 * `Commands` into ~145 individual JSX attributes. It calls
 * `rightPanelContract.ts`'s pure `buildRightPanelView`/`buildRightPanelCommands`
 * (every closure/derivation those hold is moved VERBATIM from this file's
 * pre-C8 body — same condition, same call, same argument order) and renders
 * `<DiscoverRightPanel view commands />`. Only the values this bridge must
 * keep locally — the footer pager JSX (a ReactNode slot, `rightPanelContract.ts`
 * is `.ts` and cannot hold JSX) and the school-first marker-listing-preview
 * `useEffect`/`useMemo` (a hook; the builders are pure functions) — still live
 * here.
 *
 * Unlike its two canonical siblings this bridge legitimately consumes nearly
 * the whole `view`/`commands` contract — `DiscoverRightPanel` is a
 * multi-journey leaf — so it (and `rightPanelContract.ts`) are typed against
 * the full contract rather than a `Pick`ed subset. That is the
 * reviewer-acknowledged exception to the narrow-Pick rule, and it applies to
 * the `pageContext` group too: the whole `nav`/`actions` group is threaded
 * through rather than enumerating the ~30 members it touches.
 */
export function LegacyRightPanelBridge({ view, commands }: LegacyRightPanelBridgeProps) {
  // Issue #2657 C8 — `buildRightPanelView`/`buildRightPanelCommands` now take
  // the WHOLE `view`/`commands` objects and do their own field-level reads
  // (same expressions this destructuring prelude used to spell out before
  // C8 — see rightPanelContract.ts). Only the handful of values this bridge
  // still needs DIRECTLY (the footer pager JSX below, and the school-first
  // marker-listing-preview effect, which stays here per architect plan §2)
  // are destructured now.
  const { city } = view.routing;
  const { selectedArea } = view.geography;
  const { page, totalPages, totalElements } = view.results;
  const { setPage } = commands.results;
  const { onSelectedListingPreviewChange } = commands.navigation;
  const { selectedMarkerListing, isAuthenticated } = view.interaction;
  const { nav: urlState } = view.pageContext;
  const cityLabel = CITY_CONFIG[city]?.label ?? city;

  // Issue #2149 — school-first's counterpart to AreaLeafListingsSurface/
  // NodeListingsSurface's own `onSelectedListingPreviewChange` report-up
  // effect (see those files). Area-first can derive its preview from
  // `nav.selectedListing` because an area-first marker click writes the
  // `listing=` URL param; a pure school-first click deliberately does NOT
  // (issue #1547-deferred design, #1973 rev-2), so it only ever sets local
  // `selectedMarkerListing` (owned by useMarkerSelection, threaded here via
  // `view.interaction`). Deriving the preview from that local state instead
  // is what makes the mobile listing-preview sheet work for school-first at
  // all — without this, `useDiscoverMobilePresentationController`'s
  // `selectedListingPreview` never gets set, and both the desktop popover
  // (deliberately suppressed on mobile since #1956 PR-5) and the mobile sheet
  // stay empty on marker tap.
  //
  // Scoped to `journey === 'school-first' && schoolId != null` — the ONE
  // state this bridge renders where a marker click sets `selectedMarkerListing`
  // without also being covered by area-first's own reporting path
  // (`isAreaFirstJourneyActive` routes every `journey === 'area-first'` state
  // to `AreaFirstJourneyPanel` instead, per `useDiscoverNavigationController`,
  // so this bridge never doubles up with that surface's effect). Tapping a
  // second marker replaces the preview naturally: this effect is keyed on
  // `selectedMarkerListing` itself, not on any "already open" gate.
  const schoolFirstMarkerListingPreview = useMemo<SelectedListingPreview | null>(() => {
    if (urlState.journey !== 'school-first' || urlState.schoolId == null) return null;
    if (!selectedMarkerListing) return null;
    return toSelectedListingPreviewFromMarkerListing(selectedMarkerListing, {
      isAuthenticated,
      cityLabel,
    });
  }, [urlState.journey, urlState.schoolId, selectedMarkerListing, isAuthenticated, cityLabel]);

  useEffect(() => {
    onSelectedListingPreviewChange(schoolFirstMarkerListingPreview);
  }, [schoolFirstMarkerListingPreview, onSelectedListingPreviewChange]);

  // Issue #2657 C8 — footer pager JSX stays here (ReactNode slot, forwarded
  // whole into `view.frame.layout.footer` — see architect plan §2 "Whole
  // objects still passed"). `rightPanelContract.ts` is `.ts`, not `.tsx`, so
  // it cannot hold JSX; the pager CONDITION and markup are unchanged from
  // pre-C8.
  const footerContent = isAuthenticated && !selectedArea && totalPages > 1 ? (
    <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border bg-card shrink-0">
      <Button
        variant="outline" size="sm"
        disabled={page === 0}
        onClick={() => setPage((p) => p - 1)}
      >
        <ChevronLeft className="h-4 w-4 mr-1" />Prev
      </Button>
      <span className="text-xs text-muted-foreground">
        {page + 1} / {totalPages} · {totalElements.toLocaleString()} listings
      </span>
      <Button
        variant="outline" size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => setPage((p) => p + 1)}
      >
        Next<ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  ) : null;

  const rightPanelView = buildRightPanelView(view, { cityLabel, footer: footerContent });
  const rightPanelCommands = buildRightPanelCommands(commands, view);

  return <DiscoverRightPanel view={rightPanelView} commands={rightPanelCommands} />;
}
