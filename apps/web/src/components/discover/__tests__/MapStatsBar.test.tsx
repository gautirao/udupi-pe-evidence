import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapStatsBar, MarkersTruncationNotice } from '../MapStatsBar';
import { PropertyFilters } from '@/hooks/usePropertyListings';

const emptyFilters: PropertyFilters = {};
const polygonFilters: PropertyFilters = { polygon: [[13.3, 74.7], [13.4, 74.8]] as unknown as PropertyFilters['polygon'] };

/**
 * Issue #2419 (PR-1) — MapStatsBar is retired and renders nothing.
 *
 * It used to be the committed-POLYGON indicator ("Area search" + "Clear
 * area"). #2419 requires ONE POLYGON scope surface, and that is now
 * `features/discover/components/map/ActiveScopeChip.tsx`, which names the
 * scope "Drawn area" and is not gated on authentication. These tests changed
 * because the BEHAVIOUR was deliberately removed, not because they became
 * inconvenient — the replacement surface is covered by ActiveScopeChip's own
 * committed-POLYGON suite.
 */
describe('MapStatsBar (retired — #2419)', () => {
  it('renders nothing when no polygon filter is active', () => {
    const { container } = render(<MapStatsBar filters={emptyFilters} onPolygonClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no longer renders a second committed-POLYGON indicator', () => {
    const { container } = render(<MapStatsBar filters={polygonFilters} onPolygonClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Area search')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear polygon search/i })).not.toBeInTheDocument();
  });

  it('still renders nothing for a school radius — that lives in the breadcrumb + legend', () => {
    const { container } = render(
      <MapStatsBar filters={{ schoolRadiusKm: 5 }} onPolygonClear={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
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
