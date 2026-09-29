import type { ComponentProps, ReactNode } from 'react';
import { JourneySwitcher } from '@/components/discover/JourneySwitcher';
import { JourneySummaryStrip } from '@/components/discover/JourneySummaryStrip';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';

type JourneySwitcherProps = ComponentProps<typeof JourneySwitcher>;

export interface DiscoverJourneyPanelShellProps
  extends Pick<
    JourneySwitcherProps,
    | 'activeJourney'
    | 'compact'
    | 'cityLabel'
    | 'totalProperties'
    | 'areasCount'
    | 'prefersReducedMotion'
    | 'onSelectJourney'
  > {
  /** `data-testid` on the shell root — the only thing that differs structurally between journeys. */
  testId: string;
  /**
   * The real 820px `matchMedia` flag (Issue #2108), received as a PROP rather
   * than read from `useDiscoverShell()` — see
   * `__tests__/panelAmbientContext.guard.test.ts` for why no file under
   * `surfaces/panel/**` may reach into the Discover context facade.
   */
  isMobileShell: boolean;
  /** Single computed source (useDiscoverPageContext), threaded through the caller's `view.pageContext` — never re-derived here. */
  hostsHeaderControls: boolean;
  /** Single computed source (useDiscoverPageContext) — whether the header actually RENDERS journey tabs (`hostsHeaderControls` minus an unresolved admin preview). Gates the switcher/summary-strip; `hostsHeaderControls` alone still gates the control bar (it stays in the header regardless of preview resolution). */
  headerHostsJourneyTabs: boolean;
  /** The journey's own panel content, rendered inside the bounded scroll wrapper. */
  children: ReactNode;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — the canonical journey panel SHELL,
 * extracted from the two byte-identical copies that lived inline in
 * `DiscoverPanelSurface.tsx`'s area-first and school-first branches.
 *
 * Every class string below is MOVED VERBATIM. The two breakpoint-scoped
 * divergences from the legacy `DiscoverRightPanel` root are load-bearing and
 * are covered by their own assertions in the panel test suite — the original
 * Issue #2084 rationale follows unchanged:
 *
 * Issue #2084 — panel SHELL + persistent JourneySwitcher restore. Wrapped
 * ONCE around the whole journey panel invocation (never per-branch inside that
 * panel), so the shell/switcher are state-invariant across all four area-first
 * panel states (AC1). Mirrors the legacy `DiscoverRightPanel` root
 * (DiscoverRightPanel.tsx:1713-1794) — SAME desktop width class +
 * switcher-then-content DOM order (R6) — with TWO deliberate breakpoint-scoped
 * divergences, per the handoff's R1 stop_condition and its code-review fix
 * cycle 1: `lg:order-2` ONLY, never a bare `order-2` (the legacy root carries
 * both; at mobile widths the bare one would apply and invert this journey's
 * CURRENT, must-remain list-before-map mobile ordering into map-before-list);
 * and `lg:h-full` ONLY (paired with the existing `lg:border-l`), never a bare
 * `h-full` — the legacy root has NO height class at any breakpoint, and a bare
 * `h-full` here would give this shell a mobile flex-basis equal to the full
 * mobile shell height, starving the `h-64` map of most of its space under
 * flex-shrink. `min-h-0` (unprefixed) is additionally new versus the legacy
 * root, but is safe at every breakpoint — it only clears the default
 * min-height:auto floor, it never forces a size — and is what lets the desktop
 * `lg:h-full` + `overflow-hidden` pairing actually bound the inner
 * `overflow-y-auto` wrapper below (R5).
 */
export function DiscoverJourneyPanelShell({
  testId,
  isMobileShell,
  hostsHeaderControls,
  headerHostsJourneyTabs,
  activeJourney,
  compact,
  cityLabel,
  totalProperties,
  areasCount,
  prefersReducedMotion,
  onSelectJourney,
  children,
}: DiscoverJourneyPanelShellProps) {
  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden bg-background lg:order-2 lg:h-full lg:w-1/2 lg:border-l lg:border-border"
      data-testid={testId}
    >
      {/* R6 — the switcher mounts FIRST, above panel content, matching the
          legacy shell's own tab order (DiscoverRightPanel.tsx:1723) so
          area-first inherits the identical keyboard focus order its
          sibling journeys already have. The border-b here is also AC7's
          divider rule separating the switcher block from the list below. */}
      <div className="flex flex-col gap-3 shrink-0 border-b border-border px-4 pb-2 pt-4">
        {/* Only when the header doesn't have room for its own copy (mobile, or a desktop width below the header's threshold). Keyed on hostsHeaderControls (not headerHostsJourneyTabs): the control bar stays in the header even while an unresolved preview suppresses the header's journey tabs. */}
        {!isMobileShell && !hostsHeaderControls && <DiscoverControlBar hostsHeaderControls={hostsHeaderControls} />}
        {/* The header is the sole journey selector (including the full-card city-root density) whenever it actually RENDERS the journey tabs; the panel falls back to its own copy below that width, or while an admin city-launch preview leaves the header's tabs suppressed — see useDiscoverPageContext.ts's headerHostsJourneyTabs doc comment. */}
        {!headerHostsJourneyTabs && (
          <JourneySwitcher
            compact={compact}
            activeJourney={activeJourney}
            onSelectJourney={onSelectJourney}
            cityLabel={cityLabel}
            totalProperties={totalProperties}
            areasCount={areasCount}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
        {/* The header hosting the switcher does not host the summary strip too (no room, and it isn't a selector) — restore it here alone, in the exact spot and density condition (non-compact / city-root) the hidden switcher would have shown it. Keyed on headerHostsJourneyTabs: while an unresolved preview suppresses the header's tabs the switcher above is shown instead, so this standalone strip must stay hidden (its content already lives inside that switcher). */}
        {headerHostsJourneyTabs && !compact && activeJourney && (
          <JourneySummaryStrip
            journey={activeJourney}
            totalProperties={totalProperties}
            areasCount={areasCount}
          />
        )}
      </div>
      {/* R5 — a bounded scroll container for the panel states whose own
          root is still a bare `p-4` div with no scroll ancestry of its own
          (loading/error/cluster-focus/empty/children-list). The AREA-leaf
          branch (`AreaLeafListingsSurface`) already owns its own
          `h-full ... overflow-hidden` root + internal `overflow-y-auto`
          scrolling (DiscoverAreasJourneyPanel.tsx) — nesting it inside this
          bounded flex item does not change that: its `h-full` resolves
          against this wrapper's bounded content-box and it remains the
          actual scroll owner, so this outer `overflow-y-auto` stays inert
          (no double scrollbar) for that branch.

          DESKTOP: boundedness comes from the shell root's `lg:h-full` +
          `overflow-hidden` above, so this wrapper scrolls against a real
          fixed height, exactly as intended.

          MOBILE (code-review fix cycle 1): the shell root no longer
          carries a bare `h-full`, so on mobile it has no explicit height
          of its own — identical to the pre-#2084 area-first panel root
          (a bare `p-4` div with no height class). This wrapper's
          `flex-1 overflow-y-auto` then resolves against whatever natural
          (content-driven) height the shell ends up with in the mobile
          column flex layout, same as before this shell existed — no new
          scroll dead-zone and no double scrollbar versus today. */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
