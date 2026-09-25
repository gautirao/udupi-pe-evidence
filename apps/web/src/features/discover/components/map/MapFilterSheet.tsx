// Issue #2628 — the mobile Map staged filter sheet (design doc MAP_FILTERS_2627.md, § B/D).
//
// STAGED apply semantics (Decision #3): every edit below writes to a LOCAL draft copy of
// `filters` only. Nothing reaches the canonical filter state until "Show N ⟨units⟩" is pressed.
// Cancel / scrim-tap / swipe-down / Esc / browser Back all discard the draft identically, with no
// confirm — reopening always re-seeds the draft from whatever is currently applied, so nothing
// staged-but-uncommitted survives a close.
//
// Renders the SAME `PropertyFilterGroups` presentational component List uses, fed by ITS OWN
// `usePropertyFilterGroups` call against the draft (never a second call against the same
// `filters`/`onFiltersChange` pair — see PropertyFilterGroups.tsx's header on why that would
// split-brain `activeFamily`).
//
// Buy/Rent is NOT part of `PropertyFilters` — it is the page's separate `DiscoverIntent` URL
// state (`nav.intent` / `actions.setIntent`, see DiscoverControlBar.tsx / IntentSelector.tsx). The
// design doc's mf-03 puts Buy/Rent FIRST in this sheet regardless, so it is staged here as its own
// local `draftIntent`, mirroring "the exact List rule" in prose (§7): switching to Rent resets both
// budgets and drops the Residential Plot type, because Plot has no rental inventory contract.
import { useEffect, useRef, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import {
  usePropertyFilterGroups,
  PropertyFilterGroups,
} from '@/components/discover/panels/PropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { computeMapFilterRefinementCount } from './MapFiltersPill';
import { applyIntentTransition } from '@/features/discover/filters/intentTransition';

export interface MapFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Canonical (applied) filters — the draft is (re)seeded from this every time the sheet opens. */
  filters: PropertyFilters;
  /** Writes the draft as the ONE canonical filter state (the existing handleFiltersChange/setFilters path). */
  onApply: (next: PropertyFilters) => void;
  /** Current applied Buy/Rent intent. Optional — defaults to 'buy' where the caller has no intent wiring yet. */
  intent?: DiscoverIntent;
  /** Writes the applied intent alongside `onApply`. Omit where the caller has no intent command to give. */
  onIntentChange?: (intent: DiscoverIntent) => void;
  isCommercialSubtypeSupported?: boolean;
  isReadyToMoveSupported?: boolean;
  /** Result count for the CURRENTLY APPLIED filters — drives the "still shows M ⟨units⟩" status line. */
  appliedResultCount: number;
  /**
   * Live result count for the DRAFT filters, recomputed by the caller as the draft changes. Map's
   * query layer is outside this component's ownership, so this is `null` when the caller has not
   * wired a live recount — the footer then shows a qualitative status only, never a fabricated
   * number (see this file's usage site for the tracked follow-up).
   */
  draftResultCount?: number | null;
  /** e.g. "homes", "commercial properties" — the unit noun for THIS result set. */
  resultUnitNoun?: string;
  /** Schools read-only note (design mf-15) — rendered as a plum banner when supplied. */
  scopeNote?: string;
}

