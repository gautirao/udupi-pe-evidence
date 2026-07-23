import React from 'react';
import { MapPin, SearchX, X } from 'lucide-react';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverRegionSummary } from '@/hooks/useDiscoverRegionSummary';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { TrustStrip } from './_shared';

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
      className="flex-1 overflow-y-auto px-5 py-7 lg:px-11 lg:py-10"
      data-testid="guided-entry-panel"
    >
      <div className="mx-auto max-w-[580px]">
        {/* Eyebrow */}
        <div className="mb-3.5 flex items-center gap-2">
          <MapPin className="h-[15px] w-[15px] text-[hsl(var(--copper))]" aria-hidden="true" />
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Discover {cityLabel}
          </span>
        </div>

        {/* Hero */}
        {/* Issue #1817 (AC8) — id + tabIndex=-1 so "Start over" can programmatically
            move focus here after a reset (design §8: "focus moves to the panel's h1
            so keyboard users land somewhere sensible"). Not in the natural tab order —
            only reachable via the imperative .focus() call. */}
        <h1
          id="discover-panel-h1"
          tabIndex={-1}
          className="mb-3.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground lg:text-[40px] focus:outline-none"
        >
          Find your place in {cityLabel}, your way.
        </h1>
        <p className="mb-3 max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground lg:text-[16.5px]">
          Browse verified properties across {cityLabel}. Pick how you&rsquo;d like to
          start — by neighbourhood, by school, or by farmland.
        </p>
        <p className="mb-4 text-[13px] text-muted-foreground">
          {intent === 'buy'
            ? 'Showing sale prices in ₹ across every journey.'
            : 'Showing monthly rents in ₹ — same properties, reworded for renting.'}
        </p>

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

        {/* Section C: Macro regions — secondary "or start with a region" */}
        <div className="my-8 h-px w-full bg-border" />

        <div aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between">
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
          <p className="mb-4 text-[13.5px] leading-relaxed text-muted-foreground">
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
              className="flex flex-col gap-3"
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
                    className={`group flex items-center justify-between gap-3.5 rounded-xl border-[1.5px] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? 'border-[hsl(var(--copper))] bg-[hsl(var(--copper)/0.08)] shadow-sm'
                        : 'border-border bg-card hover:border-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <span
                        className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-[hsl(var(--copper))] text-white'
                            : 'bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground'
                        }`}
                      >
                        <MapPin className="h-[20px] w-[20px]" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-bold tracking-tight text-foreground truncate">
                          {region.regionLabel}
                        </h3>
                        <div className="mt-0.5 text-[13px] text-muted-foreground truncate">
                          {cue}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <div className="font-mono text-[17px] font-bold text-foreground leading-none">
                          {region.listingCount.toLocaleString()}
                        </div>
                        <div className="mt-1 text-[11.5px] font-medium text-muted-foreground">
                          {region.listingCount === 1 ? 'property' : 'properties'}
                        </div>
                      </div>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        isSelected ? 'bg-[hsl(var(--copper))] text-white' : 'text-muted-foreground group-hover:bg-secondary group-hover:text-foreground'
                      }`}>
                        <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Trust strip */}
        <TrustStrip className="mt-8 pt-6 border-t border-border" />
      </div>
    </div>
  );
}
