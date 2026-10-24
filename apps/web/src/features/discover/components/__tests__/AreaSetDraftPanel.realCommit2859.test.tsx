/**
 * #2859 B7 (issue 285907) WEB slice B2 — issue-2017-multi-area-areaset-commit-regression, assertion 2017-9.
 *
 * 2017-9 is the COMPOSED draft flow: Add -> draft chip (URL unchanged) -> Cancel (URL unchanged, reopen shows only
 * the committed chip) -> Add -> "Show listings" -> the REAL commitAreaSet writes rscope=areas, rareas=A,B,
 * areaKey=A as ONE PUSH. AreaSetDraftPanel.test.tsx mocks useDiscoverActions (commitAreaSet is a spy), so it proves
 * the payload only. Here AreaSetDraftPanel mounts inside the REAL DiscoverProvider (real nav/actions/shell, real
 * useDiscoverUrlState over a MemoryRouter) with NO discover-context mock; a LocationProbe reads the URL.
 *
 * Mocked (named): the two data hooks (areas, nearby candidates). The follow-up request scoped to both keys and the
 * header count == cards are NOT mounted in this tree (no useDiscoverMapData, no right-panel header): those two
 * subclaims stay RETAIN and the separate existing its are construction-only.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const AREA_A = 'IN|KA|Udupi|Manipal';
const AREA_B = 'IN|KA|Udupi|Kunjibettu';

vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return {
    ...actual,
    useDiscoverAreas: () => ({
      data: {
        city: 'udupi',
        areas: [
          { areaKey: 'IN|KA|Udupi|Manipal', name: 'Manipal', geoCenterLat: 13.35, geoCenterLon: 74.79 },
          { areaKey: 'IN|KA|Udupi|Kunjibettu', name: 'Kunjibettu', geoCenterLat: 13.36, geoCenterLon: 74.79 },
          { areaKey: 'IN|KA|Udupi|Parkala', name: 'Parkala', geoCenterLat: 13.37, geoCenterLon: 74.8 },
        ],
      },
    }),
  };
});
// Like the real endpoint: candidates are everything NOT already selected (the backend pre-excludes `selected`).
vi.mock('@/hooks/useNearbyAreaCandidates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useNearbyAreaCandidates')>();
  return {
    ...actual,
    useNearbyAreaCandidates: (city: string, selected: string[]) => ({
      data: {
        city,
        selectedAreaKeys: selected,
        candidates: [
          { areaKey: 'IN|KA|Udupi|Kunjibettu', name: 'Kunjibettu', geoCenterLat: 13.36, geoCenterLon: 74.79, eligibleListingCount: 4, schoolCount: 2 },
          { areaKey: 'IN|KA|Udupi|Parkala', name: 'Parkala', geoCenterLat: 13.37, geoCenterLon: 74.8, eligibleListingCount: 3, schoolCount: 1 },
        ].filter((c) => !selected.includes(c.areaKey)),
      },
      isLoading: false,
    }),
  };
});

import { AreaSetDraftPanel } from '../AreaSetDraftPanel';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';

const seen: Array<{ search: string; key: string }> = [];
let probeNavigate: ReturnType<typeof useNavigate> | undefined;
function LocationProbe() {
  const location = useLocation();
  probeNavigate = useNavigate();
  React.useEffect(() => {
    seen.push({ search: location.search, key: location.key });
  }, [location]);
  return null;
}
const lastParams = () => new URLSearchParams(seen[seen.length - 1]?.search ?? '');

/** The REAL shell owns open/close; this host only renders the panel while the real shell says it is open. */
function Host() {
  const shell = useDiscoverShell();
  return (
    <AreaSetDraftProvider>
      <button type="button" data-testid="host-reopen" onClick={() => shell.openAreaSetDraft()}>reopen</button>
      {shell.isAreaSetDraftOpen && <AreaSetDraftPanel />}
    </AreaSetDraftProvider>
  );
}

const addBtn = (areaKey: string) => screen.getByTestId(`area-set-draft-panel-suggestion-${areaKey}-add`);
const chip = (areaKey: string) => screen.queryByTestId(`area-set-draft-panel-chip-${areaKey}`);

