/**
 * Issue #1808 — MapRegionOverviewLegend unit tests. q1 marker-accurate line 2,
 * no-withholding-language guard, and the '{Region short} overview' line 1.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapRegionOverviewLegend } from '../MapRegionOverviewLegend';

const WITHHOLDING_PHRASE = /top areas only|not the full list|not all areas|preview/i;

describe('MapRegionOverviewLegend', () => {
  it('markerKind="zones" — line 2 reads "Zones in this region"', () => {
    render(<MapRegionOverviewLegend regionShortLabel="East" markerKind="zones" />);
    expect(screen.getByText('East overview')).toBeInTheDocument();
    expect(screen.getByText('Zones in this region')).toBeInTheDocument();
  });

  it('markerKind="areas" — line 2 reads "Areas in this region"', () => {
    render(<MapRegionOverviewLegend regionShortLabel="South Udupi" markerKind="areas" />);
    expect(screen.getByText('South Udupi overview')).toBeInTheDocument();
    expect(screen.getByText('Areas in this region')).toBeInTheDocument();
  });

  it('markerKind=null — generic fallback line 2', () => {
    render(<MapRegionOverviewLegend regionShortLabel="North" markerKind={null} />);
    expect(screen.getByText('Zones and areas in this region')).toBeInTheDocument();
  });

  it.each(['zones', 'areas', null] as const)(
    'markerKind=%s — never renders withholding language (q1 guard)',
    (markerKind) => {
      const { container } = render(
        <MapRegionOverviewLegend regionShortLabel="East" markerKind={markerKind} />,
      );
      expect(container.textContent).not.toMatch(WITHHOLDING_PHRASE);
    },
  );
});
