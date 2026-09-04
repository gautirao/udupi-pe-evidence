import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

/**
 * Polygon geometry styling — Issue #2419 (PR-2), taken from the committed
 * Discover design kit rather than invented here.
 *
 * `ui_kits/new_discover/src/ExpMap.jsx` (the mock's own map layer) draws the
 * two states DIFFERENTLY, and #2419 requires the shopper to tell "drawing a
 * draft" apart from "using a committed polygon". Before this PR both used one
 * copper-ish style, so the two states were visually identical.
 *
 *   draft     — navy, dashed, barely filled    (ExpMap.jsx:461)
 *   committed — copper, solid, heavier, filled (ExpMap.jsx:462)
 *
 * Hex values are the mock's verbatim, and deliberately not re-expressed as
 * theme tokens: these are map-geometry colours painted onto a Leaflet canvas
 * over street tiles, not themed surface chrome, and the kit specifies them as
 * literals for that reason.
 */
const DRAFT_SHAPE_OPTIONS: L.PolylineOptions = {
  color: '#1B2A45',
  weight: 2,
  dashArray: '6 5',
  fillColor: '#1B2A45',
  fillOpacity: 0.05,
};

const COMMITTED_SHAPE_OPTIONS: L.PolylineOptions = {
  color: '#B05C3A',
  weight: 2.4,
  fillColor: '#B05C3A',
  fillOpacity: 0.1,
  // SOLID. Committed styling is applied with `setStyle` to the very layer the
  // shopper drew (see the sync effect), and Leaflet's setStyle MERGES options:
  // without an explicit override the draft's `dashArray: '6 5'` survives the
  // restyle and the committed boundary renders as a dashed copper line. The
  // browser evidence run for PR #2452 caught exactly that (stroke-dasharray
  // "6 5" still on the committed path). `undefined` makes Leaflet remove the
  // SVG attribute.
  dashArray: undefined,
};

interface DrawControlProps {
  onPolygonDrawn: (polygon: [number, number][]) => void;
  onPolygonCleared: () => void;
  /** When truthy, the draw control renders a visible polygon overlay. */
  polygon?: [number, number][] | null;
  /**
   * Issue #2419 (PR-2) — the product-native draw-mode seam.
   *
   * Increment to START point placement. A NONCE rather than a boolean:
   * "start drawing" is an event, and a boolean cannot express "the shopper
   * pressed Draw again" after cancelling, because it never changes value.
   * `0`/undefined means "never asked", so mounting can never auto-arm the
   * tool.
   */
  startDrawNonce?: number;
  /** Increment to CANCEL point placement and discard the in-progress shape. */
  cancelDrawNonce?: number;
  /** Increment to remove the last placed vertex, leaving the rest in place. */
  undoVertexNonce?: number;
  /**
   * Fires as the shape is built, with the number of vertices placed so far.
   * Drives the draw-mode overlay's Undo affordance, which must not offer to
   * undo a point that does not exist.
   */
  onDrawVertexCountChange?: (count: number) => void;
  /**
   * Fires when point placement ends WITHOUT a completed shape — cancelled, or
   * aborted by the plugin. Distinct from `onPolygonDrawn`, which only ever
   * fires with a finished polygon.
   */
  onDrawModeExit?: () => void;
  /**
   * Hides the plugin's own toolbar button and action bar. #2419 requires the
   * primary entry to be product-native rather than "unexplained plugin
   * chrome"; the plugin's machinery stays, only its UI is suppressed.
   */
  hidePluginToolbar?: boolean;
}

/**
 * Integrates leaflet-draw polygon drawing into the existing Leaflet map.
 * Only polygon drawing is enabled — all other tools (marker, circle, polyline, rectangle) are disabled.
 *
 * Uses `useMap()` to access the map instance from the parent `<MapContainer>`.
 *
 * Issue #2419 (PR-2) — this component gained an external start/cancel/undo
 * seam. Before it, the ONLY way to begin drawing was the plugin's own toolbar
 * button, so no product-native entry point could exist anywhere in the app.
 * The seam is nonce-driven and one-way: this component never decides WHEN to
 * draw, it only obeys. All product state stays in `useDiscoverPageState`.
 */
