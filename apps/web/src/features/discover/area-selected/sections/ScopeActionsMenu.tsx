import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DrawSearchAreaEntry } from '@/components/discover/panels/AreaSetSelectedExtras';
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDiscoverSummary } from '@/hooks/useDiscoverSummary';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { resolveDrawSearchAreaEligibility } from '@/features/discover/state/drawSearchAreaEligibility';

export interface ScopeActionsMenuProps {
  /** Non-null (length > 1) selects the "Edit areas ▾" AREA_SET branch; everything else is "Options ▾". */
  multiAreaKeys: string[] | null;
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  isViewportScope: boolean;
  /** AREA_SET only. */
  onEditAreas?: () => void;
  onClearAreas?: () => void;
  onFitAll?: () => void;
  /** Shared across every scope that can draw — same eligibility-gated control everywhere. */
  onDrawSearchArea?: () => void;
  onRevealMap?: () => void;
  /** POLYGON only. */
  onRedrawPolygon?: () => void;
  /** VIEWPORT/POLYGON only — same gating `AreaSelectedPanelScopeBar` already applies. */
  returnLabel?: string | null;
  onReturn?: () => void;
}

/**
 * Issue #2729 §3 — the PURE decision logic for which items the scope-actions menu shows, pulled
 * out of the component so it can be unit-tested directly (deterministic, no jsdom/Radix rendering
 * involved) rather than only reachable by opening the live menu. `ScopeActionsMenu` below calls
 * this and nothing else decides visibility — a passing test against this function is a test
 * against the component's real behaviour, not a parallel reimplementation of it.
 */
export interface ScopeMenuVisibility {
  isAreaSet: boolean;
  triggerLabel: 'Edit areas' | 'Options';
  /** AREA_SET always shows Edit/Clear/Fit-all/Create-alert as a fixed group. */
  showAreaSetActions: boolean;
  /**
   * Issue #2419 (PR-2) — same exclusion the pre-existing single-area action row applied: POLYGON
   * scope shows its own "Redraw" entry instead, so Draw-search-area does not appear twice for the
   * same committed polygon.
   */
  showDrawEntry: boolean;
  showRedraw: boolean;
  /** Issue #2478 — same gating `AreaSelectedPanelScopeBar` applies: only VIEWPORT/POLYGON ever show a "return to previous scope" action. */
  showReturn: boolean;
}

export function resolveScopeMenuVisibility(input: {
  multiAreaKeys: string[] | null;
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  isViewportScope: boolean;
  onRedrawPolygon?: () => void;
  returnLabel?: string | null;
}): ScopeMenuVisibility {
  const { multiAreaKeys, resultScopeKind, isViewportScope, onRedrawPolygon, returnLabel } = input;
  const isAreaSet = multiAreaKeys != null && multiAreaKeys.length > 0;
  return {
    isAreaSet,
    triggerLabel: isAreaSet ? 'Edit areas' : 'Options',
    showAreaSetActions: isAreaSet,
    showDrawEntry: isAreaSet || (!isViewportScope && resultScopeKind !== 'POLYGON'),
    showRedraw: !isAreaSet && resultScopeKind === 'POLYGON' && onRedrawPolygon != null,
    showReturn:
      !isAreaSet && (resultScopeKind === 'VIEWPORT' || resultScopeKind === 'POLYGON') && !!returnLabel,
  };
}

/**
 * Issue #2729 §3 — one compact "Edit areas ▾" (AREA_SET) / "Options ▾" (every other scope) menu
 * replacing the permanent ghost-button action row, so the row no longer consumes a full desktop
 * line. EVERY action the old row exposed is preserved, wired to the SAME handlers, with the SAME
 * gating (`DrawSearchAreaEntry` is reused verbatim, unmodified, via its `asMenuItem` variant — see
 * that component's own doc comment). "Create alert" stays a disabled, honestly-labelled entry for
 * AREA_SET only, exactly matching today's production (it does not exist as a control anywhere
 * else in production, so this menu does not invent it for other scopes).
 *
 * Built on Radix's `DropdownMenu` primitive (already used elsewhere in this app), which supplies
 * `aria-haspopup`/`aria-expanded` on the trigger, roving-focus arrow-key navigation, Escape and
 * outside-click dismissal, and focus-restoration to the trigger on close — for free, with no
 * bespoke keyboard-handling code to get wrong here.
 */
