/**
 * Issue #2017 — AreaSetDraftPanel: the desktop in-panel AREA_SET draft view.
 *
 * #2750 PR-5 B1 T3 (2017-N10a/b/c) — destination for the draft behaviour that
 * e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts (L96-210) drove through a browser:
 *   N10a  Add on a nearby suggestion adds a DRAFT chip and does not commit,
 *   N10b  "Show listings" appears only when dirty and commits the FULL draft with the FIRST key as primary,
 *   N10c  Cancel / "Back to areas" discard the draft (a reopen shows only the committed chip).
 *
 * The REAL `useAreaSetDraft` + `AreaSetDraftProvider` run (genuine add/remove/isDirty/resetToCommitted); only the
 * context hooks that would otherwise need the whole DiscoverProvider tree (nav / actions / shell) and the two data
 * hooks (areas, nearby candidates) are stubbed, mirroring AreaSetChips.test.tsx. `commitAreaSet` and
 * `closeAreaSetDraft` are spies so the commit payload is asserted, not inferred.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DiscoverNavContextValue, DiscoverActionsContextValue } from '@/features/discover/context/types';
import type { NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';

const mockCommitAreaSet = vi.hoisted(() => vi.fn());
const mockCloseAreaSetDraft = vi.hoisted(() => vi.fn());

const AREA_A = 'IN|KA|Udupi|Manipal';
const AREA_B = 'IN|KA|Udupi|Kunjibettu';
const AREA_C = 'IN|KA|Udupi|Parkala';
const AREA_D = 'IN|KA|Udupi|Brahmavar';

const POOL: NearbyAreaCandidate[] = [
  { areaKey: AREA_B, name: 'Kunjibettu', geoCenterLat: 13.36, geoCenterLon: 74.79, eligibleListingCount: 4, schoolCount: 2 },
  { areaKey: AREA_C, name: 'Parkala', geoCenterLat: 13.37, geoCenterLon: 74.8, eligibleListingCount: 3, schoolCount: 1 },
  { areaKey: AREA_D, name: 'Brahmavar', geoCenterLat: 13.4, geoCenterLon: 74.75, eligibleListingCount: 2, schoolCount: 1 },
];

const currentNav = {
  city: 'udupi',
  areaKey: AREA_A,
  filters: {},
  schoolId: null,
  radiusKm: null,
  q: '',
  journey: 'area-first',
  groupId: null,
  selectedGroup: null,
  intent: 'buy',
  scope: null,
  resultScope: { active: { kind: 'AREA_SET', areaKeys: [AREA_A] }, previous: null },
} as unknown as DiscoverNavContextValue;

// The shell level is owned by the test Host (below) so the panel can be closed and REOPENED while the
// AreaSetDraftProvider (and therefore the draft state) stays mounted, exactly as in DiscoverRightPanel.
let currentShell: Record<string, unknown> = {};

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => currentNav,
  useDiscoverActions: () =>
    ({ commitAreaSet: mockCommitAreaSet, clearAllFiltersAndSearch: vi.fn() }) as unknown as DiscoverActionsContextValue,
  useDiscoverShell: () => currentShell,
}));

vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return {
    ...actual,
    useDiscoverAreas: () => ({
      data: {
        city: 'udupi',
        areas: [
          { areaKey: AREA_A, name: 'Manipal', geoCenterLat: 13.35, geoCenterLon: 74.79 },
          ...POOL.map((c) => ({ areaKey: c.areaKey, name: c.name, geoCenterLat: c.geoCenterLat, geoCenterLon: c.geoCenterLon })),
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
      data: { city, selectedAreaKeys: selected, candidates: POOL.filter((c) => !selected.includes(c.areaKey)) },
      isLoading: false,
    }),
  };
});

import { AreaSetDraftPanel } from '../AreaSetDraftPanel';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';

function Host({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  currentShell = {
    mobileView: 'LIST',
    setMobileView: vi.fn(),
    isMobileShell: false,
    isAreaSetDraftOpen: open,
    openAreaSetDraft: () => setOpen(true),
    closeAreaSetDraft: () => {
      mockCloseAreaSetDraft();
      setOpen(false);
    },
  };
  return (
    <AreaSetDraftProvider>
      <button type="button" data-testid="host-reopen" onClick={() => setOpen(true)}>
        reopen
      </button>
      {open && <AreaSetDraftPanel />}
    </AreaSetDraftProvider>
  );
}

const addBtn = (areaKey: string) => screen.getByTestId(`area-set-draft-panel-suggestion-${areaKey}-add`);
const chip = (areaKey: string) => screen.queryByTestId(`area-set-draft-panel-chip-${areaKey}`);
const selectedHeader = (n: number) => screen.getByText(`Draft selection · ${n} of 3 selected`);
const commitCta = () => screen.queryByTestId('area-set-draft-panel-commit-cta');

describe('AreaSetDraftPanel — the desktop in-panel AREA_SET draft (#2750 PR-5 T3 2017-N10)', () => {
  beforeEach(() => {
    mockCommitAreaSet.mockClear();
    mockCloseAreaSetDraft.mockClear();
  });

  // #2750 PR-5 2017-N10a
  it('Add on a nearby suggestion adds a draft chip and does not commit', () => {
    render(<Host />);

    // Pre-edit: only the committed area, one of three.
    expect(selectedHeader(1)).toBeInTheDocument();
    expect(chip(AREA_A)).toBeInTheDocument();
    expect(chip(AREA_B)).not.toBeInTheDocument();

    fireEvent.click(addBtn(AREA_B));
    expect(chip(AREA_B)).toBeInTheDocument();
    expect(selectedHeader(2)).toBeInTheDocument();
    // The Add is a DRAFT edit: nothing is committed.
    expect(mockCommitAreaSet).not.toHaveBeenCalled();

    // At-limit control: a third area fills the draft, a fourth Add changes nothing.
    fireEvent.click(addBtn(AREA_C));
    expect(selectedHeader(3)).toBeInTheDocument();
    expect(screen.getByTestId('area-set-draft-panel-atlimit-notice')).toBeInTheDocument();
    fireEvent.click(addBtn(AREA_D));
    expect(chip(AREA_D)).not.toBeInTheDocument();
    expect(selectedHeader(3)).toBeInTheDocument();
    expect(mockCommitAreaSet).not.toHaveBeenCalled();
  });

  // #2750 PR-5 2017-N10b
  it('Show listings appears only when dirty and commits the full draft with the FIRST key as primary', () => {
    render(<Host />);

    // Non-dirty draft (equal to the committed set): no commit CTA.
    expect(commitCta()).not.toBeInTheDocument();

    // Draft [A, B]: two keys, so first (A) and last (B) differ and the primary choice is observable.
    fireEvent.click(addBtn(AREA_B));
    const cta = commitCta();
    expect(cta).toBeInTheDocument();
    expect(mockCommitAreaSet).not.toHaveBeenCalled();

    fireEvent.click(cta as HTMLElement);
    expect(mockCommitAreaSet).toHaveBeenCalledTimes(1);
    expect(mockCommitAreaSet).toHaveBeenCalledWith([AREA_A, AREA_B], { primaryAreaKey: AREA_A });
    expect(mockCloseAreaSetDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('area-set-draft-panel')).not.toBeInTheDocument();
  });

  // #2750 PR-5 2017-N10c
  it('Cancel discards the draft: reopening shows only the committed chip, 1 of 3 selected, no commit CTA', () => {
    render(<Host />);

    // Pre-edit control: the first mount shows the committed set only.
    expect(selectedHeader(1)).toBeInTheDocument();
    expect(commitCta()).not.toBeInTheDocument();

    // Cancel path.
    fireEvent.click(addBtn(AREA_B));
    expect(chip(AREA_B)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('area-set-draft-panel-cancel'));
    expect(mockCloseAreaSetDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('area-set-draft-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('host-reopen'));
    expect(chip(AREA_A)).toBeInTheDocument();
    expect(chip(AREA_B)).not.toBeInTheDocument();
    expect(selectedHeader(1)).toBeInTheDocument();
    expect(commitCta()).not.toBeInTheDocument();

    // "Back to areas" is the second non-commit close and discards the same way.
    fireEvent.click(addBtn(AREA_B));
    expect(chip(AREA_B)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('area-set-draft-panel-back'));
    expect(mockCloseAreaSetDraft).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('host-reopen'));
    expect(chip(AREA_B)).not.toBeInTheDocument();
    expect(selectedHeader(1)).toBeInTheDocument();
    expect(commitCta()).not.toBeInTheDocument();
    expect(mockCommitAreaSet).not.toHaveBeenCalled();
  });
});
