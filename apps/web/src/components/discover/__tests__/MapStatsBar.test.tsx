import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MarkersTruncationNotice } from '../MapStatsBar';


/**
 * `MapStatsBar` was DELETED by Issue #2419 (PR-2).
 *
 * PR-1 emptied it (it had become a second, auth-gated owner of the
 * committed-POLYGON state, labelled "Area search" against the chip's "Drawn
 * area") but could not remove its mount, which lived in a file another lane
 * owned. PR-2 touches that file legitimately, so the component and its mount
 * went together. Its replacement, `ActiveScopeChip`, has its own suite.
 *
 * This file remains because `MarkersTruncationNotice` — unrelated, and still
 * in active use — happens to live in the same module.
 */

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
