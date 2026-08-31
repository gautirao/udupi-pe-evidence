import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import {
  CLUSTER_DISABLE_AT_ZOOM,
  CLUSTER_MAX_RADIUS_PX,
} from '@/lib/map/zoomPolicy';
import {
  resolveMarkerRevealMode,
  computeSpiderfyDistanceMultiplier,
  SPIDERFY_DISTANCE_MULTIPLIER_BASE,
  computeCoincidentMarkerOffsets,
} from '@/shared/map/zoomPolicy';
import { clusterCanSplit, hasSpatialSpread } from '@/shared/map/areaClusterSplit';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';
import type { PropertyListingWithImages } from '../PropertyMap';
import { createMarkerIcon, createSelectedMarkerIcon } from './markerIcons';

/**
 * Issue #2382 — residential marker + clustering layer, extracted verbatim
 * out of PropertyMap.tsx (page-health follow-up from #2296). Owns the
 * residential `L.markerClusterGroup` lifecycle (mount/update/teardown),
 * cluster-tap camera-intent publishing, coincident-marker offsetting, and
 * the reveal-mode (clustered-overview vs individual-pins) recompute. No
 * behaviour change — PropertyMap.tsx still owns shared map state
 * (selection/hover ids, camera) and wires this layer via props.
 */

/**
 * Issue #1762 — sentinel `disableClusteringAtZoom` value used to HOLD a
 * dense cluster in its clustered-overview state past the normal
 * `CLUSTER_DISABLE_AT_ZOOM` (16) threshold, once `resolveMarkerRevealMode`
 * decides — after a cluster-tap fit settles — that the revealed marker set
 * is still too dense for individual pins to read cleanly. Comfortably above
 * any zoom this app's tile layer reaches (no explicit `maxZoom` is set on
 * `MapContainer`, so Leaflet's own default of 18 applies), so Leaflet's
 * `zoom >= disableClusteringAtZoom` declustering never fires while held.
 */
const MARKER_REVEAL_HOLD_ZOOM = 24;

