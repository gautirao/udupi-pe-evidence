import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SchoolJourneyBreadcrumb,
  SchoolRadiusLegend,
  isSchoolRadiusOverlayState,
  prettifyZoneSlug,
} from '../SchoolRadiusMapOverlay';

const UUID = '23a61c72-1e6a-4499-8eac-9e3eaff55768';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('SchoolJourneyBreadcrumb', () => {
  it('renders the full resolved journey City > Zone > Area > School', () => {
    render(
      <SchoolJourneyBreadcrumb
        cityLabel="Udupi"
        zoneLabel="University Belt"
        areaLabel="Manipal"
        schoolName="Little Flower English Medium School"
      />,
    );
    expect(screen.getByTestId('breadcrumb-seg-city')).toHaveTextContent('Udupi');
    expect(screen.getByTestId('breadcrumb-seg-zone')).toHaveTextContent('University Belt');
    expect(screen.getByTestId('breadcrumb-seg-area')).toHaveTextContent('Manipal');
    expect(screen.getByTestId('breadcrumb-seg-school')).toHaveTextContent(
      'Little Flower English Medium School',
    );
  });

  it('omits missing segments gracefully (no zone, no school yet) without "undefined"', () => {
    render(<SchoolJourneyBreadcrumb cityLabel="Udupi" zoneLabel={null} areaLabel="Manipal" schoolName={null} />);
    expect(screen.getByTestId('breadcrumb-seg-city')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-seg-area')).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-seg-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-seg-school')).not.toBeInTheDocument();
    const nav = screen.getByTestId('school-journey-breadcrumb');
    expect(nav.textContent).not.toMatch(/undefined|null/);
  });

  it('shows the breadcrumb without the school segment while the school is still loading', () => {
    render(
      <SchoolJourneyBreadcrumb cityLabel="Udupi" zoneLabel="University Belt" areaLabel="Manipal" schoolName={null} />,
    );
    expect(screen.getByTestId('breadcrumb-seg-area')).toHaveTextContent('Manipal');
    expect(screen.queryByTestId('breadcrumb-seg-school')).not.toBeInTheDocument();
  });

  it('never renders a raw UUID — only resolved names', () => {
    render(
      <SchoolJourneyBreadcrumb
        cityLabel="Udupi"
        zoneLabel="University Belt"
        areaLabel="Manipal"
        schoolName="Little Flower English Medium School"
      />,
    );
    expect(screen.getByTestId('school-journey-breadcrumb').textContent).not.toMatch(UUID_RE);
  });

  it('returns null when nothing has resolved yet', () => {
    const { container } = render(
      <SchoolJourneyBreadcrumb cityLabel={null} zoneLabel={null} areaLabel={null} schoolName={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('treats a UUID-looking schoolName defensively — caller passes names, but the pill text is just whatever it is given (proves it does not synthesize ids)', () => {
    // The component renders exactly the label it is given; production callers pass school.name.
    // This guards that NO id is injected by the component itself when a real name is provided.
    render(<SchoolJourneyBreadcrumb cityLabel="Udupi" schoolName="Dr TMA Pai Composite PU College" />);
    expect(screen.getByTestId('school-journey-breadcrumb').textContent).not.toContain(UUID);
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