export function DrawControl({
  onPolygonDrawn,
  onPolygonCleared,
  polygon,
  startDrawNonce,
  cancelDrawNonce,
  undoVertexNonce,
  onDrawVertexCountChange,
  onDrawModeExit,
  hidePluginToolbar = false,
}: DrawControlProps) {
  const map = useMap();
  const drawnLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  /** The live L.Draw.Polygon handler while point placement is active. */
  const drawHandlerRef = useRef<L.Draw.Polygon | null>(null);
  // Callbacks are captured via refs so the mount-once effect below can call
  // the latest ones without re-running on every parent re-render.
  const onPolygonDrawnRef = useRef(onPolygonDrawn);
  onPolygonDrawnRef.current = onPolygonDrawn;
  const onDrawVertexCountChangeRef = useRef(onDrawVertexCountChange);
  onDrawVertexCountChangeRef.current = onDrawVertexCountChange;
  const onDrawModeExitRef = useRef(onDrawModeExit);
  onDrawModeExitRef.current = onDrawModeExit;

  // Mount the draw control once
  useEffect(() => {
    const drawnItems = drawnLayerRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: DRAFT_SHAPE_OPTIONS,
        },
        polyline: false,
        circle: false,
        rectangle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        // Disable edit/delete toolbar — we use our own "Clear" button
        edit: false,
        remove: false,
      },
    });

    drawControlRef.current = drawControl;
    map.addControl(drawControl);

    // Listen for polygon creation
    const onCreated = (e: L.DrawEvents.Created) => {
      // Clear previous polygon before adding the new one
      drawnItems.clearLayers();
      const layer = e.layer as L.Polygon;
      // KEEP DRAFT STYLING. A closed shape is not a committed scope: it still
      // has to pass #2420 validation and, when another scope is active, the
      // #2016 replacement dialog. An earlier revision restyled it to
      // committed here, which made the shape look settled during exactly the
      // window where the shopper is being asked whether to accept it — and
      // left a REJECTED polygon wearing committed styling.
      //
      // Committed styling has exactly ONE source: the `polygon` prop sync
      // effect below, which reflects the authoritative committed ResultScope.
      layer.setStyle(DRAFT_SHAPE_OPTIONS);
      drawnItems.addLayer(layer);

      const latLngs = (layer.getLatLngs()[0] as L.LatLng[]);
      const coords: [number, number][] = latLngs.map((ll) => [
        Math.round(ll.lat * 10000) / 10000,
        Math.round(ll.lng * 10000) / 10000,
      ]);
      // Placement is over — clear the handler BEFORE notifying, so the
      // DRAWSTOP listener below does not also report an abandoned draw.
      drawHandlerRef.current = null;
      onDrawVertexCountChangeRef.current?.(0);
      onPolygonDrawnRef.current(coords);
    };

    // Issue #2419 (PR-2) — vertex accounting for the product-native Undo.
    // The count comes from the event's own layer group rather than a local
    // tally, so a vertex the plugin removes internally can never drift from
    // what the overlay reports.
    const onDrawVertex = (e: L.DrawEvents.DrawVertex) => {
      onDrawVertexCountChangeRef.current?.(e.layers.getLayers().length);
    };

    const onDrawStop = () => {
      // Fires for BOTH a completed shape and an abandoned one. `onCreated`
      // runs first and nulls the handler, so a still-set handler here means
      // placement ended without a polygon.
      if (drawHandlerRef.current) {
        drawHandlerRef.current = null;
        onDrawVertexCountChangeRef.current?.(0);
        onDrawModeExitRef.current?.();
      }
    };

    map.on(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);
    map.on(L.Draw.Event.DRAWVERTEX, onDrawVertex as L.LeafletEventHandlerFn);
    map.on(L.Draw.Event.DRAWSTOP, onDrawStop);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);
      map.off(L.Draw.Event.DRAWVERTEX, onDrawVertex as L.LeafletEventHandlerFn);
      map.off(L.Draw.Event.DRAWSTOP, onDrawStop);
      drawHandlerRef.current?.disable();
      drawHandlerRef.current = null;
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
    // Only run once on mount — callbacks are captured via refs above.
  }, [map]);

  // Issue #2419 (PR-2) — suppress the plugin's own chrome when the product
  // supplies the entry. Applied as a class on the map container rather than
  // by omitting the control, because that control instance owns the handler
  // machinery; removing it would remove the tool along with its UI.
  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle('discover-hide-leaflet-draw-toolbar', hidePluginToolbar);
    return () => container.classList.remove('discover-hide-leaflet-draw-toolbar');
  }, [map, hidePluginToolbar]);

  // START point placement.
  useEffect(() => {
    if (!startDrawNonce) return;
    drawHandlerRef.current?.disable();
    // Clear any previously drawn shape so the shopper draws onto a clean map
    // rather than on top of the boundary they are replacing.
    drawnLayerRef.current.clearLayers();
    const handler = new L.Draw.Polygon(map as L.DrawMap, {
      allowIntersection: false,
      // No area readout: the plugin tooltip that would show it is hidden by
      // `hidePluginToolbar`, and leaflet-draw 1.0.4's `readableArea` throws
      // `ReferenceError: type is not defined` on every mousemove once
      // `showArea` is on (the browser evidence run for PR #2452 logged one
      // per draw session). Off, the measurement is never computed.
      showArea: false,
      shapeOptions: DRAFT_SHAPE_OPTIONS,
    });
    drawHandlerRef.current = handler;
    handler.enable();
    onDrawVertexCountChangeRef.current?.(0);
    // Nonce-driven: this must re-run on every increment, and ONLY on that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDrawNonce]);

  // CANCEL point placement.
  useEffect(() => {
    if (!cancelDrawNonce) return;
    const handler = drawHandlerRef.current;
    if (!handler) return;
    // Null the ref FIRST so the DRAWSTOP listener does not also report an
    // exit — the product already knows, it asked for this.
    drawHandlerRef.current = null;
    handler.disable();
    drawnLayerRef.current.clearLayers();
    onDrawVertexCountChangeRef.current?.(0);
    // Nonce-only dep is genuinely complete: everything else read here is a ref.
  }, [cancelDrawNonce]);

  // UNDO the last placed vertex.
  useEffect(() => {
    if (!undoVertexNonce) return;
    drawHandlerRef.current?.deleteLastVertex();
  }, [undoVertexNonce]);

  // Sync external polygon state to the drawn layer (e.g., from URL params or clear)
  useEffect(() => {
    const drawnItems = drawnLayerRef.current;

    if (!polygon || polygon.length < 3) {
      drawnItems.clearLayers();
      return;
    }

    // This effect is the ONE place committed styling is applied. A polygon
    // arriving here IS the authoritative committed ResultScope — freshly
    // confirmed, or restored from the URL on refresh or Back/Forward.
    //
    // The existing-layer branch does NOT early-return any more. It used to,
    // which was correct while `onCreated` styled its own shape as committed;
    // now that a just-drawn shape correctly stays in DRAFT styling until it
    // is accepted, returning early here would leave a committed polygon
    // wearing draft styling for the rest of its life. Restyling in place also
    // keeps the original geometry rather than replacing the layer, so the
    // shape the shopper drew is literally the one that stays on the map.
    //
    // Restyling triggers no state update, so the infinite-loop hazard the
    // old guard existed for (draw → state → re-render) does not return.
    const existing = drawnItems.getLayers();
    if (existing.length > 0) {
      for (const layer of existing) {
        (layer as L.Polygon).setStyle(COMMITTED_SHAPE_OPTIONS);
      }
      return;
    }

    const latLngs = polygon.map(([lat, lng]) => L.latLng(lat, lng));
    drawnItems.addLayer(L.polygon(latLngs, COMMITTED_SHAPE_OPTIONS));
  }, [polygon]);

  // Clear handler — invoked by parent via the onPolygonCleared prop
  // The parent's "Clear polygon" button calls onPolygonCleared which sets polygon to null,
  // and the useEffect above clears the drawn layer.

  return null;
}
