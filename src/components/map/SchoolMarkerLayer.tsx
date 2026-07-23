import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { escapeHtml } from '@/lib/security';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export interface SchoolMarkerLayerProps {
  schools: SchoolResult[];
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Master visibility gate for the school markers (Issue #1157 rev-5 DEFECT A).
   * The markers render when this is true. MapDiscovery computes it as
   * `journey === 'school-first' || schoolPicking || (journey === 'area-first' && areaKey && schoolId)`
   * so the area-first school-picking sub-step and area-school-combined state show
   * markers without flipping journey to school-first. When the OR's first term is
   * true (school-first), the value is byte-for-byte identical to the previous
   * `journey === 'school-first'` gate — school-first rendering is unchanged.
   */
  showSchoolMarkers?: boolean;
  /**
   * Active journey. Retained because the loading/error/empty diagnostic UI stays
   * gated to school-first only (those overlays must NOT surface in area-first).
   */
  journey?: DiscoverJourney | null;
  /** Loading state from useSchoolsByArea. When true and journey='school-first', shows loading UI. */
  isLoading?: boolean;
  /** Error state from useSchoolsByArea. When true and journey='school-first', shows error UI. */
  isError?: boolean;
  /** Error object from useSchoolsByArea. Displayed when isError=true. */
  error?: Error | null;
  /**
   * When set, only the marker for this school ID is rendered (focus mode).
   * All other school markers are suppressed. Null/undefined = show all.
   */
  selectedSchoolId?: string | null;
}

/**
 * A school marker icon — plum circle with graduation cap (Issue #1954: recolored
 * from blue #2563eb to the plum design-system token, matching PropertyMap.tsx's
 * schoolMarkerIcon + SchoolRadiusMapOverlay.tsx's legend swatch).
 * Defined locally to avoid a cross-dependency with PropertyMap's module-scope
 * `schoolMarkerIcon` (which is not exported).
 */
const schoolPinIcon = L.divIcon({
  className: 'school-pin',
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
 * Renders a Leaflet marker for each school in the `schools` array.
 * Only mounts markers when `journey === 'school-first'` and there is at least
 * one school to show. Clicking a marker calls `onSelectSchool(school.id)`.
 *
 * When `selectedSchoolId` is non-null, only the marker for that school is
 * rendered (focus mode). All other school markers are suppressed so the user
 * sees exactly one pin — the selected school.
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
  showSchoolMarkers = false,
  journey,
  isLoading = false,
  isError = false,
  error = null,
  selectedSchoolId = null,
}: SchoolMarkerLayerProps) {
  const map = useMap();

  // Diagnostic: log empty state (successful load but no schools).
  // Intentionally still gated to school-first — this warn must NOT surface in
  // the area-first sub-step (Issue #1157 rev-5 WARN3 scope note).
  useEffect(() => {
    if (journey === 'school-first' && !isLoading && !isError && schools.length === 0) {
      console.warn('[SchoolMarkerLayer] No schools found for selected area in school-first journey');
    }
  }, [journey, isLoading, isError, schools.length]);

  useEffect(() => {
    if (!showSchoolMarkers || schools.length === 0) return;

    const markers: L.Marker[] = [];

    for (const school of schools) {
      // Focus mode: when a school is selected, only render its marker.
      if (selectedSchoolId !== null && school.id !== selectedSchoolId) continue;

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
  }, [schools, map, onSelectSchool, showSchoolMarkers, selectedSchoolId]);

  // Render diagnostics (loading / error / empty overlays) only in school-first
  // journey. When markers are hidden entirely (showSchoolMarkers=false) there is
  // nothing to render either. The area-first sub-step shows markers but no
  // diagnostic overlays (those remain school-first-only by design).
  if (!showSchoolMarkers || journey !== 'school-first') {
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
