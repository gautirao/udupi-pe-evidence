import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { MapEmptyGuidance } from '../MapEmptyGuidance';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const emptyFilters: PropertyFilters = {};
const filtersWithLocality: PropertyFilters = { localities: ['Manipal'] };

// The new branch renders a react-router <Link>, so those cases must mount
// inside a router. Legacy cases below render plain (no Link path) and stay green.
const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

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

  // --- Anonymous zoom-past-area prompt (#1156) ---

  // Threshold passed via prop (areaLayerMaxZoom) — never hard-coded into the
  // assertion logic, mirroring the production const AREA_LAYER_MAX_ZOOM.
  const AREA_LAYER_MAX_ZOOM = 12;

  it('#1156: anon + zoomed past threshold + no area + cityTotal > 0 → shows prompt with sign-in link and area-select affordance', () => {
    renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    // Area-select affordance (instructional copy).
    expect(screen.getByText(/Select an area to see properties/i)).toBeInTheDocument();
    // Sign-in link points at the app's /auth?returnTo contract.
    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn).toBeInTheDocument();
    expect(signIn).toHaveAttribute('href', '/auth?returnTo=/discover');
  });

  it('#1156: authenticated user (else identical) → prompt NOT shown', () => {
    const { container } = renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('#1156: area selected (else identical) → prompt NOT shown', () => {
    const { container } = renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('#1156: zoom at threshold boundary (not strictly greater) → prompt NOT shown', () => {
    const { container } = renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('#1156: school context active (else identical) → still suppressed (early-return wins)', () => {
    const schoolFilters: PropertyFilters = {
      schoolRadiusKm: 2,
      schoolLat: 13.3409,
      schoolLon: 74.7421,
    };
    const { container } = renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={schoolFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Select an area to see properties/i)).not.toBeInTheDocument();
  });

  it('#1156: cityTotal === 0 + anon zoom-past → shows existing empty-city message, NOT the new prompt', () => {
    renderWithRouter(
      <MapEmptyGuidance
        cityTotal={0}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(screen.getByText(/No properties listed in/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select an area to see properties/i)).not.toBeInTheDocument();
  });

  // --- Issue #2169 Bug 2: Agri journey must not show the tainted residential cityTotal message ---

  it('#2169: Agri journey + residential cityTotal === 0, no locality filter → renders nothing (no residential message)', () => {
    const { container } = render(
      <MapEmptyGuidance
        cityTotal={0}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAgriJourney
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/No properties listed in/i)).not.toBeInTheDocument();
  });

  it('#2169: Agri journey + residential cityTotal === 0 + locality filter → renders nothing (no residential message)', () => {
    const { container } = render(
      <MapEmptyGuidance
        cityTotal={0}
        filters={filtersWithLocality}
        city="udupi"
        isLoading={false}
        isAgriJourney
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/No properties found in the selected areas/i)).not.toBeInTheDocument();
  });

  it('#2169: non-Agri journey + cityTotal === 0 (isAgriJourney omitted) → city-wide message still renders (regression)', () => {
    render(
      <MapEmptyGuidance cityTotal={0} filters={emptyFilters} city="udupi" isLoading={false} />,
    );
    expect(screen.getByText(/No properties listed in/i)).toBeInTheDocument();
  });

  // --- Issue #2173 (PR reviewer follow-up): anon zoom-past-area prompt must
  // also stay suppressed during the Agri journey, mirroring the two messages
  // above, even though the prompt's own copy carries no residential count. ---

  it('#2173: Agri journey + anon zoom-past-area trigger conditions met → prompt NOT shown', () => {
    const { container } = renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
        isAgriJourney
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Select an area to see properties/i)).not.toBeInTheDocument();
  });

  it('#2173: non-Agri journey (isAgriJourney omitted) + same anon zoom-past-area trigger → prompt still renders (regression)', () => {
    renderWithRouter(
      <MapEmptyGuidance
        cityTotal={5}
        filters={emptyFilters}
        city="udupi"
        isLoading={false}
        isAuthenticated={false}
        hasAreaSelected={false}
        mapZoom={AREA_LAYER_MAX_ZOOM + 2}
        areaLayerMaxZoom={AREA_LAYER_MAX_ZOOM}
      />,
    );
    expect(screen.getByText(/Select an area to see properties/i)).toBeInTheDocument();
  });
});
