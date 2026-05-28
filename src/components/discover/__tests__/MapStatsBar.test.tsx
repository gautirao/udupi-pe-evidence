import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapStatsBar } from '../MapStatsBar';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { SchoolResult } from '@/hooks/useSchoolSearch';

const emptyFilters: PropertyFilters = {};
const polygonFilters: PropertyFilters = { polygon: [[13.3, 74.7], [13.4, 74.8]] as unknown as PropertyFilters['polygon'] };

const mockSchool: SchoolResult = {
  id: 's1',
  name: 'Manipal Academy',
  board: null,
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
};

describe('MapStatsBar', () => {
  it('does not render "on map" listing count', () => {
    render(
      <MapStatsBar filters={emptyFilters} selectedSchool={null} onPolygonClear={vi.fn()} />,
    );
    expect(screen.queryByText(/on map/i)).not.toBeInTheDocument();
  });

  it('does not render "total listings" count', () => {
    render(
      <MapStatsBar filters={emptyFilters} selectedSchool={null} onPolygonClear={vi.fn()} />,
    );
    expect(screen.queryByText(/total listings/i)).not.toBeInTheDocument();
  });

  it('shows "Area search" indicator when polygon filter active', () => {
    render(
      <MapStatsBar filters={polygonFilters} selectedSchool={null} onPolygonClear={vi.fn()} />,
    );
    expect(screen.getByText('Area search')).toBeInTheDocument();
  });

  it('shows school name when selectedSchool is set', () => {
    render(
      <MapStatsBar filters={emptyFilters} selectedSchool={mockSchool} onPolygonClear={vi.fn()} />,
    );
    expect(screen.getByText('Manipal Academy')).toBeInTheDocument();
  });

  it('renders a valid school radius unchanged', () => {
    render(
      <MapStatsBar
        filters={{ schoolRadiusKm: 5 }}
        selectedSchool={mockSchool}
        onPolygonClear={vi.fn()}
      />,
    );
    expect(screen.getByText('(5 km)')).toBeInTheDocument();
  });

  it('falls back to the default radius when schoolRadiusKm is undefined', () => {
    render(
      <MapStatsBar filters={emptyFilters} selectedSchool={mockSchool} onPolygonClear={vi.fn()} />,
    );
    expect(screen.getByText('(3 km)')).toBeInTheDocument();
  });

  it('clamps a 0 km radius to the minimum so it never shows "0 km" (issue #1220)', () => {
    render(
      <MapStatsBar
        filters={{ schoolRadiusKm: 0 }}
        selectedSchool={mockSchool}
        onPolygonClear={vi.fn()}
      />,
    );
    expect(screen.getByText('(1 km)')).toBeInTheDocument();
    expect(screen.queryByText('(0 km)')).not.toBeInTheDocument();
  });
});
