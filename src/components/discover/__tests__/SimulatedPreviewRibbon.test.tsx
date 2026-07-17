/**
 * SimulatedPreviewRibbon — Issue #1911 PR3.
 *
 * Tests:
 * 1. renders the "Simulated · Preview" ribbon in preview mode
 * 2. renders nothing (hidden) in live mode / default context (no provider)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SimulatedPreviewRibbon } from '../SimulatedPreviewRibbon';
import { DiscoverDataSourceProvider } from '@/features/discover/state/DiscoverDataSourceContext';

describe('SimulatedPreviewRibbon', () => {
  it('renders the ribbon in preview mode', () => {
    render(
      <DiscoverDataSourceProvider value={{ mode: 'preview', cityId: 1, revisionId: 2 }}>
        <SimulatedPreviewRibbon />
      </DiscoverDataSourceProvider>,
    );
    expect(screen.getByTestId('simulated-preview-ribbon')).toBeInTheDocument();
    expect(screen.getByText(/Simulated/i)).toBeInTheDocument();
    expect(screen.getByText(/Preview/i)).toBeInTheDocument();
  });

  it('renders nothing in live mode (default context, no provider)', () => {
    render(<SimulatedPreviewRibbon />);
    expect(screen.queryByTestId('simulated-preview-ribbon')).not.toBeInTheDocument();
  });
});
