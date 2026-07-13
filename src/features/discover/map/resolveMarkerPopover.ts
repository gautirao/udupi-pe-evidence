import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import { resolveMarkerListings, type ResolveMarkerListingsInput } from './resolveMarkerListings';

/**
 * Issue #1824 Slice S10b — pure-module extraction of the Issue #1810 (Stage
 * 2A, MODEL A) marker-resolve + stepper cluster (previously inline at
 * MapDiscovery.tsx L1792-1808 / L1816-1823 @ b287cfd7). VERBATIM logic
 * transposition: the resolveMarkerListings 15-field call and the
 * markerPopoverStepper IIFE (eligibility gate, findIndex, the
 * idx===-1||length<=1 guard, and the {index,total} return) are unchanged. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s10b-design.md.
 *
 * PURE: no React import, no hooks, no side effects, no memoization — a plain
 * function that returns fresh objects on every call (per-render identity,
 * as before extraction). handleStepMarkerListing STAYS inline in the page
 * (the user-locked #1810 MODEL A no-camera invariant) and is NOT part of
 * this module.
 */
export interface ResolveMarkerPopoverInput extends ResolveMarkerListingsInput {
  isMarkerPopoverEligible: boolean;
  selectedMarkerListing: PropertyListingWithImages | null;
}

export interface MarkerPopoverStepper {
  index: number;
  total: number;
}

export interface ResolveMarkerPopoverResult {
  currentMapMarkerListings: PropertyListingWithImages[];
  markerPopoverStepper: MarkerPopoverStepper | null;
}

export function resolveMarkerPopover(input: ResolveMarkerPopoverInput): ResolveMarkerPopoverResult {
  const {
    mapLayerCategory,
    selectedArea,
    isGroupResultsState,
    mapZoom,
    areaLayerMaxZoom,
    isAuthenticated,
    journey,
    schoolId,
    groupResultsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
    isMarkerPopoverEligible,
    selectedMarkerListing,
  } = input;

  // Issue #1810 (Stage 2A, MODEL A) — the single ordered listing-marker array
  // that feeds PropertyMap's markers AND doubles as the popup stepper's
  // ratified panel-scope set (user-locked model, see approved-plan.toml
  // [user_decision]).
  const currentMapMarkerListings = resolveMarkerListings({
    mapLayerCategory,
    selectedArea,
    isGroupResultsState,
    mapZoom,
    areaLayerMaxZoom,
    isAuthenticated,
    journey,
    schoolId,
    groupResultsMarkers,
    markerListings,
    areaMarkerListings,
    schoolRadiusFallbackMarkers,
    isLoadingAreaListings,
    isErrorAreaListings,
    markersLoading,
  });

  // Issue #1810 (Stage 2A) — MODEL A stepper set: the clicked listing's 1-based
  // position within currentMapMarkerListings (the SAME array feeding the map +
  // in-scope with the results panel). null when ineligible, the listing isn't
  // found in the set (defensive), or the set has <=1 member — the popup then
  // renders no stepper at all (AC8). Deliberately NOT a hook: cheap, recomputed
  // every render, no camera side effects of any kind.
  const markerPopoverStepper =
    isMarkerPopoverEligible && selectedMarkerListing != null
      ? (() => {
          const idx = currentMapMarkerListings.findIndex((l) => l.id === selectedMarkerListing.id);
          if (idx === -1 || currentMapMarkerListings.length <= 1) return null;
          return { index: idx, total: currentMapMarkerListings.length };
        })()
      : null;

  return { currentMapMarkerListings, markerPopoverStepper };
}
