/**
 * HierarchyBackButton — Issue #1956 PR 2 (Slice 5, AC5.2-AC5.10).
 *
 * The visible in-app "hierarchy Back" affordance: navigates to the CURRENT
 * resolved node's canonical parent — the last entry of `node.ancestry`, the
 * server-declared immediate parent. The DESTINATION is always this
 * server-declared parent; only the NAVIGATION MECHANISM (a real history POP
 * vs a REPLACE of the current entry) is ever conditional — see the guard
 * below. This distinction is deliberate and load-bearing (fix-verify cycle 1,
 * `hierarchy_back_guarded_pop` ruling): a BLIND/unconditional
 * `window.history.back()`/`navigate(-1)` (one that trusts history to contain
 * the right destination) stays forbidden; a POP whose destination has been
 * INDEPENDENTLY PROVEN to equal the canonical parent is not the same thing.
 *
 * ── HIDDEN AT THE CITY ROOT (AC5.7) ──
 * A node with an empty `ancestry` (the synthetic city root, or any node the
 * server reports with no parent) renders NO control at all — Back must never
 * leave Discover.
 *
 * ── THE DEFECT THIS GUARD FIXES ──
 * `goToNode`/`goToAncestorNode` (`state/url/navigation.ts`) are PUSHes (pinned
 * by `navigationCommandMatrix.test.ts`). An ordinary drill-down City ->
 * Direction -> Area is therefore TWO PUSHes, leaving history
 * `[..., Direction, Area]`. An UNCONDITIONAL `<Link replace>` back to Direction
 * then rewrites the CURRENT (Area) entry to Direction, producing
 * `[..., Direction, Direction]` — two adjacent identical entries. One Back
 * press becomes a visual no-op, and Forward can never restore Area again.
 * That is exactly the duplicate-adjacent-entry state AC5.10 forbids, and it
 * happens on the ordinary guided-navigation path, not an edge case.
 *
 * ── THE GUARD: HISTORY-ENTRY ADJACENCY, NOT "LAST NODE SEEN" ──
 * A ref that merely remembers the last node ever rendered is NOT a sufficient
 * guard: it proves recency, never adjacency. Consider a user who drills
 * Direction -> Area, jumps via a breadcrumb to some other ancestor, and then
 * does something else — "the last node I saw" need not be the entry
 * immediately behind the CURRENT one in the browser's actual history stack.
 *
 * A small log of `{ locationKey, nodeKey }` pairs, one per DISTINCT
 * `location.key` observed, models this instead — see
 * `useAreasNavigationJourney.ts`'s `useHierarchyBackAdjacencyLog` for where
 * that log now lives and why.
 *
 * ── FIX-VERIFY CYCLE 3 — THE LOG IS NO LONGER THIS COMPONENT'S STATE ──
 * This component used to own that log in a local `useRef`. A ref is per
 * component INSTANCE: `DiscoverAreasJourneyPanel` has separate early-return
 * branches for loading/error/no-node, none of which render this component —
 * only the resolved branches do. Every drill-down passes through a loading
 * commit while the new node's resolve/counts fetch is in flight, which
 * UNMOUNTS this component and REMOUNTS it fresh once the node resolves,
 * silently resetting a local ref to `[]` on literally every hop — so the
 * guard always saw an empty log and always chose REPLACE in a real browser,
 * even though the identical guard logic passed every `MemoryRouter` test
 * (those tests never modelled the loading-branch unmount/remount cycle). The
 * log now lives in `useAreasNavigationJourney` — called exactly once per
 * view and never itself unmounted across a navigation — and is passed in here
 * as `historyAdjacencyLog`. This component computes the MECHANISM from that
 * log; it never owns or mutates the log itself.
 *
 * `decideHierarchyBackMechanism` (in `useAreasNavigationJourney.ts`) is the
 * guard's decision function, factored out pure (no React, no DOM) precisely
 * so it can be unit-tested directly against recorded log states.
 *
 * ── FIX-VERIFY CYCLE 4 — THE LOG'S IDENTITY IS THE HISTORY SLOT ──
 * `historyAdjacencyLog` entries are keyed by `window.history.state.idx` (the
 * browser history-stack slot), never `location.key` — an async camera-fit
 * REPLACE (AC5.11) mints a new `location.key` for the SAME slot roughly
 * 650-900ms after every navigation, which a `location.key`-keyed log used to
 * mis-record as a duplicate logical entry, corrupting this exact lookup at
 * real human-reaction-time timing. This component reads the CURRENT slot the
 * same way the log itself does (`readBrowserHistoryIndex`) so both sides
 * observe the identical value for "the slot right now". See
 * `useAreasNavigationJourney.ts`'s module doc for the full defect writeup.
 * What this still CANNOT prove, and what this module does not attempt to
 * unit-test, is the real browser history stack shape after a POP/Forward
 * sequence at real timing — that needs the real-browser E2E pass; see
 * `e2e/discover/issue-1956-pr2-*.spec.ts`.
 *
 * `href` is built by the SAME `buildNodeHref` pure-data path every other
 * navigation affordance uses (never a hand-rolled URL, never a second node
 * key construction site) — this component writes no URL param itself, and
 * that href is what a middle-click/cmd-click/keyboard-new-tab activation
 * falls through to regardless of the POP/REPLACE mechanism choice below.
 */
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import {
  decideHierarchyBackMechanism,
  readBrowserHistoryIndex,
  type HistoryAdjacencyEntry,
} from '@/features/discover/navigation/useAreasNavigationJourney';

