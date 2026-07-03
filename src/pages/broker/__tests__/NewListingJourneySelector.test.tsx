/**
 * NewListingJourneySelector — first-screen journey picker tests (Issue #1719).
 *
 * Verifies:
 *  - renders exactly three cards (Residential / Commercial / Agricultural land)
 *  - each card navigates to the correct dedicated create-listing route on click
 *  - keyboard a11y: role=button, tabIndex=0, both Enter and Space activate
 *  - the lifecycle helper copy ("What happens next" steps + "not published
 *    instantly" line) is present
 *  - the grid collapses to a single column on mobile (grid-cols-1 base class)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

// Import AFTER mocks are registered.
import NewListingJourneySelector from '../NewListingJourneySelector';

function renderSelector() {
  return render(
    <MemoryRouter initialEntries={['/broker/listings/new']}>
      <NewListingJourneySelector />
    </MemoryRouter>,
  );
}

describe('NewListingJourneySelector (Issue #1719)', () => {
  it('renders exactly three journey cards with the expected labels', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Create residential listing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create commercial listing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create agricultural listing' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('renders the listing lifecycle helper copy', () => {
    renderSelector();
    expect(screen.getByText('Create listing')).toBeInTheDocument();
    expect(screen.getByText('Save draft')).toBeInTheDocument();
    expect(screen.getByText('Submit for review')).toBeInTheDocument();
    expect(screen.getByText('Pending admin approval')).toBeInTheDocument();
    expect(
      screen.getByText(/Listings aren't published instantly/i),
    ).toBeInTheDocument();
  });

  it('does NOT render a "last used" badge', () => {
    renderSelector();
    expect(screen.queryByText(/last used/i)).not.toBeInTheDocument();
  });

  it('clicking the Residential card navigates to /broker/listings/new/residential', async () => {
    renderSelector();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create residential listing' }));
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new/residential');
  });

  it('clicking the Commercial card navigates to /broker/listings/new/commercial', async () => {
    renderSelector();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create commercial listing' }));
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new/commercial');
  });

  it('clicking the Agricultural card navigates to /broker/listings/new/agricultural', async () => {
    renderSelector();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create agricultural listing' }));
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new/agricultural');
  });

  it('keyboard a11y: card is a role=button, tabIndex=0, and Enter activates navigation', async () => {
    renderSelector();
    const card = screen.getByRole('button', { name: 'Create residential listing' });
    expect(card).toHaveAttribute('tabIndex', '0');

    card.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new/residential');
  });

  it('keyboard a11y: Space activates navigation', async () => {
    renderSelector();
    const card = screen.getByRole('button', { name: 'Create commercial listing' });

    card.focus();
    const user = userEvent.setup();
    await user.keyboard(' ');
    expect(mockNavigate).toHaveBeenCalledWith('/broker/listings/new/commercial');
  });

  it('renders the grid with a single-column mobile base class (grid-cols-1)', () => {
    const { container } = renderSelector();
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('md:grid-cols-3');
  });
});
