import { Suspense, lazy } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { MapSkeleton } from '@/components/discover/MapSkeleton';
import { MobileClusterSheet } from '@/features/discover/views/mobile/MobileClusterSheet';
import { MobileListingPreviewSheet } from '@/features/discover/views/mobile/MobileListingPreviewSheet';
import { MapInfoDock } from '@/components/discover/MapInfoDock';
import { DiscoverMapLegend } from '@/components/discover/DiscoverMapLegend';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { deriveMapInfoDockContent } from './mapInfoDockContent';
import type { DiscoverMapSurfaceView, DiscoverMapSurfaceCommands } from './buildMapSurfaceModel';

/**
 * Issue #2142 Commit 4 — renamed from DiscoverMapMount.tsx (per the approved
 * plan's rollback file-set). The shouldMount/Suspense/lazy real-unmount gate
 * below is preserved VERBATIM from that file (see its own prior doc comment,
 * git history). This surface additionally now owns MobileClusterSheet,
 * MobileListingPreviewSheet, and the recenter-button portal — see
 * buildMapSurfaceModel.ts's doc comment for why those live here rather than on
 * DiscoverOverlaySurface (DOM/stacking-context coupling with the map canvas,
 * team-lead ruling 2026-08-12).
 *
 * Issue #2659 (D3) — DiscoverMapCanvas now takes the nested `{ view,
 * commands, mapContainerRef }` contract directly (its own former 139-field
 * flat props interface is deleted). This surface therefore no longer
 * reconstructs a flat prop object here — it forwards `view`/`commands` as-is,
 * minus `overlays` (never passed to the canvas; see the render below).
 */
const LazyDiscoverMapCanvas = lazy(() =>
  import('../views/DiscoverMapCanvas').then((mod) => ({
    default: mod.DiscoverMapCanvas,
  })),
);

if (typeof window !== 'undefined' && window.innerWidth > 820) {
  void import('../views/DiscoverMapCanvas');
}

export interface DiscoverMapSurfaceProps {
  view: DiscoverMapSurfaceView;
  commands: DiscoverMapSurfaceCommands;
  mapContainerRef: RefObject<HTMLDivElement | null>;
}