const PREV_URL = `/discover?city=udupi&lat=13.35000&lon=74.79000&zoom=12`;
const COMMITTED_URL = `/discover?city=udupi&areaKey=${encodeURIComponent(AREA_A)}&rscope=areas&rareas=${encodeURIComponent(AREA_A)}`;

describe('#2859 B7 2017-9 — AreaSetDraftPanel -> REAL commitAreaSet -> URL (real DiscoverProvider, no action mocks)', () => {
  it('Add leaves the URL unchanged; Cancel leaves it unchanged and a reopen shows only A; Add + Show listings writes rscope=areas, rareas=A,B, areaKey=A as ONE PUSH', async () => {
    seen.length = 0;
    probeNavigate = undefined;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[PREV_URL, COMMITTED_URL]} initialIndex={1}>
          <LocationProbe />
          <DiscoverProvider>
            <Host />
          </DiscoverProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The real shell starts closed: open the draft through the real shell action.
    expect(screen.queryByTestId('area-set-draft-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('host-reopen'));
    expect(screen.getByTestId('area-set-draft-panel')).toBeInTheDocument();

    // BASELINE: committed [A], URL carries the committed set.
    expect(chip(AREA_A)).toBeInTheDocument();
    expect(chip(AREA_B)).not.toBeInTheDocument();
    expect(screen.getByText('Draft selection · 1 of 3 selected')).toBeInTheDocument();
    expect(lastParams().get('rscope')).toBe('areas');
    expect(lastParams().get('rareas')).toBe(AREA_A);
    expect(lastParams().get('areaKey')).toBe(AREA_A);
    const searchBefore = seen[seen.length - 1].search;
    const writesBefore = seen.length;
    expect(screen.queryByTestId('area-set-draft-panel-commit-cta')).not.toBeInTheDocument();

    // ADD B: draft chip appears (positive), URL unchanged (negative, same it).
    fireEvent.click(addBtn(AREA_B));
    expect(chip(AREA_B)).toBeInTheDocument();
    expect(screen.getByText('Draft selection · 2 of 3 selected')).toBeInTheDocument();
    expect(screen.getByTestId('area-set-draft-panel-commit-cta')).toBeInTheDocument();
    expect(seen[seen.length - 1].search).toBe(searchBefore);
    expect(seen.length).toBe(writesBefore);

    // CANCEL: panel closes (positive), URL unchanged (negative), reopen shows only A.
    fireEvent.click(screen.getByTestId('area-set-draft-panel-cancel'));
    expect(screen.queryByTestId('area-set-draft-panel')).not.toBeInTheDocument();
    expect(seen[seen.length - 1].search).toBe(searchBefore);
    expect(seen.length).toBe(writesBefore);
    fireEvent.click(screen.getByTestId('host-reopen'));
    expect(screen.getByTestId('area-set-draft-panel')).toBeInTheDocument();
    expect(chip(AREA_A)).toBeInTheDocument();
    expect(chip(AREA_B)).not.toBeInTheDocument();
    expect(screen.getByText('Draft selection · 1 of 3 selected')).toBeInTheDocument();
    expect(screen.queryByTestId('area-set-draft-panel-commit-cta')).not.toBeInTheDocument();

    // ADD B again -> SHOW LISTINGS: the REAL commitAreaSet writes the URL.
    fireEvent.click(addBtn(AREA_B));
    fireEvent.click(screen.getByTestId('area-set-draft-panel-commit-cta'));
    await waitFor(() => {
      expect(lastParams().get('rareas')).toBe(`${AREA_A},${AREA_B}`);
    });
    expect(lastParams().get('rscope')).toBe('areas');
    expect(lastParams().get('areaKey')).toBe(AREA_A);
    expect(lastParams().get('city')).toBe('udupi');
    // the real shell closed the draft after the commit
    expect(screen.queryByTestId('area-set-draft-panel')).not.toBeInTheDocument();

    // ONE PUSH: a single Back lands on the committed [A] entry (not on PREV, not on a duplicate [A,B] entry).
    const writesAfterCommit = seen.length;
    expect(writesAfterCommit).toBeGreaterThan(writesBefore);
    act(() => {
      probeNavigate!(-1);
    });
    await waitFor(() => {
      expect(lastParams().get('rareas')).toBe(AREA_A);
    });
    expect(lastParams().get('areaKey')).toBe(AREA_A);
    expect(lastParams().get('lat')).toBeNull();
  });
});