// Marker cluster layer component
export function MarkerClusterLayer({
  listings,
  onSelectListing,
  selectedListingId,
  hoveredListingId,
  onMarkerClickWithPosition,
  onMarkerClusterCameraIntent,
}: {
  listings: PropertyListingWithImages[];
  onSelectListing?: (listing: PropertyListingWithImages | null) => void;
  /** Issue #1547 — ID of the currently selected listing (URL-derived). When set, that
   *  listing's marker renders with the copper selected-state icon; no camera movement. */
  selectedListingId?: string | null;
  /** Issue #1547 — ephemeral hover/focus id (React state, NOT URL). When set, the
   *  matching marker renders with the copper icon; clears on mouseleave/blur. */
  hoveredListingId?: string | null;
  /** a3 — fires with the pixel position of the marker click relative to the map container. */
  onMarkerClickWithPosition?: (pos: { x: number; y: number }) => void;
  /**
   * Issue #1762 — fired ONLY for a splittable cluster click, with the
   * cluster's own member bounds/center. See PropertyMapProps's doc on the
   * same-named prop for the full contract.
   */
  onMarkerClusterCameraIntent?: (bounds: CameraIntent['bounds'], center: [number, number]) => void;
}) {
  const map = useMap();

  // Issue #1762 — dynamic declustering-at-zoom threshold, wired to
  // resolveMarkerRevealMode (zoomPolicy.ts). Defaults to the existing static
  // CLUSTER_DISABLE_AT_ZOOM. Recomputed on every settled camera position —
  // via the general (non-one-shot) `moveend` listener registered below —
  // from the CURRENT map bounds/zoom/viewport and listing density,
  // regardless of how that camera was reached (cluster-tap fit, manual
  // zoom/pan, or a completely fresh navigation). This is what makes a
  // manual zoom to an equivalent camera converge on the same cluster/pin
  // result as a cluster-tap: both paths settle on a 'moveend' and both
  // recompute the SAME decision from the SAME inputs.
  const [markerRevealDisableAtZoom, setMarkerRevealDisableAtZoom] = useState<number>(CLUSTER_DISABLE_AT_ZOOM);
  // Tracks whether `listings` changed since the hold was last set, so a
  // genuinely new listing set (new area/scope/filter fetch) always starts
  // fresh at CLUSTER_DISABLE_AT_ZOOM rather than inheriting a stale hold
  // computed against a completely different marker set. The general
  // moveend-driven recompute below immediately supersedes this default with
  // the real density-based decision for the new listings/current camera.
  const prevListingsRef = useRef<PropertyListingWithImages[] | null>(null);

  // Issue #1762 fix cycle 7 — "don't collapse an open spiderfy fan on
  // repeated clicks within it" (product requirement, verbatim in the issue:
  // collapse ONLY on a different marker/cluster click or a bare-map click,
  // both of which Leaflet's own spiderfier already handles natively).
  //
  // Root cause: `onSelectListing` (fired by an individual marker's own
  // click handler below) writes a new `selectedListingId`, which — being a
  // dependency of the single big effect that builds this whole layer — used
  // to re-run that ENTIRE effect. Its cleanup unconditionally calls
  // `map.removeLayer(clusterGroup)`, destroying the live cluster group
  // (and with it, Leaflet's own `_spiderfied` state) even though nothing
  // about Leaflet's spiderfy/unspiderfy contract was ever invoked — this is
  // an accidental side effect of the layer being torn down and rebuilt, not
  // real unspiderfy behavior.
  //
  // Fix: split the effect in two. `buildLayer` (below) does the full
  // teardown-then-construct work exactly as the original single effect did,
  // and is the ONLY thing allowed to call `map.removeLayer`/reconstruct
  // `L.markerClusterGroup`. The first effect calls it for real structural
  // changes (listings/map/config). A second, separate effect reacts to
  // `selectedListingId`/`hoveredListingId` alone: when the cluster group is
  // currently spiderfied, it patches JUST the affected marker(s)' icons in
  // place via `markersByListingIdRef` — no removeLayer, no rebuild, fan
  // stays open. When NOT spiderfied, it falls back to calling `buildLayer()`
  // directly, preserving the exact pre-fix full-rebuild behavior for that
  // case (e.g. selecting a listing from a list item, not a spiderfied pin).
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersByListingIdRef = useRef<
    Map<string, { marker: L.Marker; listing: PropertyListingWithImages }>
  >(new Map());
  const teardownLayerRef = useRef<(() => void) | null>(null);
  const prevSelectedListingIdRef = useRef<string | null | undefined>(selectedListingId);
  const prevHoveredListingIdRef = useRef<string | null | undefined>(hoveredListingId);
  const didMountHighlightEffectRef = useRef(false);

  // Code-review follow-up (APPROVE WITH COMMENTS) — same-commit double-rebuild
  // guard. If a structural dep (e.g. `listings`) and `selectedListingId`/
  // `hoveredListingId` both change in the SAME React commit (e.g. a listings
  // refetch resolving in the same tick as a URL-driven selection change),
  // both effects below fire in that commit. Without this guard, the
  // structural effect's `buildLayer()` call runs first and produces a fresh,
  // non-spiderfied cluster group; the selection/hover effect then also sees
  // "not spiderfied" and calls `buildLayer()` again — tearing down and
  // rebuilding the layer it just built (wasted `L.markerClusterGroup`
  // construction + a visible marker-icon flicker).
  //
  // `commitIdRef` is bumped once per COMMIT (via the commit-phase effect
  // below, not the render body — refs must not be written during render;
  // see that effect for why), so it is shared by every effect that fires
  // off that same commit. `buildLayer()` stamps `lastBuildCommitIdRef` with
  // the current `commitIdRef` value every time it actually runs. The
  // selection/hover effect below checks: if a build already happened in
  // THIS commit, that build's closure already captured the CURRENT
  // selectedListingId/hoveredListingId (buildLayer reads them directly from
  // the render closure, not from stale refs) — so there is nothing left for
  // the selection/hover effect to do, and it skips its own patch/rebuild
  // work entirely rather than duplicating it.
  const commitIdRef = useRef(0);
  const lastBuildCommitIdRef = useRef(0);

  const buildLayer = () => {
    lastBuildCommitIdRef.current = commitIdRef.current;
    // Tear down whatever layer currently exists (if any) before
    // constructing the new one — this function owns the full
    // teardown-then-rebuild lifecycle, whether invoked from the structural
    // effect below or from the selection/hover effect's non-spiderfied
    // fallback path.
    teardownLayerRef.current?.();
    teardownLayerRef.current = null;

    const listingsChanged = prevListingsRef.current !== null && prevListingsRef.current !== listings;
    prevListingsRef.current = listings;
    const effectiveDisableAtZoom = listingsChanged ? CLUSTER_DISABLE_AT_ZOOM : markerRevealDisableAtZoom;
    if (listingsChanged && markerRevealDisableAtZoom !== CLUSTER_DISABLE_AT_ZOOM) {
      setMarkerRevealDisableAtZoom(CLUSTER_DISABLE_AT_ZOOM);
    }

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      // Issue #1762 — false: Leaflet's own zoomToBounds() bypasses this
      // app's CameraIntent/MapController camera authority and was landing
      // on the WRONG bounds on cluster tap (live-reproduced defect). With
      // this false, leaflet.markercluster's internal `_zoomOrSpiderfy`
      // becomes a safe no-op except the genuine "already bottomed-out at
      // max zoom" spiderfy case (verified against the installed
      // leaflet.markercluster@1.5.3 source — see the approved plan's
      // revision_1_responses.spiderfy_version_check) — spiderfyOnMaxZoom
      // stays true and coexists cleanly with the clusterclick/clusterkeypress
      // handler added below, which is now the SOLE camera mover for a
      // splittable cluster tap.
      zoomToBoundsOnClick: false,
      maxClusterRadius: CLUSTER_MAX_RADIUS_PX,
      disableClusteringAtZoom: effectiveDisableAtZoom,
      // Issue #1762 fix cycle 3 — live-reproduced regression: for a cluster
      // whose members share (near-)identical coordinates (verified via a
      // temporary debug probe against the real repro — sw/ne bounds were
      // EXACTLY coincident), `clusterCanSplit` above correctly declines to
      // move the camera (there is no zoom level that would visually separate
      // coincident points) — but leaflet.markercluster's OWN
      // `_zoomOrSpiderfy` listener (bound unconditionally whenever
      // `spiderfyOnMaxZoom` is true — see the `zoomToBoundsOnClick` comment
      // below) independently fires `cluster.spiderfy()` for exactly this
      // "bottomed-out, never splits below the group's max clustering zoom"
      // case. Leaflet's default `spiderfyDistanceMultiplier` (1) sizes the
      // circle-fan radius for its own small (~25-40px) pin icons
      // (`_generatePointsCircle`: legLength = max(circumference/2π, 35),
      // circumference = multiplier * 25 * (2 + count) — multiplier 1 floors
      // to a 35px radius for any count ≤ ~7). Our custom price-pill markers
      // (createMarkerIcon) are ~90px wide, so a 35px-radius fan puts adjacent
      // pills on top of each other — the exact "opens into stacked/
      // overlapping pins, not a readable fan" defect. 3.5 raises the radius
      // to ~97px for a 5-member circle (chord between adjacent pills ≈114px,
      // clearing the ~90px pill width) and scales the same multiplier into
      // `_generatePointsSpiral`'s separation for denser (≥9-member) clusters,
      // without changing the zoom/fit decision above or leaflet.markercluster's
      // own bottomed-out-cluster gating.
      //
      // Issue #1762 fix-cycle 5 — this is now only the CONSTRUCTION-time
      // default/ceiling (SPIDERFY_DISTANCE_MULTIPLIER_BASE). It is
      // dynamically narrowed per-click, per-cluster-childCount and
      // per-current-viewport by handleClusterActivate below (see that
      // handler's comment) via computeSpiderfyDistanceMultiplier
      // (zoomPolicy.ts) — a WORKDONE_REVIEW BLOCKING finding that this
      // flat value had no upper bound tied to viewport size/child count.
      spiderfyDistanceMultiplier: SPIDERFY_DISTANCE_MULTIPLIER_BASE,
      // Issue #1762 fix cycle 4 — live-reproduced regression: after a
      // coincident cluster spiderfies (cycle 3), clicking an individual
      // spiderfied price-pill marker did nothing (no popover, no URL
      // change). Leaflet's own spider "leg" polylines default to
      // `interactive: true` (no `interactive`/`clickable` override in this
      // group's default `spiderLegPolylineOptions`) and are drawn from the
      // cluster's origin point to EACH marker's spiderfied position — i.e.
      // every leg terminates exactly at a marker's anchor point, which for
      // our ~90-107px-wide price pills (anchored at their bottom-center via
      // `iconAnchor:[0,0]` + a CSS `translate(-50%,-100%)` wrapper, see
      // createMarkerIcon) sits directly under a large swath of the pill's
      // own clickable area. A click landing on that overlap can be captured
      // by the (invisible, thin but real-hit-area) leg instead of the pill
      // underneath/behind it, silently swallowing the click — the leg has
      // no app-level click handler, so nothing happens, and the leg's own
      // click still bubbles to the map's native 'click' listener that
      // leaflet.markercluster binds internally for unspiderfying, which is
      // why the fan can look inert rather than erroring. `interactive:
      // false` removes spider legs from hit-testing entirely so a click
      // always reaches the marker underneath; purely visual, no change to
      // leg rendering/animation.
      spiderLegPolylineOptions: { interactive: false },
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();

        // Issue #2409 — leaflet.markercluster's own grid-based hierarchical
        // clustering can wrap a single, spatially-isolated listing in a
        // MarkerCluster node at intermediate zoom levels (independent of
        // maxClusterRadius proximity — live-reproduced against the real
        // pipeline, not a test-double artifact). A 1-member "cluster" must
        // never surface as a cluster badge: return the SAME icon the child's
        // own individual marker was built with (already computed above with
        // the correct highlighted/price-band state), so a singleton cluster
        // renders pixel-identical to an individual pin.
        if (count === 1) {
          const soleMarker = cluster.getAllChildMarkers()[0];
          const soleIcon = soleMarker?.options.icon;
          if (soleIcon) return soleIcon;
        }

        let size: 'small' | 'medium' | 'large' = 'small';
        // Sized with real padding around the 17px count + 8px "HOMES" label
        // (0.05em letter-spacing) so the label never crowds/overflows the
        // circle edge — the prior 38/42/48px tiers left almost no margin
        // once the circle's width/height were actually enforced.
        let sizeNum = 46;

        if (count > 50) {
          size = 'large';
          sizeNum = 62;
        } else if (count > 10) {
          size = 'medium';
          sizeNum = 54;
        }

        // Listing-cluster marker redesign — compact dark-navy circular badge
        // (count on top, "HOMES" label below), matching the reference
        // screenshot. Keyboard/hover contract mirrors AreaMarkerLayer's
        // .dp-region / .area-group-card bubbles exactly: tabindex/role="button"/
        // aria-label make the marker a real control, and a "Tap to zoom in ›"
        // caption (index.css .custom-marker-cluster-cap) reveals on hover/focus
        // using the SAME wording as those other marker tiers. The outer
        // .custom-marker-cluster class name is preserved unchanged — several
        // E2E specs select on it for presence/visibility only.
        const noun = count === 1 ? 'home' : 'homes';
        const ariaLabel = escapeHtml(
          `${count} ${noun} in this cluster. Activate to zoom in.`,
        );

        return L.divIcon({
          // Leaflet's divIcon sets iconSize on the OUTER wrapper it creates
          // around this html string, not on this inner div — without an
          // explicit width/height here, .custom-marker-cluster (a flex
          // container with no padding) collapses to hug its content instead
          // of filling that allocated circle, producing a cramped, padding-
          // less badge. Setting width/height explicitly (matching sizeNum,
          // the same value passed to iconSize below) fixes that.
          html: `<div class="custom-marker-cluster custom-marker-cluster-${size}" style="width:${sizeNum}px;height:${sizeNum}px;" tabindex="0" role="button" aria-label="${ariaLabel}">
            <span class="custom-marker-cluster-count">${count}</span>
            <span class="custom-marker-cluster-label">HOMES</span>
            <span class="custom-marker-cluster-cap" aria-hidden="true">Tap to zoom in <span class="custom-marker-cluster-cap-arrow">&#8250;</span></span>
          </div>`,
          className: '',
          iconSize: L.point(sizeNum, sizeNum),
        });
      },
    });

    const validListings = listings.filter((l) => l.latitude && l.longitude);

    // Issue #2139 — coincident-coordinate separation (zoomPolicy.ts). Above
    // disableClusteringAtZoom, leaflet.markercluster provides ZERO
    // coincident-point handling (see computeCoincidentMarkerOffsets'
    // module comment) — this is the sole mechanism keeping listings that
    // share (near-)identical geocoded coordinates individually visible and
    // clickable once the map crosses that threshold. `!` is required here:
    // validListings is already runtime-filtered to truthy latitude/
    // longitude above, but the PropertyListing type still carries them as
    // nullable.
    const coincidentOffsets = computeCoincidentMarkerOffsets(
      validListings.map((l) => ({ id: l.id, latitude: l.latitude!, longitude: l.longitude! })),
    );

    // Issue #1762 fix cycle 7 — fresh per-build lookup so the
    // selection/hover effect can find and patch an individual marker's icon
    // in place without touching the cluster group itself.
    const nextMarkersById = new Map<string, { marker: L.Marker; listing: PropertyListingWithImages }>();
    // Issue #2139 code-review fix — the cluster-tap split decision below
    // (clusterCanSplit/hasSpatialSpread) MUST see each member's ORIGINAL
    // (pre-offset) coordinates, not the coincident-offset render position.
    // cluster.getBounds() reads whatever lat/lng each L.marker was actually
    // constructed with, so applying the offset to marker construction would
    // otherwise silently flip a genuinely-coincident cluster's bounds from
    // degenerate (zero spread — #1762's deliberate "no meaningful split"
    // case) to a tiny nonzero spread, changing clusterCanSplit's verdict for
    // that cluster. Keeping a raw-coordinate lookup alongside the (offset)
    // marker keeps #1762's cluster-tap split/fit-to-members behaviour
    // byte-for-byte unchanged, while still letting the rendered markers
    // themselves be visually/interactively separated.
    const rawLatLngByMarker = new Map<L.Marker, { lat: number; lng: number }>();
    // Issue #2409 — reverse lookup so handleClusterActivate can resolve a
    // genuine 1-member cluster's sole child back to its listing, to fire the
    // exact same onSelectListing/onMarkerClickWithPosition an individual
    // marker click would.
    const listingByMarker = new Map<L.Marker, PropertyListingWithImages>();

    validListings.forEach((listing) => {
      // Issue #1547 — copper icon when id matches the URL-selected listing OR the
      // ephemeral hover/focus id. Both conditions use the same copper visual;
      // no flyTo / camera movement occurs for either path.
      const isHighlighted =
        listing.id === selectedListingId || listing.id === hoveredListingId;
      // Issue #1942 — thread priceBand (anon coarse price, #1941) into both icon
      // builders so anon individual pins show the band instead of a bare '—'.
      // Issue #2051 — also thread monthly_rent/monthlyRentBand so rent/lease pins
      // render a price instead of falling through to the '—' residual (AC6c).
      const icon = isHighlighted
        ? createSelectedMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand)
        : createMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand);
      // Issue #2139 — render at the coincident-offset position (identical
      // to the raw listing coordinates for any non-coincident listing).
      const position = coincidentOffsets.get(listing.id) ?? { latitude: listing.latitude!, longitude: listing.longitude! };
      const marker = L.marker([position.latitude, position.longitude], { icon });
      // Plain literal, not L.latLng(...) — avoids depending on the real
      // Leaflet LatLng constructor (this file's test doubles mock only the
      // specific `leaflet` exports each test needs); a {lat,lng} literal is
      // a valid LatLngExpression for L.latLngBounds below.
      rawLatLngByMarker.set(marker, { lat: listing.latitude!, lng: listing.longitude! });
      listingByMarker.set(marker, listing);

      // Attach listing-id to the marker element for E2E selectors.
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.setAttribute('data-listing-id', listing.id);
      });

      marker.on('click', (e: L.LeafletMouseEvent) => {
        onSelectListing?.(listing);
        // a3 — fire pixel position so MarkerPopoverCard can auto-position near the pin.
        // containerPoint is the pixel position relative to the map container element.
        if (onMarkerClickWithPosition && e.containerPoint) {
          onMarkerClickWithPosition({ x: e.containerPoint.x, y: e.containerPoint.y });
        }
      });

      nextMarkersById.set(listing.id, { marker, listing });
      clusterGroup.addLayer(marker);
    });

    // Issue #1762 — the SOLE cluster-tap camera mover, replacing Leaflet's
    // disabled zoomToBoundsOnClick above. Bound on 'clusterclick
    // clusterkeypress' — the SAME two event names leaflet.markercluster's
    // own internal `_bindEvents`/`_zoomOrSpiderfy` listens on (verified
    // against the installed leaflet.markercluster@1.5.3 source) — so this
    // handler runs alongside Leaflet's own (now-inert-for-zoom) listener
    // rather than replacing it. `@types/leaflet.markercluster` has no typed
    // overload for these plugin-added event names (only leaflet's own
    // built-in event map is typed), so the event object needs an
    // unavoidable cast to read `.layer` (the clicked MarkerCluster) and
    // `.originalEvent` (the underlying DOM event, present for a real click).
    const handleClusterActivate = (e: L.LeafletEvent) => {
      const evt = e as unknown as {
        type: string;
        layer?: L.MarkerCluster;
        originalEvent?: KeyboardEvent;
        containerPoint?: { x: number; y: number };
      };
      // Mirrors leaflet.markercluster's own _zoomOrSpiderfy gate: a
      // 'clusterkeypress' only activates on Enter (keyCode 13). Not
      // reachable via the existing keydown bridge below today (that bridge
      // synthesizes a native .click(), which surfaces as 'clusterclick' —
      // this gate exists for parity with Leaflet's own contract in case
      // something else ever dispatches a real 'clusterkeypress').
      if (evt.type === 'clusterkeypress' && evt.originalEvent && evt.originalEvent.keyCode !== 13) {
        return;
      }
      const cluster = evt.layer;
      if (!cluster) return;

      // Issue #2409 — a genuine 1-member cluster (see the iconCreateFunction
      // comment above for why leaflet.markercluster can produce one) must
      // behave exactly like tapping that listing's own individual marker:
      // no zoom/fit, no spiderfy, one tap opens the listing preview
      // directly. Bypasses every split/spiderfy decision below entirely.
      if (cluster.getChildCount() === 1) {
        const soleMarker = cluster.getAllChildMarkers()[0];
        const listing = soleMarker ? listingByMarker.get(soleMarker) : undefined;
        if (listing) {
          onSelectListing?.(listing);
          if (onMarkerClickWithPosition && evt.containerPoint) {
            onMarkerClickWithPosition({ x: evt.containerPoint.x, y: evt.containerPoint.y });
          }
        }
        return;
      }

      // Issue #1762 fix-cycle 5 — viewport-aware spiderfy fan clamp
      // (WORKDONE_REVIEW BLOCKING finding on the fix-cycle-3 flat
      // spiderfyDistanceMultiplier:3.5). MUST run before the
      // clusterCanSplit early-return below: leaflet.markercluster's OWN
      // clusterclick/clusterkeypress listener (`_zoomOrSpiderfy`,
      // registered via `_bindEvents()` inside `map.addLayer(clusterGroup)`
      // further down this effect — i.e. AFTER this handler is registered
      // via `clusterGroup.on(...)` below) independently decides whether to
      // spiderfy a bottomed-out cluster, regardless of whether
      // clusterCanSplit declines to move the camera — a non-splittable
      // (coincident) cluster is exactly the case that spiderfies (see the
      // fix-cycle-3 comment on `spiderfyDistanceMultiplier` above).
      // L.Evented fires listeners for one event in registration order
      // (verified against the installed leaflet.markercluster@1.5.3
      // source), and `MarkerCluster.spiderfy()` reads
      // `this._group.options.spiderfyDistanceMultiplier` LIVE at call time
      // (verified: `_generatePointsCircle`/`_generatePointsSpiral` both
      // read `this._group.options.spiderfyDistanceMultiplier`, not a value
      // captured at construction) — so mutating `clusterGroup`'s live
      // options object here, before Leaflet's own listener runs later in
      // this SAME event dispatch, changes what that spiderfy call sees.
      // `@types/leaflet.markercluster`'s `MarkerClusterGroup` class does
      // not re-declare `options` as the more specific
      // `MarkerClusterGroupOptions` (it inherits leaflet's untyped
      // `Layer.options`), so reading/writing this field needs the same
      // kind of unavoidable cast already used for `_spiderfied` below.
      const clusterGroupOptions = (clusterGroup as unknown as {
        options: { spiderfyDistanceMultiplier?: number };
      }).options;
      const spiderfyViewport = map.getContainer();
      clusterGroupOptions.spiderfyDistanceMultiplier = computeSpiderfyDistanceMultiplier(
        cluster.getChildCount(),
        spiderfyViewport.clientWidth,
        spiderfyViewport.clientHeight,
      );

      // Issue #2139 code-review fix — prefer each member's RAW (pre-offset)
      // coordinate via rawLatLngByMarker for the split decision, NOT
      // cluster.getBounds() (which reflects the rendered, coincident-offset
      // marker positions). Without this, a genuinely byte-identical-
      // coincident cluster's bounds would flip from degenerate/zero-spread
      // (#1762's deliberate "no meaningful split" case) to a tiny nonzero
      // spread purely because of the #2139 render-offset, changing
      // clusterCanSplit's verdict for that cluster. Falls back to
      // cluster.getBounds() (Leaflet's own) whenever raw coordinates aren't
      // fully resolvable for every child — a real click always resolves
      // every child (every marker in this clusterGroup was registered in
      // rawLatLngByMarker during the forEach above), so this fallback only
      // engages for test doubles that don't model child markers.
      const childMarkers = cluster.getAllChildMarkers();
      const rawLatLngs = childMarkers
        .map((m) => rawLatLngByMarker.get(m))
        .filter((ll): ll is { lat: number; lng: number } => ll != null);
      // Same [[swLat,swLng],[neLat,neLng]] single-array shape this file
      // already uses for `L.latLngBounds(cameraIntent.bounds)` elsewhere —
      // deliberately NOT `L.latLngBounds(rawLatLngs)` (an arbitrary-length
      // point array), so this reuses the exact call shape/contract already
      // relied on in this file rather than introducing a new one.
      const bounds =
        childMarkers.length > 0 && rawLatLngs.length === childMarkers.length
          ? L.latLngBounds([
              [Math.min(...rawLatLngs.map((p) => p.lat)), Math.min(...rawLatLngs.map((p) => p.lng))],
              [Math.max(...rawLatLngs.map((p) => p.lat)), Math.max(...rawLatLngs.map((p) => p.lng))],
            ])
          : cluster.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const currentZoom = map.getZoom();
      const cappedTargetZoom = Math.min(CLUSTER_DISABLE_AT_ZOOM, map.getBoundsZoom(bounds, false));
      const hasSpread = hasSpatialSpread([sw.lat, sw.lng], [ne.lat, ne.lng]);

      if (!clusterCanSplit(currentZoom, cappedTargetZoom, hasSpread)) {
        // Not splittable — publish nothing; leaflet.markercluster's own
        // spiderfyOnMaxZoom (still enabled) handles the bottomed-out-cluster
        // case, and the camera never moves for a non-splittable click.
        return;
      }

      const center = bounds.getCenter();
      onMarkerClusterCameraIntent?.(
        [[sw.lat, sw.lng], [ne.lat, ne.lng]],
        [center.lat, center.lng],
      );
      // Issue #1762 fix — the reveal-mode (clustered-overview vs
      // individual-pins) recompute used to happen ONLY here, via a one-shot
      // `map.once('moveend', ...)` armed by this cluster-tap handler. That
      // meant a manual/fresh navigation to the exact same settled camera
      // never recomputed the decision and instead inherited whatever
      // `markerRevealDisableAtZoom` happened to already be — violating the
      // #1762 AC that cluster-tap and manual navigation to an equivalent
      // camera must converge on the same result. The fit this handler
      // triggers still ends in a 'moveend' like any other camera move, so
      // the general (non-one-shot) `recomputeMarkerRevealMode` listener
      // registered below now covers this path too — nothing cluster-tap-
      // specific needs to happen here anymore.
    };
    clusterGroup.on('clusterclick clusterkeypress', handleClusterActivate);

    map.addLayer(clusterGroup);

    // Listing-cluster keyboard bridge. Leaflet.markercluster regenerates
    // cluster icons on every zoom/pan (unlike AreaMarkerLayer's static area
    // markers), so per-icon listener attachment on 'add' would need constant
    // re-wiring against an untyped plugin event. Delegate once on the map
    // container instead: Enter/Space on a focused .custom-marker-cluster
    // bubbles up here and is forwarded to a native .click() on the element,
    // which surfaces as a 'clusterclick' event — reaching both Leaflet's own
    // (now-inert-for-zoom) internal listener and handleClusterActivate above
    // — this makes the cluster-tap fit-to-members handler keyboard-reachable
    // without any separate keyboard-specific camera logic.
    const container = map.getContainer();
    const handleClusterKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const clusterEl = target.closest<HTMLElement>('.custom-marker-cluster');
      if (!clusterEl) return;
      e.preventDefault();
      clusterEl.click();
    };
    container.addEventListener('keydown', handleClusterKeydown);

    // Issue #1762 fix — reveal/clustering decision recompute, driven by the
    // SETTLED camera rather than a cluster-tap-only one-shot listener. Runs
    // on every 'moveend' this map instance fires (cluster-tap fit, manual
    // pan/zoom, programmatic CameraIntent-driven moves alike), each time
    // deriving markerRevealDisableAtZoom from the CURRENT bounds/zoom/
    // viewport and how many of this layer's own listings fall inside those
    // bounds — the same inputs resolveMarkerRevealMode always took, just no
    // longer gated on which handler happened to trigger the move. Also
    // invoked once synchronously below so a fresh mount/navigation (which
    // may not fire its own 'moveend') still reflects the settled camera it
    // mounted with, rather than the CLUSTER_DISABLE_AT_ZOOM default.
    const recomputeMarkerRevealMode = () => {
      // Issue #1762 fix cycle 4 — preserved from the prior one-shot
      // handler: skip the recompute while a spiderfy fan is open. Applying
      // a reveal-mode change re-renders this component with a new
      // `markerRevealDisableAtZoom` (an effect dependency below), which
      // tears down and recreates the whole marker-cluster layer — doing
      // that while a spiderfy fan is on-screen would silently discard it
      // out from under the user's next click. `_spiderfied` is
      // leaflet.markercluster's own live pointer to the currently-open
      // spiderfy (untyped — @types/leaflet.markercluster has no surface
      // for plugin-internal state).
      const clusterGroupInternal = clusterGroup as unknown as { _spiderfied?: unknown };
      if (clusterGroupInternal._spiderfied) {
        return;
      }
      // NOTE: markerCount here is validListings.length — this layer's whole
      // loaded data set (already filtered to finite coordinates above), NOT
      // a viewport-scoped/in-bounds count. resolveMarkerRevealMode's isDense
      // check is therefore driven by total dataset size + fixed viewport
      // pixel dimensions, invariant to zoom/pan within that dataset — a
      // deliberate, currently-untuned broadening beyond the original
      // per-cluster (getChildCount()) density signal; see PR #2138 review
      // discussion. Bounds are still read below (getSouth/getWest/getNorth/
      // getEast, not getSouthWest()/getNorthEast() — this app's map mocks
      // and the existing BoundsWatcher handler above don't assume those
      // exist) and passed as fittedExtent, which resolveMarkerRevealMode
      // currently ignores (documented DEFERRED in zoomPolicy.ts) — kept for
      // forward compatibility if that parameter is wired up later.
      const bounds = map.getBounds();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();
      const mapContainer = map.getContainer();
      const mode = resolveMarkerRevealMode(
        map.getZoom(),
        validListings.length,
        mapContainer.clientWidth,
        mapContainer.clientHeight,
        [[south, west], [north, east]],
      );
      const nextDisableAtZoom = mode === 'clusteredOverview' ? MARKER_REVEAL_HOLD_ZOOM : CLUSTER_DISABLE_AT_ZOOM;
      setMarkerRevealDisableAtZoom((prev) => (prev === nextDisableAtZoom ? prev : nextDisableAtZoom));
    };
    map.on('moveend', recomputeMarkerRevealMode);
    recomputeMarkerRevealMode();

    // Issue #1762 fix cycle 7 — publish the newly-built layer/marker lookup
    // for the selection/hover effect below, and record the teardown this
    // build owns so a future `buildLayer()` call (or unmount) can undo
    // exactly this construction.
    clusterGroupRef.current = clusterGroup;
    markersByListingIdRef.current = nextMarkersById;
    teardownLayerRef.current = () => {
      clusterGroup.off('clusterclick clusterkeypress', handleClusterActivate);
      map.removeLayer(clusterGroup);
      container.removeEventListener('keydown', handleClusterKeydown);
      map.off('moveend', recomputeMarkerRevealMode);
      clusterGroupRef.current = null;
      markersByListingIdRef.current = new Map();
    };
  };

  // Bumps `commitIdRef` once per actual COMMIT (an effect with no
  // dependency array runs after every commit, exactly once — unlike a
  // render-body write, which is not guaranteed 1:1 with commits under
  // concurrent-rendering features). Declared before the structural and
  // selection/hover effects below so it always runs first within the same
  // commit (React runs a single component's effects in declaration order),
  // guaranteeing both of those effects observe the same, already-current
  // `commitIdRef.current` value for that commit.
  useEffect(() => {
    commitIdRef.current += 1;
  });

  // Structural effect — full teardown/rebuild whenever the layer's real
  // inputs change (listings, map instance, config-affecting callbacks, or
  // the reveal-mode zoom threshold). This is the ONLY effect that runs
  // `buildLayer()` on mount; `selectedListingId`/`hoveredListingId` are
  // deliberately NOT in this dependency array — see the selection/hover
  // effect below for why and how those are handled instead.
  useEffect(() => {
    buildLayer();
    return () => {
      teardownLayerRef.current?.();
      teardownLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    listings,
    map,
    onSelectListing,
    onMarkerClickWithPosition,
    onMarkerClusterCameraIntent,
    markerRevealDisableAtZoom,
  ]);

  // Issue #1762 fix cycle 7 — selection/hover-only effect. Skips the first
  // (mount) run since the structural effect above already built the layer
  // with the correct initial highlight state. On every subsequent
  // selectedListingId/hoveredListingId change: if the cluster group is
  // currently spiderfied, patch just the affected marker(s)' icons in place
  // (fan stays open — no removeLayer, no rebuild). Otherwise, fall back to
  // `buildLayer()` directly, which reproduces the pre-fix full-rebuild
  // behavior exactly for the non-spiderfied case.
  useEffect(() => {
    if (!didMountHighlightEffectRef.current) {
      didMountHighlightEffectRef.current = true;
      prevSelectedListingIdRef.current = selectedListingId;
      prevHoveredListingIdRef.current = hoveredListingId;
      return;
    }

    // Same-commit double-rebuild guard — see commitIdRef/lastBuildCommitIdRef
    // comment above. The structural effect already called `buildLayer()`
    // during this exact commit, and that build already reflects the current
    // selectedListingId/hoveredListingId, so skip redundant work.
    if (lastBuildCommitIdRef.current === commitIdRef.current) {
      prevSelectedListingIdRef.current = selectedListingId;
      prevHoveredListingIdRef.current = hoveredListingId;
      return;
    }

    const clusterGroup = clusterGroupRef.current;
    // Same untyped-plugin-internal cast pattern as recomputeMarkerRevealMode
    // above — `_spiderfied` has no surface in @types/leaflet.markercluster.
    const clusterGroupInternal = clusterGroup as unknown as { _spiderfied?: unknown } | null;
    const isSpiderfied = Boolean(clusterGroup && clusterGroupInternal?._spiderfied);

    if (isSpiderfied) {
      const idsToRefresh = new Set<string>();
      if (prevSelectedListingIdRef.current) idsToRefresh.add(prevSelectedListingIdRef.current);
      if (prevHoveredListingIdRef.current) idsToRefresh.add(prevHoveredListingIdRef.current);
      if (selectedListingId) idsToRefresh.add(selectedListingId);
      if (hoveredListingId) idsToRefresh.add(hoveredListingId);

      idsToRefresh.forEach((id) => {
        const entry = markersByListingIdRef.current.get(id);
        if (!entry) return;
        const { marker, listing } = entry;
        const isHighlighted = id === selectedListingId || id === hoveredListingId;
        const icon = isHighlighted
          ? createSelectedMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand)
          : createMarkerIcon(listing.property_type, listing.price, listing.priceBand, listing.monthly_rent, listing.monthlyRentBand);
        marker.setIcon(icon);
      });
    } else {
      buildLayer();
    }

    prevSelectedListingIdRef.current = selectedListingId;
    prevHoveredListingIdRef.current = hoveredListingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListingId, hoveredListingId]);

  return null;
}
