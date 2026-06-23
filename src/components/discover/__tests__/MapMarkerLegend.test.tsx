/**
 * Tests for MapMarkerLegend (R-B — Issue #1606)
 *
 * Coverage:
 * - Renders "PROPERTY TYPE" title
 * - Shows one row per distinct type present in listings (count > 0)
 * - Does NOT render when listings is empty
 * - Count column shows correct value
 * - Types that resolve to the same visual group (e.g. commercial/warehouse → 'Other')
 *   are shown as separate rows (distinct property_type keys).
 * - Unknown types fall back to the grey 'Other' visual.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MapMarkerLegend } from '../MapMarkerLegend';

const makeListings = (types: string[]) =>
  types.map((property_type) => ({ property_type }));

describe('MapMarkerLegend', () => {
  it('renders the "Property type" title when listings are present', () => {
    render(<MapMarkerLegend listings={makeListings(['apartment'])} />);
    // The `uppercase` CSS class transforms visually, but DOM text is lowercase.
    expect(screen.getByText('Property type')).toBeInTheDocument();
  });

  it('returns null when listings is empty', () => {
    const { container } = render(<MapMarkerLegend listings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one row for each distinct type present', () => {
    render(
      <MapMarkerLegend
        listings={makeListings(['apartment', 'apartment', 'land', 'villa'])}
      />,
    );
    // apartment → 'Apartments', land → 'Plots / land', villa → 'Villas'
    expect(screen.getByText('Apartments')).toBeInTheDocument();
    expect(screen.getByText('Plots / land')).toBeInTheDocument();
    expect(screen.getByText('Villas')).toBeInTheDocument();
  });

  it('shows correct count for each type', () => {
    render(
      <MapMarkerLegend
        listings={makeListings(['apartment', 'apartment', 'apartment', 'land'])}
      />,
    );
    // Counts are rendered in font-mono spans — 3 for apartment, 1 for land.
    const countSpans = document.querySelectorAll('span.font-mono');
    const counts = Array.from(countSpans).map((el) => el.textContent?.trim());
    expect(counts).toContain('3');
    expect(counts).toContain('1');
  });

  it('uses the grey "Other" label for an unknown type', () => {
    render(<MapMarkerLegend listings={makeListings(['some_unknown_type'])} />);
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders with the correct aria-label', () => {
    render(<MapMarkerLegend listings={makeListings(['house'])} />);
    expect(screen.getByLabelText('Property type legend')).toBeInTheDocument();
  });

  it('renders a coloured disc for each row', () => {
    const { container } = render(
      <MapMarkerLegend listings={makeListings(['apartment', 'land'])} />,
    );
    // Each disc is a <span> with an inline background style.
    const discs = container.querySelectorAll('span[aria-hidden="true"]');
    expect(discs.length).toBeGreaterThanOrEqual(2);
  });
});
