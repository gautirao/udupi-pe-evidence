import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapStatsBar, MarkersTruncationNotice } from '../MapStatsBar';
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

// ─── AC-F3: MarkersTruncationNotice (#944) ────────────────────────────────

describe('MarkersTruncationNotice', () => {
  it('aria-live container is present but empty when truncated is false', () => {
    render(
      <MarkersTruncationNotice
        truncated={false}
        returnedElements={42}
        totalFilteredElements={42}
      />,
    );
    // The aria-live region stays mounted so screen readers can announce transitions;
    // no notice text must be visible when not truncated.
    expect(screen.queryByText(/pins in this map area/)).not.toBeInTheDocument();
  });

  it('renders the notice with correct counts when truncated is true', () => {
    render(
      <MarkersTruncationNotice
        truncated={true}
        returnedElements={1000}
        totalFilteredElements={4200}
      />,
    );
    expect(screen.getByText(/Showing 1,000 of 4,200 pins in this map area/)).toBeInTheDocument();
  });

  it('shows em-dash placeholders when counts are undefined', () => {
    render(
      <MarkersTruncationNotice
        truncated={true}
        returnedElements={undefined}
        totalFilteredElements={undefined}
      />,
    );
    // Notice must render (truncated=true) with fallback dashes
    expect(screen.getByText(/Showing — of — pins in this map area/)).toBeInTheDocument();
  });

  it('has aria-live="polite" for accessible dynamic updates', () => {
    render(
      <MarkersTruncationNotice
        truncated={true}
        returnedElements={500}
        totalFilteredElements={2000}
      />,
    );
    const live = screen.getByText(/Showing 500 of 2,000 pins in this map area/).closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('disappears when truncated transitions from true to false', () => {
    const { rerender } = render(
      <MarkersTruncationNotice
        truncated={true}
        returnedElements={1000}
        totalFilteredElements={5000}
      />,
    );
    expect(screen.getByText(/Showing 1,000 of 5,000 pins/)).toBeInTheDocument();

    rerender(
      <MarkersTruncationNotice
        truncated={false}
        returnedElements={200}
        totalFilteredElements={200}
      />,
    );
    expect(screen.queryByText(/pins in this map area/)).not.toBeInTheDocument();
  });
});
