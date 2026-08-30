import { Circle, Marker } from 'react-leaflet';
import L from 'leaflet';
import { SELECTED_SCHOOL_PANE_NAME } from '@/components/map/SchoolMarkerLayer';
import type { SchoolCircle as SchoolCircleShape } from '../PropertyMap';

/**
 * Issue #2382 — school circle/radius overlay, extracted verbatim out of
 * PropertyMap.tsx (page-health follow-up from #2296). Owns the plum radius
 * ring + school pin rendered around the selected school; SchoolMarkerLayer.tsx
 * (unrelated file, unaffected by this move) continues to own the school
 * result markers themselves and the SELECTED_SCHOOL_PANE_NAME the marker
 * below is rendered into.
 */

// Issue #1954 — school marker recolored from blue (#2563eb) to the plum design-system
// token, matching the school-first V2 identity used throughout SchoolJourneyPanels
// (bg-plum-tint / text-plum). Does not touch area/agri marker colours elsewhere in
// this app (Polygon pathOptions in AgriParcelLayer.tsx, AreaMarkerLayer, etc.) —
// school-only change.
export const schoolMarkerIcon = L.divIcon({
  className: 'school-marker',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background-color: hsl(var(--plum));
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    ">🎓</div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/**
 * Renders the plum dashed radius ring + school pin around the currently
 * selected school. No-op (renders nothing) when `schoolCircle` is absent —
 * same gate PropertyMap.tsx used inline before this extraction.
 */
export function SchoolRadiusOverlay({ schoolCircle }: { schoolCircle?: SchoolCircleShape }) {
  if (!schoolCircle) return null;

  return (
    <>
      <Circle
        center={[schoolCircle.lat, schoolCircle.lon]}
        radius={schoolCircle.radiusKm * 1000}
        pathOptions={{
          // Issue #1954 — plum dashed radius ring (was blue #2563eb), matching
          // the plum school marker icon above. dashArray/weight/fillOpacity unchanged.
          color: 'hsl(var(--plum))',
          fillColor: 'hsl(var(--plum))',
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '6 4',
        }}
      />
      {/* School location marker (🎓). The school name is intentionally NOT
          labelled on the map — the journey breadcrumb overlay already shows it,
          so a permanent tooltip here would just duplicate it.
          Issue #2130 — rendered into the dedicated selected-school pane
          (below the default markerPane) so it can never occlude an
          overlapping property marker's tap target; the pane itself is
          created by PropertyMap.tsx's SelectedSchoolPaneSetup controller. */}
      <Marker
        position={[schoolCircle.lat, schoolCircle.lon]}
        icon={schoolMarkerIcon}
        pane={SELECTED_SCHOOL_PANE_NAME}
      />
    </>
  );
}
