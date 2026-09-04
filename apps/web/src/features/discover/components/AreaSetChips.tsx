import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/discover/chips/Chip';
import { useDiscoverNav, useDiscoverActions, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { type NearbyAreaCandidate } from '@/hooks/useNearbyAreaCandidates';
import { useAreaSetDraftContext } from '@/features/discover/state/AreaSetDraftContext';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { areaSetProximityLabel, type SelectedAreaGeo } from '@/features/discover/utils/areaSetProximity';

// Matches the panel's own `w-[22rem]` Tailwind class and `1rem` (16px) worth
// of breathing room from the viewport edge — kept as plain px constants
// (rather than reading them off the DOM) so the viewport-edge clamp in the
// positioning effect below can run synchronously in the same layout pass.
const PANEL_WIDTH_PX = 352;
const PANEL_EDGE_MARGIN_PX = 16;
// Mobile-viewport-clip fix (live-browser verification at 390×844, "3 of 3
// selected") — the mobile map surface wraps this component in a
// `fixed inset-0` container, which takes the page out of normal document
// flow: nothing scrolls to reveal content that overflows the viewport below
// this panel's absolute-positioned box. With 3 areas selected, the panel's
// natural height (title block + 3 chips + several candidate cards + notes +
// the bottom "Show N listings" commit bar) measured ~870px tall, well past a
// 390×844 viewport — the commit CTA was completely unreachable. Floor keeps
// the panel from being clamped to something unusably short if the trigger
// sits very low in the viewport.
const PANEL_MIN_HEIGHT_PX = 200;

// Issue #2017 — multi-area AREA_SET draft chip strip + "commit search" CTA.
// Self-contained: reads the committed scope via useDiscoverNav() and calls
// useDiscoverActions().commitAreaSet directly, so it does not need to be
// mounted inside DiscoverControlBar.tsx (whose prop surface is guarded by
// DiscoverControlBar.facadeOnly.test.tsx). Draft add/remove is purely local
// (useAreaSetDraft) — no URL write happens until "Search these areas" is
// clicked, at which point the FULL current draft set commits atomically via
// commitAreaSet(areaKeys, { primaryAreaKey: areaKeys[0] }) — the #2017
// architecture decision that areaKey = the first key in commit order, so a
// single-area commit is byte-for-byte identical to today's selectArea().
//
// Renders null when the draft is empty — there is nothing to show or commit.
export function AreaSetChips() {
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();
  // Code-review Finding 2 (PR #2424) — retained ONLY for labelByKey (selected-chip
  // display names). This hook's warm, shared, city-scoped cache (staleTime 300s,
  // reused by other discover surfaces) is the right source for area name lookups.
  // It is NOT used for suggestions any more — see useNearbyAreaCandidates below,
  // which is filter-aware and bounded by eligible listing count server-side.
  // Node-only URL (no `city=` param, e.g. area-first direct-node navigation)
  // leaves nav.city === '', which would silently disable this fetch — fall
  // back to the established `nav.city || DEFAULT_CITY` idiom.
  const { data } = useDiscoverAreas(nav.city || DEFAULT_CITY);
  const areas = data?.areas ?? [];

  const {
    view: draft,
    commands,
    nearbyFilters,
    data: nearbyData,
    isLoading: suggestionsLoading,
  } = useAreaSetDraftContext();
  const suggestions = nearbyData?.candidates ?? [];

  // Team-lead review (post-#2017 desktop rework) — every non-commit close of
  // this draft (the trigger toggle, Escape, an outside click, "Back to
  // areas", the bottom "Cancel" button) must discard any uncommitted edits
  // via commands.resetToCommitted(), or a reopen would silently inherit an
  // area that was added but never committed. Previously ONLY "Cancel" called
  // closeAreaSetDraft() with an explicit comment that this was deliberate —
  // it was not; see AreaSetDraftCommands.resetToCommitted's doc. Declared
  // this early (ahead of the effects below) so the outside-click/Escape
  // handlers can share it too.
  const handleCancelDraft = () => {
    commands.resetToCommitted();
    shell.closeAreaSetDraft();
  };

  // Team-lead review (2nd pass) — the outside-click effect below installs
  // its `handleClickOutside` listener via useEffect, whose deps are
  // `[suggestOpen, shell.isMobileShell]` (NOT handleCancelDraft). Without
  // this ref, that listener would close over whatever `handleCancelDraft`
  // (and therefore whatever `commands.resetToCommitted`, and therefore
  // whatever committed scope) was current the moment the effect last
  // re-ran — stale as soon as the COMMITTED scope changes while the picker
  // stays open (e.g. commit via "Search these areas" without closing the
  // picker), so a later outside click could reset the draft to an
  // outdated committed scope instead of the current one. A ref updated on
  // every render always reflects the latest closure, independent of the
  // effect's own dependency array — the same fix shape as any
  // "always-current callback" ref pattern, decoupling listener lifetime
  // from callback freshness.
  const handleCancelDraftRef = useRef(handleCancelDraft);
  handleCancelDraftRef.current = handleCancelDraft;

  const [rovingIndex, setRovingIndex] = useState(0);
  // Issue #2017 (owner-directed desktop rework) — the open/closed level now
  // lives in DiscoverShellContext (isAreaSetDraftOpen), shared with the
  // desktop in-panel AreaSetDraftPanel, instead of local-only state. See
  // DiscoverShellContextValue.isAreaSetDraftOpen's doc for why a shared
  // level (not a one-shot request) is required here.
  const suggestOpen = shell.isAreaSetDraftOpen;
  const focusableRefs = useRef<Array<HTMLElement | null>>([]);
  const groupRef = useRef<HTMLDivElement | null>(null);
  // Issue #2017 mobile-popover-unreachable fix, round 2 — the "Add area"
  // suggestions list is a plain, non-portaled absolutely-positioned div (NOT
  // a Radix Popover) so it stays inside this component's own DOM subtree
  // (see the outer wrapperRef doc below for why round 1 of this fix — simply
  // swapping Popover for a plain div nested INSIDE the chip row — was still
  // insufficient).
  //
  // Round 1 fixed the original bug (Radix's PopoverContent portals to
  // document.body at z-50, occluded by DiscoverPageShell.tsx's mobile
  // `fixed inset-0 z-[60]` map wrapper — two `position:fixed` siblings with
  // no shared stacking context). But nesting the replacement div directly
  // inside the chip row below (role="group", `overflow-hidden` so the strip
  // never wraps/grows) meant the dropdown — positioned `absolute top-full`
  // relative to its trigger — rendered entirely below that row's own
  // clipping box. Browsers exclude fully-clipped content from hit-testing,
  // so the dropdown was invisible/unclickable regardless of z-index or
  // pointer-events (confirmed live on mobile via
  // document.elementsFromPoint() at the dropdown's own center: it never
  // appeared in the hit-test stack at all).
  //
  // Fix: this outer `relative` wrapper (wrapperRef) is NOT a descendant of
  // the overflow-hidden row, so the dropdown is rendered as its sibling
  // instead of nested inside the row — only the trigger Button itself stays
  // inside the row (for flex layout). triggerRef + dropdownPos below
  // measure the trigger's on-screen position (relative to this wrapper) so
  // the dropdown still visually anchors under the trigger despite no longer
  // sharing a DOM ancestor with it.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  // Tracks whether focus was already inside this chip group, so the effect
  // below only re-focuses after a chip removal (not on initial mount or
  // unrelated re-renders where focus was never here).
  const hadFocusRef = useRef(false);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    areas.forEach((area) => map.set(area.areaKey, area.name));
    return map;
  }, [areas]);

  // Gap #4 judgment call (see report to lane-2017) — distinguishes "genuinely
  // no nearby areas" from "nearby areas exist but none match the active
  // discover filters" so the empty state can point the user at "Reset
  // filters" instead of implying the area itself has no listings. Derived
  // display logic only (which copy/CTA to show) — the actual filtering
  // happens server-side in useNearbyAreaCandidates.
  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        (nearbyFilters.propertyTypes && nearbyFilters.propertyTypes.length > 0) ||
          (nearbyFilters.bedrooms && nearbyFilters.bedrooms.length > 0) ||
          nearbyFilters.priceMin !== undefined ||
          nearbyFilters.priceMax !== undefined ||
          (nearbyFilters.sellerTypes && nearbyFilters.sellerTypes.length > 0) ||
          (nearbyFilters.boardFilters && nearbyFilters.boardFilters.length > 0) ||
          (nearbyFilters.categoryFilters && nearbyFilters.categoryFilters.length > 0) ||
          nearbyFilters.backOnMarket === true ||
          nearbyFilters.newToMarket === true ||
          nearbyFilters.reraRegistered === true ||
          nearbyFilters.readyToMove === true ||
          nearbyFilters.dateFrom !== undefined ||
          nearbyFilters.dateTo !== undefined,
      ),
    [nearbyFilters],
  );

  // Issue #2017 reskin — geo-center lookup for the currently-selected/draft
  // areas, keyed by areaKey. Used by proximityLabel() below to find each
  // candidate's NEAREST selected area (not just the first/primary one) for
  // the "Adjacent to {name}" vs "{X.X} km away" row label.
  const selectedAreaGeoByKey = useMemo(() => {
    const map = new Map<string, SelectedAreaGeo>();
    areas.forEach((area) => {
      if (draft.draftAreaKeys.includes(area.areaKey)) {
        map.set(area.areaKey, { name: area.name, lat: area.geoCenterLat, lon: area.geoCenterLon });
      }
    });
    return map;
  }, [areas, draft.draftAreaKeys]);

  function proximityLabel(candidate: NearbyAreaCandidate): string {
    return areaSetProximityLabel(candidate, selectedAreaGeoByKey);
  }

  // Issue #2017 fix (truthfulness) — this used to also compute `combinedTotal`
  // (a sum of each selected area's UNFILTERED useDiscoverAreas listingCount)
  // for display on the commit CTA. Removed: it could visibly disagree with
  // the actual filtered result count the shopper lands on after committing.
  // See the CTA's own comment below for the full rationale and the follow-up
  // needed for a real filter-aware, deduplicated number.
  const combinedTotalLabel = draft.draftAreaKeys.map((key) => labelByKey.get(key) ?? key).join(' + ');

  // Re-focus the element now occupying the roving index after a chip is
  // removed — otherwise the removed chip's DOM node unmounts and focus
  // silently falls back to document.body. Only runs if focus was already
  // inside the group (tracked via hadFocusRef, updated by the group's
  // onFocus/onBlur below), so it never steals focus on mount.
  useEffect(() => {
    if (!hadFocusRef.current) return;
    const count = focusableRefs.current.length;
    if (count === 0) return;
    const idx = Math.min(rovingIndex, count - 1);
    focusableRefs.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.draftAreaKeys.length]);

  // Outside-click-to-close for the plain-div suggestions dropdown — mirrors
  // the established local pattern used by CityDropdown/AreaAutocomplete in
  // DiscoverControlBar.tsx (no shared hook exists for this in the repo).
  // Checks both the trigger and the dropdown (no longer a shared DOM
  // ancestor between them — see wrapperRef doc above) so clicking the
  // trigger itself never immediately re-closes what its own onClick just
  // opened.
  useEffect(() => {
    // Issue #2017 (owner-directed desktop rework) — this dropdown only
    // renders on mobile now (`suggestOpen && shell.isMobileShell` below), so
    // this listener must be gated the same way. Without the isMobileShell
    // check, dropdownRef/triggerRef stay null-or-map-scoped on desktop while
    // `suggestOpen` is still true (the shared level also drives the in-panel
    // AreaSetDraftPanel), so ANY click anywhere else in the document —
    // including a click on AreaSetDraftPanel's own "Add" button, a totally
    // separate DOM subtree in the right panel — was treated as "outside" and
    // immediately closed the draft before its own onClick could add the area.
    if (!suggestOpen || !shell.isMobileShell) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      // Team-lead review (2nd pass) — go through the ref, not the closed-
      // over handleCancelDraft, so a committed-scope change while the
      // picker stays open is reflected even though this effect's own deps
      // don't include handleCancelDraft (see handleCancelDraftRef's doc).
      handleCancelDraftRef.current();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [suggestOpen, shell.isMobileShell]);

  // Positions the dropdown under the trigger. Runs synchronously before
  // paint (useLayoutEffect) so there is no visible flash at {0,0}. Recomputes
  // on window resize while open — the chip row can reflow (e.g. orientation
  // change) and shift the trigger's on-screen position.
  //
  // Viewport-edge clamp (reskin gap, found via live browser verification at
  // narrow widths) — the panel's own className already caps its width to
  // `max-w-[calc(100vw-2rem)]`, but the trigger-relative `left` offset was
  // never clamped against that width, so on a wide chip row (e.g. 3 areas +
  // both action buttons) the trigger sits far enough right that the panel
  // rendered up to ~90px past the right edge of the viewport, hiding the
  // "Add" buttons entirely off-screen. Clamps left so the panel's right edge
  // never exceeds `viewport width - PANEL_EDGE_MARGIN_PX`, and its left edge
  // never goes past the same margin on the opposite side.
  useLayoutEffect(() => {
    // Same isMobileShell gate as the outside-click effect above — this
    // positions the mobile-only dropdown, which never mounts on desktop.
    if (!suggestOpen || !shell.isMobileShell) return;
    const updatePosition = () => {
      const wrapperEl = wrapperRef.current;
      const triggerEl = triggerRef.current;
      if (!wrapperEl || !triggerEl) return;
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const triggerRect = triggerEl.getBoundingClientRect();
      const panelWidth = Math.min(PANEL_WIDTH_PX, window.innerWidth - 2 * PANEL_EDGE_MARGIN_PX);
      const maxLeft = window.innerWidth - PANEL_EDGE_MARGIN_PX - panelWidth - wrapperRect.left;
      const minLeft = PANEL_EDGE_MARGIN_PX - wrapperRect.left;
      const desiredLeft = triggerRect.left - wrapperRect.left;
      // Available viewport space (not wrapper-relative — see PANEL_MIN_HEIGHT_PX
      // doc above) below the trigger, clamped to a sane floor so the panel is
      // never made unusably short.
      const maxHeight = Math.max(
        PANEL_MIN_HEIGHT_PX,
        window.innerHeight - triggerRect.bottom - PANEL_EDGE_MARGIN_PX,
      );
      setDropdownPos({
        left: Math.max(minLeft, Math.min(desiredLeft, maxLeft)),
        top: triggerRect.bottom - wrapperRect.top + 4,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [suggestOpen, shell.isMobileShell]);

  if (draft.draftAreaKeys.length === 0) {
    return null;
  }

  // Finding 1 — "Add area" trigger now always renders once >=1 draft chip
  // exists (the guard above already guarantees that here), regardless of
  // suggestions.length — loading/empty async suggestion states are handled
  // inside the dropdown instead of by hiding the trigger.
  const focusableCount = draft.draftAreaKeys.length + 1 + (draft.isDirty ? 1 : 0);
  focusableRefs.current = focusableRefs.current.slice(0, focusableCount);
  const clampedRovingIndex = Math.min(rovingIndex, Math.max(focusableCount - 1, 0));

  const moveFocus = (delta: number) => {
    if (focusableCount === 0) return;
    const next = (clampedRovingIndex + delta + focusableCount) % focusableCount;
    setRovingIndex(next);
    focusableRefs.current[next]?.focus();
  };

  const handleCommit = () => {
    // Code-review Finding 1 (PR #2424) — clamp defensively at commit time too,
    // not just at add() time, so an artificially-oversized draft (e.g. a stale
    // closure, a future bug in a caller) can never commit more than maxAreas.
    const areaKeys = draft.draftAreaKeys.slice(0, draft.maxAreas);
    if (areaKeys.length === 0) return;
    actions.commitAreaSet(areaKeys, { primaryAreaKey: areaKeys[0] });
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        ref={groupRef}
        role="group"
        aria-label="Selected areas"
        className="flex flex-nowrap items-center gap-1.5 overflow-hidden"
        data-testid="area-set-chips"
        onFocus={() => {
          hadFocusRef.current = true;
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            hadFocusRef.current = false;
          }
        }}
      >
        {draft.draftAreaKeys.map((areaKey, idx) => (
          <Chip
            key={areaKey}
            id={areaKey}
            icon={<span className="text-[10px] font-bold leading-none">A</span>}
            label={labelByKey.get(areaKey) ?? areaKey}
            onClear={() => {
              // Capture "was focus in the group" synchronously, before the DOM
              // node is removed. Removing a focused node triggers the browser's
              // native focus-fixup rule (a blur/focusout with relatedTarget
              // null, reverting focus to document.body), which can bubble to
              // the group and flip hadFocusRef to false via onBlur below
              // before this component re-renders. Relying on that live
              // bubbling here would race the fixup and silently defeat the
              // restorative focus effect. jsdom does not implement focus-fixup,
              // so only a real browser reproduces this ordering.
              hadFocusRef.current = groupRef.current?.contains(document.activeElement) ?? false;
              commands.remove(areaKey);
            }}
            testId={`area-set-chip-${areaKey}`}
            dismissTestId={`area-set-chip-${areaKey}-dismiss`}
            tabIndex={clampedRovingIndex === idx ? 0 : -1}
            onFocus={() => setRovingIndex(idx)}
            onArrow={moveFocus}
            chipRef={(el) => {
              focusableRefs.current[idx] = el;
            }}
          />
        ))}

        {(() => {
          const idx = draft.draftAreaKeys.length;
          return (
            <Button
              ref={(el) => {
                focusableRefs.current[idx] = el;
                triggerRef.current = el;
              }}
              variant="outline"
              size="sm"
              className={
                draft.atLimit
                  ? 'h-6 shrink-0 gap-1 rounded-full px-2 text-xs opacity-50'
                  : 'h-6 shrink-0 gap-1 rounded-full border-copper/40 px-2 text-xs text-copper hover:bg-copper-tint hover:text-copper'
              }
              tabIndex={clampedRovingIndex === idx ? 0 : -1}
              onFocus={() => setRovingIndex(idx)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  moveFocus(1);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  moveFocus(-1);
                } else if (e.key === 'Escape' && suggestOpen) {
                  e.preventDefault();
                  handleCancelDraft();
                }
              }}
              aria-label="Add a nearby area"
              aria-haspopup="true"
              aria-expanded={suggestOpen}
              // Finding 1 — aria-disabled (not native disabled) keeps the
              // trigger in the roving-tabindex/focusable sequence even when
              // at the area cap, so keyboard users can still reach it and
              // hear why it's inert via aria-describedby below.
              aria-disabled={draft.atLimit}
              aria-describedby={draft.atLimit ? 'area-set-limit-note' : undefined}
              data-testid="area-set-add-trigger"
              onClick={() => {
                if (draft.atLimit) return;
                if (shell.isAreaSetDraftOpen) {
                  handleCancelDraft();
                } else {
                  shell.openAreaSetDraft();
                }
              }}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add area
            </Button>
          );
        })()}

        {draft.isDirty &&
          (() => {
            const idx = draft.draftAreaKeys.length + 1;
            return (
              <Button
                ref={(el) => {
                  focusableRefs.current[idx] = el;
                }}
                variant="default"
                size="sm"
                className="h-6 shrink-0 gap-1 rounded-full bg-copper px-2.5 text-xs text-copper-foreground hover:bg-copper-hover"
                tabIndex={clampedRovingIndex === idx ? 0 : -1}
                onFocus={() => setRovingIndex(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    moveFocus(1);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    moveFocus(-1);
                  }
                }}
                onClick={handleCommit}
                aria-label={`Search ${draft.draftAreaKeys.length} selected areas`}
                data-testid="area-set-commit-cta"
              >
                <Search className="h-3 w-3" aria-hidden="true" />
                Search these areas
              </Button>
            );
          })()}
      </div>

      {suggestOpen && shell.isMobileShell && (
        // Issue #2017 (owner-directed desktop rework, PR #2424 review) — this
        // floating map-anchored popover is now MOBILE-ONLY. On desktop the
        // owner ruled that the earlier judgment call below (reproducing the
        // mock's right-panel content as a floating overlay, since "there is
        // no dedicated left-map/right-panel layout") was the wrong call:
        // desktop DOES have a real, persistent right panel
        // (DiscoverRightPanel / DiscoverAreasJourneyPanel /
        // NodeListingsSurface), and `AreaSetDraftPanel` now renders this same
        // draft content there in place of `AreaSelectedPanel`. Rendering
        // BOTH here would duplicate the draft UI on screen at once. Mobile
        // keeps this popover because there IS no separate persistent panel
        // there (map and panel share one column) — see the surviving
        // comments below for the rest of the mobile-only rationale.
        //
        // Issue #2017 reskin (design-mock parity pass) — the small suggestion
        // dropdown is expanded into a fuller "draft selection" panel matching
        // the design mock's right-panel structure (title block, chip recap,
        // section header, candidate rows with distance/school copy, bottom
        // combined-total commit bar). Test id kept as
        // `area-set-suggestions-popover` — the outside-click/positioning/
        // Escape-to-close wiring above still targets this same node.
        <div
          ref={dropdownRef}
          className="absolute z-[1100] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none"
          style={{
            left: dropdownPos?.left ?? 0,
            top: dropdownPos?.top ?? 0,
            maxHeight: dropdownPos?.maxHeight,
          }}
          data-testid="area-set-suggestions-popover"
        >
          {/* Breadcrumb (gap #1) — judgment call (flagged to lane-2017): the
              design mock reads "‹ Back to areas in North", naming the current
              map direction/region. Nothing in this component's data surface
              (useDiscoverNav, useAreaSetDraft, useDiscoverAreas) exposes a
              human-readable region/direction name — inventing one here would
              be presentation logic masking a missing data contract, not a
              legitimate derived display value. Renders the honest, scoped-
              down "‹ Back to areas" instead and simply closes the panel
              (there is no separate "areas list" surface to navigate to). */}
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={handleCancelDraft}
            data-testid="area-set-panel-back"
          >
            <span aria-hidden="true">‹</span> Back to areas
          </button>

          {/* Title block — mock: eyebrow "DRAFT SELECTION · N OF max SELECTED",
              heading "Add nearby areas", right-aligned "N of max areas selected". */}
          <div className="mb-3 border-b border-border pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-copper">
              Draft selection · {draft.draftAreaKeys.length} of {draft.maxAreas} selected
            </p>
            <div className="mt-1 flex items-start justify-between gap-2">
              <h3 className="font-serif text-base font-semibold text-foreground">Add nearby areas</h3>
              {/* Reskin fix (visual-parity pass) — mock's EPResultHead renders
                  this as a stacked stat block (large mono number + small
                  muted caption below), not a single inline text line. */}
              <div className="shrink-0 text-right leading-tight">
                <p className="font-mono text-base font-semibold text-foreground">
                  {draft.draftAreaKeys.length} of {draft.maxAreas}
                </p>
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">areas selected</p>
              </div>
            </div>
          </div>

          {/* Chip recap (gap #3) — reuses the same Chip primitive as the
              collapsed strip above, so removing a chip from inside the open
              panel behaves identically to removing it from the strip. Uses
              simplified, non-roving props (single shared tabIndex, no-op
              onFocus/onArrow/chipRef) rather than duplicating the strip's
              full roving-tabindex sequence — Chip's Enter/Backspace/Delete
              keydown handling and the dismiss button's onClick both fire
              onClear() independent of onArrow wiring (see Chip.tsx), so
              this recap is fully keyboard- and mouse-dismissible without it.
              Test ids are namespaced (area-set-panel-chip-*) so they never
              collide with the always-mounted area-set-chip-* nodes in the
              strip behind this panel. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {draft.draftAreaKeys.map((areaKey) => (
              <Chip
                key={areaKey}
                id={areaKey}
                icon={<span className="text-[10px] font-bold leading-none">A</span>}
                label={labelByKey.get(areaKey) ?? areaKey}
                onClear={() => commands.remove(areaKey)}
                testId={`area-set-panel-chip-${areaKey}`}
                dismissTestId={`area-set-panel-chip-${areaKey}-dismiss`}
                tabIndex={0}
                onFocus={() => {}}
                onArrow={() => {}}
                chipRef={() => {}}
              />
            ))}
          </div>

          {/* Section header — mock: "MAXIMUM OF max AREAS REACHED" once at
              cap, right-aligned "N of max selected". */}
          <div className="mb-2 flex items-baseline justify-between gap-2 border-t border-border pt-3">
            <p
              className={
                draft.atLimit
                  ? 'text-[10px] font-semibold uppercase tracking-wide text-copper'
                  : 'text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'
              }
            >
              {draft.atLimit ? `Maximum of ${draft.maxAreas} areas reached` : 'Nearby areas'}
            </p>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {draft.draftAreaKeys.length} of {draft.maxAreas} selected
            </span>
          </div>

          {/* Reskin gap #3 — visible warn-tone notice when at the area cap,
              in addition to (not replacing) the sr-only role="status" note
              at the bottom of this component, which keyboard/SR users still
              rely on via aria-describedby on the "Add area" trigger. */}
          {draft.atLimit && (
            <div
              className="mb-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning-foreground"
              data-testid="area-set-atlimit-notice"
            >
              Maximum of {draft.maxAreas} areas reached — remove one to add another.
            </div>
          )}

          {suggestionsLoading ? (
            <div className="px-1 py-2 text-xs text-muted-foreground" data-testid="area-set-suggestions-loading">
              Loading nearby areas…
            </div>
          ) : suggestions.length === 0 && hasActiveFilters ? (
            // Gap #4 — nearby areas exist but none have a matching listing
            // under the active discover filters. Distinct from the
            // genuinely-no-candidates empty state below so the CTA can point
            // at the actual cause instead of implying the areas are empty.
            // Reskin gap #5 — restyled as a tinted warn-tone EPNote-style pill
            // (mock's EPNote tone="warn" treatment) instead of a bare text row.
            <div
              className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning-foreground"
              data-testid="area-set-suggestions-filtered-empty"
            >
              No area here has a listing that matches your filters.{' '}
              <button
                type="button"
                className="font-medium text-copper underline-offset-2 hover:underline"
                onClick={() => actions.clearAllFiltersAndSearch()}
                data-testid="area-set-suggestions-reset-filters"
              >
                Reset filters
              </button>
            </div>
          ) : suggestions.length === 0 ? (
            // Reskin gap #5 — restyled as a tinted muted-tone EPNote-style pill.
            <div
              className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
              data-testid="area-set-suggestions-empty"
            >
              No nearby areas to suggest
            </div>
          ) : (
            // Reskin gap #1 — candidate rows are now bordered, shadowed
            // rounded-lg cards (mock's `nearby-area-card`) instead of flat
            // hover-only-bordered rows, with a 3-line text stack: name,
            // proximity/adjacency, and a mono-styled counts line.
            <div className="flex flex-col gap-2">
              {suggestions.map((candidate) => (
                <div
                  key={candidate.areaKey}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-primary/40"
                  data-testid={`area-set-suggestion-${candidate.areaKey}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{candidate.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{proximityLabel(candidate)}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {candidate.eligibleListingCount} listings · {candidate.schoolCount} schools
                    </p>
                  </div>
                  {/* Reskin gap #2 — solid primary (navy) button, not copper
                      ghost-text. Copper/rust is now reserved for the eyebrow
                      and the primary "Show N listings" CTA only. */}
                  <Button
                    variant="default"
                    size="sm"
                    className={
                      draft.atLimit
                        ? 'h-7 shrink-0 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground opacity-50'
                        : 'h-7 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                    }
                    // Gap #4 — visually-disabled (not native disabled) so the
                    // row stays keyboard-reachable; the click is guarded so it
                    // no-ops at the cap rather than actually adding.
                    aria-disabled={draft.atLimit}
                    onClick={() => {
                      // Finding 2 — the backend already excludes `selected`
                      // area keys from candidates, and this button no-ops
                      // once draft.atLimit is true, so 'added' is the only
                      // realistic outcome here. commands.add still returns a
                      // discriminated result for defensive callers; this call
                      // site intentionally no-ops on 'duplicate'/'at-limit'
                      // rather than surfacing an error for what should be an
                      // unreachable race.
                      //
                      // Reskin behavior change (flagged to lane-2017): the
                      // panel no longer auto-closes after a single add — the
                      // design mock's reference flow adds MULTIPLE areas
                      // (Nagawara, then Ganganagar) within one open session,
                      // so setSuggestOpen(false) is intentionally NOT called
                      // here any more. The panel only closes via Escape, an
                      // outside click, or the bottom bar's Show/Cancel.
                      if (draft.atLimit) return;
                      commands.add(candidate.areaKey);
                    }}
                    data-testid={`area-set-suggestion-${candidate.areaKey}-add`}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Reskin gap #4 — persistent muted-tone explanatory strip (mock's
              always-present bottom EPNote below the candidate grid). Renders
              regardless of draft.isDirty so it reads correctly the moment
              the panel opens, before anything has changed yet. */}
          <div
            className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground"
            data-testid="area-set-draft-note"
          >
            This is a draft — nothing changes until you press Show listings.
          </div>

          {/* Bottom combined-total commit bar — mock: primary "Show N
              listings" + "Cancel", subtext naming the selected areas. Only
              shown once the draft actually differs from what's committed;
              mirrors the collapsed strip's area-set-commit-cta gating. */}
          {draft.isDirty && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 flex-1 gap-1.5 rounded-full bg-copper text-sm font-semibold text-copper-foreground hover:bg-copper-hover"
                  onClick={() => {
                    handleCommit();
                    shell.closeAreaSetDraft();
                  }}
                  data-testid="area-set-panel-commit-cta"
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                  Show listings
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full text-sm"
                  onClick={handleCancelDraft}
                  data-testid="area-set-panel-cancel"
                >
                  Cancel
                </Button>
              </div>
              <p className="mt-2 truncate text-center text-[11px] text-muted-foreground">
                {/* Issue #2017 fix (truthfulness) — the CTA above USED to read
                    "Show {combinedTotal} listings", where combinedTotal summed
                    each selected area's UNFILTERED useDiscoverAreas(...)
                    listingCount (see the field's own doc a few lines up: "NOT
                    a deduplicated cross-area backend query... out of scope for
                    this presentation-layer reskin"). That number can — and,
                    live-verified, does — disagree with the actual filtered
                    result count the shopper lands on after committing (e.g.
                    "Show 29 listings" committing to a results view that then
                    says "20 shown"). A CTA promising a specific count it
                    cannot back up is worse than one that promises none — the
                    button no longer states a number (see above), and this
                    sub-copy no longer claims "Honest total for X" (a claim
                    that was itself only true when the number happened to
                    agree). It now states only the qualitative, always-true
                    fact this component CAN say honestly: which areas are
                    included. A true filter-aware, deduplicated per-area count
                    would need the backend's existing eligibleListingCount
                    mechanism (already computed for unselected *candidates*
                    via useNearbyAreaCandidates) extended to also cover the
                    *selected* draft areas — flagged as follow-up scope, not
                    done here. */}
                {`Includes ${combinedTotalLabel}`}
              </p>
            </div>
          )}
        </div>
      )}

      {draft.atLimit && (
        // Finding 1 — announces why the "Add area" trigger is inert once the
        // cap is hit. role="status" + aria-live="polite" so screen-reader
        // users hear this without it stealing focus; aria-describedby on the
        // trigger above wires the two together explicitly.
        <span id="area-set-limit-note" role="status" aria-live="polite" className="sr-only">
          Maximum {draft.maxAreas} areas — remove one to add another
        </span>
      )}
    </div>
  );
}
