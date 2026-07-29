/**
 * Issue #1956 PR 2 (Slice 3) — NavigationChildList.
 *
 * Thin layout/selection-forwarding shell — this suite covers that it renders
 * exactly the (already-bounded) children it is given, forwards selection, and
 * reflects hover/selected state by stable node_key (AC3.9).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationChildList } from '../NavigationChildList';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';

const CHILDREN: AreasNavigationChild[] = [
  {
    nodeKey: 'd:n',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    displayOrder: 1,
    listingCount: 10,
    schoolCount: 1,
    isLeafArea: false,
    matchingAreaCount: null,
  },
  {
    nodeKey: 'd:e',
    nodeType: 'DIRECTION',
    displayLabel: 'East Bangalore',
    displayOrder: 2,
    listingCount: 5,
    schoolCount: null,
    isLeafArea: false,
    matchingAreaCount: null,
  },
];

describe('NavigationChildList', () => {
  it('renders one card per child, in order', () => {
    render(<NavigationChildList children={CHILDREN} onSelect={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByTestId('navigation-child-card-d:n')).toBeInTheDocument();
    expect(screen.getByTestId('navigation-child-card-d:e')).toBeInTheDocument();
  });

  it('forwards a card click to onSelect with that card nodeKey', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NavigationChildList children={CHILDREN} onSelect={onSelect} />);
    await user.click(screen.getByTestId('navigation-child-card-d:e'));
    expect(onSelect).toHaveBeenCalledWith('d:e');
  });

  it('marks only the selectedNodeKey card as pressed', () => {
    render(<NavigationChildList children={CHILDREN} onSelect={vi.fn()} selectedNodeKey="d:e" />);
    expect(screen.getByTestId('navigation-child-card-d:n')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('navigation-child-card-d:e')).toHaveAttribute('aria-pressed', 'true');
  });

  it('passes representative names through by nodeKey', () => {
    render(
      <NavigationChildList
        children={CHILDREN}
        onSelect={vi.fn()}
        representativeAreaNamesByNodeKey={new Map([['d:n', ['Hebbal', 'Yelahanka']]])}
      />,
    );
    expect(screen.getByTestId('navigation-child-card-d:n').textContent).toContain('Hebbal, Yelahanka');
    expect(screen.getByTestId('navigation-child-card-d:e').textContent).toContain('East Bangalore');
  });

  it('renders an empty grid (no crash, no cards) when children is empty', () => {
    render(<NavigationChildList children={[]} onSelect={vi.fn()} />);
    expect(screen.getByTestId('navigation-child-list')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
