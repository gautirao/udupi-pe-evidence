import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building,
  Check,
  ChevronRight,
  GraduationCap,
  Layers,
  MapPin,
  Sprout,
  TrendingUp,
} from 'lucide-react';
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
  /**
   * City-wide live property total — drives the area card's "{n} properties"
   * chip. `null`/`undefined` means the value has not resolved yet and
   * renders an explicit loading affordance — it is NEVER coerced to 0, since
   * a real 0 is a distinct, meaningful answer (see the `Chip`/`loading`
   * handling below).
   */
  totalProperties?: number | null;
  /**
   * Number of areas with at least one listing — drives the area card's
   * "{n} areas" chip. Same null-is-loading contract as `totalProperties`.
   */
  areasCount?: number | null;
  /**
   * Issue #1953 build step 6 (AC27/AC9) — this component is now the SOLE,
   * PERSISTENT mode-selection control (previously duplicated: once here, once
   * as GuidedEntryPanel's landing-only "journey-switcher-section"). The
   * landing-only copy was removed from GuidedEntryPanel; this component now
   * mounts once in the shared shell (DiscoverRightPanel) and stays reachable
   * at every panel state. `activeJourney` drives `aria-selected` on each tab
   * — null/undefined (no journey chosen yet, e.g. bare city landing) means no
   * tab is selected.
   */
  activeJourney?: DiscoverJourney | null;
  /**
   * Issue #1953 follow-up fix — explicit density signal. Compact renders a
   * tab strip (icon + short label only); non-compact renders the full
   * journey cards (icon tile, headline, description, chips, CTA).
   *
   * This is deliberately DECOUPLED from `activeJourney`: the caller
   * (DiscoverRightPanel) derives it from `panelContent !== 'guided-entry'`,
   * not from the raw `journey` URL param. `derivePanelContent` has several
   * journey-less inference branches (areaKey/schoolId/groupId present with
   * no `journey=` param — the URLs LandingPage/AreaCtaBlock/AreaGuide/
   * AreaGuideHero/Trends construct), where `journey` is undefined but the
   * panel is already showing a non-landing result view. Keying density off
   * `activeJourney` alone made those URLs render full cards (i.e. never
   * went compact) — see JourneySwitcher.test.tsx and
   * DiscoverRightPanel.test.tsx regression tests. `activeJourney` still
   * drives ONLY `aria-selected` on the matching tab.
   */
  compact?: boolean;
  /**
   * Issue #1808 (A3), relocated here in #1953 build step 6 — the one-shot
   * copper attention ring + aria-live helper, moved from GuidedEntryPanel's
   * per-mount wrapper onto this persistent tablist CONTAINER (never per-tab).
   * `regionGuideHelperText` is precomputed by the caller (DiscoverRightPanel)
   * from the same backend region-summary data GuidedEntryPanel used to read
   * directly — no duplicate fetch introduced here.
   */
  regionGuideRingActive?: boolean;
  regionGuideHelperText?: string;
  /** Bumped per fresh region selection; keys the ring so it replays only on a new pick. */
  regionGuideNonce?: number;
  /** Suppresses the ring pulse, replaced by a static ring. */
  prefersReducedMotion?: boolean;
}

type JourneyDef = {
  key: DiscoverJourney;
  testId: string;
  ariaLabel: string;
  Icon: typeof Layers;
  title: string;
  primary: boolean;
  desc: string;
  chips: ChipContent[];
  cta: string;
  cardHover: string;
  tile: string;
  glyph: string;
  ctaText: string;
  accentBorder: string;
  accentBg: string;
  checkBg: string;
  metaBg: string;
  metaIcon: string;
};

type ChipContent = { label: string; loading?: boolean };

const METADATA_ITEM_ICONS = [MapPin, Building, TrendingUp] as const;

