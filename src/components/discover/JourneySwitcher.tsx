import React from 'react';
import { ArrowRight, GraduationCap, Layers, Sprout } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

interface JourneySwitcherProps {
  onSelectJourney: (journey: DiscoverJourney) => void;
  /**
   * Display name of the selected city — interpolated into the area-card copy so it
   * stays city-aware ("Explore {city} localities"). Defaults to 'Udupi' (the
   * DEFAULT_CITY label) only as a safe fallback for direct/standalone usage; the
   * landing always passes the live label derived from CITY_CONFIG.
   */
  cityLabel?: string;
  /** City-wide live property total — drives the area card's "{n} properties" chip. */
  totalProperties?: number;
  /** Number of areas with at least one listing — drives the area card's "{n} areas" chip. */
  areasCount?: number;
}

type JourneyDef = {
  key: DiscoverJourney;
  testId: string;
  ariaLabel: string;
  Icon: typeof Layers;
  title: string;
  primary: boolean;
  desc: string;
  chips: string[];
  cta: string;
  // Full LITERAL Tailwind class strings (no runtime concatenation — JIT scans statically).
  cardHover: string;
  tile: string;
  glyph: string;
  ctaText: string;
};

// Chip — small warm mono pill, matched to the ReTrends mock exactly:
// surface-subtle #EEEDE9 fill, hairline border, Geist Mono 11.5/600, grey-700 text.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-muted px-[9px] py-[3px] font-mono text-[11.5px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

export function JourneySwitcher({
  onSelectJourney,
  cityLabel = 'Udupi',
  totalProperties = 0,
  areasCount = 0,
}: JourneySwitcherProps) {
  const journeys: JourneyDef[] = [
    {
      key: 'area-first',
      testId: 'journey-card-area-first',
      ariaLabel: 'Explore properties by area',
      Icon: Layers,
      title: 'Explore by area',
      primary: true,
      desc: `Start with the neighbourhood. Explore ${cityLabel} localities, then open the properties inside the area that fits.`,
      chips: [`${areasCount} areas`, `${totalProperties} properties`, 'Locality insights'],
      cta: 'Explore areas',
      cardHover: 'hover:border-primary',
      tile: 'bg-secondary group-hover:bg-primary',
      glyph: 'text-primary group-hover:text-primary-foreground',
      ctaText: '',
    },
    {
      key: 'school-first',
      testId: 'journey-card-school-first',
      ariaLabel: 'Search near a school',
      Icon: GraduationCap,
      title: 'Search near a school',
      primary: false,
      desc:
        'Pick a school as your anchor and see only the homes within an easy daily commute of it.',
      chips: ['5 or 10 km radius', 'Homes near schools'],
      cta: 'Find homes near schools',
      cardHover: 'hover:border-[hsl(var(--plum))]',
      tile: 'bg-[hsl(var(--plum-tint))] group-hover:bg-[hsl(var(--plum))]',
      glyph: 'text-[hsl(var(--plum))] group-hover:text-white',
      ctaText: 'group-hover:text-[hsl(var(--plum))]',
    },
    {
      key: 'agri-first',
      testId: 'journey-card-agri-first',
      ariaLabel: 'Find agricultural land',
      Icon: Sprout,
      title: 'Find agricultural land',
      primary: false,
      desc:
        'Looking for farmland instead? Search parcels by corridor, direction and distance from town.',
      chips: ['By corridor & direction', 'Farmland only'],
      cta: 'Search farmland',
      cardHover: 'hover:border-[hsl(var(--evergreen))]',
      tile: 'bg-[hsl(var(--evergreen-tint))] group-hover:bg-[hsl(var(--evergreen))]',
      glyph: 'text-[hsl(var(--evergreen))] group-hover:text-white',
      ctaText: 'group-hover:text-[hsl(var(--evergreen))]',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {journeys.map((j) => (
        <button
          key={j.key}
          type="button"
          aria-label={j.ariaLabel}
          data-testid={j.testId}
          onClick={() => onSelectJourney(j.key)}
          className={cn(
            'group block w-full rounded-xl border-[1.5px] border-border bg-card p-5 text-left shadow-sm',
            'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            j.cardHover,
          )}
        >
          <div className="flex items-start gap-3.5">
            {/* Icon tile — tinted at rest, solid accent on hover. */}
            <span
              className={cn(
                'flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-md transition-colors',
                j.tile,
              )}
            >
              <j.Icon className={cn('h-[22px] w-[22px] transition-colors', j.glyph)} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2.5">
                <h3 className="text-[16.5px] font-bold tracking-tight text-foreground">{j.title}</h3>
                {j.primary && (
                  <span className="inline-flex items-center rounded-full bg-[hsl(var(--copper-tint))] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[hsl(var(--copper-hover))]">
                    Recommended
                  </span>
                )}
              </div>
              <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">{j.desc}</p>

              <div className="mb-3.5 flex flex-wrap gap-1.5">
                {j.chips.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>

              {j.primary ? (
                <span className="inline-flex items-center gap-2 rounded-md bg-[hsl(var(--copper))] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors group-hover:bg-[hsl(var(--copper-hover))]">
                  {j.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              ) : (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground transition-colors',
                    j.ctaText,
                  )}
                >
                  {j.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
