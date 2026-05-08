import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export interface SchoolMarkerLayerProps {
  schools: SchoolResult[];
  onSelectSchool?: (schoolId: string) => void;
  /** Only renders when journey === 'school-first'. */
  journey?: DiscoverJourney | null;
}

/**
 * A school marker icon — blue circle with graduation cap.
 * Defined locally to avoid a cross-dependency with PropertyMap's module-scope
 * `schoolMarkerIcon` (which is not exported).
 */
const schoolPinIcon = L.divIcon({
  className: 'school-marker',
  html: `
    <div style="
      width: 36px;
      height: 36px;
      background-color: #2563eb;
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
 * Renders a Leaflet marker for each school in the `schools` array.
 * Only mounts markers when `journey === 'school-first'` and there is at least
 * one school to show. Clicking a marker calls `onSelectSchool(school.id)`.
 *
 * Mirrors the imperative AreaMarkerLayer pattern (useEffect + L.marker.addTo)
 * because PropertyMap's MapContainer uses non-React Leaflet internals.
 */
export function SchoolMarkerLayer({
  schools,
  onSelectSchool,
  journey,
}: SchoolMarkerLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (journey !== 'school-first' || schools.length === 0) return;

    const markers: L.Marker[] = [];

    for (const school of schools) {
      const marker = L.marker([school.latitude, school.longitude], {
        icon: schoolPinIcon,
        title: escapeHtml(school.name),
      });

      marker.bindTooltip(escapeHtml(school.name), {
        permanent: false,
        direction: 'top',
        offset: [0, -20],
      });

      marker.on('click', () => {
        onSelectSchool?.(school.id);
      });

      marker.addTo(map);
      markers.push(marker);
    }

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [schools, map, onSelectSchool, journey]);

  return null;
}
