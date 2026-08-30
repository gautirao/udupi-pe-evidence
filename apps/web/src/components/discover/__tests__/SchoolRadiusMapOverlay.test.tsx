import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SchoolRadiusLegend,
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
  areaKeyToLabel,
} from '../SchoolRadiusMapOverlay';

describe('areaKeyToLabel', () => {
  it('extracts the final pipe-segment as the area label', () => {
    expect(areaKeyToLabel('IN|KA|Udupi|Manipal')).toBe('Manipal');
    expect(areaKeyToLabel('IN|KA|Udupi|Eshwar Nagar')).toBe('Eshwar Nagar');
  });
  it('returns null for blank/missing input', () => {
    expect(areaKeyToLabel(null)).toBeNull();
    expect(areaKeyToLabel(undefined)).toBeNull();
    expect(areaKeyToLabel('')).toBeNull();
    expect(areaKeyToLabel('   ')).toBeNull();
  });
  it('handles a bare label with no pipes', () => {
    expect(areaKeyToLabel('Manipal')).toBe('Manipal');
  });
});

describe('SchoolRadiusLegend', () => {
  it('renders Schools, Homes and the radius row', () => {
    render(<SchoolRadiusLegend radiusKm={3} />);
    const legend = screen.getByTestId('school-radius-legend');
    expect(legend).toHaveTextContent('Schools');
    expect(legend).toHaveTextContent('Homes');
    expect(screen.getByTestId('school-radius-legend-radius')).toHaveTextContent('3 km radius');
  });

  it.each([3, 5, 10])('reflects the live radius: %i km radius', (km) => {
    render(<SchoolRadiusLegend radiusKm={km} />);
    expect(screen.getByTestId('school-radius-legend-radius')).toHaveTextContent(`${km} km radius`);
  });
});

describe('isSchoolRadiusOverlayState', () => {
  it('is true for the selected-school radius panel states when a school is selected', () => {
    expect(isSchoolRadiusOverlayState('school-selected', true)).toBe(true);
    expect(isSchoolRadiusOverlayState('area-school-combined', true)).toBe(true);
  });

  it('is false without a selected school', () => {
    expect(isSchoolRadiusOverlayState('school-selected', false)).toBe(false);
    expect(isSchoolRadiusOverlayState('area-school-combined', false)).toBe(false);
  });

  it('is false for area-first and agri-first states (they never get the school-radius overlay)', () => {
    expect(isSchoolRadiusOverlayState('area-selected', true)).toBe(false);
    expect(isSchoolRadiusOverlayState('area-groups-landing', true)).toBe(false);
    expect(isSchoolRadiusOverlayState('agri-landing', true)).toBe(false);
    expect(isSchoolRadiusOverlayState('agri-selected', true)).toBe(false);
    expect(isSchoolRadiusOverlayState('schools-in-area', true)).toBe(false);
  });
});

describe('prettifyZoneSlug', () => {
  it('title-cases a kebab slug', () => {
    expect(prettifyZoneSlug('university-belt')).toBe('University Belt');
  });
  it('returns null for null/blank', () => {
    expect(prettifyZoneSlug(null)).toBeNull();
    expect(prettifyZoneSlug('')).toBeNull();
    expect(prettifyZoneSlug('   ')).toBeNull();
  });
});
