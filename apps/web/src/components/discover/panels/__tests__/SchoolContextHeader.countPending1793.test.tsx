/**
 * Issue #1793 SR-024 (R1) — SchoolContextHeader (the #2770 desktop compact header) must omit the
 * "N homes within X km" stat while the school-radius result is loading/failed (`countPending`),
 * instead of rendering a fake "0 homes". A genuine 0 (not pending) must still be shown.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SchoolContextHeader } from '../schools/radius/SchoolContextHeader';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

const school: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.3531,
  longitude: 74.7935,
  address: 'Manipal, Udupi District',
  distanceKm: 0.5,
};

type HeaderProps = React.ComponentProps<typeof SchoolContextHeader>;

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  return render(
    <SchoolContextHeader
      school={school}
      listingCount={7}
      intent="buy"
      effectiveRadius={5}
      onRadiusChange={vi.fn()}
      onChangeSchool={vi.fn()}
      radiusTestIdPrefix="radius-btn"
      {...overrides}
    />,
  );
}

describe('SchoolContextHeader countPending (#1793 R1)', () => {
  it('omits school-summary-count while countPending, but keeps the rest of the header', () => {
    renderHeader({ countPending: true, listingCount: 0 });
    expect(screen.queryByTestId('school-summary-count')).toBeNull();
    expect(screen.queryByText(/within 5 km/)).toBeNull();
    expect(screen.getByTestId('school-summary-name')).toHaveTextContent('Manipal Public School');
    expect(screen.getByTestId('radius-btn-5')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('change-school-btn')).toBeInTheDocument();
  });

  it('shows the count when not pending', () => {
    renderHeader({ countPending: false, listingCount: 7 });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('7 homes within 5 km');
  });

  it('shows a genuine 0 when not pending', () => {
    renderHeader({ countPending: false, listingCount: 0, intent: 'rent' });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('0 rentals within 5 km');
  });

  it('is unchanged when the prop is omitted (singular noun included)', () => {
    renderHeader({ listingCount: 1 });
    expect(screen.getByTestId('school-summary-count')).toHaveTextContent('1 home within 5 km');
  });
});
