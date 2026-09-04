import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockJourney, mockAuth } = vi.hoisted(() => ({
  mockJourney: { current: null as string | null },
  mockAuth: {
    current: { user: { id: 'u1' } as { id: string } | null, isLoading: false },
  },
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({ journey: mockJourney.current }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => ({
    data: {
      areas: [
        { areaKey: 'hebbal', name: 'Hebbal' },
        { areaKey: 'nagawara', name: 'Nagawara' },
      ],
    },
  }),
}));

import { AreaSetSelectedHeader } from '../AreaSetSelectedExtras';

/**
 * Issue #2419 (PR-1) — the "Draw search area" entry point.
 *
 * Before this issue the entry was unconditionally disabled with the
 * placeholder title "Draw search area is not available yet", which gave the
 * same non-answer in every journey.
 */
function renderHeader(
  journey: string | null,
  areaKeys = ['hebbal', 'nagawara'],
  auth: { user: { id: string } | null; isLoading: boolean } = { user: { id: 'u1' }, isLoading: false },
) {
  mockJourney.current = journey;
  mockAuth.current = auth;
  return render(
    <AreaSetSelectedHeader
      areaKeys={areaKeys}
      city="bangalore"
      count={20}
      intentNoun="sale"
      isLoadingListings={false}
      onEditAreas={vi.fn()}
      onClearAreas={vi.fn()}
      onFitAll={vi.fn()}
      onFocusArea={vi.fn()}
    />,
  );
}

describe('AreaSetSelectedHeader — Draw search area entry', () => {
  it('offers the entry in the residential area-first journey', () => {
    renderHeader('area-first');

    expect(screen.getByTestId('area-set-draw-area')).toBeInTheDocument();
  });

  it('offers the entry in the school -> residential homes journey', () => {
    renderHeader('school-first');

    expect(screen.getByTestId('area-set-draw-area')).toBeInTheDocument();
  });

  // The Agricultural query contract has no POLYGON support, so the control is
  // removed rather than greyed out — a disabled button would advertise a
  // feature that is never coming to that journey.
  it('removes the entry entirely in the Agricultural journey', () => {
    renderHeader('agri-first');

    expect(screen.queryByTestId('area-set-draw-area')).not.toBeInTheDocument();
    // The rest of the action row is untouched.
    expect(screen.getByTestId('area-set-edit-areas')).toBeInTheDocument();
    expect(screen.getByTestId('area-set-clear-areas')).toBeInTheDocument();
  });

  // PR-1 keeps it disabled because nothing can enter draw mode yet, but the
  // title now says something true rather than a generic placeholder.
  it('is disabled in PR-1 with a title that states the real reason', () => {
    renderHeader('area-first');

    const entry = screen.getByTestId('area-set-draw-area');
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute('title', 'Drawing a search area is coming soon');
    expect(entry).not.toHaveAttribute('title', 'Draw search area is not available yet');
  });

  it('leaves the unrelated Create alert entry disabled and unchanged', () => {
    renderHeader('area-first');

    expect(screen.getByTestId('area-set-create-alert')).toBeDisabled();
  });

  // Main Agent ruling: polygon search is signed-in-only in PR-1.
  it('tells an anonymous shopper to sign in rather than hiding the entry', () => {
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: null, isLoading: false });

    const entry = screen.getByTestId('area-set-draw-area');
    expect(entry).toBeInTheDocument();
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute('title', 'Sign in to search a drawn area');
  });

  // `isAuthenticated` is derived as "not loading AND user present", so during
  // the auth load window it reads false even for a signed-in shopper. The
  // entry must not flash a sign-in demand at them.
  it('does not demand sign-in while auth is still loading', () => {
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: null, isLoading: true });

    expect(screen.getByTestId('area-set-draw-area')).toHaveAttribute(
      'title',
      'Drawing a search area is coming soon',
    );
  });
});
