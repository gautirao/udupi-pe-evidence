/**
 * Issue #2729 §3 — the compact "Edit areas ▾"/"Options ▾" scope-actions menu replacing the
 * permanent ghost-button action row.
 *
 * ENVIRONMENT NOTE: this repo has a pre-existing, documented limitation where a Radix
 * `DropdownMenu` trigger cannot reliably be opened in jsdom via `userEvent.click` (hangs; see
 * `AppLayout.test.tsx`'s "Neither test below opens the overflow trigger via userEvent" comment)
 * NOR via a manual `pointerdown`+`pointerup`+`click` `fireEvent` sequence (confirmed here —
 * `aria-expanded` stays `false` and `DropdownMenuContent` never mounts either way). Every existing
 * test in this repo that touches a Radix `DropdownMenu` (`AppLayout.test.tsx`,
 * `RoleAwareHeader.discoverHeaderExtras.test.tsx`) works around this the same way this file does:
 * assert the TRIGGER's structure/label directly (render-only, no open), and test the underlying
 * VISIBILITY DECISION as a pure function instead of via live open/click/keyboard interaction.
 *
 * `resolveScopeMenuVisibility` is exported from `ScopeActionsMenu.tsx` for exactly this reason —
 * it is the SAME function the component calls to decide what to render, not a parallel
 * reimplementation, so a passing test here is a test against the component's real behaviour.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';
import { ScopeActionsMenu, resolveScopeMenuVisibility, type ScopeActionsMenuProps } from '../ScopeActionsMenu';

vi.mock('@/hooks/useDiscoverSummary', () => ({
  useDiscoverSummary: () => ({ data: { polygonSearchAvailable: true } }),
}));

// Issue #2729 D4 — `ScopeActionsMenu` now resolves the SAME Draw-search-area eligibility
// `DrawSearchAreaEntry` does (see the D4 fix comment in ScopeActionsMenu.tsx), which includes
// `isAuthenticated`. `renderWithProviders`' AuthProvider defaults UNAUTHENTICATED (its own doc
// comment: "matches every current caller's assumptions"), which is exactly the real-browser state
// that produced D4's empty-menu bug for an anonymous shopper. Most tests below want a signed-in
// shopper (the more common "does every action work" case), so `useAuth` is mocked authenticated by
// default; the anonymous case gets its own explicit describe block further down.
let mockIsAuthenticated = true;
vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return {
    ...actual,
    useAuth: () => ({ user: mockIsAuthenticated ? { id: 'u1' } : null, isLoading: false }),
  };
});

const renderMenu = (over: Partial<ScopeActionsMenuProps> = {}) => {
  const props: ScopeActionsMenuProps = {
    multiAreaKeys: null,
    resultScopeKind: 'AREA',
    isViewportScope: false,
    ...over,
  };
  return renderWithProviders(
    <DiscoverProvider>
      <AreaSetDraftProvider>
        <ScopeActionsMenu {...props} />
      </AreaSetDraftProvider>
    </DiscoverProvider>,
    { router: 'browser' },
  );
};

describe('#2729 §3 — ScopeActionsMenu trigger (structural)', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
  });

  it('AREA_SET: trigger reads "Edit areas ▾" with aria-haspopup=menu, closed by default', () => {
    renderMenu({ multiAreaKeys: ['A', 'B'] });
    const trigger = screen.getByTestId('scope-actions-menu-trigger');
    expect(trigger).toHaveTextContent('Edit areas');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('single AREA scope: trigger reads "Options ▾"', () => {
    renderMenu({ multiAreaKeys: null, resultScopeKind: 'AREA' });
    expect(screen.getByTestId('scope-actions-menu-trigger')).toHaveTextContent('Options');
  });
});

describe('#2729 D4 fix — a menu must never render empty', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
  });

  it('single AREA scope, anonymous shopper: Draw-search-area resolves HIDDEN and there is no other action — the trigger does NOT render at all (matches the merge-base action row, which also showed nothing via `:empty` for this exact state)', () => {
    mockIsAuthenticated = false;
    renderMenu({ multiAreaKeys: null, resultScopeKind: 'AREA', isViewportScope: false });
    expect(screen.queryByTestId('scope-actions-menu-trigger')).not.toBeInTheDocument();
  });

  it('single AREA scope, SIGNED-IN shopper: Draw-search-area is eligible, so the trigger DOES render (the D4 regression: this state showed an empty menu instead of nothing or this)', () => {
    mockIsAuthenticated = true;
    renderMenu({ multiAreaKeys: null, resultScopeKind: 'AREA', isViewportScope: false });
    expect(screen.getByTestId('scope-actions-menu-trigger')).toBeInTheDocument();
  });

  it('POLYGON scope, anonymous, WITH a redraw handler: Redraw is still not eligibility-gated by auth, so the trigger renders (Redraw, not Draw-search-area, is the action here)', () => {
    mockIsAuthenticated = false;
    renderMenu({ multiAreaKeys: null, resultScopeKind: 'POLYGON', isViewportScope: false, onRedrawPolygon: vi.fn() });
    expect(screen.getByTestId('scope-actions-menu-trigger')).toBeInTheDocument();
  });

  it('POLYGON scope, anonymous, WITHOUT a redraw handler and no VIEWPORT/return: genuinely no action — trigger absent', () => {
    mockIsAuthenticated = false;
    renderMenu({ multiAreaKeys: null, resultScopeKind: 'POLYGON', isViewportScope: false });
    expect(screen.queryByTestId('scope-actions-menu-trigger')).not.toBeInTheDocument();
  });

  it('AREA_SET always renders the trigger regardless of Draw-search-area eligibility (Edit/Clear/Fit-all/Create-alert are never auth-gated)', () => {
    mockIsAuthenticated = false;
    renderMenu({ multiAreaKeys: ['A', 'B'], resultScopeKind: 'AREA', isViewportScope: false });
    expect(screen.getByTestId('scope-actions-menu-trigger')).toBeInTheDocument();
  });
});

describe('#2729 §3 — resolveScopeMenuVisibility (the menu\'s real decision logic)', () => {
  it('AREA_SET: shows the fixed Edit/Clear/Fit-all/Create-alert group + Draw entry, never Redraw/Return', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: ['A', 'B'],
      resultScopeKind: 'AREA',
      isViewportScope: false,
      onRedrawPolygon: vi.fn(),
      returnLabel: 'Return to X',
    });
    expect(v).toMatchObject({
      isAreaSet: true,
      triggerLabel: 'Edit areas',
      showAreaSetActions: true,
      showDrawEntry: true,
      showRedraw: false,
      showReturn: false,
    });
  });

  it('single AREA scope: Options label, Draw entry only — no AREA_SET actions, Redraw or Return', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: null,
      resultScopeKind: 'AREA',
      isViewportScope: false,
    });
    expect(v).toMatchObject({
      isAreaSet: false,
      triggerLabel: 'Options',
      showAreaSetActions: false,
      showDrawEntry: true,
      showRedraw: false,
      showReturn: false,
    });
  });

  it('POLYGON scope with a redraw handler: Redraw shown, Draw-search-area entry EXCLUDED (no duplicate draw control)', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: null,
      resultScopeKind: 'POLYGON',
      isViewportScope: false,
      onRedrawPolygon: vi.fn(),
    });
    expect(v.showDrawEntry).toBe(false);
    expect(v.showRedraw).toBe(true);
  });

  it('MUTATION CHECK: POLYGON scope WITHOUT a redraw handler shows neither Redraw nor Draw-search-area (proves showRedraw is gated on the handler, not just the scope kind)', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: null,
      resultScopeKind: 'POLYGON',
      isViewportScope: false,
      onRedrawPolygon: undefined,
    });
    expect(v.showRedraw).toBe(false);
    expect(v.showDrawEntry).toBe(false);
  });

  it('VIEWPORT scope with a returnLabel: Return shown; Draw-search-area entry excluded (isViewportScope)', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: null,
      resultScopeKind: 'VIEWPORT',
      isViewportScope: true,
      returnLabel: 'Return to Koramangala',
    });
    expect(v.showReturn).toBe(true);
    expect(v.showDrawEntry).toBe(false);
  });

  it('MUTATION CHECK: VIEWPORT scope with NO returnLabel shows no Return item (proves the gating is real, not always-on for VIEWPORT/POLYGON)', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: null,
      resultScopeKind: 'VIEWPORT',
      isViewportScope: true,
      returnLabel: null,
    });
    expect(v.showReturn).toBe(false);
  });

  it('AREA_SET always wins the trigger label and the fixed action group, even if returnLabel/onRedrawPolygon are also supplied (AREA_SET and Options are mutually exclusive)', () => {
    const v = resolveScopeMenuVisibility({
      multiAreaKeys: ['A', 'B'],
      resultScopeKind: 'POLYGON',
      isViewportScope: false,
      onRedrawPolygon: vi.fn(),
      returnLabel: 'Return to X',
    });
    expect(v.triggerLabel).toBe('Edit areas');
    expect(v.showRedraw).toBe(false);
    expect(v.showReturn).toBe(false);
  });
});
