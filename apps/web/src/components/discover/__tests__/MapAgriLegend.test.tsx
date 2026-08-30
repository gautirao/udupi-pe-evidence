/**
 * Tests for MapAgriLegend (Issue #1771)
 *
 * Coverage — legend is contextual per agri drill-down stage (mock parity):
 * - landing (default): Corridors row only
 * - corridor: Corridors + Village clusters rows
 * - locality: Parcels row only
 * - Correct aria-label + data-stage attribute
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapAgriLegend } from '../MapAgriLegend';

describe('MapAgriLegend', () => {
  it('landing (default): shows Corridors only', () => {
    render(<MapAgriLegend />);
    expect(screen.getByText('Corridors')).toBeInTheDocument();
    expect(screen.queryByText('Village clusters')).not.toBeInTheDocument();
    expect(screen.queryByText('Parcels')).not.toBeInTheDocument();
    expect(screen.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'landing');
  });

  it('corridor: shows Corridors and Village clusters', () => {
    render(<MapAgriLegend stage="corridor" />);
    expect(screen.getByText('Corridors')).toBeInTheDocument();
    expect(screen.getByText('Village clusters')).toBeInTheDocument();
    expect(screen.queryByText('Parcels')).not.toBeInTheDocument();
    expect(screen.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'corridor');
  });

  it('locality: shows Parcels only', () => {
    render(<MapAgriLegend stage="locality" />);
    expect(screen.getByText('Parcels')).toBeInTheDocument();
    expect(screen.queryByText('Corridors')).not.toBeInTheDocument();
    expect(screen.queryByText('Village clusters')).not.toBeInTheDocument();
    expect(screen.getByTestId('agri-map-legend')).toHaveAttribute('data-stage', 'locality');
  });

  it('renders with the correct aria-label', () => {
    render(<MapAgriLegend />);
    expect(screen.getByLabelText('Agricultural map markers legend')).toBeInTheDocument();
  });
});
