/**
 * Tests for MapGroupBreadcrumb (Issue #1595 Option A)
 *
 * The City › Group breadcrumb shown on the map (top-left) for the area-first
 * selected-group step. Must be dynamic + generic across cities and groups.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapGroupBreadcrumb } from '../MapGroupBreadcrumb';

describe('MapGroupBreadcrumb', () => {
  it('renders the city and group as a breadcrumb', () => {
    render(<MapGroupBreadcrumb cityLabel="Udupi" groupName="University Belt" />);
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
    expect(nav).toHaveTextContent('Udupi');
    expect(nav).toHaveTextContent('University Belt');
  });

  it('is generic across cities and groups (no hardcoded copy)', () => {
    render(<MapGroupBreadcrumb cityLabel="Bangalore" groupName="Tech Corridor" />);
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav).toHaveTextContent('Bangalore');
    expect(nav).toHaveTextContent('Tech Corridor');
    expect(nav).not.toHaveTextContent('Udupi');
    expect(nav).not.toHaveTextContent('University Belt');
  });
});