export function DiscoverMapSurface({ view, commands, mapContainerRef }: DiscoverMapSurfaceProps) {
  const { isMobileShell, mobileView } = useDiscoverShell();
  const shouldMount = !isMobileShell || mobileView === 'MAP';
  // Issue #2698 — the SAME discriminator DiscoverMapCanvas uses (`!!mobileListButton`, supplied
  // only while the full-screen mobile Map is open), so the area recenter and the canvas's
  // right-hand column (city recenter, school-radius hint) can never disagree on "mobile".
  const isMobileMapOverlay = !!view.mobile.mobileListButton;

  // Issue #2698 — the SAME condition DiscoverMapCanvas's `hideDuplicateCountBadge` uses
  // (`isMobileMapOverlay && !!onFiltersChange && (isAreaFirstSelectedAreaState ||
  // schoolRadiusActive)`), including the school-radius term: useDiscoverJourneyTransitions.ts's
  // combined Areas + school flow keeps `journey === 'area-first'` with
  // filters.schoolLat/schoolLon/schoolRadiusKm set, so school-radius DOES reach this journey.
  // `view.schools.schoolRadiusActive` is the same filter-derived boolean
  // (useDiscoverBadgeController.ts) DiscoverMapCanvas reads — no new state.
  const hideDuplicateCountBadge =
    isMobileMapOverlay &&
    !!commands.filters.onFiltersChange &&
    (view.navigation.isAreaFirstSelectedAreaState || view.schools.schoolRadiusActive);

  // Issue #2748 — the ONE Map Info Dock (guidance → count → recenter), Areas-journey only.
  // Null outside that journey, so every other journey's map info stays exactly as it was
  // (DiscoverMapCanvas's own count/guidance/city-recenter, unchanged, and this file's legacy
  // `areas-recenter-button` below).
  const mapInfoDockContent = deriveMapInfoDockContent(view, { hideDuplicateCountBadge });

  // Issue #2748 (lane review, pass 3) — `handleRecenterOnSelectedNode` (behind
  // `commands.overlays.onRecenter`) is a no-op when the navigation node hasn't
  // resolved yet (`getCameraIntentForRecenter(null)` returns null, since there is
  // no node to derive an extent from) — a real gap, since the issue requires
  // exactly one WORKING recenter at all times. Rather than hiding the row (the
  // issue's own preference is a working fallback over hiding it), fall back to
  // the exact city-centre camera intent the legacy "Recenter on <city>" button
  // used (`DiscoverMapCanvas.tsx`, now removed for this journey) whenever there
  // is no resolved node yet but a city centre is already known.
  const handleDockRecenter = () => {
    const node = view.navigation.areasNavigationJourney?.node;
    const cityCenter = view.camera.cityCenter;
    if (!node && cityCenter) {
      commands.camera.publishCameraIntent({
        areaKey: view.navigation.city || DEFAULT_CITY,
        areaLabel: view.navigation.city || DEFAULT_CITY,
        geo_center_lat: cityCenter[0],
        geo_center_lon: cityCenter[1],
        bbox: null,
      });
      return;
    }
    commands.overlays.onRecenter();
  };
  const isAreaFirstJourney = view.navigation.journey === 'area-first';

  // Issue #2659 (D3) — DiscoverMapCanvas now takes the nested `{ view, commands,
  // mapContainerRef }` contract directly; this surface no longer reconstructs a
  // flat prop object. `overlays` is deliberately EXCLUDED from both — it must
  // never reach the canvas (see this file's own doc comment and the
  // `surfaceLayering`/camera-ownership guards).
  const { overlays: _viewOverlays, ...canvasView } = view;
  const { overlays: _commandsOverlays, ...canvasCommands } = commands;

  return (
    <>
      {view.overlays.mobileCluster.visible && (
        <MobileClusterSheet
          journey={view.overlays.mobileCluster.journey}
          focusedClusterMemberAreaKeys={view.overlays.mobileCluster.focusedClusterMemberAreaKeys}
          onClusterFocusChange={commands.overlays.onClusterFocusChange}
          eligibilityJourney={view.overlays.mobileCluster.eligibilityJourney}
        />
      )}
      {view.overlays.listingPreview.visible && view.overlays.listingPreview.preview && (
        <MobileListingPreviewSheet
          preview={view.overlays.listingPreview.preview}
          onDismiss={commands.overlays.onDismissPreview}
          onViewDetails={commands.overlays.onViewDetails}
          onHeightChange={commands.overlays.onPreviewHeightChange}
        />
      )}
      {shouldMount && (
        // Issue #2017 (owner-directed desktop rework) — AreaSetDraftProvider
        // moved UP to MapDiscovery.tsx (the common ancestor of this map tree
        // AND the panel tree, where AreaSetDraftPanel now also consumes this
        // same context on desktop) so both trees share ONE draft/nearby-
        // candidate instance instead of two independent, desynchronized
        // copies. See MapDiscovery.tsx's own comment for the full rationale.
        <Suspense fallback={<MapSkeleton />}>
          <LazyDiscoverMapCanvas view={canvasView} commands={canvasCommands} mapContainerRef={mapContainerRef} />
        </Suspense>
      )}
      {/* Issue #2748 — this legacy portalled button is superseded by the Map Info Dock's own
          recenter row for the Areas journey (rendered below), which is unconditional whenever
          the dock renders rather than gated on out-of-view/ROOT like this one. Left completely
          unchanged for every other journey (e.g. school-first), which this issue does not touch
          (PR #2757 clarification, Interpretation 3). */}
      {!isAreaFirstJourney &&
        view.overlays.recenter.visible &&
        view.overlays.recenter.portalTarget &&
        createPortal(
          <button
            type="button"
            data-testid="areas-recenter-button"
            onClick={commands.overlays.onRecenter}
            // Issue #2724 (code review, pass 4) — unlike the count pill this button has no
            // width cap, so a long area name ("Jayaprakash Narayana Extension & Kodihalli
            // Layout Cross") wraps to 3 lines at 1024px and, being bottom-anchored, grows
            // UPWARD toward the tip pill/other overlays instead of staying inside its row.
            // Capped to the SAME max-w-[220px] the pill already uses (DiscoverMapCountBadge.tsx)
            // and the label clamped to 2 lines so it can never exceed the pill's own worst-case
            // height. The full "Recenter on <area>" text stays the button's accessible name
            // (line-clamp is purely visual — the DOM text node is untouched) and is repeated in
            // `title` for a hover tooltip on the clamped case. Desktop only; mobile (#2727,
            // out of scope here) is untouched.
            title={`Recenter on ${view.overlays.recenter.label}`}
            // Issue #2698 — centred at bottom-20 it covered the bottom-left map legend at
            // 375–412px. On the mobile Map it stacks in the right-hand column instead,
            // directly above the canvas's own "Recenter on <city>" button (bottom-[100px]).
            // Issue #2714 — desktop kept the centred bottom-20 placement, which sits in the
            // bottom-centre column #2714 reserves for the tip pill + count badge (and, at
            // narrower map widths than the #2698 evidence captured, risked reaching the
            // bottom-left legend the same way the mobile case above already had to move away
            // from). Per #2714's placement boundaries the bottom-right column stacks, bottom to
            // top: attribution, zoom, "Recenter on <city>" (now bottom-48), the school-radius
            // "more" hint (bottom-28, but taller — live-measured top edge 178px), the count
            // badge's right-anchored variant (now bottom-60, live-measured top edge 278px), then
            // this button — bottom-72 (288px) clears the badge's top edge with a 10px margin
            // (live-measured via Playwright; the badge, hint, city recenter and this button can
            // all render together in the anon school-radius "showing first N" + out-of-view-node
            // state), mirroring the mobile column's own stacking order.
            //
            // Issue #2724 (pass 3, area-selected desktop pairing) — this button only ever renders
            // (`view.overlays.recenter.visible`) when a real area/zone is selected AND out of view
            // (the ROOT-node exclusion above rules out the city-landing/nothing-selected case), so
            // on desktop it is ALWAYS in the exact state DiscoverMapCountBadge's
            // `isAreaRecenterButtonVisible` pairing targets — no extra state check needed here.
            // Moved from its own right-anchored bottom-72 stack to share the pill's row at
            // bottom-60, flanking right of centre (`left-1/2 ml-2`) to mirror the pill's `right-1/2
            // mr-2` (see DiscoverMapCountBadge.tsx's own doc for that side), forming one centred
            // side-by-side pair instead of two independently-stacked right-column elements. This
            // button and the count pill are mutually exclusive with the OTHER right-column stack
            // (zoom, "Recenter on <city>", school-radius hint) this comment above describes, since
            // that stack's badge variant only renders for the non-area-selected states. Mobile is
            // untouched.
            className={
              isMobileMapOverlay
                ? 'absolute bottom-[144px] right-[10px] z-[500] rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md'
                : 'absolute bottom-60 left-1/2 z-[500] ml-2 max-w-[220px] rounded-full border border-border bg-background/95 px-4 py-2 text-sm font-medium shadow-md'
            }
          >
            <span className={isMobileMapOverlay ? undefined : 'line-clamp-2'}>
              Recenter on {view.overlays.recenter.label}
            </span>
          </button>,
          view.overlays.recenter.portalTarget,
        )}
      {/* Issue #2748 — the Map Info Dock: ONE card owning guidance/count/recenter for the
          Areas journey, replacing the legacy trio (this file's own recenter button above,
          DiscoverMapCanvas's count pill + "Recenter on <city>" button, and MapEmptyGuidance's
          anon zoom prompt — all suppressed for this journey at their own call sites).
          Portalled into the SAME map container as the legacy recenter button so it sits inside
          the map surface's own stacking context. Desktop (owner feedback, round 4): flush in the
          bottom-left corner at `bottom-[14px] left-[14px]`, matching the #2747 mock's
          `map-info-dock-anchor` exactly (`left:14px; bottom:14px`) instead of the earlier
          `bottom-36` that was raised to clear the legend below it.

          Owner feedback (round 5) — the legend used to move OUT OF THE WAY via a fixed
          worst-case offset (`bottom-[264px]`), which left a large unexplained dead gap above
          the dock in every state SHORTER than the tallest possible one (e.g. ~172px in the
          common area-selected state). Fixed for real: the wrapper below is now a real
          `flex flex-col-reverse` column (DOM order [dock, legend] + `column-reverse` puts the
          FIRST child — the dock — at the bottom and the SECOND — the legend slot below — above
          it), with a small `gap`. Reflow gives the legend a CONSISTENT small gap above the
          dock's own ACTUAL rendered height in every state, with no ResizeObserver/measurement
          effect and no new state owner. The Areas-journey desktop legend variants now render
          INTO this same column (`DiscoverMapLegend`'s `renderMode="desktopAreaFirstSlot"` — see
          that file's own doc comment) instead of their own independent absolute position.
          Mobile is untouched (the slot only renders `!isMobileMapOverlay`; mobile's own legend
          keeps its historical inline `bottom-10`/`bottom-24` position, unaffected by this
          column). Mobile dock: bottom-center at
          `bottom-[150px]` (raised from an initial `bottom-[100px]`, pre-push review finding —
          live-measured at 390x844, area-selected state: `bottom-[100px]` put the dock's own
          bottom edge at 744px from the container top while MapMarkerLegend's top edge was
          715px — a real 29px overlap even with the real, unforced "RR Nagar" label, worse once
          a longer label grows the dock taller. `bottom-[150px]` clears the legend's measured top
          edge with a comfortable margin), consolidating what were three separately-floating
          elements into one — there is no pre-existing city/node-level bottom sheet to embed into
          on the mobile Map (see this issue's PR for that finding), so this keeps the same
          floating footprint the three legacy elements already occupied rather than adding a new
          layer beyond it. */}
      {mapInfoDockContent &&
        view.overlays.recenter.portalTarget &&
        createPortal(
          <div
            // Issue #2748 (lane review, pass 2) — this wrapper div itself sat over the
            // SAME rectangle as the dock's own non-interactive background, and (unlike
            // the dock, fixed in the previous pass) had no `pointer-events` class of its
            // own — its default `auto` intercepted clicks before they ever reached
            // MapInfoDock's `pointer-events-none` card. `pointer-events-none` here too;
            // the dock's own `pointer-events-auto` controls (sign-in link, recenter
            // button) still opt back in from inside it.
            className={
              isMobileMapOverlay
                ? 'pointer-events-none absolute bottom-[150px] left-1/2 z-[500] -translate-x-1/2'
                : // Owner feedback (round 6) — the 821–1023px band (desktop shell, but
                  // narrow enough that the map is a short inline strip under the panel —
                  // `isMobileMapOverlay` is false there, so this IS the branch that
                  // renders; `shouldMount` only reaches the true mobile branch once
                  // `isMobileShell`, which cuts in at ≤820) can give the map container as
                  // little as ~106px of height, shorter than the dock alone. Live-measured
                  // A/B: this is NOT a round-4/5/6 regression — 2e4e1d91 (before any of
                  // this round's changes) already had the dock's own fixed `bottom-36`
                  // overflow the map's top edge by ~128px here, and even `main` (a8e703a9,
                  // pre-#2748, no dock) already had the bare legend overflow it by ~23px in
                  // the area-selected state. `max-h-[calc(100%-14px)] overflow-hidden`
                  // below is a genuine fix, not a pre-existing-defer: it caps the WHOLE
                  // column to never exceed the map's own height (minus the 14px bottom
                  // anchor), so nothing can float over the filter panel above the map.
                  //
                  // `overflow-hidden` on the WRAPPER alone would only clip PAINT — a
                  // flex child that doesn't fit still reports its full, unclipped
                  // `getBoundingClientRect()` (proven live: the legend's own top edge
                  // measured 8.77px above the map's top at 900×700, even though nothing
                  // was visibly painted there). Real geometric containment needs the
                  // child to actually SHRINK, not just have its overflow painted away —
                  // so the legend slot below additionally carries `min-h-0` (overrides
                  // the flex default `min-height:auto`, which otherwise refuses to
                  // shrink a flex item below its own content size) + its own
                  // `overflow-hidden`. With the column's height capped and the dock
                  // NOT given `min-h-0` (so it keeps `min-height:auto` and cannot shrink
                  // below its own content — the interactive piece, protected), the flex
                  // algorithm gives the dock its full natural height first and lets the
                  // legend absorb whatever's left, down to 0px if there's truly no room.
                  // `lg:` (≥1024px, this issue's own desktop floor) removes the cap
                  // entirely, restoring the exact unbounded round-5 behaviour — flush
                  // 14/14, 10px legend gap — unchanged.
                  //
                  // Owner feedback (round 7) — below `lg` the map's own breadcrumb overlay
                  // (DiscoverMapContextOverlay.tsx, `absolute top-4 left-4 z-[1000]`, same
                  // stacking context: both are plain `position:absolute` descendants of the
                  // map surface, no intervening transform/opacity/filter/isolation ancestor
                  // — verified by reading both files) sat ABOVE this column's `z-[500]` in
                  // the ~55–95px landscape-phone strip, and its hit area beat the dock's
                  // recenter button (Playwright `elementFromPoint`, live-measured: covered
                  // in area-selected at 844/896/915/932/1000-wide × ≤430-tall, and in
                  // city at 844×390 — a reachability regression from `main`, where the old
                  // recenter floated over the panel and was still clickable).
                  //
                  // Owner feedback (round 8, advisory-fix) — an earlier `z-[1002]` here also
                  // rose ABOVE DrawModeOverlay/SearchThisAreaCta (both `z-[1001]`, unrelated
                  // map-state overlays with no breakpoint gate), letting this column steal
                  // clicks from draw-mode Cancel/Undo or "Search this area" if they ever
                  // geometrically overlap it in the short strip — contradicting this same
                  // comment's own "must never cover THOSE either". Geometric check (a live
                  // repro of either overlay was not reachable — see the e2e spec's own doc
                  // comment): DrawModeOverlay's panel is `max-w-sm` (384px), centred in
                  // `[16, width-16]` below `lg` — at 844px wide that's ~x:[230,614], which
                  // DOES overlap this column's x:[14,302] in [230,302], so the risk this
                  // review flagged is real, not theoretical. `z-[1000]` — an exact TIE
                  // with the breadcrumb, not a value above it — relies on DOM order instead:
                  // at equal z-index, CSS paints later-DOM-order elements on top, and this
                  // column's portal target renders after the breadcrumb overlay in the same
                  // stacking context (`Node.compareDocumentPosition`, live-verified: the
                  // breadcrumb precedes the dock). So the dock still wins the breadcrumb (the
                  // fix's actual target, otherwise redundant here — the panel already shows
                  // the same trail + a "Back to …" link above the map) while staying BELOW
                  // the 1001 overlays, which must keep winning where they overlap this column.
                  // `lg:z-[500]` restores the original, unchanged desktop stacking at ≥1024.
                  'pointer-events-none absolute bottom-[14px] left-[14px] z-[1000] flex max-h-[calc(100%-14px)] w-[min(288px,calc(50%_-_92px))] flex-col-reverse items-start gap-2.5 overflow-hidden lg:z-[500] lg:max-h-none lg:overflow-visible'
            }
          >
            {/* `shrink-0` (owner feedback, round 6) — MapInfoDock's own root already carries
                `overflow-hidden` (its rounded-corner card look), which per the flex spec makes
                it eligible for an automatic `min-height:0` and thus shrinkable below its own
                content — exactly the piece this fix means to PROTECT (the interactive rows:
                recenter, sign-in) when the column is capped in the narrow band. Wrapping it in
                a `shrink-0` sibling stops it from taking any of the deficit; the legend slot
                below (`min-h-0`, no `shrink-0`) absorbs all of it instead. No-op on mobile
                (that branch isn't a flex container). `w-full` here too — MapInfoDock's own
                `w-full` resolves against THIS wrapper's width, which without its own explicit
                width would shrink-to-fit content instead of inheriting the 288px/50%-92px cap
                from the positioned anchor two levels up (live-measured regression: the dock
                widened to 249.5px, past its own cap, without this). */}
            <div className="w-full shrink-0">
              <MapInfoDock
                where={mapInfoDockContent.where}
                countText={mapInfoDockContent.countText}
                listingCapable={mapInfoDockContent.listingCapable}
                isAuthenticated={view.status.isAuthenticated}
                onRecenter={handleDockRecenter}
                isMobile={isMobileMapOverlay}
              />
            </div>
            {!isMobileMapOverlay && (
              // Owner feedback (round 5) — real flex sibling of the dock above (DOM order
              // matters: this comes AFTER the dock so `flex-col-reverse` stacks it visually
              // ABOVE). Owner feedback (round 6) — no wrapping div here any more: an extra
              // proxy div could be MADE to shrink in the narrow band, but a CSS percentage
              // height on ITS CHILD never resolves against that flex-shrunk height (only an
              // explicit ancestor height counts — CSS2.1 §10.5), so the legend kept
              // reporting its full unshrunk size one level down. `<DiscoverMapLegend>`
              // renders a Fragment (no DOM node of its own), so its one real child div
              // (`discover-map-legend`, carrying `min-h-0 overflow-hidden pointer-events-auto`
              // itself — see that component's `SLOT_LEGEND_ITEM`) is now the ACTUAL flex
              // item, shrinkable for real.
              <DiscoverMapLegend
                renderMode="desktopAreaFirstSlot"
                schoolRadiusChrome={
                  view.schools.schoolRadiusOverlay
                    ? {
                        schoolRadiusKm: view.scope.filters.schoolRadiusKm,
                        isAreaFirstJourney: true,
                        isMobileMapOverlay: false,
                      }
                    : null
                }
                variants={{
                  schoolRadiusOverlay: view.schools.schoolRadiusOverlay,
                  resolvedPanelContent: view.navigation.resolvedPanelContent,
                  overviewAreas: view.areas.overviewAreas,
                  isRegionOverview: view.areas.isRegionOverview,
                  regionGuideVisible: view.regionGuide.regionGuideVisible,
                  regionOverviewShortLabel: view.areas.regionOverviewShortLabel,
                  regionOverviewMarkerKind: view.regionGuide.regionOverviewMarkerKind,
                  isAreaFirstSelectedAreaState: view.navigation.isAreaFirstSelectedAreaState,
                  areaMarkerListings: view.markers.areaMarkerListings,
                  isSelectedGroupState: view.navigation.isSelectedGroupState,
                  isAreaFirstCityLanding: view.navigation.isAreaFirstCityLanding,
                  // `mapInfoDockContent` is non-null only when `view.navigation.journey ===
                  // 'area-first'` (`deriveMapInfoDockContent`'s sole gate), so this literal is
                  // always correct here — no `string`-vs-`DiscoverJourney` cast needed.
                  journey: 'area-first',
                  // Unused in `desktopAreaFirstSlot` mode (the agri-first branch never
                  // renders there — see DiscoverMapLegend's own `!slot` guards).
                  selectedLocality: null,
                  selectedRegion: null,
                  isMobileMapOverlay: false,
                }}
              />
            )}
          </div>,
          view.overlays.recenter.portalTarget,
        )}
    </>
  );
}
