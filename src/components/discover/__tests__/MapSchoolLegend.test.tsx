/**
 * Tests for MapSchoolLegend (school-first visual-parity polish).
 *
 * Coverage — legend is contextual per school-first drill-down stage (mirrors
 * MapAgriLegend's #1771 pattern):
 * - landing (default): "School zones" row only
 * - zone: "Areas" row only
 * - area: "Schools" row only
 * - correct aria-label + data-stage attribute
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapSchoolLegend } from '../MapSchoolLegend';

describe('MapSchoolLegend', () => {
  it('landing (default): shows "School zones" only', () => {
    render(<MapSchoolLegend />);
    expect(screen.getByText('School zones')).toBeInTheDocument();
    expect(screen.queryByText('Areas')).not.toBeInTheDocument();
    expect(screen.queryByText('Schools')).not.toBeInTheDocument();
    expect(screen.getByTestId('school-map-legend')).toHaveAttribute('data-stage', 'landing');
  });

  it('zone: shows "Areas" only', () => {
    render(<MapSchoolLegend stage="zone" />);
    expect(screen.getByText('Areas')).toBeInTheDocument();
    expect(screen.queryByText('School zones')).not.toBeInTheDocument();
    expect(screen.queryByText('Schools')).not.toBeInTheDocument();
    expect(screen.getByTestId('school-map-legend')).toHaveAttribute('data-stage', 'zone');
  });

  it('area: shows "Schools" only', () => {
    render(<MapSchoolLegend stage="area" />);
    expect(screen.getByText('Schools')).toBeInTheDocument();
    expect(screen.queryByText('School zones')).not.toBeInTheDocument();
    expect(screen.queryByText('Areas')).not.toBeInTheDocument();
    expect(screen.getByTestId('school-map-legend')).toHaveAttribute('data-stage', 'area');
  });

  it('renders with the correct aria-label', () => {
    render(<MapSchoolLegend />);
    expect(screen.getByLabelText('School map markers legend')).toBeInTheDocument();
  });
});
