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
  /** Loading state from useSchoolsByArea. When true and journey='school-first', shows loading UI. */
  isLoading?: boolean;
  /** Error state from useSchoolsByArea. When true and journey='school-first', shows error UI. */
  isError?: boolean;
  /** Error object from useSchoolsByArea. Displayed when isError=true. */
  error?: Error | null;
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
 * Also handles loading, error, and empty-state diagnostics:
 * - Loading: shows spinner while fetching (only in school-first journey)
 * - Error: shows error message when API fails (only in school-first journey)
 * - Empty: logs console.warn when no schools found after successful load
 *
 * Mirrors the imperative AreaMarkerLayer pattern (useEffect + L.marker.addTo)
 * because PropertyMap's MapContainer uses non-React Leaflet internals.
 */
export function SchoolMarkerLayer({
  schools,
  onSelectSchool,
  journey,
  isLoading = false,
  isError = false,
  error = null,
}: SchoolMarkerLayerProps) {
  const map = useMap();

  // Diagnostic: log empty state (successful load but no schools)
  useEffect(() => {
    if (journey === 'school-first' && !isLoading && !isError && schools.length === 0) {
      console.warn('[SchoolMarkerLayer] No schools found for selected area in school-first journey');
    }
  }, [journey, isLoading, isError, schools.length]);

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

  // Render diagnostics only in school-first journey
  if (journey !== 'school-first') {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="school-marker-loading"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2 border border-border"
      >
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading schools...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to load schools';
    return (
      <div
        data-testid="school-marker-error"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-white rounded-lg shadow-lg px-4 py-2 border border-red-200 flex items-center gap-2"
      >
        <svg
          className="w-4 h-4 text-red-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-red-700">{errorMsg}</span>
      </div>
    );
  }

  // Empty state
  if (schools.length === 0) {
    return (
      <div
        data-testid="school-marker-empty"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-white rounded-lg shadow-lg px-4 py-2 border border-border flex items-center gap-2"
      >
        <svg
          className="w-4 h-4 text-muted-foreground flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-muted-foreground">No schools found in this area</span>
      </div>
    );
  }

  return null;
}
