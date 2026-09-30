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
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

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

  // Issue #2762 PR-C — the ONE Map Info Dock (guidance → count → recenter), now generalized to
  // all three journeys (`deriveMapInfoDockContent` dispatches per `view.navigation.journey`; see
  // that file). Null only for a journey/panel state none of the three derivers claim.
  const mapInfoDockContent = deriveMapInfoDockContent(view, { hideDuplicateCountBadge });

  // Issue #2748 (lane review, pass 3) — `handleRecenterOnSelectedNode` (behind
  // `commands.overlays.onRecenter`) is a no-op when the navigation node hasn't
  // resolved yet (`getCameraIntentForRecenter(null)` returns null, since there is
  // no node to derive an extent from) — a real gap, since the issue requires
  // exactly one WORKING recenter at all times. Rather than hiding the row (the
  // issue's own preference is a working fallback over hiding it), fall back to
  // the exact city-centre camera intent the legacy "Recenter on <city>" button
  // used (`DiscoverMapCanvas.tsx`, now deleted for all three journeys) whenever
  // there is no resolved node yet but a city centre is already known.
  //
  // Issue #2762 PR-C (review fix) — the earlier version of this comment claimed the
  // `areasNavigationJourney?.node`/city-fallback branch below "needed no structural change to
  // serve all three journeys" — WRONG, caught by an independent code-reviewer of this PR.
  // `areasNavigationJourney.node` is populated by `useAreasNavigationJourney` only while
  // `showAreasNavigationJourney` is true, which useDiscoverNavigationController.ts gates off
  // (among other things) `isSchoolsNavNodeLevel = journey === 'school-first' && !areaKey &&
  // !schoolId` and `isAgriNavNodeLevel = journey === 'agri-first' && !selectedLocality` — BOTH
  // false once a school is selected or an agri locality is drilled into, i.e. exactly the two
  // leaf/listing-capable states `deriveSchoolDock`/`deriveAgriDock` cover (`listingCapable:
  // true`). In those states `node` is null, so the branch below fell into the city fallback and
  // recentred on the CITY while the dock's own button still read "Recenter on <school/locality>"
  // (label sourced from `mapInfoDockContent.where`, computed above) — a real label/behavior
  // mismatch. Fixed by resolving the target from `mapInfoDockContent`'s own journey +
  // `listingCapable` discriminants FIRST, using the already-available per-journey camera fields
  // (`schools.selectedSchoolLat/selectedSchoolLon`, `camera.agriGroupFocusBounds` — both already
  // threaded onto this surface's view for the camera-fit effects in
  // useDiscoverCameraController.ts/useDiscoverCameraOrchestration.ts), before falling through to
  // the untouched Areas node/city-fallback logic.
  const handleDockRecenter = () => {
    if (view.navigation.journey === 'school-first' && mapInfoDockContent?.listingCapable) {
      const { selectedSchool, selectedSchoolLat, selectedSchoolLon } = view.schools;
      if (selectedSchoolLat != null && selectedSchoolLon != null) {
        commands.camera.publishCameraIntent({
          areaKey: selectedSchool?.id ?? mapInfoDockContent.where,
          areaLabel: mapInfoDockContent.where,
          geo_center_lat: selectedSchoolLat,
          geo_center_lon: selectedSchoolLon,
          bbox: null,
        });
        return;
      }
    }

    if (view.navigation.journey === 'agri-first' && mapInfoDockContent?.listingCapable) {
      const bounds = view.camera.agriGroupFocusBounds;
      if (bounds) {
        commands.camera.publishCameraIntent({
          areaKey: mapInfoDockContent.where,
          areaLabel: mapInfoDockContent.where,
          geo_center_lat: (bounds[0][0] + bounds[1][0]) / 2,
          geo_center_lon: (bounds[0][1] + bounds[1][1]) / 2,
          bbox: bounds,
        });
        return;
      }
    }

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
      {/* Issue #2762 PR-C — this legacy portalled "areas-recenter-button" (despite its name, it
          was reachable for School/Agri too via `!isAreaFirstJourney` — `showAreasNavigationJourney`
          in useDiscoverNavigationController.ts already extends `view.overlays.recenter.visible`'s
          underlying signal to school/agri node levels) is DELETED, not hidden: the Map Info Dock's
          own recenter row now owns recenter for ALL THREE journeys (see mapInfoDockContent.ts),
          and this control would otherwise be a second, structurally-possible recenter target
          whenever both were reachable at once. No replacement needed at this call site — the dock
          below is unconditional whenever `mapInfoDockContent` is non-null. */}
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
          keeps its inline `bottom-10` position (#2762: school-radius chrome moved from `bottom-24`), unaffected by this
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
                // Issue #2762 PR-C — remounts (not merely re-renders) on scope change, so a
                // recenter target from the PREVIOUS scope can never linger — see scopeKey's own
                // doc comment in mapInfoDockContent.ts.
                key={mapInfoDockContent.scopeKey}
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
                        // Issue #2762/#2766 — mirror DiscoverMapCanvas's own inline call. This
                        // slot now mounts for every journey (PR-C), so a hardcoded `true` made
                        // School-first render the radius legend here AND inline (two legends).
                        isAreaFirstJourney: view.navigation.journey === 'area-first',
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
                  // Issue #2762 PR-C — the REAL journey (previously hardcoded to the literal
                  // 'area-first', back when this slot only ever owned that one journey). The
                  // slot now owns the legend for whichever journey `mapInfoDockContent` covers
                  // (see DiscoverMapLegend's own `desktopDockSlotOwnsLegend` doc comment).
                  journey: view.navigation.journey as DiscoverJourney,
                  // KNOWN GAP (disclosed, not silently guessed) — `selectedLocality` (Agri's
                  // drilled-into locality, used by DiscoverMapCanvas's OWN inline call via
                  // `nav.selectedLocality` from live context) is not present on
                  // `DiscoverMapSurfaceView.navigation` today; this `surfaces/**` file cannot
                  // read `useDiscoverNav()` directly (forbidden — see this file's own header
                  // comment). Stays `null` here, same as before this change. If the legend's
                  // variant-selection switch (PR-D's remit, unchanged by this PR) depends on it
                  // for the agri-parcel-level variant, that variant may render a less-specific
                  // fallback in the slot position until `selectedLocality` is threaded onto the
                  // surface view — flagged for PR-D/follow-up, not fixed here.
                  selectedLocality: null,
                  selectedRegion: view.agri.selectedRegion,
                  isMobileMapOverlay: false,
                  // Issue #2762 PR-D — real value, already on the surface view
                  // (`view.markers.currentMapMarkerListings`, the SAME array
                  // forwarded to DiscoverMapCanvas's `<PropertyMap listings=.../>`
                  // via `canvasView`); no view-model widening needed for this one,
                  // unlike `selectedLocality` above. Read only by the school-selected
                  // property-type block, which — like every other school/agri branch
                  // in this switch — is `!slot`-gated and so never actually renders
                  // from this call; wired through anyway to keep `variants` honest
                  // (it's a required field) rather than passing a fabricated `[]`.
                  currentMapMarkerListings: view.markers.currentMapMarkerListings,
                }}
              />
            )}
          </div>,
          view.overlays.recenter.portalTarget,
        )}
    </>
  );
}