export function ScopeActionsMenu({
  multiAreaKeys,
  resultScopeKind,
  isViewportScope,
  onEditAreas,
  onClearAreas,
  onFitAll,
  onDrawSearchArea,
  onRevealMap,
  onRedrawPolygon,
  returnLabel,
  onReturn,
}: ScopeActionsMenuProps) {
  const { triggerLabel, showAreaSetActions, showDrawEntry: showDrawEntryByScope, showRedraw, showReturn } =
    resolveScopeMenuVisibility({ multiAreaKeys, resultScopeKind, isViewportScope, onRedrawPolygon, returnLabel });

  // Issue #2729 D4 fix — "a menu must never render empty". `DrawSearchAreaEntry` itself can
  // resolve to HIDDEN at runtime (e.g. an anonymous shopper — `resolveDrawSearchAreaEligibility`'s
  // `signed_in_required` reason) even when `showDrawEntryByScope` says the SCOPE allows a draw
  // action; the merge-base single-area action row already handled this via CSS `:empty` (it never
  // rendered a dead control either). A `DropdownMenuContent` does not mount its children until
  // OPENED, so that eligibility can't be read from the item itself in time to decide whether the
  // trigger should render — this computes the SAME eligibility, via the SAME pure function and the
  // SAME hooks `DrawSearchAreaEntry` calls (not duplicated logic, just duplicated pure derivation
  // over the identical inputs, mirroring the app's existing safe-duplication convention, e.g.
  // `AreaSetTwoTileRow`'s "same cache key, never a second request" note for `useDiscoverSummary`),
  // so the trigger and the item can never disagree about whether Draw is really available.
  const nav = useDiscoverNav();
  let isAuthenticated: boolean | undefined = undefined;
  try {
    const auth = useAuth();
    isAuthenticated = auth.isLoading ? undefined : auth.user !== null;
  } catch {
    // safe fallback when rendered outside AuthProvider (matches DrawSearchAreaEntry's own guard)
  }
  const { data: summary } = useDiscoverSummary({ city: nav?.city || DEFAULT_CITY });
  const drawEligibility = resolveDrawSearchAreaEligibility({
    isDrawModeWired: onDrawSearchArea != null,
    cityBoundaryAvailable: summary?.polygonSearchAvailable,
    journey: nav?.journey,
    hasResidentialListingScope: showAreaSetActions ? (multiAreaKeys?.length ?? 0) > 0 : !isViewportScope,
    isAuthenticated,
  });
  const showDrawEntry = showDrawEntryByScope && drawEligibility.status !== 'HIDDEN';

  const hasAnyItem = showAreaSetActions || showDrawEntry || showRedraw || showReturn;
  if (!hasAnyItem) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="scope-actions-menu-trigger"
          className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-copper/40 px-2.5 text-xs font-semibold text-copper transition-colors hover:bg-copper-tint"
        >
          {triggerLabel}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="scope-actions-menu-content">
        {showAreaSetActions && (
          <>
            <DropdownMenuItem onSelect={onEditAreas} data-testid="area-set-edit-areas">
              Edit areas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onClearAreas} data-testid="area-set-clear-areas">
              Clear selected areas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFitAll} data-testid="area-set-fit-all">
              Fit all
            </DropdownMenuItem>
          </>
        )}
        {showDrawEntry && (
          <DrawSearchAreaEntry
            asMenuItem
            hasResidentialListingScope={showAreaSetActions ? (multiAreaKeys?.length ?? 0) > 0 : !isViewportScope}
            onDrawSearchArea={onDrawSearchArea}
            onRevealMap={onRevealMap}
          />
        )}
        {showRedraw && (
          <DropdownMenuItem onSelect={onRedrawPolygon} data-testid="area-panel-scope-bar-redraw">
            Redraw
          </DropdownMenuItem>
        )}
        {showReturn && (
          <DropdownMenuItem onSelect={onReturn} data-testid="area-panel-scope-bar-return">
            {returnLabel}
          </DropdownMenuItem>
        )}
        {showAreaSetActions && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled title="Create alert is not available yet" data-testid="area-set-create-alert">
              Create alert
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
