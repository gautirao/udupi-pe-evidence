import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapEmptyGuidance } from '../MapEmptyGuidance';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const emptyFilters: PropertyFilters = {};
const filtersWithLocality: PropertyFilters = { localities: ['Manipal'] };

describe('MapEmptyGuidance', () => {
  it('renders nothing while loading', () => {
    const { container } = render(
      <MapEmptyGuidance cityTotal={0} filters={emptyFilters} city="udupi" isLoading />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when cityTotal > 0', () => {
    const { container } = render(
      <MapEmptyGuidance cityTotal={5} filters={emptyFilters} city="udupi" isLoading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows city empty message when cityTotal === 0 and no locality filter', () => {
    render(
      <MapEmptyGuidance cityTotal={0} filters={emptyFilters} city="udupi" isLoading={false} />,
    );
    expect(screen.getByText(/No properties listed in/i)).toBeInTheDocument();
  });

  it('shows locality filter message when cityTotal === 0 and locality filter active', () => {
    render(
      <MapEmptyGuidance cityTotal={0} filters={filtersWithLocality} city="udupi" isLoading={false} />,
    );
    expect(screen.getByText(/No properties found in the selected areas/i)).toBeInTheDocument();
  });

  it('does not show sparse-map hint at any count', () => {
    render(
      <MapEmptyGuidance cityTotal={2} filters={emptyFilters} city="udupi" isLoading={false} />,
    );
    expect(screen.queryByText(/concentrated in specific areas/i)).not.toBeInTheDocument();
  });

  // --- School context AC1 / AC2 / AC3 ---

  it('AC1: renders nothing when school radius active and cityTotal > 0', () => {
    const schoolFilters: PropertyFilters = {
      schoolRadiusKm: 2,
      schoolLat: 13.3409,
      schoolLon: 74.7421,
    };
    const { container } = render(
      <MapEmptyGuidance cityTotal={10} filters={schoolFilters} city="udupi" isLoading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('AC2: renders nothing when school radius active and cityTotal === 0 (no city-wide claim)', () => {
    const schoolFilters: PropertyFilters = {
      schoolRadiusKm: 2,
      schoolLat: 13.3409,
      schoolLon: 74.7421,
    };
    const { container } = render(
      <MapEmptyGuidance cityTotal={0} filters={schoolFilters} city="udupi" isLoading={false} />,
    );
    // Must not render the city-wide message
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/No properties listed in/i)).not.toBeInTheDocument();
  });

  it('AC2: never shows city-wide message when school context active + localities also set', () => {
    const schoolFilters: PropertyFilters = {
      schoolRadiusKm: 2,
      schoolLat: 13.3409,
      schoolLon: 74.7421,
      localities: ['Manipal'],
    };
    const { container } = render(
      <MapEmptyGuidance cityTotal={0} filters={schoolFilters} city="udupi" isLoading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('AC3: partial school fields (missing schoolLon) do NOT suppress — falls through to existing logic', () => {
    // Robustness: if only some school fields are set (malformed state) we do not suppress
    const partialFilters: PropertyFilters = {
      schoolRadiusKm: 2,
      schoolLat: 13.3409,
      // schoolLon intentionally absent
    };
    render(
      <MapEmptyGuidance cityTotal={0} filters={partialFilters} city="udupi" isLoading={false} />,
    );
    // Falls through to cityTotal === 0 branch → shows city-wide message
    expect(screen.getByText(/No properties listed in/i)).toBeInTheDocument();
  });

  it('AC3: no school context + cityTotal === 0 → city-wide message still renders (regression)', () => {
    render(
      <MapEmptyGuidance cityTotal={0} filters={emptyFilters} city="udupi" isLoading={false} />,
    );
    expect(screen.getByText(/No properties listed in/i)).toBeInTheDocument();
  });

  it('AC3: no school context + cityTotal === 0 + localities → locality message still renders (regression)', () => {
    render(
      <MapEmptyGuidance cityTotal={0} filters={filtersWithLocality} city="udupi" isLoading={false} />,
    );
    expect(screen.getByText(/No properties found in the selected areas/i)).toBeInTheDocument();
  });
});
