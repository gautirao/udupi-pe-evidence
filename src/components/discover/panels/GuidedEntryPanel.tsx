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
}

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground';

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
}: GuidedEntryPanelProps) {
  // Display name for the selected city, sourced from the shared CITY_CONFIG registry
  // (single source of truth — no parallel city list). Falls back to the DEFAULT_CITY
  // label when the slug is empty/unknown so copy never renders a blank city name.
  const cityLabel = CITY_CONFIG[city]?.label ?? CITY_CONFIG[DEFAULT_CITY].label;

  // Issue #1745 P8 — own URL-state instance for the scope axis only (city/intent stay
  // props from the parent, which owns the single source of truth for those). Reading
  // the full useDiscoverUrlState here mirrors the established pattern of independent
  // per-panel instances (see SchoolsInAreaPanel, SchoolJourneyPanels).
  const [urlState, urlActions] = useDiscoverUrlState();
  const selectedScope = urlState.scope ?? null;

  // Issue #1745 P7 — listingPurpose is a SEPARATE filter from propertyType (never
  // conflated — matches the backend SummaryQuery contract). Buy maps to "sale".
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
    urlActions.setScope(selectedScope === regionKey ? null : regionKey);
  };
  const handleClearScope = () => urlActions.setScope(null);

  return (
    <div
      className="flex-1 overflow-y-auto px-5 py-7 lg:px-11 lg:py-10"
      data-testid="guided-entry-panel"
    >
      <div className="mx-auto max-w-[560px]">
        {/* Eyebrow */}
        <div className="mb-3.5 flex items-center gap-2">
          <MapPin className="h-[15px] w-[15px] text-[hsl(var(--copper))]" aria-hidden="true" />
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Discover {cityLabel}
          </span>
        </div>

        {/* Hero */}
        <h1 className="mb-3.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground lg:text-[40px]">
          Find your place in {cityLabel}, your way.
        </h1>
        <p className="mb-6 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground lg:text-[16.5px]">
          Browse verified properties across {cityLabel}. Pick how you&rsquo;d like to
          start — by neighbourhood, by school, or by farmland.
        </p>

        {/* Controls: city + Buy/Rent */}
        <div className="mb-2.5 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-3.5 shadow-sm">
          <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <span className={EYEBROW}>City</span>
            <CitySelect
              value={city}
              onChange={onCityChange}
              className="h-11 w-full rounded-md border-border bg-[hsl(var(--input-bg))] px-3 text-sm font-semibold text-foreground"
            />
          </label>
          <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
            <span className={EYEBROW}>Looking to</span>
            <IntentSelector intent={intent} onIntentChange={onIntentChange} hideLabel fill />
          </div>
        </div>
        <p className="mb-6 pl-0.5 text-[12.5px] text-muted-foreground">
          {intent === 'buy'
            ? 'Showing sale prices in ₹ across every journey.'
            : 'Showing monthly rents — same properties, reworded for renting.'}
        </p>

        {/* Empty-state notice — shown only when the selected city has loaded with zero
            live properties. Honest, calm, city-aware; the journey cards stay below so
            farmland/school journeys remain reachable and the city switcher above lets
            the user pick another city. */}
        {isCityEmpty && (
          <div
            data-testid="guided-entry-empty-state"
            className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-card">
              <SearchX className="h-[19px] w-[19px] text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-foreground">
                No properties in {cityLabel} yet
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                Try another city above, or check back soon as new listings are added.
              </p>
            </div>
          </div>
        )}

        {/* Macro-region cards (Issue #1745 P7/P8) — backend-owned counts from
            useDiscoverSummary. Landing-level refinement only: selecting a card sets
            `scope=` (highlight + URL persistence), never filters downstream panels. */}
        <div aria-live="polite">
          {isSummaryLoading && (
            <div
              data-testid="guided-entry-regions-loading"
              className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-[64px] rounded-lg" />
              ))}
            </div>
          )}

          {!isSummaryLoading && isSummaryError && (
            <p
              data-testid="guided-entry-regions-error"
              className="mb-6 text-[12.5px] text-muted-foreground"
            >
              Area counts are unavailable right now — you can still search {cityLabel} below.
            </p>
          )}

          {!isSummaryLoading && !isSummaryError && regions.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <span className={EYEBROW}>Popular areas in {cityLabel}</span>
                {selectedScope && (
                  <button
                    type="button"
                    onClick={handleClearScope}
                    className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Clear
                  </button>
                )}
              </div>
              <div
                data-testid="guided-entry-regions-grid"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
              >
                {regions.map((region) => {
                  const isSelected = selectedScope === region.regionKey;
                  return (
                    <button
                      key={region.regionKey}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleRegionClick(region.regionKey)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[hsl(var(--copper))] bg-[hsl(var(--copper)/0.08)]'
                          : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <span className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
                        <Compass
                          className="h-3.5 w-3.5 text-[hsl(var(--copper))]"
                          aria-hidden="true"
                        />
                        {region.regionLabel}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {region.listingCount.toLocaleString()}{' '}
                        {region.listingCount === 1 ? 'property' : 'properties'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section label */}
        <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Three ways to search
        </div>

        {/* Journey cards */}
        <JourneySwitcher
          onSelectJourney={onSelectJourney}
          cityLabel={cityLabel}
          totalProperties={totalProperties}
          areasCount={areasCount}
        />

        {/* Trust strip */}
        <TrustStrip className="mt-6" />
      </div>
    </div>
  );
}
