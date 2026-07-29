/**
 * AreasBreadcrumbTrail — Issue #1956 PR 2 (Slice 5, AC5.1/AC5.2/AC5.14).
 *
 * The bounded canonical-Areas breadcrumb: City > Direction > Local
 * Destination > Area, 4 items maximum, built from the ONE resolved node's
 * `ancestry` (server-declared, never re-derived) plus the node itself as the
 * terminal, non-linked crumb.
 *
 * ── REUSES THE EXISTING SHELL, NOT A NEW TRUNCATION MECHANISM ──
 * `DiscoverMapBreadcrumb` already provides the container max-width +
 * per-segment `maxWidthClass`/`truncate` mechanism used by the school-journey
 * breadcrumb (`DiscoverMapContextOverlay.tsx`'s `showSchoolBreadcrumb` branch).
 * This component reuses BOTH — a constrained `containerClassName` and a
 * per-crumb `max-w-[140px]` — rather than inventing a second collapse/
 * ellipsis apparatus. `useCollapsedBreadcrumbTrail.ts` does not exist on this
 * branch and must not be recreated (issue #1956 PR-2 forbidden scope).
 *
 * ── EVERY CRUMB IS href XOR current, NEVER href-AND-onClick ──
 * Ancestor crumbs get an `href` built by `buildNodeHref` (the pure,
 * differentially-tested data path shared with every other navigation
 * affordance — this component never constructs a node key or writes a URL
 * param itself). The terminal crumb is `current` and carries no `href` —
 * `DiscoverMapBreadcrumb` renders a plain (non-link) span for it, so it can
 * never double-fire a navigation the way a crumb rendering both `href` and
 * an `onClick` would (the exact prior-art bug this codebase has already hit
 * once: "the user had to press Back twice to undo one click").
 *
 * ── THE 4-ITEM CAP IS A GUARD, NOT A TRUNCATION ──
 * A promoted hierarchy deeper than City > Direction > Local Destination >
 * Area is a SERVER-SIDE invariant violation (#14 — DIRECTION only at depth
 * 0, no node deeper than depth 2). Frontend flattening — silently dropping
 * ancestors to force-fit 4 — is explicitly forbidden: it would hide a real
 * authoring/promotion bug behind a breadcrumb that looks fine and would leave
 * `HierarchyBackButton`'s "canonical parent" pointing at data this component
 * chose to hide. Instead, an over-depth resolution is DETECTED and SURFACED
 * as a distinct, visibly-different notice rather than ever rendered as a
 * normal trail.
 */
import { AlertTriangle, MapPin } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import type { NavigationChildSummary, NavigationNodeResponse } from '@/features/discover/navigation/types';

/** AC5.1 — City > Direction > Local Destination > Area, four items maximum. */
export const AREAS_BREADCRUMB_MAX_ITEMS = 4;

export interface AreasBreadcrumbTrailProps {
  /** The ONE resolved navigation node (`useAreasNavigationJourney`'s `node`). `null` renders nothing. */
  node: NavigationNodeResponse | null;
  /**
   * Pure href builder for an ancestor's node key — `urlActions.buildNodeHref`,
   * passed through unchanged. Never invoked for the terminal (current) crumb.
   */
  buildHref: (nodeKey: string) => string | null;
}

export function AreasBreadcrumbTrail({ node, buildHref }: AreasBreadcrumbTrailProps) {
  if (!node) return null;

  const currentAsSummary: NavigationChildSummary = {
    nodeKey: node.nodeKey,
    nodeType: node.nodeType,
    displayLabel: node.displayLabel,
    displayOrder: 0,
  };
  const chain: NavigationChildSummary[] = [...node.ancestry, currentAsSummary];

  if (chain.length > AREAS_BREADCRUMB_MAX_ITEMS) {
    // Deliberate, actionable diagnostic — no PII/token content.
    console.error(
      `[AreasBreadcrumbTrail] resolved ancestry depth (${chain.length}) exceeds the AC5.1 cap ` +
        `of ${AREAS_BREADCRUMB_MAX_ITEMS} for node "${node.nodeKey}" — this indicates an invalid ` +
        'promoted hierarchy tree server-side, not a frontend rendering choice. The trail is not ' +
        'rendered so a wrong "Back" destination is never silently offered.',
    );
    return (
      <div
        role="alert"
        data-testid="areas-breadcrumb-depth-guard"
        className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>This area&apos;s navigation path is deeper than expected. Please report this.</span>
      </div>
    );
  }

  const segments: DiscoverMapCrumb[] = chain.map((entry, i) => {
    const isCurrent = i === chain.length - 1;
    return {
      key: entry.nodeKey,
      label: entry.displayLabel,
      current: isCurrent,
      emphasis: isCurrent ? 'strong' : 'muted',
      // AC5.2 — the current item is never a link. Every ancestor's href comes
      // from the SAME buildNodeHref data path goToAncestorNode's write would
      // produce (differentially pinned in navigationCommandMatrix.test.ts).
      href: isCurrent ? undefined : (buildHref(entry.nodeKey) ?? undefined),
      // AC5.14 — the existing per-crumb truncation mechanism (max-w + the
      // shell's unconditional `truncate`), not a new collapse apparatus.
      maxWidthClass: 'max-w-[140px]',
    };
  });

  return (
    <DiscoverMapBreadcrumb
      testId="areas-breadcrumb-trail"
      ariaLabel="Areas breadcrumb"
      leadingIcon={MapPin}
      leadingIconClassName="text-[hsl(var(--copper))]"
      // AC5.14 — a bounded container max-width so `truncate` can actually
      // engage (mirrors the school-journey branch's containerClassName;
      // MV-1 found the legacy map-group-breadcrumb branch missing this).
      containerClassName="max-w-[min(88vw,520px)] border-border/60 py-1.5 shadow-md"
      segments={segments}
    />
  );
}
