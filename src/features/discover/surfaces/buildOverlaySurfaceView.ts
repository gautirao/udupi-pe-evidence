import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourneyTransitionsCommands } from '@/features/discover/state/useDiscoverJourneyTransitions';

/**
 * Issue #2142 Commit 4 — typed view/commands contract for DiscoverOverlaySurface.
 *
 * Scope note (deviation from the architect's original spec): this surface owns
 * ONLY the outer chrome (NearSchoolSheet + DiscoverConsentBanner +
 * DiscoverPrivacyToggle) — the pieces MapDiscovery.tsx renders as top-level
 * siblings AFTER the map+panel row. MobileClusterSheet, MobileListingPreviewSheet,
 * and the recenter-button portal were originally spec'd here too, but are
 * mounted INSIDE the same z-[60] mobile-map wrapper <div> as DiscoverMapCanvas
 * (required for correct Leaflet-canvas stacking context — see that wrapper's own
 * code comment, `[reuse_seams].sheet_stacking`). A single DiscoverOverlaySurface
 * mount point cannot reproduce both DOM positions without either trapping
 * DiscoverPrivacyToggle's `fixed` positioning inside the mobile overlay, or
 * un-inheriting the map canvas's stacking context for the other three. Per
 * team-lead ruling (2026-08-12): those three now live in DiscoverMapSurface's
 * own `overlays` view/commands sub-group instead, split by actual DOM/stacking
 * coupling rather than spec-literal proximity — zero DOM-position change vs.
 * today either way.
 */
export interface DiscoverOverlaySurfaceView {
  nearSchool: {
    visible: boolean;
    open: boolean;
    selectedSchool: SchoolResult | null;
    filters: PropertyFilters;
    boardFilter: string[];
    city: string | null;
  };
}

export interface DiscoverOverlaySurfaceCommands {
  setNearSchoolOpen: (open: boolean) => void;
  onSchoolSelect: (school: SchoolResult | null) => void;
  onFiltersChange: (next: PropertyFilters) => void;
  onBoardFilterChange: (boards: string[]) => void;
}

export interface BuildOverlaySurfaceViewParams {
  isAgriJourney: boolean;
  nearSchoolOpen: boolean;
  selectedSchool: SchoolResult | null;
  filters: PropertyFilters;
  schoolBoardFilter: string[];
  isCityValid: boolean;
  city: string;
}

export function buildOverlaySurfaceView(
  params: BuildOverlaySurfaceViewParams,
): DiscoverOverlaySurfaceView {
  const { isAgriJourney, nearSchoolOpen, selectedSchool, filters, schoolBoardFilter, isCityValid, city } =
    params;

  return {
    nearSchool: {
      visible: !isAgriJourney,
      open: nearSchoolOpen,
      selectedSchool,
      filters,
      boardFilter: schoolBoardFilter,
      city: isCityValid ? city : null,
    },
  };
}

export interface BuildOverlaySurfaceCommandsParams {
  setNearSchoolOpen: (open: boolean) => void;
  journeyCommands: DiscoverJourneyTransitionsCommands;
  handleFiltersChange: (next: PropertyFilters) => void;
  handleBoardFilterChange: (boards: string[]) => void;
}

export function buildOverlaySurfaceCommands(
  params: BuildOverlaySurfaceCommandsParams,
): DiscoverOverlaySurfaceCommands {
  const { setNearSchoolOpen, journeyCommands, handleFiltersChange, handleBoardFilterChange } = params;

  return {
    setNearSchoolOpen,
    onSchoolSelect: journeyCommands.wrappedSchoolSelect,
    onFiltersChange: handleFiltersChange,
    onBoardFilterChange: handleBoardFilterChange,
  };
}