export interface HierarchyBackButtonProps {
  /** The ONE resolved navigation node (`useAreasNavigationJourney`'s `node`). */
  node: NavigationNodeResponse | null;
  /** Pure href builder for the canonical parent's node key — `urlActions.buildNodeHref`. */
  buildHref: (nodeKey: string) => string | null;
  /**
   * Fix-verify cycle 3 — the journey-owned history-adjacency log
   * (`useAreasNavigationJourney`'s `historyAdjacencyLog`). This component
   * reads it to decide the POP/REPLACE mechanism only; it never mutates or
   * keeps its own copy — see the module doc for why.
   */
  historyAdjacencyLog: readonly HistoryAdjacencyEntry[];
  className?: string;
}

export function HierarchyBackButton({ node, buildHref, historyAdjacencyLog, className }: HierarchyBackButtonProps) {
  const navigate = useNavigate();

  if (!node || node.ancestry.length === 0) {
    // AC5.7 — the city root (and any node the server reports with no
    // ancestry) has no active hierarchy Back control.
    return null;
  }

  const parent = node.ancestry[node.ancestry.length - 1];
  const href = buildHref(parent.nodeKey);
  if (!href) {
    // Defensive: a malformed/oversized parent key would never be writable
    // anyway (isWritableNodeKey) — render nothing rather than a dead link.
    return null;
  }

  // Fix-verify cycle 4 — the SAME read `useHierarchyBackAdjacencyLog` uses,
  // so this decision and the log's own bookkeeping never observe two
  // different values for "the slot right now".
  const currentHistoryIndex = readBrowserHistoryIndex();
  const mechanism = decideHierarchyBackMechanism(historyAdjacencyLog, currentHistoryIndex, parent.nodeKey);

  return (
    <Link
      to={href}
      // Always the safe fallback for every path except the proven POP below:
      // middle-click/cmd-click/keyboard-new-tab bypass onClick entirely and
      // fall through to this href with `replace` semantics, never a fresh
      // PUSH, regardless of the mechanism decided for a plain activation.
      replace
      onClick={
        mechanism === 'pop'
          ? (event) => {
              // GUARDED conditional POP (hierarchy_back_guarded_pop ruling) —
              // never a blind history.back()/navigate(-1). Reaching this
              // branch means decideHierarchyBackMechanism has already proven
              // the immediately-preceding app-managed history entry IS this
              // exact canonical parent, so a real POP lands on the identical
              // destination `href` points at, while also leaving Area
              // Forward-restorable — a REPLACE here would destroy that.
              event.preventDefault();
              navigate(-1);
            }
          : undefined
      }
      data-testid="areas-hierarchy-back"
      aria-label={`Back to ${parent.displayLabel}`}
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium text-muted-foreground',
        'hover:text-foreground transition-colors rounded',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">Back to {parent.displayLabel}</span>
    </Link>
  );
}
