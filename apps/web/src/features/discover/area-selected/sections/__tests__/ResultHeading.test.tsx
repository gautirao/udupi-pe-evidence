import type { ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { ResultHeading } from '../ResultHeading';

const render = (ui: ReactElement) => renderWithProviders(<DiscoverProvider>{ui}</DiscoverProvider>);

const shell = {
  fitAreaSet: vi.fn(),
  focusAreaSetMember: vi.fn(),
  startDrawSearchArea: vi.fn(),
  isMobileShell: false,
  setMobileView: vi.fn(),
};

const baseProps = {
  multiAreaKeys: null,
  resolvedAreasCity: 'udupi',
  count: 12,
  intentNoun: 'sale' as const,
  isLoadingListings: false,
  onEditAreas: vi.fn(),
  onClearAreas: vi.fn(),
  onRemoveArea: vi.fn(),
  shell,
  isViewportScope: false,
  resultScopeKind: 'AREA' as const,
  headingNoun: 'Properties',
  countNoun: 'shown for sale',
  areaLabel: 'Kalsanka',
  returnLabel: null,
  onReturn: vi.fn(),
};

describe('#2658 C3 — ResultHeading', () => {
  it('single-area AREA scope: renders the eyebrow, heading, count and sub-copy', () => {
    render(<ResultHeading {...baseProps} />);
    expect(screen.getByText('Result scope — Selected area')).toBeInTheDocument();
    expect(screen.getByText('Properties in Kalsanka')).toBeInTheDocument();
    expect(screen.getByTestId('area-header-count')).toHaveTextContent('12');
    expect(screen.getByTestId('area-header-count-noun')).toHaveTextContent('shown for sale');
    expect(screen.getByText(/Explore verified listings around Kalsanka/)).toBeInTheDocument();
    expect(screen.getByTestId('area-intent-helper')).toHaveTextContent('Showing sale prices in ₹ for Kalsanka.');
  });

  it('VIEWPORT scope: uses the shared SCOPE_TITLE.VIEWPORT wording and "On screen right now"', () => {
    render(<ResultHeading {...baseProps} isViewportScope resultScopeKind="VIEWPORT" />);
    expect(screen.getByText('Result scope — Visible map area')).toBeInTheDocument();
    expect(screen.getByText('On screen right now')).toBeInTheDocument();
    expect(screen.getByTestId('area-intent-helper')).toHaveTextContent('Showing sale prices in ₹ for this area.');
  });

  it('POLYGON scope: drawn-area wording throughout, and hides the draw-search-area entry row', () => {
    render(<ResultHeading {...baseProps} resultScopeKind="POLYGON" />);
    expect(screen.getByText('Result scope — Drawn area')).toBeInTheDocument();
    expect(screen.getByText('Properties in your drawn area')).toBeInTheDocument();
    expect(screen.queryByTestId('area-single-action-row')).not.toBeInTheDocument();
  });

  it('shows the draw-search-area entry row for a non-VIEWPORT, non-POLYGON single-area scope', () => {
    render(<ResultHeading {...baseProps} />);
    expect(screen.getByTestId('area-single-action-row')).toBeInTheDocument();
  });

  it('hides the count block while listings are loading', () => {
    render(<ResultHeading {...baseProps} isLoadingListings />);
    expect(screen.queryByTestId('area-header-count')).not.toBeInTheDocument();
  });

  it('multi-area AREA_SET branch renders AreaSetSelectedHeader instead of the single-area heading', () => {
    render(<ResultHeading {...baseProps} multiAreaKeys={['a', 'b']} />);
    // AreaSetSelectedHeader owns its own count/intent rendering; the single-area
    // eyebrow text must not appear alongside it.
    expect(screen.queryByText('Result scope — Selected area')).not.toBeInTheDocument();
    expect(screen.queryByText('Properties in Kalsanka')).not.toBeInTheDocument();
  });

  it('renders no activeContextChips wrapper when the prop is null', () => {
    render(<ResultHeading {...baseProps} activeContextChips={null} />);
    expect(screen.queryByText('chip-content')).not.toBeInTheDocument();
  });

  it('renders activeContextChips when supplied', () => {
    render(<ResultHeading {...baseProps} activeContextChips={<span>chip-content</span>} />);
    expect(screen.getByText('chip-content')).toBeInTheDocument();
  });
});
