import { Link } from 'react-router-dom';
import { MapPin, GraduationCap, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDiscoverRoute, type PublicNavJourney } from '@/lib/navUtils';
import type { RegionOverviewMarkerKind } from '@/components/map/RegionGuidanceCard';
import { getJourneyAccessibleDescription } from './journeyGuidanceCopy';

/** Same shape `RightPanelFrame`'s `JourneySwitcher` consumes, reused verbatim rather than re-derived. */
export interface DiscoverHeaderRegionGuide {
  ringActive: boolean;
  markerKind: RegionOverviewMarkerKind | null | undefined;
  nonce: number;
  prefersReducedMotion: boolean;
  helperText: string;
}

export interface DiscoverHeaderJourneyTabsProps {
  /** City slug used to build each tab's `getDiscoverRoute` href — same source RoleAwareHeader already resolves. */
  currentCity: string;
  /** The active journey (URL `journey=` param), or `null` on the journey-less landing — no tab is selected then. */
  currentJourney: PublicNavJourney | null;
  /** Optional — omitted where the caller has no region-guide context (e.g. isolated tests). */
  regionGuide?: DiscoverHeaderRegionGuide;
  /**
   * Display name of the selected city — same city-dynamic interpolation
   * `JourneySwitcher` uses for its area-first card copy ("Explore {city}
   * localities"). Defaults to 'Udupi' only as a safe fallback for isolated
   * renders/tests; real usage always passes the live label.
   */
  cityLabel?: string;
}

interface HeaderJourneyTab {
  key: PublicNavJourney;
  /** Short label — deliberately not JourneySwitcher's longer compact label, which stays unchanged for mobile/landing. */
  label: string;
  ariaLabel: string;
  Icon: typeof MapPin;
}

const HEADER_JOURNEY_TABS: HeaderJourneyTab[] = [
  { key: 'area-first', label: 'By area', ariaLabel: 'Explore by area', Icon: MapPin },
  { key: 'school-first', label: 'Near a school', ariaLabel: 'Search near a school', Icon: GraduationCap },
  { key: 'agri-first', label: 'Agricultural land', ariaLabel: 'Find agricultural land', Icon: Sprout },
];

/** The collapsed desktop header's compact journey-switch control — plain cross-page links with short labels, plus the region-guide ring/helper for every panel state, including `guided-entry` (the header is now the sole journey selector there too). */
export function DiscoverHeaderJourneyTabs({
  currentCity,
  currentJourney,
  regionGuide,
  cityLabel = 'Udupi',
}: DiscoverHeaderJourneyTabsProps) {
  const ringActive = regionGuide?.ringActive ?? false;
  const ringClass = ringActive
    ? regionGuide?.prefersReducedMotion
      ? 'dp-attn-static'
      : 'dp-attn-on'
    : undefined;

  return (
    <div
      key={ringActive ? regionGuide?.nonce : 'static'}
      data-testid="discover-header-journey-tabs-section"
      className={cn('dp-attn-target flex shrink-0 flex-col gap-1', ringClass)}
    >
      {ringActive && regionGuide?.helperText && (
        <p
          aria-live="polite"
          data-testid="discover-header-region-guide-helper"
          className="text-[11px] font-medium leading-tight text-[hsl(var(--copper))]"
        >
          {regionGuide.helperText}
        </p>
      )}
      <nav
        aria-label="Choose how you want to search"
        data-testid="discover-header-journey-tabs"
        className="flex items-center gap-1 shrink-0"
      >
        {HEADER_JOURNEY_TABS.map((tab) => {
          const isSelected = currentJourney === tab.key;
          const description = getJourneyAccessibleDescription(tab.key, cityLabel);
          const descriptionId = `discover-header-journey-tab-${tab.key}-description`;
          return (
            <Link
              key={tab.key}
              to={getDiscoverRoute(currentCity, tab.key)}
              aria-current={isSelected ? 'page' : undefined}
              aria-label={tab.ariaLabel}
              aria-describedby={descriptionId}
              title={description}
              data-testid={`discover-header-journey-tab-${tab.key}`}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 py-1.5 text-xs font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              <tab.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
              {/* Same helper copy JourneySwitcher's full cards show (incl. area-first's "Recommended" marker), exposed here as an accessible description rather than visible text — the row is width-critical at the sole-selector breakpoint. */}
              <span id={descriptionId} className="sr-only">
                {description}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
