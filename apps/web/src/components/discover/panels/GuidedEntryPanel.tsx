import React from 'react';
import { ChevronRight, MapPin, SearchX, X } from 'lucide-react';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverRegionSummary } from '@/hooks/useDiscoverRegionSummary';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { PanelEyebrow, TrustStrip } from './_shared';

interface GuidedEntryPanelProps {
  onSelectJourney: (journey: DiscoverJourney) => void;
  city: string;
  onCityChange: (city: string) => void;
  intent: DiscoverIntent;
  onIntentChange: (intent: DiscoverIntent) => void;
  /** City-wide live property total (sum of per-area listingCount). */
  totalProperties: number;
  /** Number of areas with at least one listing. */
  areasCount: number;
  /**
   * Issue #1588 follow-up — true when the selected city has loaded and has zero
   * live properties. Drives a calm empty-state notice (no fabricated markers/copy).
   * Defaults false so the notice never flashes while areas are still loading.
   */
  isCityEmpty?: boolean;
  /**
   * Issue #1808 — true only when the region-overview state is active, not
   * dismissed, AND the pick came from an actual map/panel click (never
   * deep-link/refresh). Gates BOTH the aria-live helper and the one-shot
   * ring on the EXISTING JourneySwitcher section (no new journey-choice
   * row/component — user decision q2).
   */
  regionGuideRingActive?: boolean;
  /** Issue #1808 q1 — marker-accurate zones/areas variant for the helper copy. */
  regionGuideMarkerKind?: RegionOverviewMarkerKind;
  /** Issue #1808 — bumped per fresh region selection; keys the ring so it replays only on a new pick. */
  regionGuideNonce?: number;
  /** Issue #1808 §8 — suppresses the ring pulse, replaced by a static ring. */
  prefersReducedMotion?: boolean;
  /** Issue #1808 — fired when a region card is selected (not deselected), arming the pulse with source='panel'. */
  onRegionSelectFromPanel?: () => void;
}

function getMacroRegionCue(regionKey: string, regionLabel: string, cityLabel: string): string {
  const key = regionKey.toLowerCase();
  const label = regionLabel.toLowerCase();
  if (key.includes('north') || label.includes('north')) return 'Northern neighbourhoods & growth corridors';
  if (key.includes('east') || label.includes('east')) return 'Eastern neighbourhoods & commute corridors';
  if (key.includes('south') || label.includes('south')) return 'Established residential neighbourhoods';
  if (key.includes('west') || label.includes('west')) return 'Western communities & transit links';
  if (key.includes('central') || label.includes('central') || label.includes('centre')) return 'City core & business district';
  if (key.includes('university') || label.includes('university')) return 'Academic institutions & student living';
  if (key.includes('coastal') || label.includes('coastal') || label.includes('beach')) return 'Beachfront & coastal properties';
  return `Explore verified properties across ${cityLabel}`;
}

/**
 * Public Discover landing — the journey-selection entry (Issue #1588), rebuilt to the
 * approved ReTrends mock: eyebrow + Fraunces hero + City/Buy-Rent controls card +
 * macro-region cards + "Three ways to search" + three rich journey cards +
 * verification trust strip.
 *
 * Behaviour-preserving reskin: city + intent are the existing URL-state controls,
 * threaded down from MapDiscovery; no new routing or journey behaviour.
 *
 * Issue #1745 P7/P8 — macro-region cards below the controls card are sourced from
 * `useDiscoverSummary` (backend-owned counts only; no client-side aggregation).
 * Selecting a card writes `scope=<regionKey>` via `setScope` (a landing-level
 * refinement selection only — see scope semantics note below); the summary query
 * failing or returning zero regions degrades gracefully and never blocks the three
 * journey cards or the rest of the landing.
 *
 * Scope semantics (Issue #1745 P8): `scope=` affects ONLY (a) this card grid's
 * selected/highlighted visual state, (b) URL persistence of the selection, (c) the
 * clear/deselect affordance below, and (d) context passed into journey entry links.
 * It does NOT filter the area/school/agri result panels downstream, and it is NOT a
 * 4th selectable journey.
 */