function sameFilters(a: PropertyFilters, b: PropertyFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function MapFilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  intent = 'buy',
  onIntentChange,
  isCommercialSubtypeSupported = true,
  isReadyToMoveSupported = true,
  appliedResultCount,
  draftResultCount = null,
  resultUnitNoun = 'homes',
  scopeNote,
}: MapFilterSheetProps) {
  const [draft, setDraft] = useState<PropertyFilters>(filters);
  const [draftIntent, setDraftIntent] = useState<DiscoverIntent>(intent);
  const wasOpenRef = useRef(false);
  const pushedHistoryRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Re-seed the draft only on the CLOSED→OPEN transition (design doc "reopen": "The draft is
  // seeded from the applied filters, so selections are always preserved"). Re-seeding on every
  // `filters`/`intent` change while open would silently discard an in-progress edit.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(filters);
      setDraftIntent(intent);
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the heading on open (design doc Accessibility: "focus moves to the 'Filters' heading
  // (tabIndex=-1)"), and one history entry per open so browser Back discards the draft like Cancel.
  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    window.history.pushState({ mapFilterSheet: true }, '');
    pushedHistoryRef.current = true;
    const handlePopState = () => {
      pushedHistoryRef.current = false;
      onOpenChange(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftGroups = usePropertyFilterGroups({
    filters: draft,
    onFiltersChange: setDraft,
    intent: draftIntent,
    isReadyToMoveSupported,
    isCommercialSubtypeSupported,
  });
  const { hasPropertyFilters, handleClearPropertyFilters } = draftGroups;

  const hasChanges = !sameFilters(draft, filters) || draftIntent !== intent;
  const canClear = hasPropertyFilters || draftIntent !== intent;
  const refinementCount = computeMapFilterRefinementCount(draft);

  const consumeHistoryEntry = () => {
    if (pushedHistoryRef.current) {
      pushedHistoryRef.current = false;
      window.history.back();
    }
  };

  const handleCancel = () => {
    consumeHistoryEntry();
    onOpenChange(false);
  };

  const handleApply = () => {
    onApply(draft);
    onIntentChange?.(draftIntent);
    consumeHistoryEntry();
    onOpenChange(false);
  };

  // "Clear all" (design Decision #4): draft := DEFAULT_FILTERS with purpose+family kept — the
  // EXISTING `handleClearPropertyFilters` reset rule from PropertyFilterGroups.tsx, reused
  // verbatim rather than reinvented. It is staged (needs Show to take effect) and disabled when
  // there is nothing to clear.
  const handleClearAll = () => {
    handleClearPropertyFilters();
  };

  // Buy/Rent — NOT part of PropertyFilters (see file header). Staged locally; applies the
  // ONE canonical intent-transition rule (Issue #2708) shared with List's `city.ts` setIntent —
  // see intentTransition.ts's header for the rule itself.
  const handleSelectIntent = (nextIntent: DiscoverIntent) => {
    if (nextIntent === draftIntent) return;
    setDraftIntent(nextIntent);
    setDraft((prev) => applyIntentTransition(prev, nextIntent));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DrawerContent
        id="mf-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mf-title"
        className="z-[70] max-h-[calc(100%-88px)]"
        overlayClassName="z-[70]"
        data-testid="map-filter-sheet"
        // Issue #2712 — this sheet is portalled to `document.body` (vaul Drawer, default z-50),
        // as a page-level SIBLING of DiscoverPageShell's `fixed inset-0 z-[60]` mobile-map
        // overlay (see that file — z-[60] is a hard constraint from #1953, never lowered).
        // Neither element is nested inside the other's stacking context, so plain numeric
        // z-index governs paint order between them; z-50 lost to z-60, so vaul's own
        // `pointer-events:none` on `<body>` left taps landing on invisible map chrome instead of
        // this sheet. Raising ONLY this sheet's overlay+content to z-[70] (via the additive
        // `overlayClassName` prop on `DrawerContent`, mirroring `AlertDialogContentProps` from
        // #2471) is sufficient to beat the ENTIRE map subtree regardless of any higher z-indices
        // used internally within that z-60 stacking context (e.g. draw-mode/marker overlays),
        // since those are contained inside it and never compete with page-level siblings.
        // #2628 (live-browser finding) — this sheet is the FIRST nested dialog ever
        // mounted inside the mobile full-screen Map overlay. `useMobileMapOverlayShell`
        // (pre-existing, shared infrastructure) attaches its own unconditional
        // `document.addEventListener('keydown', ...)` Escape handler that closes the
        // WHOLE overlay back to List — it has no concept of a nested dialog owning
        // Escape first. Vaul's Drawer already correctly discards the staged draft on
        // Escape (`onOpenChange(false)` -> `handleCancel()` above), but the same native
        // keydown event then continues bubbling to that document-level listener and
        // closes the entire Map view too — a real, reproducible regression, live-verified:
        // pressing Escape while this sheet was open silently exited mobile Map mode
        // entirely, not just the sheet.
        //
        // `stopPropagation()` here would be simpler but is WRONG: vaul's own
        // Escape-closes-the-drawer handling is ALSO a plain document-level listener (the
        // same category as `useMobileMapOverlayShell`'s), so stopping propagation blocks
        // BOTH the unwanted outer close AND vaul's own intended one, live-verified (the
        // sheet stopped closing on Escape at all). `preventDefault()` is the correct,
        // standard nested-dialog-stack signal instead: it does not stop the event from
        // reaching other listeners (vaul's own handling is unaffected), it only marks the
        // event so an outer layer can choose to defer — which `useMobileMapOverlayShell`'s
        // own Escape handler now does (see that hook's matching comment). This is the
        // conventional pattern Radix's own DismissableLayer uses internally for stacked
        // dialogs; `useMobileMapOverlayShell` predates having any nested dialog to stack
        // against, so it never needed to implement it before.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
          }
        }}
      >
        <DrawerHeader>
          <DrawerTitle
            id="mf-title"
            ref={titleRef}
            tabIndex={-1}
            data-testid="map-filter-sheet-title"
          >
            Filters
          </DrawerTitle>
        </DrawerHeader>

        {scopeNote && (
          <p
            className="mx-4 mb-2 rounded-md border border-plum/30 bg-plum-tint px-3 py-2 text-xs text-plum"
            data-testid="map-filter-sheet-scope-note"
          >
            {scopeNote}
          </p>
        )}

        <div
          className="flex-1 overflow-y-auto [overscroll-behavior:contain]"
          data-testid="map-filter-sheet-body"
        >
          {/* Buy/Rent — first, per mf-03. Mirrors the family-chip styling PropertyFilterGroups
              already uses so the sheet reads as one continuous group stack, not two systems. */}
          <div className="border-b border-border px-4 py-1.5">
            <div
              className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
              data-testid="map-filter-sheet-intent-row"
            >
              <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Looking to
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    'h-11 min-h-[44px] rounded-full px-[14px] text-[13px] font-semibold ' +
                    (draftIntent === 'buy'
                      ? 'border-copper bg-copper text-copper-foreground shadow-sm'
                      : 'border-border bg-card text-[hsl(var(--text-body))]')
                  }
                  onClick={() => handleSelectIntent('buy')}
                  aria-pressed={draftIntent === 'buy'}
                  data-testid="map-filter-sheet-intent-buy"
                >
                  Buy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    'h-11 min-h-[44px] rounded-full px-[14px] text-[13px] font-semibold ' +
                    (draftIntent === 'rent'
                      ? 'border-copper bg-copper text-copper-foreground shadow-sm'
                      : 'border-border bg-card text-[hsl(var(--text-body))]')
                  }
                  onClick={() => handleSelectIntent('rent')}
                  aria-pressed={draftIntent === 'rent'}
                  data-testid="map-filter-sheet-intent-rent"
                >
                  Rent / Lease
                </Button>
              </div>
            </div>
          </div>

          <PropertyFilterGroups
            {...draftGroups}
            filters={draft}
            isCommercialSubtypeSupported={isCommercialSubtypeSupported}
            isReadyToMoveSupported={isReadyToMoveSupported}
          />
        </div>

        <DrawerFooter
          className="gap-2 border-t border-border"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <p
            className="text-center text-xs text-muted-foreground"
            aria-live="polite"
            data-testid="map-filter-sheet-status"
          >
            {!hasChanges
              ? 'These filters are on the map now.'
              : `Not applied yet — the map still shows ${appliedResultCount} ${resultUnitNoun}`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={handleClearAll}
              disabled={!canClear}
              data-testid="map-filter-sheet-clear-all"
            >
              Clear all
            </Button>
            <Button
              type="button"
              className="min-h-[48px] flex-1"
              onClick={handleApply}
              data-testid="map-filter-sheet-apply"
            >
              {draftResultCount != null
                ? `Show ${draftResultCount} ${resultUnitNoun}`
                : `Show ${refinementCount > 0 ? 'filtered' : 'all'} ${resultUnitNoun}`}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
