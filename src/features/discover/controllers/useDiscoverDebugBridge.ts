import { useEffect } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

export interface UseDiscoverDebugBridgeParams {
  areaListings: DiscoverCityListingItem[];
  areaMarkerListings: PropertyListingWithImages[];
  markerListings: PropertyListingWithImages[];
  effectiveSelectedArea: AreaPoint | null;
  legacySelectedArea: AreaPoint | null;
  mapZoom: number;
  city: string;
  selectedSchool: SchoolResult | null;
  schoolMarkerFocusTick: number;
  areaRestoreTick: number;
  cityRestoreTick: number;
  canonicalNodeFitCount: number;
  bottomOcclusionPx: number;
  previewOcclusionPx: number;
}

/**
 * Issue #2142 (correction pass) — the two `window.__debug` write sites, moved
 * verbatim off MapDiscovery.tsx into one owner.
 *
 * THIS IS A PLAYWRIGHT CONTRACT, not diagnostics. The published object SHAPE
 * is asserted by e2e specs (issue-2083-home-breadcrumb-back-camera-race,
 * issue-1823-camera-fit-policy, issue-2129-mobile-marker-occlusion, ...), so:
 *
 *   1. Both effects stay in this file, in THIS relative order. The first
 *      writes `propertyMapListings` + `mapState`; the second merges
 *      `bottomOcclusionPx`/`previewOcclusionPx` into `mapState`. Swapping
 *      them, or merging them into one effect, changes which write wins.
 *   2. The spread-merge semantics are load-bearing, not stylistic. See the
 *      PR #2128 cycle-4 comment inline: without spreading the prior
 *      `mapState` first, mapZoom's churn re-runs the first effect after the
 *      second and wipes what the second just set (confirmed live).
 *   3. Field NAMES are frozen. `selectedArea` deliberately keeps its key while
 *      carrying the bridged value, with `legacySelectedArea` exposed alongside.
 *
 * Kept as ONE controller with two effects (rather than split per effect)
 * precisely because the ordering between them is the contract.
 */
export function useDiscoverDebugBridge({
  areaListings,
  areaMarkerListings,
  markerListings,
  effectiveSelectedArea,
  legacySelectedArea,
  mapZoom,
  city,
  selectedSchool,
  schoolMarkerFocusTick,
  areaRestoreTick,
  cityRestoreTick,
  canonicalNodeFitCount,
  bottomOcclusionPx,
  previewOcclusionPx,
}: UseDiscoverDebugBridgeParams) {
  // Debug: expose areaListings and related data to window.__debug for Playwright tests.
  // Issue #1824 Slice S7 — schoolMarkerFocusTick sourced from the camera
  // controller; areaRestoreTick/cityRestoreTick from journeyView (S6 owns
  // them). The object SHAPE is byte-identical (E2E contract, AC4).
  useEffect(() => {
    (window as Window & { __debug?: Record<string, unknown> }).__debug = {
      ...(window as Window & { __debug?: Record<string, unknown> }).__debug,
      propertyMapListings: {
        areaListings,
        areaMarkerListings,
        areaLen: areaListings.length,
        areaMarkerLen: areaMarkerListings.length,
        markerListings,
        markerLen: markerListings.length,
        // Issue #2083 cycle 4 (code-review nit) — was the bare legacy value,
        // which is null under a canonical node journey even though an area IS
        // selected, silently misleading any E2E assertion against this field.
        // `selectedArea` keeps its key name (E2E contract, AC4 — shape stays
        // byte-identical) but now carries the resolved value;
        // `legacySelectedArea` is exposed alongside it for anyone who
        // specifically needs the raw legacy value.
        selectedArea: effectiveSelectedArea,
        legacySelectedArea,
      },
      mapState: {
        // PR #2128 review cycle 4 (fix-verify) — spread the existing
        // mapState FIRST so this effect merges instead of clobbering
        // fields the second effect below independently owns (currently:
        // bottomOcclusionPx/previewOcclusionPx). Without this, mapZoom's
        // near-constant churn on any map interaction re-runs THIS effect
        // after the other one, wiping whatever it just set — confirmed live
        // (bottomOcclusionPx went from present to completely absent a few
        // seconds after being set).
        ...((window as Window & { __debug?: Record<string, unknown> }).__debug
          ?.mapState as Record<string, unknown> | undefined),
        zoom: mapZoom,
        city,
        // Issue #1160 — expose school centre for E2E viewport assertions.
        // SchoolFocusPanner pans the Leaflet map imperatively (no URL write),
        // so E2E must read the map centre from this debug object rather than
        // from URL params.
        schoolCenter: selectedSchool
          ? { lat: selectedSchool.latitude, lon: selectedSchool.longitude }
          : null,
        // Issue #1160 GAP 1+2 — expose restoration ticks for E2E assertability.
        // MF-6 asserts schoolMarkerFocusTick > 0 after listings settle.
        // MF-7 asserts areaRestoreTick incremented on Back from school-selected.
        // MF-8 asserts cityRestoreTick incremented on Back from schools-in-area.
        schoolMarkerFocusTick,
        areaRestoreTick,
        cityRestoreTick,
        // Issue #2083 (cycle 5) — see UseDiscoverCameraOrchestrationResult's
        // doc; asserted by issue-2083-home-breadcrumb-back-camera-race.spec.ts
        // to prove the canonical-node bbox refit does NOT double-fire on a
        // Back transition that already has a persisted viewport to restore.
        canonicalNodeFitCount,
      },
    };
  }, [areaListings, areaMarkerListings, markerListings, effectiveSelectedArea, legacySelectedArea, mapZoom, city, selectedSchool, schoolMarkerFocusTick, areaRestoreTick, cityRestoreTick, canonicalNodeFitCount]);

  // E2E observability only (Playwright contract, matches the existing
  // canonicalNodeFitCount/schoolCenter convention on this same debug object)
  // — merges into the mapState sub-object built by the effect above. MUST
  // stay declared AFTER it; see this file's doc comment.
  useEffect(() => {
    const w = window as Window & { __debug?: Record<string, unknown> };
    w.__debug = {
      ...w.__debug,
      mapState: {
        ...(w.__debug?.mapState as Record<string, unknown> | undefined),
        bottomOcclusionPx,
        previewOcclusionPx,
      },
    };
  }, [bottomOcclusionPx, previewOcclusionPx]);
}
