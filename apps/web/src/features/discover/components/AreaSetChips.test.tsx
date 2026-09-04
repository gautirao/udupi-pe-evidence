/**
 * Issue #2017 — AreaSetChips: multi-area AREA_SET draft chip strip.
 *
 * Wraps the REAL useAreaSetDraft hook (not mocked) so state transitions
 * (add/remove/isDirty) are genuine — only `commands.remove` is wrapped with
 * a spy so the wiring can be asserted without losing real removal behavior,
 * which the keyboard-focus regression test below depends on (the chip's DOM
 * node must actually unmount for the fix's re-focus effect to be exercised).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiscoverNavContextValue, DiscoverActionsContextValue } from '@/features/discover/context/types';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';
import type { ResultScope } from '@/features/discover/state/resultScope';

const mockRemove = vi.hoisted(() => vi.fn());
const mockCommitAreaSet = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useAreaSetDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/discover/state/useAreaSetDraft')>();
  return {
    ...actual,
    useAreaSetDraft: (committedScope: Parameters<typeof actual.useAreaSetDraft>[0]) => {
      const result = actual.useAreaSetDraft(committedScope);
      return {
        ...result,
        commands: {
          ...result.commands,
          remove: (areaKey: string) => {
            mockRemove(areaKey);
            result.commands.remove(areaKey);
          },
        },
      };
    },
  };
});

function areaSetScope(areaKeys: string[]): ResultScope {
  return { kind: 'AREA_SET', areaKeys };
}

// Minimal nav object — AreaSetChips only reads `city` and `resultScope` off
// nav. Cast via `as unknown as X` because DiscoverNavContextValue carries
// ~15 URL-state fields unrelated to this component; this mirrors the
// existing `makeNav`-style partial-object pattern used elsewhere in this
// repo's controller tests (e.g. useDiscoverJourneySwitchController.test.ts).
function makeNav(activeScope: ResultScope): DiscoverNavContextValue {
  return {
    city: 'bangalore',
    areaKey: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    scope: null,
    resultScope: { active: activeScope, previous: null },
  } as unknown as DiscoverNavContextValue;
}

let currentNav: DiscoverNavContextValue = makeNav(null);

// Issue #2017 (owner-directed desktop rework) — AreaSetChips now reads the
// open/closed level from useDiscoverShell's `isAreaSetDraftOpen` (shared
// with the desktop in-panel AreaSetDraftPanel) instead of owning local
// `suggestOpen` state. `currentIsAreaSetDraftOpenSeed` seeds the mocked
// hook's real `useState` per-render (mirrors `currentNav` above) so the
// "mounts with the draft already open" case can still be exercised
// directly. The mock calls a REAL `useState` (this factory function runs as
// a genuine hook during AreaSetChips's render, so React's hook rules apply
// normally) so click-driven open/close interactions in the tests below
// still produce real re-renders, exactly like the local state they replace.
let currentIsAreaSetDraftOpenSeed = false;

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => currentNav,
  useDiscoverActions: () =>
    // Only `commitAreaSet` is exercised by this component; the rest of the
    // ~46-field actions surface is irrelevant here (same cast rationale as makeNav above).
    ({ commitAreaSet: mockCommitAreaSet }) as unknown as DiscoverActionsContextValue,
  useDiscoverShell: () => {
    const [isOpen, setIsOpen] = useState(currentIsAreaSetDraftOpenSeed);
    return {
      mobileView: 'LIST',
      setMobileView: vi.fn(),
      // Issue #2017 (owner-directed desktop rework) — AreaSetChips's own
      // suggestions dropdown is now MOBILE-ONLY (`suggestOpen &&
      // shell.isMobileShell` gates both its render and the outside-click/
      // positioning effects — see AreaSetChips.tsx). This test file exists
      // to exercise that dropdown's content/behavior, so it must run in the
      // mobile context it actually renders in; `AreaSetDraftPanel.test.tsx`
      // covers the equivalent desktop in-panel view separately.
      isMobileShell: true,
      isAreaSetDraftOpen: isOpen,
      openAreaSetDraft: () => setIsOpen(true),
      closeAreaSetDraft: () => setIsOpen(false),
    };
  },
}));

let currentAreas: DiscoverArea[] = [];

vi.mock('@/hooks/useDiscoverAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useDiscoverAreas')>();
  return {
    ...actual,
    useDiscoverAreas: () => ({ data: { city: 'bangalore', areas: currentAreas } }),
  };
});

// Code-review Finding 2 (PR #2424) — the "Add area" suggestions dropdown is
// now backed by useNearbyAreaCandidates (a real network hook), not the
// deleted client-side selectNearbyAreaSuggestions selector. Mocked here,
// mirroring the useDiscoverAreas per-hook mock above, so these component
// tests control suggestion data/loading state directly instead of exercising
// a real fetch.
let currentSuggestions: NearbyAreaCandidate[] = [];
let currentSuggestionsLoading = false;

vi.mock('@/hooks/useNearbyAreaCandidates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useNearbyAreaCandidates')>();
  return {
    ...actual,
    useNearbyAreaCandidates: () => ({
      data: { city: 'bangalore', selectedAreaKeys: [], candidates: currentSuggestions },
      isLoading: currentSuggestionsLoading,
    }),
  };
});

import { AreaSetChips } from './AreaSetChips';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';

// Issue #2017 sibling-context extraction — useAreaSetDraft/useNearbyAreaCandidates
// are now called inside AreaSetDraftProvider rather than inside AreaSetChips
// itself (see AreaSetDraftContext.tsx). The vi.mock calls above still target
// those hook modules directly, so wrapping every render in the provider below
// keeps this suite's existing mocking strategy fully intact.
function renderAreaSetChips() {
  return render(
    <AreaSetDraftProvider>
      <AreaSetChips />
    </AreaSetDraftProvider>,
  );
}

const AREA_A: DiscoverArea = {
  areaKey: 'area:indiranagar',
  name: 'Indiranagar',
  geoCenterLat: 12.97,
  geoCenterLon: 77.64,
  listingCount: 12,
  schoolCount: 3,
};
const AREA_B: DiscoverArea = {
  areaKey: 'area:koramangala',
  name: 'Koramangala',
  geoCenterLat: 12.93,
  geoCenterLon: 77.62,
  listingCount: 20,
  schoolCount: 5,
};
const AREA_C: DiscoverArea = {
  areaKey: 'area:whitefield',
  name: 'Whitefield',
  geoCenterLat: 12.97,
  geoCenterLon: 77.75,
  listingCount: 8,
  schoolCount: 2,
};

describe('AreaSetChips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentNav = makeNav(null);
    currentAreas = [];
    currentSuggestions = [];
    currentSuggestionsLoading = false;
    currentIsAreaSetDraftOpenSeed = false;
  });

  // Issue #2017 — the shared `isAreaSetDraftOpen` level (see
  // DiscoverShellContextValue's doc). Covers the race this level-triggered
  // design exists to close: AreaSetChips can mount with the draft ALREADY
  // open (the real mobile case, where the map/chip-strip tree mounts lazily
  // only after AreaSelectedPanel's "Add nearby areas" fires
  // `setMobileView('MAP')` + `openAreaSetDraft()`).
  describe('isAreaSetDraftOpen (cross-tree open level)', () => {
    it('shows the suggestions popover when isAreaSetDraftOpen is already true on mount', () => {
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A, AREA_B];
      currentIsAreaSetDraftOpenSeed = true;

      renderAreaSetChips();

      expect(screen.getByTestId('area-set-suggestions-popover')).toBeInTheDocument();
    });

    it('does not show the popover when isAreaSetDraftOpen is false', () => {
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A, AREA_B];
      currentIsAreaSetDraftOpenSeed = false;

      renderAreaSetChips();

      expect(screen.queryByTestId('area-set-suggestions-popover')).not.toBeInTheDocument();
    });
  });

  it('renders nothing when draft.draftAreaKeys is empty', () => {
    currentNav = makeNav(null);
    currentAreas = [AREA_A, AREA_B];
    const { container } = renderAreaSetChips();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per draft area key, plus the "Add area" trigger', () => {
    currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey]));
    // Code-review Finding 1 (PR #2424) — the "Add area" trigger now always
    // renders once >=1 draft chip exists, regardless of suggestion count
    // (loading/empty suggestion states are handled inside the dropdown
    // instead of by hiding the trigger). So the trigger IS present here even
    // with no extra unselected areas configured.
    currentAreas = [AREA_A, AREA_B];
    renderAreaSetChips();
    expect(screen.getByTestId(`area-set-chip-${AREA_A.areaKey}`)).toBeInTheDocument();
    expect(screen.getByTestId(`area-set-chip-${AREA_B.areaKey}`)).toBeInTheDocument();
    expect(screen.getByTestId('area-set-add-trigger')).toBeInTheDocument();
  });

  it('removing a chip calls commands.remove(areaKey)', async () => {
    const user = userEvent.setup();
    currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey]));
    currentAreas = [AREA_A, AREA_B];
    renderAreaSetChips();

    await user.click(screen.getByTestId(`area-set-chip-${AREA_B.areaKey}-dismiss`));

    expect(mockRemove).toHaveBeenCalledWith(AREA_B.areaKey);
    expect(screen.queryByTestId(`area-set-chip-${AREA_B.areaKey}`)).not.toBeInTheDocument();
  });

  it('re-focuses the next chip after removal instead of falling back to document.body (regression)', async () => {
    const user = userEvent.setup();
    currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey, AREA_C.areaKey]));
    currentAreas = [AREA_A, AREA_B, AREA_C];
    renderAreaSetChips();

    const firstChip = screen.getByTestId(`area-set-chip-${AREA_A.areaKey}`);
    firstChip.focus();
    expect(document.activeElement).toBe(firstChip);

    await user.click(screen.getByTestId(`area-set-chip-${AREA_A.areaKey}-dismiss`));

    expect(screen.queryByTestId(`area-set-chip-${AREA_A.areaKey}`)).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByTestId(`area-set-chip-${AREA_B.areaKey}`));
  });

  it('restores focus after removing the focused chip even when a native focus-fixup blur fires first (regression)', async () => {
    const user = userEvent.setup();
    currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey, AREA_C.areaKey]));
    currentAreas = [AREA_A, AREA_B, AREA_C];
    renderAreaSetChips();

    const firstChip = screen.getByTestId(`area-set-chip-${AREA_A.areaKey}`);
    firstChip.focus();
    expect(document.activeElement).toBe(firstChip);

    // Simulate the browser's native "focus fixup" rule: removing a focused
    // DOM node fires a bubbling blur/focusout with relatedTarget null BEFORE
    // the node is actually unmounted (jsdom doesn't implement this step, so
    // it never fires on its own here — we dispatch it explicitly to force
    // the same event ordering a real browser produces). This flips
    // hadFocusRef to false via the group's existing onBlur handler, ahead of
    // the click below that actually triggers removal — exactly the ordering
    // that would silently defeat the restorative focus effect if removal
    // still depended on hadFocusRef instead of a synchronous read of
    // document.activeElement.
    firstChip.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));

    await user.click(screen.getByTestId(`area-set-chip-${AREA_A.areaKey}-dismiss`));

    expect(screen.queryByTestId(`area-set-chip-${AREA_A.areaKey}`)).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByTestId(`area-set-chip-${AREA_B.areaKey}`));
  });

  it('does not render the commit CTA when the draft is not dirty', () => {
    currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
    currentAreas = [AREA_A];
    renderAreaSetChips();
    expect(screen.queryByTestId('area-set-commit-cta')).not.toBeInTheDocument();
  });

  it('renders the commit CTA when dirty, and clicking it commits the full draft with the first key as primary', async () => {
    const user = userEvent.setup();
    currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey]));
    currentAreas = [AREA_A, AREA_B];
    renderAreaSetChips();

    expect(screen.queryByTestId('area-set-commit-cta')).not.toBeInTheDocument();

    // Drive the draft dirty via chip removal (already covered above as its
    // own real user interaction) rather than the "Add area" Radix Popover:
    // opening that Popover hangs userEvent.click() well past the test
    // timeout under jsdom, with no prior precedent in this repo for testing
    // Radix Popover (only Select has an established jsdom workaround), and
    // the Popover itself isn't what this test is verifying — only the CTA's
    // dirty-gated visibility and its commit wiring are.
    await user.click(screen.getByTestId(`area-set-chip-${AREA_B.areaKey}-dismiss`));

    const cta = await screen.findByTestId('area-set-commit-cta');
    await user.click(cta);

    expect(mockCommitAreaSet).toHaveBeenCalledWith([AREA_A.areaKey], {
      primaryAreaKey: AREA_A.areaKey,
    });
  });

  // Code-review Finding 2 (PR #2424) — suggestion labels must surface the
  // backend's per-candidate eligibleListingCount (bounded/filter-aware),
  // not a raw/unbounded listing count.
  //
  // Issue #2017 reskin — row copy is now "{proximity} · {N} listings ·
  // {M} schools" (proximity is either "Adjacent to {name}" or "{X.X} km
  // away", computed client-side via haversine against the nearest selected
  // area's geo-center). The exact km figure is real-geography-derived and
  // not asserted here (that's covered by dedicated proximityLabel cases
  // below); this test only pins the still-backend-sourced counts.
  it('renders each suggestion with eligibleListingCount and schoolCount', async () => {
    const user = userEvent.setup();
    currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
    currentAreas = [AREA_A];
    currentSuggestions = [
      {
        areaKey: 'area:kaup',
        name: 'Kaup',
        geoCenterLat: 13.21,
        geoCenterLon: 74.74,
        eligibleListingCount: 12,
        schoolCount: 3,
      },
    ];
    renderAreaSetChips();

    await user.click(screen.getByTestId('area-set-add-trigger'));

    const suggestion = await screen.findByTestId('area-set-suggestion-area:kaup');
    expect(suggestion).toHaveTextContent('Kaup');
    expect(suggestion).toHaveTextContent('12 listings');
    expect(suggestion).toHaveTextContent('3 schools');
  });

  // Issue #2017 reskin — proximity label: "Adjacent to {name}" within
  // ADJACENCY_THRESHOLD_KM (0.75km) of the nearest selected area's
  // geo-center, else "{X.X} km away".
  describe('proximity label', () => {
    it('shows "Adjacent to {name}" when the candidate is within the adjacency threshold', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A];
      currentSuggestions = [
        {
          areaKey: 'area:near-a',
          name: 'Near Area A',
          // ~0.3km north of AREA_A's geo-center (well under the 0.75km threshold).
          geoCenterLat: AREA_A.geoCenterLat + 0.003,
          geoCenterLon: AREA_A.geoCenterLon,
          eligibleListingCount: 4,
          schoolCount: 1,
        },
      ];
      renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));

      const suggestion = await screen.findByTestId('area-set-suggestion-area:near-a');
      expect(suggestion).toHaveTextContent(`Adjacent to ${AREA_A.name}`);
    });

    it('shows "{X.X} km away" when the candidate is beyond the adjacency threshold', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A];
      currentSuggestions = [
        {
          areaKey: 'area:kaup',
          name: 'Kaup',
          geoCenterLat: 13.21,
          geoCenterLon: 74.74,
          eligibleListingCount: 12,
          schoolCount: 3,
        },
      ];
      renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));

      const suggestion = await screen.findByTestId('area-set-suggestion-area:kaup');
      expect(suggestion).toHaveTextContent(/\d+(\.\d+)? km away/);
    });
  });

  // Team-lead review (post-#2017 desktop rework) — Cancel (and every other
  // non-commit close: the trigger toggle, "Back to areas", Escape, an
  // outside click) must discard uncommitted edits via
  // commands.resetToCommitted(), or a reopen silently inherits an area that
  // was added but never committed. Repro this test guards against: committed
  // [A] -> add B -> Cancel -> reopen -> B was still selected.
  describe('Cancel discards uncommitted edits (team-lead review)', () => {
    it('committed [A] -> add B -> Cancel -> reopen shows only [A], not [A, B]', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A, AREA_B];
      currentSuggestions = [
        {
          areaKey: AREA_B.areaKey,
          name: AREA_B.name,
          geoCenterLat: AREA_B.geoCenterLat,
          geoCenterLon: AREA_B.geoCenterLon,
          eligibleListingCount: 5,
          schoolCount: 1,
        },
      ];
      renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));
      await user.click(await screen.findByTestId(`area-set-suggestion-${AREA_B.areaKey}-add`));

      expect(screen.getByTestId(`area-set-panel-chip-${AREA_B.areaKey}`)).toBeInTheDocument();

      await user.click(screen.getByTestId('area-set-panel-cancel'));
      expect(screen.queryByTestId('area-set-suggestions-popover')).not.toBeInTheDocument();

      // Reopen — the draft must have been reset to the committed scope, not
      // just closed with B still sitting in it.
      await user.click(screen.getByTestId('area-set-add-trigger'));

      expect(screen.getByTestId(`area-set-panel-chip-${AREA_A.areaKey}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`area-set-panel-chip-${AREA_B.areaKey}`)).not.toBeInTheDocument();
      // Not dirty any more — the commit bar (which Cancel sits inside) must
      // not render, since the reopened draft exactly matches committed.
      expect(screen.queryByTestId('area-set-panel-commit-cta')).not.toBeInTheDocument();
    });

    it('the collapsed strip chip for the never-committed area is gone too, not just the panel recap', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A, AREA_B];
      currentSuggestions = [
        {
          areaKey: AREA_B.areaKey,
          name: AREA_B.name,
          geoCenterLat: AREA_B.geoCenterLat,
          geoCenterLon: AREA_B.geoCenterLon,
          eligibleListingCount: 5,
          schoolCount: 1,
        },
      ];
      renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));
      await user.click(await screen.findByTestId(`area-set-suggestion-${AREA_B.areaKey}-add`));
      await user.click(screen.getByTestId('area-set-panel-cancel'));

      expect(screen.getByTestId(`area-set-chip-${AREA_A.areaKey}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`area-set-chip-${AREA_B.areaKey}`)).not.toBeInTheDocument();
    });
  });

  // Team-lead review (2nd pass) — the outside-click effect installs its
  // listener via useEffect with deps [suggestOpen, shell.isMobileShell]
  // (NOT handleCancelDraft), so without handleCancelDraftRef the listener
  // would keep calling a STALE handleCancelDraft — closing over whatever
  // committed scope existed when the effect last ran, not the current one.
  // Repro: committed [A] -> open picker -> add B -> the COMMITTED scope
  // advances to [A, B] (e.g. via "Search these areas") WITHOUT the picker
  // closing -> an outside click must reset/reopen to the NEWEST committed
  // scope [A, B], not the stale [A] captured when the listener was
  // installed.
  describe('outside-click resets to the CURRENT committed scope, not a stale one (team-lead review, 2nd pass)', () => {
    it('committed scope changes while the picker stays open -> outside click -> reopen shows the newest committed scope', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey]));
      currentAreas = [AREA_A, AREA_B, AREA_C];
      currentSuggestions = [
        {
          areaKey: AREA_B.areaKey,
          name: AREA_B.name,
          geoCenterLat: AREA_B.geoCenterLat,
          geoCenterLon: AREA_B.geoCenterLon,
          eligibleListingCount: 5,
          schoolCount: 1,
        },
      ];
      const { rerender } = renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));
      await user.click(await screen.findByTestId(`area-set-suggestion-${AREA_B.areaKey}-add`));
      expect(screen.getByTestId(`area-set-panel-chip-${AREA_B.areaKey}`)).toBeInTheDocument();

      // Simulate the committed scope advancing to [A, B] elsewhere (e.g. a
      // real "Search these areas" commit) WITHOUT the picker closing — the
      // outside-click effect's own deps never change, so its listener is
      // never re-registered by React; only a ref indirection can make it
      // see this new committed scope.
      currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey]));
      rerender(
        <AreaSetDraftProvider>
          <AreaSetChips />
        </AreaSetDraftProvider>,
      );

      // Outside click — must reset to the CURRENT committed scope [A, B],
      // not the stale [A] captured when the listener was installed.
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId('area-set-suggestions-popover')).not.toBeInTheDocument();

      // Reopen and confirm the draft reflects [A, B], not [A].
      await user.click(screen.getByTestId('area-set-add-trigger'));
      expect(screen.getByTestId(`area-set-panel-chip-${AREA_A.areaKey}`)).toBeInTheDocument();
      expect(
        screen.getByTestId(`area-set-panel-chip-${AREA_B.areaKey}`),
        'reopened draft must equal the NEWEST committed scope [A, B], not the stale [A] from when the picker opened',
      ).toBeInTheDocument();
      expect(screen.queryByTestId('area-set-panel-commit-cta')).not.toBeInTheDocument();
    });
  });

  // Code-review Finding 1 (PR #2424) — max cap (AREA_SET_MAX_AREAS === 3),
  // exercised at the AreaSetChips UI layer (the underlying useAreaSetDraft
  // cap logic itself is unit-tested directly in useAreaSetDraft.test.ts).
  describe('at the area cap (AREA_SET_MAX_AREAS)', () => {
    it('marks the "Add area" trigger aria-disabled and wires aria-describedby to the limit note', () => {
      currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey, AREA_C.areaKey]));
      currentAreas = [AREA_A, AREA_B, AREA_C];
      renderAreaSetChips();

      const trigger = screen.getByTestId('area-set-add-trigger');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('aria-describedby', 'area-set-limit-note');
    });

    it('renders a live-region limit note announcing the cap', () => {
      currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey, AREA_C.areaKey]));
      currentAreas = [AREA_A, AREA_B, AREA_C];
      renderAreaSetChips();

      const note = document.getElementById('area-set-limit-note');
      expect(note).not.toBeNull();
      expect(note).toHaveAttribute('role', 'status');
      expect(note).toHaveAttribute('aria-live', 'polite');
      expect(note).toHaveTextContent('Maximum 3 areas — remove one to add another');
    });

    it('does not open the suggestions dropdown when the trigger is clicked at the cap', async () => {
      const user = userEvent.setup();
      currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey, AREA_C.areaKey]));
      currentAreas = [AREA_A, AREA_B, AREA_C];
      renderAreaSetChips();

      await user.click(screen.getByTestId('area-set-add-trigger'));

      expect(screen.queryByTestId('area-set-suggestions-popover')).not.toBeInTheDocument();
    });

    it('does not render the limit note below the cap', () => {
      currentNav = makeNav(areaSetScope([AREA_A.areaKey, AREA_B.areaKey]));
      currentAreas = [AREA_A, AREA_B];
      renderAreaSetChips();

      expect(document.getElementById('area-set-limit-note')).toBeNull();
      expect(screen.getByTestId('area-set-add-trigger')).toHaveAttribute('aria-disabled', 'false');
    });
  });
});
