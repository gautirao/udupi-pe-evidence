import React from 'react';
import { Building, MapPin, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export type JourneySummaryChip = { label: string; loading?: boolean };

const METADATA_ITEM_ICONS = [MapPin, Building, TrendingUp] as const;

/**
 * Same accent tokens JourneySwitcher's cards use for this journey — reused
 * here so the strip's background/icon color can never drift from its card.
 */
const JOURNEY_SUMMARY_STYLE: Record<DiscoverJourney, { metaBg: string; metaIcon: string }> = {
  'area-first': { metaBg: 'bg-[hsl(var(--copper-tint))]', metaIcon: 'text-[hsl(var(--copper))]' },
  'school-first': { metaBg: 'bg-[hsl(var(--plum-tint))]', metaIcon: 'text-[hsl(var(--plum))]' },
  'agri-first': { metaBg: 'bg-[hsl(var(--evergreen-tint))]', metaIcon: 'text-[hsl(var(--evergreen))]' },
};

/**
 * Same per-journey chip content JourneySwitcher's cards used to compute
 * inline — moved here verbatim so the strip (now renderable on its own, both
 * inside JourneySwitcher below 1366px and directly in the panel at >=1366px
 * where the header hosts the switcher instead) is the single source.
 */
export function getJourneySummaryChips(
  journey: DiscoverJourney,
  totalProperties?: number | null,
  areasCount?: number | null,
): JourneySummaryChip[] {
  switch (journey) {
    case 'area-first':
      return [
        areasCount == null ? { label: 'Loading areas…', loading: true } : { label: `${areasCount} areas` },
        totalProperties == null
          ? { label: 'Loading properties…', loading: true }
          : { label: `${totalProperties} properties` },
        { label: 'Locality insights' },
      ];
    case 'school-first':
      return [{ label: '5 or 10 km radius' }, { label: 'Homes near schools' }];
    case 'agri-first':
      return [{ label: 'By corridor & direction' }, { label: 'Farmland only' }];
  }
}

function MetaItem({
  icon: Icon,
  iconClassName,
  loading = false,
  children,
}: {
  icon: LucideIcon;
  iconClassName: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap text-[11.5px] font-semibold text-[hsl(var(--text-body))]',
        loading && 'italic opacity-70',
      )}
    >
      <Icon className={cn('h-[13px] w-[13px] shrink-0', iconClassName)} aria-hidden="true" />
      {children}
    </span>
  );
}

export interface JourneySummaryStripProps {
  /** Which journey's chip set/accent color to render — area-first's is city-stats-driven, school-first/agri-first are static. */
  journey: DiscoverJourney;
  /** Same null-is-loading contract as JourneySwitcher — only read for area-first. */
  totalProperties?: number | null;
  areasCount?: number | null;
}

/**
 * Issue #2108 follow-up — the visible metadata strip ("9 areas · 21
 * properties · Locality insights" for area-first; the radius/homes pair for
 * school-first; the corridor/farmland pair for agri-first). Originally
 * inline inside `JourneySwitcher`, reserved for the non-compact (city-root /
 * guided-entry) density only, matching the mock's placement directly under
 * its `mode-selector`. Pulled out to its own component so it can render on
 * its own directly in the panel at widths where the shared header hosts the
 * journey tabs and `JourneySwitcher` itself no longer mounts there — same
 * data, same markup, no new copy.
 */
export function JourneySummaryStrip({ journey, totalProperties, areasCount }: JourneySummaryStripProps) {
  const chips = getJourneySummaryChips(journey, totalProperties, areasCount);
  const style = JOURNEY_SUMMARY_STYLE[journey];
  return (
    <div
      data-testid="journey-metadata-strip"
      className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg px-[11px] py-[7px]', style.metaBg)}
    >
      {chips.map((c, chipIndex) => (
        <React.Fragment key={chipIndex}>
          {chipIndex > 0 && (
            <span aria-hidden="true" className="h-[3px] w-[3px] shrink-0 rounded-full bg-gray-400" />
          )}
          <MetaItem
            icon={METADATA_ITEM_ICONS[chipIndex % METADATA_ITEM_ICONS.length]}
            iconClassName={style.metaIcon}
            loading={c.loading}
          >
            {c.label}
          </MetaItem>
        </React.Fragment>
      ))}
    </div>
  );
}
