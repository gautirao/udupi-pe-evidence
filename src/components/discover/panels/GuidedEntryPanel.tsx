import React from 'react';
import { MapPin, SearchX, Compass, X } from 'lucide-react';
import { JourneySwitcher } from '../JourneySwitcher';
import { CitySelect } from '../CitySelect';
import { IntentSelector } from '../IntentSelector';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverSummary } from '@/hooks/useDiscoverSummary';
import { useAreaGroups } from '@/hooks/useAreaGroups';
import { aggregateMacroRegions } from '@/utils/macroRegionResolver';
import { cn } from '@/lib/utils';
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

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground';

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
  const [urlState, urlActions] = useDiscoverUrlState();
  const selectedScope = urlState.scope ?? null;

  const listingPurpose = intent === 'rent' ? 'rent' : 'sale';
  const {
    data: summaryData,
    isLoading: isSummaryLoadingRaw,
    isError: isSummaryError,
  } = useDiscoverSummary({ city, listingPurpose });
  const { data: areaGroupsData, isLoading: isGroupsLoading } = useAreaGroups(city);
  const rawRegions = summaryData?.regions;
  const areaGroups = areaGroupsData?.groups;
  const regions = React.useMemo(
    () => aggregateMacroRegions(rawRegions, areaGroups, summaryData?.totalActiveListings),
    [rawRegions, areaGroups, summaryData?.totalActiveListings]
  );
  const isSummaryLoading = isSummaryLoadingRaw || isGroupsLoading;

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

  // Issue #1808 — marker-accurate aria-live helper mirroring the map
  // guidance-card body (user decision q1: literally accurate, never a
  // withholding phrase). Region label reuses the same `regions` list the
  // cards below already render from — no new data source.
  const selectedRegionLabel =
    regions.find((r) => r.regionKey === selectedScope)?.regionLabel ?? selectedScope ?? '';
  const regionGuideHelperText =
    regionGuideMarkerKind === 'zones'
      ? `${selectedRegionLabel} selected. The map shows this region's zones — choose how you want to continue below.`
      : regionGuideMarkerKind === 'areas'
        ? `${selectedRegionLabel} selected. The map shows this region's areas — choose how you want to continue below.`
        : `${selectedRegionLabel} selected. The map shows an overview of this region — choose how you want to continue below.`;
  const ringClass = regionGuideRingActive
    ? prefersReducedMotion
      ? 'dp-attn-static'
      : 'dp-attn-on'
    : undefined;

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

        {/* Controls: city + Buy/Rent */}
        <div className="mb-8 flex flex-wrap items-end gap-3.5 rounded-xl border border-border bg-card p-4 shadow-sm">
          <label className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <span className={EYEBROW}>City</span>
            <CitySelect
              value={city}
              onChange={onCityChange}
              className="h-11 w-full rounded-md border-border bg-[hsl(var(--input-bg))] px-3.5 text-sm font-semibold text-foreground"
            />
          </label>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <span className={EYEBROW}>Looking to</span>
            <IntentSelector intent={intent} onIntentChange={onIntentChange} hideLabel fill />
          </div>
        </div>

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

        {/* Section B: Journey CTAs — the primary decision.
            Issue #1808 (decision q2 = RING_EXISTING_SECTION) — this is the
            EXISTING "choose how to continue" section; the one-shot copper
            attention ring targets it directly. No new journey-choice row/
            component is added. `key` remounts on a fresh nonce so the ring
            animation replays only on a new region pick, never on re-render. */}
        <div
          key={regionGuideRingActive ? regionGuideNonce : 'static'}
          data-testid="journey-switcher-section"
          className={cn('dp-attn-target', ringClass)}
        >
          {/* Issue #1808 — ring + helper fire together, ONLY on an actual
              map/panel pick (regionGuideRingActive), never on deep-link/
              refresh. The card + legend (mounted elsewhere in MapDiscovery)
              still show on every source, per AC5. */}
          {regionGuideRingActive && (
            <p
              aria-live="polite"
              data-testid="region-guide-helper"
              className="mb-2.5 text-[13px] font-medium text-[hsl(var(--copper))]"
            >
              {regionGuideHelperText}
            </p>
          )}
          <div className="mb-3.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            <Compass className="h-[15px] w-[15px] text-[hsl(var(--copper))]" aria-hidden="true" />
            <span>Choose how you want to search</span>
          </div>

          {/* Journey cards */}
          <JourneySwitcher
            onSelectJourney={onSelectJourney}
            cityLabel={cityLabel}
            totalProperties={totalProperties}
            areasCount={areasCount}
          />
        </div>

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
