/**
 * Issue #1956 PR 2 (Slice 3) — NavigationChildCard.
 *
 * AC3.9 (T4) — exactly one dispatch path (onSelect, no href) so a map click
 * and a panel-card click can never double-fire. AC3.5/AC3.6/AC3.8 copy rules
 * covered here at the single-card level; the multi-card "+N never at
 * structural level" rule is covered in NavigationLevelPanel.test.tsx and the
 * groupedCardAreaNames.test.tsx extension.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationChildCard } from '../NavigationChildCard';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';

function makeChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    displayOrder: 1,
    listingCount: 8,
    schoolCount: 2,
    isLeafArea: false,
    matchingAreaCount: null,
    ...overrides,
  };
}

describe('NavigationChildCard', () => {
  it('calls onSelect with the nodeKey on click, and only on click (no href rendered)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NavigationChildCard child={makeChild()} onSelect={onSelect} />);
    const card = screen.getByTestId('navigation-child-card-d:n');
    expect(card.tagName).toBe('BUTTON');
    expect(card.closest('a')).toBeNull();
    await user.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('d:n');
  });

  it('reflects selection via aria-pressed', () => {
    const { rerender } = render(<NavigationChildCard child={makeChild()} onSelect={vi.fn()} isSelected={false} />);
    expect(screen.getByTestId('navigation-child-card-d:n')).toHaveAttribute('aria-pressed', 'false');
    rerender(<NavigationChildCard child={makeChild()} onSelect={vi.fn()} isSelected />);
    expect(screen.getByTestId('navigation-child-card-d:n')).toHaveAttribute('aria-pressed', 'true');
  });

  it('forwards hover/focus changes for map<->panel sync by stable node_key', async () => {
    const user = userEvent.setup();
    const onHoverChange = vi.fn();
    render(<NavigationChildCard child={makeChild()} onSelect={vi.fn()} onHoverChange={onHoverChange} />);
    const card = screen.getByTestId('navigation-child-card-d:n');
    await user.hover(card);
    expect(onHoverChange).toHaveBeenCalledWith('d:n');
    await user.unhover(card);
    expect(onHoverChange).toHaveBeenCalledWith(null);
  });

  it('a zero-count structural child shows the LOCKED zero literal, never "+N"', () => {
    render(
      <NavigationChildCard
        child={makeChild({ listingCount: 0, matchingAreaCount: 0 })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('No matches with current filters')).toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (regression) — renders the true matchingAreaCount, never the listingCount, as the structural caption', () => {
    // A Direction with 1,736 listings across only 12 matching areas must never
    // render "1736 areas with matches" — the exact defect this test pins.
    render(
      <NavigationChildCard
        child={makeChild({ listingCount: 1736, matchingAreaCount: 12 })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('12 areas with matches')).toBeInTheDocument();
    expect(screen.queryByText(/1736 areas with matches/)).not.toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — omits ONLY the areas-with-matches line when matchingAreaCount is not derivable, never the journey-aware listing count too', () => {
    render(
      <NavigationChildCard
        child={makeChild({ listingCount: 1736, matchingAreaCount: null })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('1736 listings')).toBeInTheDocument();
    expect(screen.queryByText(/areas with matches/)).not.toBeInTheDocument();
  });

  it('count_display_defect_2026_07_29 (pass 4 regression) — shows BOTH the areas-with-matches line and the listing count when matchingAreaCount is derivable', () => {
    render(
      <NavigationChildCard
        child={makeChild({ listingCount: 1736, matchingAreaCount: 12 })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('12 areas with matches')).toBeInTheDocument();
    expect(screen.getByText('1736 listings')).toBeInTheDocument();
  });

  it('a zero matchingAreaCount renders ONLY the locked zero literal, never an additional "No listings yet" line', () => {
    render(
      <NavigationChildCard
        child={makeChild({ listingCount: 0, matchingAreaCount: 0 })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('No matches with current filters')).toBeInTheDocument();
    expect(screen.queryByText('No listings yet')).not.toBeInTheDocument();
  });

  it('an AREA leaf child shows its own listing count and no structural count line', () => {
    render(
      <NavigationChildCard
        child={makeChild({
          nodeKey: 'a:IN|KA|Bangalore|Whitefield',
          nodeType: 'AREA',
          displayLabel: 'Whitefield',
          listingCount: 5,
          schoolCount: null,
          isLeafArea: true,
        })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('5 listings')).toBeInTheDocument();
    expect(screen.queryByText(/areas with matches/)).not.toBeInTheDocument();
  });

  it('an AREA leaf child with zero listings shows "No listings yet", not the structural zero literal', () => {
    render(
      <NavigationChildCard
        child={makeChild({
          nodeKey: 'a:IN|KA|Bangalore|Empty',
          nodeType: 'AREA',
          displayLabel: 'Empty Area',
          listingCount: 0,
          schoolCount: null,
          isLeafArea: true,
        })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('No listings yet')).toBeInTheDocument();
  });

  it('shows the school count as secondary metadata only when > 0', () => {
    const { rerender } = render(<NavigationChildCard child={makeChild({ schoolCount: 3 })} onSelect={vi.fn()} />);
    expect(screen.getByText('3 schools')).toBeInTheDocument();
    rerender(<NavigationChildCard child={makeChild({ schoolCount: 0 })} onSelect={vi.fn()} />);
    expect(screen.queryByText(/schools/)).not.toBeInTheDocument();
  });
});
