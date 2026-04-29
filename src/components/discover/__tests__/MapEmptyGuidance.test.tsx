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
});