export function GuidedEntryPanel({
  onSelectJourney,
  city,
  onCityChange,
  intent,
  onIntentChange,
  totalProperties,
  areasCount,
  isCityEmpty = false,
  regionGuideRingActive = false,
  regionGuideMarkerKind = null,
  regionGuideNonce = 0,
  prefersReducedMotion = false,
  onRegionSelectFromPanel,
}: GuidedEntryPanelProps) {
  const cityLabel = CITY_CONFIG[city]?.label ?? CITY_CONFIG[DEFAULT_CITY].label;
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade
  // instead of calling useDiscoverUrlState() directly (state plumbing only;
  // see team-lead-plan.toml decisions.D1_facade.sole_caller).
  const urlState = useDiscoverNav();
  const urlActions = useDiscoverActions();
  const selectedScope = urlState.scope ?? null;

  // Issue #1882 (Track A PR2 Slice S2c) — region cards now sourced directly
  // from the backend-owned region-summary rollup (GET
  // /api/discover/cities/{citySlug}/regions), REPLACING the client-side
  // aggregateMacroRegions derivation (summary regions + area-group
  // region_label string matching). No client-side aggregation remains.
  //
  // ADVISORY-1 rework — reuse the SAME intent→listingPurpose mapping this
  // panel already used for the old useDiscoverSummary call ('buy' maps to
  // 'sale'; never sent as 'buy'), so region cards display purpose-filtered
  // totals instead of the combined buy+rent count.
  const listingPurpose = intent === 'rent' ? 'rent' : 'sale';
  const {
    data: regionSummaryData,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useDiscoverRegionSummary(city, listingPurpose);
  const regions = React.useMemo(
    () =>
      (regionSummaryData?.regions ?? []).map((r) => ({
        regionKey: r.key,
        regionLabel: r.label,
        listingCount: r.listingCount,
      })),
    [regionSummaryData],
  );

  const handleRegionClick = (regionKey: string) => {
    const isDeselecting = selectedScope === regionKey;
    urlActions.setScope(isDeselecting ? null : regionKey);
    // Issue #1808 — arm the region-overview guidance pulse only when actually
    // SELECTING a region (not the toggle-off/deselect branch). Does not
    // change the setScope call above (regression-guarded state contract).
    if (!isDeselecting) {
      onRegionSelectFromPanel?.();
    }
  };
  const handleClearScope = () => urlActions.setScope(null);

  // Issue #1808 helper-text/ring derivation REMOVED in #1953 build step 6 —
  // moved to JourneySwitcher.tsx (regionGuideHelperText is now computed by
  // DiscoverRightPanel, the persistent mount's caller) alongside the ring
  // logic, since the journey-switcher-section this fed no longer renders
  // here. regionGuideMarkerKind/regionGuideRingActive/regionGuideNonce/
  // prefersReducedMotion remain unused props on this component now (dead
  // weight from the relocation) — left in place per this step's "no other
  // change to GuidedEntryPanel" constraint rather than trimming the prop
  // surface here.

  return (
    <div
      className="flex-1 overflow-y-auto scrollbar-hide px-5 py-7 lg:px-11 lg:py-5"
      data-testid="guided-entry-panel"
    >
      <div className="mx-auto max-w-[580px]">
        {/* Issue #2108 (shell fix) — eyebrow + heading now reuse the SAME
            compact pattern the area-first ROOT state uses
            (NavigationLevelPanel's isCityRoot branch: uppercase eyebrow +
            a single Fraunces `text-xl` question, no descriptive paragraph
            underneath). Replaces the previous 40px hero + two paragraphs of
            copy so the macro-region rows below fit without scrolling at
            1440x900 (VISUAL_RULES.md / approved-mock parity) — this is a
            copy/layout change only; region-click, Clear, aria-pressed and
            the region list itself are unchanged below. `PanelEyebrow` is the
            existing shared component this exact "Discover {city}" row was
            already extracted into (previously unused here). */}
        <PanelEyebrow icon={MapPin} label={`Discover ${cityLabel}`} className="mb-1" />
        {/* Issue #1817 (AC8) — id + tabIndex=-1 so "Start over" can programmatically
            move focus here after a reset (design §8: "focus moves to the panel's h1
            so keyboard users land somewhere sensible"). Not in the natural tab order —
            only reachable via the imperative .focus() call. */}
        <h1
          id="discover-panel-h1"
          tabIndex={-1}
          className="mb-2 font-['Fraunces',_ui-serif,_Georgia,_serif] text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground focus:outline-none"
        >
          Where do you want to explore?
        </h1>

        {/* Controls card — REMOVED (product-owner ruling, #1953 follow-up).
            City was already removed from this card in build step 6, leaving
            Buy/Rent as its only occupant; now that Buy/Rent is ALSO removed
            (the persistent DiscoverControlBar is the SOLE Buy/Rent control
            on /discover, same ownership rationale as the prior city
            removal), the card has nothing left to hold and is retired with
            it rather than left as an empty bordered "Looking to" box.
            `intent`/`onIntentChange` remain accepted (now JSX-unused) props
            — kept threaded through unchanged, mirroring the existing
            `onCityChange` convention on this exact component, so no
            prop-interface churn ripples into DiscoverRightPanel /
            DiscoverRightPanelContainer for this file. */}

        {/* Empty-state notice */}
        {isCityEmpty && (
          <div
            data-testid="guided-entry-empty-state"
            className="mb-8 flex items-start gap-3.5 rounded-xl border border-border bg-muted/40 p-4"
          >
            <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg bg-card shadow-sm">
              <SearchX className="h-[20px] w-[20px] text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[14.5px] font-semibold text-foreground">
                No properties in {cityLabel} yet
              </p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">
                Try another city above, or check back soon as new listings are added.
              </p>
            </div>
          </div>
        )}

        {/* Section B: Journey CTAs — REMOVED in #1953 build step 6 (AC27, A1
            retirement). The rich journey cards (previously duplicated here
            AND rendered nowhere persistently) now mount ONCE, persistently,
            in DiscoverRightPanel (see JourneySwitcher.tsx), so mode selection
            is reachable at every panel state, not just this bare landing.
            The #1808 attention ring + aria-live helper moved with it, onto
            the tablist container in JourneySwitcher.tsx — never per-tab. This
            panel's own regionGuideRingActive/regionGuideMarkerKind/
            regionGuideNonce/prefersReducedMotion/onRegionSelectFromPanel
            props are otherwise UNCHANGED (still drive the macro-region cards'
            onRegionSelectFromPanel wiring below) — no other change to this
            component. */}

        {/* Section C: Macro regions — secondary "or start with a region".
            Issue #2108 follow-up (scroll-overflow fix) — divider margin
            shrunk further (my-5 → my-2), one of several spacing cuts across
            this component (container lg:py-10 → lg:py-5, heading/eyebrow/
            subtitle margins, region-row gap, trust-strip margins) that
            together close the measured overflow: guided-entry-panel
            scrollHeight was 714 vs clientHeight 606 at 1440x900 before this
            pass; both are 576 (zero overflow) after. */}
        <div className="my-2 h-px w-full bg-border" />

        <div aria-live="polite">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              <MapPin className="h-[15px] w-[15px] text-[hsl(var(--copper))]" aria-hidden="true" />
              <span>Or start with a region</span>
            </div>
            <div className="flex items-center gap-3">
              {!isSummaryLoading && !isSummaryError && regions.length > 0 && (
                <span className="text-[13px] font-medium text-muted-foreground">
                  {regions.length} {regions.length === 1 ? 'region' : 'regions'}
                </span>
              )}
              {selectedScope && (
                <button
                  type="button"
                  onClick={handleClearScope}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
          </div>
          <p className="mb-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Prefer to narrow by part of the city first? Pick a region to scope the map, then choose how to search inside it.
          </p>

          {isSummaryLoading && (
            <div
              data-testid="guided-entry-regions-loading"
              className="flex flex-col gap-3"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
          )}

          {!isSummaryLoading && isSummaryError && (
            <div
              data-testid="guided-entry-regions-error"
              className="rounded-xl border border-border bg-muted/30 p-4 text-[13.5px] text-muted-foreground"
            >
              Area counts are unavailable right now — you can still search {cityLabel} above.
            </div>
          )}

          {!isSummaryLoading && !isSummaryError && regions.length > 0 && (
            <div
              data-testid="guided-entry-regions-grid"
              className="flex flex-col gap-1.5"
            >
              {regions.map((region) => {
                const isSelected = selectedScope === region.regionKey;
                const cue = getMacroRegionCue(region.regionKey, region.regionLabel, cityLabel);
                return (
                  <button
                    key={region.regionKey}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleRegionClick(region.regionKey)}
                    // Issue #2108 (shell fix) — row grammar matched to the
                    // SAME compact density NavigationChildCard.tsx already
                    // uses for the area-first ROOT state's destination rows
                    // (icon tile · name + right-aligned stat on one line ·
                    // secondary caption below · trailing chevron), so five
                    // region rows fit without scrolling at 1440x900. Click
                    // handler, aria-pressed and the region list/selection
                    // logic above are unchanged — this is a classNames-only
                    // row-density change.
                    className={`group flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected ? 'border-[hsl(var(--copper))] ring-1 ring-[hsl(var(--copper))] bg-[hsl(var(--copper)/0.08)]' : 'border-border'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${
                        isSelected ? 'bg-[hsl(var(--copper))] text-white' : 'bg-secondary text-foreground'
                      }`}
                      aria-hidden="true"
                    >
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {region.regionLabel}
                        </span>
                        {/* Count and unit stay two DISTINCT text nodes (not
                            concatenated into one string) — GuidedEntryPanel.regionGuide.test.tsx
                            asserts on the bare count via getByText('12'). */}
                        <span className="shrink-0 whitespace-nowrap flex items-baseline gap-1">
                          <span className="text-sm font-mono font-bold text-foreground">
                            {region.listingCount.toLocaleString()}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground">
                            {region.listingCount === 1 ? 'property' : 'properties'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{cue}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Trust strip — reassurance band below the region cards (VISUAL_RULES.md
            §"Trust strip": belongs below city-level region cards). Issue #2108
            follow-up — mt-8 pt-6 shrunk to mt-2 pt-2 to reclaim vertical budget;
            the strip itself is kept (mock spec calls for it here), the fix is
            in the surrounding spacing, not removal. */}
        <TrustStrip className="mt-2 pt-2 border-t border-border" />
      </div>
    </div>
  );
}
