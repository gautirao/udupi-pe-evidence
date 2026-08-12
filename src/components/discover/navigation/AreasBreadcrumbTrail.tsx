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
 * per-crumb `max-w-[80px]` (Issue #2089 fix cycle 3 tightened the original
 * 140px to 110px against a 390px-viewport-only analysis; fix cycle 4,
 * reviewer REQUEST CHANGES, found even 110px unsafe once the real supported
 * viewport floor (320px, no fixed floor on `min(88vw,520px)`) and OS
 * text-zoom (rem-based chrome grows, this literal px cap does not) are
 * accounted for — tightened again to 80px; see the per-crumb comment below
 * for the arithmetic) — rather than inventing a second collapse/ellipsis
 * apparatus. `useCollapsedBreadcrumbTrail.ts` does not exist on this
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
 *
 * ── FOLLOW-UP (PR #2141) — THE SYNTHETIC CITY ROOT IS NEVER A PERSISTED
 *    ANCESTOR, SO THIS COMPONENT SYNTHESIZES IT ──
 * `node.ancestry` is server-declared and never re-derived — but the server
 * never backs the synthetic city root with a real `NavigationNode` row, so
 * `ancestry` never contains a `root`/`ROOT_NODE_KEY` entry (confirmed against
 * `HierarchyBackButton`'s own AC14 fixture and the #2086 ruling it cites).
 * Building the chain as a plain `[...ancestry, current]` therefore left a
 * DIRECTION node (empty ancestry) rendering as a single, unlinked crumb —
 * trapped below City root with no guided way back up — and left every
 * deeper node's trail one segment short of AC5.1's own "City > Direction >
 * Local Destination > Area" contract. This component now prepends a
 * synthetic City crumb whenever the top of the real chain is not already the
 * root, linking it through the SAME `buildHref` data path every other
 * ancestor crumb uses (never a second URL-construction site) — restoring the
 * bounded 4-item contract exactly as documented above, and giving every
 * non-root node a real, tappable way back to City root without touching
 * `HierarchyBackButton`'s separate, differently-scoped guarded-POP mechanism.
 */
import { AlertTriangle, MapPin } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '@/components/discover/DiscoverMapBreadcrumb';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import type { NavigationChildSummary, NavigationNodeResponse } from '@/features/discover/navigation/types';

/** AC5.1 — City > Direction > Local Destination > Area, four items maximum. */
export const AREAS_BREADCRUMB_MAX_ITEMS = 4;

/**
 * Issue #2089 fix cycle 4 review (MEDIUM) — exported so
 * `DiscoverMapBreadcrumb.twoRowGuarantee.test.tsx` can import and assert
 * against the REAL shipped per-crumb `maxWidthClass`, not a hand-copied
 * literal that could silently drift out of sync with a future edit below
 * (the same "value drifts, nothing catches it" failure mode that let fix
 * cycle 3's unproven 110px ship in the first place). See the per-crumb
 * comment at this constant's own use site (in the `segments` builder below)
 * for the full row-budget arithmetic.
 */
export const AREAS_BREADCRUMB_MAX_WIDTH_CLASS = 'max-w-[80px]';

export interface AreasBreadcrumbTrailProps {
  /** The ONE resolved navigation node (`useAreasNavigationJourney`'s `node`). `null` renders nothing. */
  node: NavigationNodeResponse | null;
  /**
   * Pure href builder for an ancestor's node key — `urlActions.buildNodeHref`,
   * passed through unchanged. Never invoked for the terminal (current) crumb.
   */
  buildHref: (nodeKey: string) => string | null;
  /**
   * Display label for the synthesized City-root crumb (PR #2141 follow-up).
   * Defaults to the literal "City" so existing callers/tests that never pass
   * it keep a sensible (if generic) label; real call sites should pass the
   * resolved city display label (e.g. `CITY_CONFIG[city]?.label ?? city`).
   */
  cityLabel?: string;
}

export function AreasBreadcrumbTrail({ node, buildHref, cityLabel = 'City' }: AreasBreadcrumbTrailProps) {
  if (!node) return null;

  const currentAsSummary: NavigationChildSummary = {
    nodeKey: node.nodeKey,
    nodeType: node.nodeType,
    displayLabel: node.displayLabel,
    displayOrder: 0,
  };
  // The real chain never starts at root (see the module doc above) unless
  // the node itself IS root, or an ancestry entry already happens to carry
  // it (defensive — matches older/synthetic fixtures). Prepend a synthetic
  // City crumb in every other case so the trail always reaches root.
  const topOfChain = node.ancestry[0] ?? null;
  const needsCityCrumb = node.nodeKey !== ROOT_NODE_KEY && topOfChain?.nodeKey !== ROOT_NODE_KEY;
  const cityCrumb: NavigationChildSummary | null = needsCityCrumb
    ? { nodeKey: ROOT_NODE_KEY, nodeType: 'ROOT', displayLabel: cityLabel, displayOrder: -1 }
    : null;
  const chain: NavigationChildSummary[] = [
    ...(cityCrumb ? [cityCrumb] : []),
    ...node.ancestry,
    currentAsSummary,
  ];

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
      //
      // Issue #2089 fix cycle 3 tightened 140px -> 110px against a
      // 390px-viewport-only analysis. Issue #2089 fix cycle 4 (reviewer
      // REQUEST CHANGES on the math itself) — `containerClassName="max-w-[min(88vw,520px)]"`
      // has NO fixed floor: real Android CSS widths commonly report as low
      // as 320-360px, and this container's chrome (padding/icon/gap, all
      // Tailwind `rem`-based classes) grows under OS text-zoom while this
      // `maxWidthClass` stays a literal, non-scaling px value — both shrink
      // the margin fix cycle 3 relied on. VALID ASSUMPTION FOR THIS
      // DERIVATION: viewport width >= 320px (the standard smallest-supported-
      // mobile floor) WITH UP TO ~20% text-zoom (a conservative stand-in for
      // Android/iOS "Larger Text", which commonly reaches 115-130%) applied
      // to every rem-based dimension below (the `vw`-based container width
      // itself is unaffected by text-zoom).
      //
      // Row budget: container = min(0.88*320, 520) = 281.6px, minus the
      // pill's rem-based chrome scaled by 1.2x — `px-3` padding (24px
      // nominal -> 28.8px) and the leading icon `h-3.5 w-3.5` (14px) + its
      // `gap-1.5` (6px) (20px nominal -> 24px) — leaving a per-row budget of
      // 281.6 - 28.8 - 24 = 228.8px. Chevron `h-3.5 w-3.5` = 14px nominal ->
      // 16.8px at 1.2x; `gap-1.5` = 6px nominal -> 7.2px at 1.2x (both the
      // ol's inter-item gap and each li's chevron-to-label gap).
      //
      // 110px is NOT safe against this budget: two 110px segments where the
      // second also carries a chevron overhead: 110 + (16.8+7.2+110) + 7.2
      // (inter-item gap) = 251.2px > 228.8px. 80px clears it with real
      // slack, applying the "any 2 max-width segments fit in a row"
      // sufficient condition uniformly (this component applies ONE
      // `maxWidthClass` to every crumb, including the first — a
      // deliberately conservative choice, since the first crumb actually
      // lacks the chevron overhead the bound assumes):
      // 2 * (16.8 + 7.2 + 80) + 7.2 = 215.2 <= 228.8 (13.6px slack) —
      // guaranteeing any 2 max-width segments fit per row, so all 4 segments
      // here always resolve to <=2 rows even at this cap's worst case (every
      // ancestor label simultaneously long enough to hit 80px). This shrank
      // from fix cycle 3's 110px down to 80px — an expected, accepted
      // tradeoff of correctness over cosmetics at the real supported-
      // viewport floor, not a product-sign-off decision.
      //
      // LOW (fix cycle 4 review) — this arithmetic doesn't separately
      // subtract BASE_CONTAINER's `border border-border` (~2px more of real
      // container width taken up). Not worth its own fix cycle: 13.6px of
      // slack already exists here, so the border is folded into that margin
      // without changing the conclusion.
      maxWidthClass: AREAS_BREADCRUMB_MAX_WIDTH_CLASS,
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
