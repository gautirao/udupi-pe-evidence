/**
 * Tests for DiscoverMapLegend (Issue #2762 PR-D)
 *
 * Coverage focuses on the variant-SELECTION switch (which legend component renders,
 * not where): School browsing → Schools-only legend, School selected+homes →
 * property-type legend (with the selected-school swatch still distinct via the
 * separate schoolRadiusChrome call), Agri corridor → corridor-context legend, Agri
 * parcel-results → Land-type (agri-specific) legend, and a By-area regression check
 * that the pre-existing Areas-journey behaviour is untouched.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoverMapLegend, type DiscoverMapLegendProps } from '../DiscoverMapLegend';

type Variants = NonNullable<DiscoverMapLegendProps['variants']>;

const baseVariants: Variants = {
  schoolRadiusOverlay: false,
  resolvedPanelContent: 'guided-entry',
  overviewAreas: [],
  isRegionOverview: false,
  regionGuideVisible: false,
  regionOverviewShortLabel: null,
  regionOverviewMarkerKind: 'zones',
  isAreaFirstSelectedAreaState: false,
  areaMarkerListings: [],
  isSelectedGroupState: false,
  isAreaFirstCityLanding: false,
  journey: null,
  selectedLocality: null,
  selectedRegion: null,
  isMobileMapOverlay: true,
  currentMapMarkerListings: [],
};

describe('DiscoverMapLegend — variant-selection switch', () => {
  it('School browsing (no school selected yet): renders the Schools-only legend', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'school-first',
          schoolRadiusOverlay: false,
          resolvedPanelContent: 'school-browse',
        }}
      />,
    );
    expect(screen.getByTestId('school-map-legend')).toBeInTheDocument();
    expect(screen.queryByLabelText('Property type legend')).not.toBeInTheDocument();
  });

  it('School selected + homes shown: renders the property-type legend (Schools-only legend suppressed)', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'school-first',
          schoolRadiusOverlay: true,
          resolvedPanelContent: 'school-selected',
          currentMapMarkerListings: [
            { property_type: 'apartment' },
            { property_type: 'apartment' },
            { property_type: 'villa' },
          ],
        }}
      />,
    );
    expect(screen.queryByTestId('school-map-legend')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Property type legend')).toBeInTheDocument();
    expect(screen.getByText('Apartments')).toBeInTheDocument();
  });

  it('School selected + homes shown, but no markers on the map: renders nothing (no empty property-type card)', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'school-first',
          schoolRadiusOverlay: true,
          resolvedPanelContent: 'school-selected',
          currentMapMarkerListings: [],
        }}
      />,
    );
    expect(screen.queryByTestId('school-map-legend')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Property type legend')).not.toBeInTheDocument();
  });

  it('Agri corridor (browsing, no parcel results yet): renders the corridor-context legend, not a property-type/Land legend', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'agri-first',
          resolvedPanelContent: 'agri-group-selected',
          selectedRegion: 'N',
          selectedLocality: null,
        }}
      />,
    );
    const legend = screen.getByTestId('agri-map-legend');
    expect(legend).toHaveAttribute('data-stage', 'corridor');
    expect(screen.getByText('Village clusters')).toBeInTheDocument();
    expect(screen.queryByLabelText('Property type legend')).not.toBeInTheDocument();
  });

  it('Agri parcel results shown (locality drilled into): renders the Land-type legend, not the general property-type legend', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'agri-first',
          resolvedPanelContent: 'agri-group-locality',
          selectedRegion: 'N',
          selectedLocality: 'some-village',
        }}
      />,
    );
    const legend = screen.getByTestId('agri-map-legend');
    expect(legend).toHaveAttribute('data-stage', 'locality');
    expect(screen.getByText('Parcels')).toBeInTheDocument();
    expect(screen.queryByLabelText('Property type legend')).not.toBeInTheDocument();
  });

  it('By-area (regression, unchanged): the area-selected property-type legend still renders from areaMarkerListings', () => {
    render(
      <DiscoverMapLegend
        variants={{
          ...baseVariants,
          journey: 'area-first',
          isAreaFirstSelectedAreaState: true,
          areaMarkerListings: [{ property_type: 'land' }],
          isMobileMapOverlay: true,
        }}
      />,
    );
    expect(screen.getByLabelText('Property type legend')).toBeInTheDocument();
    expect(screen.getByText('Plots / land')).toBeInTheDocument();
  });
});
