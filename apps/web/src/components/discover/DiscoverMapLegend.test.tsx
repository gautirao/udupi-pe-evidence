import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoverMapLegend, type DiscoverMapLegendProps } from './DiscoverMapLegend';

/**
 * Issue #2762 (visual-review fix, post-merge HIGH-severity finding) — regression guard for the
 * School-first/Agri-first desktop legend anchor.
 *
 * Live `getBoundingClientRect()` measurement (see DOCK_CLEARANCE_LEGEND_ANCHOR's own doc comment
 * in DiscoverMapLegend.tsx) proved the original always-on `absolute bottom-[264px]` anchor floats
 * these two branches entirely above the map container (and the viewport) in the 821–1023px
 * "narrow desktop shell" band, where the map container can shrink to as little as ~78–106px tall
 * — confirmed for both School-selected-with-homes and Agri-locality at 900px width. The fix hides
 * this decorative legend below `lg` (1024px) and keeps the exact, already-correct `bottom-[264px]`
 * anchor at `lg` and above. This test guards that CSS contract at the class-string level (jsdom
 * doesn't evaluate `@media` breakpoints, so a live pixel check isn't feasible here) so a future
 * refactor can't silently regress it back to the old unconditional (and now-known-broken) anchor,
 * or accidentally reuse the unrelated `bottom-10`/`bottom-24` inline offsets.
 */

const SCHOOL_SELECTED_LISTINGS = [{ property_type: 'apartment' }, { property_type: 'villa' }];

function baseVariants(): NonNullable<DiscoverMapLegendProps['variants']> {
  return {
    schoolRadiusOverlay: false,
    resolvedPanelContent: 'schools-in-area',
    overviewAreas: [],
    isRegionOverview: false,
    regionGuideVisible: false,
    regionOverviewShortLabel: null,
    regionOverviewMarkerKind: 'area',
    isAreaFirstSelectedAreaState: false,
    areaMarkerListings: [],
    isSelectedGroupState: false,
    isAreaFirstCityLanding: false,
    journey: null,
    selectedLocality: null,
    selectedRegion: null,
    isMobileMapOverlay: false,
    currentMapMarkerListings: [],
  };
}

describe('DiscoverMapLegend — narrow-desktop-band anchor (#2762 visual-review fix)', () => {
  it('School-first, a school selected with homes on the map: desktop anchor is hidden below lg, restored at lg', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants(),
          journey: 'school-first',
          schoolRadiusOverlay: true,
          currentMapMarkerListings: SCHOOL_SELECTED_LISTINGS,
        }}
      />,
    );

    const legend = screen.getByTestId('discover-map-legend');
    expect(legend.className).toContain('hidden');
    expect(legend.className).toContain('lg:block');
    expect(legend.className).toContain('lg:bottom-[264px]');
    // Must not be the always-on (pre-fix, now-known-broken) anchor.
    expect(legend.className).not.toMatch(/(?<!lg:)bottom-\[264px\]/);
    // Must not be either mobile/legacy inline offset.
    expect(legend.className).not.toContain('bottom-10');
    expect(legend.className).not.toContain('bottom-24');
  });

  it('Agri-first, locality/parcel-results stage: desktop anchor is hidden below lg, restored at lg', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants(),
          journey: 'agri-first',
          selectedLocality: 'IN|KA|Bengaluru|RR Nagar',
        }}
      />,
    );

    const legend = screen.getByTestId('discover-map-legend');
    expect(legend.className).toContain('hidden');
    expect(legend.className).toContain('lg:block');
    expect(legend.className).toContain('lg:bottom-[264px]');
    expect(legend.className).not.toMatch(/(?<!lg:)bottom-\[264px\]/);
    expect(legend.className).not.toContain('bottom-10');
    expect(legend.className).not.toContain('bottom-24');
  });

  it('Mobile overlay: school-selected-with-homes sits at bottom-10, beside (not over) the radius chrome (#2762)', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants(),
          journey: 'school-first',
          schoolRadiusOverlay: true,
          currentMapMarkerListings: SCHOOL_SELECTED_LISTINGS,
          isMobileMapOverlay: true,
        }}
      />,
    );

    const legend = screen.getByTestId('discover-map-legend');
    expect(legend.className).toBe(
      'absolute bottom-10 left-[8.5rem] z-[1000] max-h-[6.25rem] max-w-[calc(100%-12rem)] overflow-y-auto',
    );
  });

  it('Mobile overlay: a >=4-type property legend still carries the height/width/scroll caps (#2762)', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants(),
          journey: 'school-first',
          schoolRadiusOverlay: true,
          currentMapMarkerListings: [
            { property_type: 'apartment' },
            { property_type: 'house' },
            { property_type: 'villa' },
            { property_type: 'plot' },
            { property_type: 'commercial' },
          ],
          isMobileMapOverlay: true,
        }}
      />,
    );

    const legend = screen.getByTestId('discover-map-legend');
    expect(legend.className).toContain('max-h-[6.25rem]');
    expect(legend.className).toContain('max-w-[calc(100%-12rem)]');
    expect(legend.className).toContain('overflow-y-auto');
  });
});
