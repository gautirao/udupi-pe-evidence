import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockJourney, mockAuth, mockSummary } = vi.hoisted(() => ({
  mockJourney: { current: null as string | null },
  mockAuth: {
    current: { user: { id: 'u1' } as { id: string } | null, isLoading: false },
  },
  mockSummary: {
    current: undefined as { polygonSearchAvailable?: boolean } | undefined,
  },
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({ journey: mockJourney.current }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth.current,
}));

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({ data: mockSummary.current }),
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
  handlers: { onDrawSearchArea?: () => void; onRevealMap?: () => void } = {},
  summary: { polygonSearchAvailable?: boolean } | undefined = { polygonSearchAvailable: true },
) {
  mockJourney.current = journey;
  mockAuth.current = auth;
  mockSummary.current = summary;
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
      onDrawSearchArea={handlers.onDrawSearchArea}
      onRevealMap={handlers.onRevealMap}
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

  // Owner ruling (#2419 PR-2): HIDE for anonymous shoppers. PR-1 showed a
  // disabled "Sign in to search a drawn area" entry, which was right while the
  // control was disabled for everyone; now that it works, a control that is
  // live for one shopper and decorative for another is worse than none.
  it('removes the entry entirely for an anonymous shopper', () => {
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: null, isLoading: false });

    expect(screen.queryByTestId('area-set-draw-area')).not.toBeInTheDocument();
    // The rest of the action row is untouched.
    expect(screen.getByTestId('area-set-edit-areas')).toBeInTheDocument();
  });

  // `isAuthenticated` is derived as "not loading AND user present", so during
  // the auth load window it reads false even for a signed-in shopper. The
  // entry must not blink out from under them.
  it('does not hide the entry while auth is still loading', () => {
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: null, isLoading: true });

    expect(screen.getByTestId('area-set-draw-area')).toBeInTheDocument();
  });

  // Issue #2419 (PR-2) — the entry is now a working control.
  it('is enabled and starts draw mode when a handler is supplied', async () => {
    const user = userEvent.setup();
    const onDrawSearchArea = vi.fn();
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: { id: 'u1' }, isLoading: false }, {
      onDrawSearchArea,
    });

    const entry = screen.getByTestId('area-set-draw-area');
    expect(entry).toBeEnabled();
    await user.click(entry);
    expect(onDrawSearchArea).toHaveBeenCalledTimes(1);
  });

  // Below `lg` the map canvas is not mounted until the Map view is open, so
  // arming the draw tool without revealing it first would put the shopper in
  // draw mode on a surface they cannot see. Order matters, not just presence.
  it('reveals the map before arming the draw tool', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    renderHeader('area-first', ['hebbal', 'nagawara'], { user: { id: 'u1' }, isLoading: false }, {
      onDrawSearchArea: () => calls.push('draw'),
      onRevealMap: () => calls.push('reveal'),
    });

    await user.click(screen.getByTestId('area-set-draw-area'));
    expect(calls).toEqual(['reveal', 'draw']);
  });

  // Without a handler the control must stay disabled rather than look usable
  // and do nothing — this is what protects callers that have not adopted the
  // prop yet.
  it('stays disabled when no draw handler is supplied', () => {
    renderHeader('area-first');

    expect(screen.getByTestId('area-set-draw-area')).toBeDisabled();
  });

  // Issue #2419 (PR-2) — the city-boundary signal. PolygonGeographicSafetyPolicy
  // fails closed with no VALID CITY row, so every polygon in such a city would
  // be rejected AFTER the shopper drew it.
  it('disables the entry when the city has no canonical boundary', () => {
    renderHeader(
      'area-first',
      ['hebbal', 'nagawara'],
      { user: { id: 'u1' }, isLoading: false },
      { onDrawSearchArea: vi.fn() },
      { polygonSearchAvailable: false },
    );

    const entry = screen.getByTestId('area-set-draw-area');
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute(
      'title',
      'Drawing a search area is not available in this city yet',
    );
  });

  // A cached response, or a backend predating the field, deserialises with the
  // key absent. `undefined` must not read as `false` and hide a feature that
  // in fact works.
  it.each([
    ['the summary has not loaded', undefined],
    ['the field is absent from the response', {}],
  ])('leaves the entry enabled when %s', (_label, summary) => {
    renderHeader(
      'area-first',
      ['hebbal', 'nagawara'],
      { user: { id: 'u1' }, isLoading: false },
      { onDrawSearchArea: vi.fn() },
      summary,
    );

    expect(screen.getByTestId('area-set-draw-area')).toBeEnabled();
  });
});