function MetaItem({
  icon: Icon,
  iconClassName,
  loading = false,
  children,
}: {
  icon: typeof Layers;
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

export function JourneySwitcher({
  onSelectJourney,
  cityLabel = 'Udupi',
  totalProperties,
  areasCount,
  activeJourney = null,
  compact = false,
  regionGuideRingActive = false,
  regionGuideHelperText,
  regionGuideNonce = 0,
  prefersReducedMotion = false,
}: JourneySwitcherProps) {
  const journeys: JourneyDef[] = [
    {
      key: 'area-first',
      testId: 'journey-card-area-first',
      ariaLabel: 'Explore by area',
      Icon: MapPin,
      title: 'Explore by area',
      primary: true,
      desc: `Start with the neighbourhood. Explore ${cityLabel} localities. See properties, schools and insights`,
      chips: [
        areasCount == null ? { label: 'Loading areas…', loading: true } : { label: `${areasCount} areas` },
        totalProperties == null
          ? { label: 'Loading properties…', loading: true }
          : { label: `${totalProperties} properties` },
        { label: 'Locality insights' },
      ],
      cta: 'Explore areas',
      cardHover: 'hover:border-blue-600',
      tile: 'bg-white/20 text-white',
      glyph: 'text-white',
      ctaText: '',
      accentBorder: 'border-blue-600',
      accentBg: 'bg-[#1d4ed8]',
      checkBg: 'bg-[hsl(var(--copper))] text-white',
      metaBg: 'bg-[hsl(var(--copper-tint))]',
      metaIcon: 'text-[hsl(var(--copper))]',
    },
    {
      key: 'school-first',
      testId: 'journey-card-school-first',
      ariaLabel: 'Search near a school',
      Icon: GraduationCap,
      title: 'Search near a school',
      primary: false,
      desc: 'Pick a school as your anchor and see only the homes within a commute radius',
      chips: [{ label: '5 or 10 km radius' }, { label: 'Homes near schools' }],
      cta: 'Find homes near schools',
      cardHover: 'hover:border-slate-400',
      tile: 'bg-purple-100 group-hover:bg-purple-200',
      glyph: 'text-purple-700',
      ctaText: 'group-hover:text-[hsl(var(--plum))]',
      accentBorder: 'border-[hsl(var(--plum))]',
      accentBg: 'bg-[hsl(var(--plum-tint))]',
      checkBg: 'bg-[hsl(var(--plum))] text-white',
      metaBg: 'bg-[hsl(var(--plum-tint))]',
      metaIcon: 'text-[hsl(var(--plum))]',
    },
    {
      key: 'agri-first',
      testId: 'journey-card-agri-first',
      ariaLabel: 'Find agricultural land',
      Icon: Sprout,
      title: 'Find agricultural land',
      primary: false,
      desc: 'Looking for farmland instead? Search parcels by corridor, direction and distance from town',
      chips: [{ label: 'By corridor & direction' }, { label: 'Farmland only' }],
      cta: 'Search farmland',
      cardHover: 'hover:border-slate-400',
      tile: 'bg-emerald-100 group-hover:bg-emerald-200',
      glyph: 'text-emerald-700',
      ctaText: 'group-hover:text-[hsl(var(--evergreen))]',
      accentBorder: 'border-[hsl(var(--evergreen))]',
      accentBg: 'bg-[hsl(var(--evergreen-tint))]',
      checkBg: 'bg-[hsl(var(--evergreen))] text-white',
      metaBg: 'bg-[hsl(var(--evergreen-tint))]',
      metaIcon: 'text-[hsl(var(--evergreen))]',
    },
  ];

  const ringClass = regionGuideRingActive
    ? prefersReducedMotion
      ? 'dp-attn-static'
      : 'dp-attn-on'
    : undefined;

  const activeIndex = journeys.findIndex((j) => j.key === activeJourney);
  const [focusedIndex, setFocusedIndex] = useState(activeIndex >= 0 ? activeIndex : 0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (activeIndex >= 0) {
      setFocusedIndex(activeIndex);
    }
  }, [activeIndex]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % journeys.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + journeys.length) % journeys.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = journeys.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocusedIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const isCompact = compact;
  const metadataJourney = journeys.find((j) => j.key === activeJourney) ?? journeys[0];

  return (
    <div
      key={regionGuideRingActive ? regionGuideNonce : 'static'}
      data-testid="journey-switcher-section"
      className={cn('dp-attn-target flex flex-col gap-3', ringClass)}
    >
      {regionGuideRingActive && regionGuideHelperText && (
        <p
          aria-live="polite"
          data-testid="region-guide-helper"
          className="text-[13px] font-medium text-[hsl(var(--copper))]"
        >
          {regionGuideHelperText}
        </p>
      )}
      <div
        role="tablist"
        aria-label="Choose how you want to search"
        className={
          isCompact
            ? 'flex items-center gap-2 overflow-x-auto'
            : 'grid grid-cols-3 gap-2'
        }
      >
        {journeys.map((j, index) => {
          const isSelected = activeJourney === j.key;
          return (
          <button
            key={j.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-label={j.ariaLabel}
            tabIndex={index === focusedIndex ? 0 : -1}
            data-testid={j.testId}
            onClick={() => {
              setFocusedIndex(index);
              onSelectJourney(j.key);
            }}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={
              isCompact
                ? cn(
                    'group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-foreground hover:bg-muted',
                  )
                : cn(
                    'group flex min-w-0 items-center gap-2 rounded-lg border-[1.5px] p-2.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    j.primary
                      ? (isSelected ? 'border-blue-700 bg-blue-700 text-white shadow-md' : 'border-blue-600 bg-[#1d4ed8] text-white hover:bg-blue-700 shadow-sm')
                      : (isSelected ? cn(j.accentBorder, j.accentBg, 'border-border bg-card text-foreground') : 'border-border bg-card text-foreground hover:border-slate-300 shadow-xs'),
                  )
            }
          >
            {isCompact ? (
              <>
                <j.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{j.title}</span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                    j.tile,
                  )}
                >
                  <j.Icon className={cn('h-4 w-4 transition-colors', j.glyph)} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className={cn("text-[12.5px] font-bold leading-snug tracking-tight", j.primary ? "text-white" : "text-foreground")}>
                      {j.title}
                    </h3>
                    {j.primary && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.03em] text-white">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className={cn("mb-0 line-clamp-1 text-[11px] leading-snug", j.primary ? "text-blue-100" : "text-muted-foreground")}>
                    {j.desc}
                  </p>

                  {j.primary ? (
                    <span className="hidden items-center gap-2 rounded-md bg-[hsl(var(--copper))] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors group-hover:bg-[hsl(var(--copper-hover))]">
                      {j.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'hidden items-center gap-1.5 text-[13.5px] font-semibold text-foreground transition-colors',
                        j.ctaText,
                      )}
                    >
                      {j.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>

                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5", j.primary ? "text-white/80" : "text-muted-foreground")} aria-hidden="true" />

                {isSelected && (
                  <span
                    aria-hidden="true"
                    data-testid={`${j.testId}-selected-check`}
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white',
                      j.checkBg,
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </>
            )}
          </button>
          );
        })}
      </div>
      {/* Issue #2108 follow-up — visible metadata strip beneath the card
          row, reserved for the landing (non-compact) density only, same as
          the mock's placement directly under its `mode-selector`. Renders
          ONLY the counts/labels this component already computes (no
          invented "Up to 3 selected areas"/"Browse all listings" — this app
          has neither a multi-area-selection feature nor an all-listings
          browse link in this context). */}
      {!isCompact && (
        <div
          data-testid="journey-metadata-strip"
          className={cn(
            'flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg px-[11px] py-[7px]',
            metadataJourney.metaBg,
          )}
        >
          {metadataJourney.chips.map((c, chipIndex) => (
            <React.Fragment key={chipIndex}>
              {chipIndex > 0 && (
                <span aria-hidden="true" className="h-[3px] w-[3px] shrink-0 rounded-full bg-gray-400" />
              )}
              <MetaItem
                icon={METADATA_ITEM_ICONS[chipIndex % METADATA_ITEM_ICONS.length]}
                iconClassName={metadataJourney.metaIcon}
                loading={c.loading}
              >
                {c.label}
              </MetaItem>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
