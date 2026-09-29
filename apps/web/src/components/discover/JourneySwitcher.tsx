import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  GraduationCap,
  Layers,
  MapPin,
  Sprout,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import { getJourneyDescription } from './journeyGuidanceCopy';
import { JourneySummaryStrip } from './JourneySummaryStrip';

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
   * Issue #1953 build step 6 (AC27/AC9) — this component is the SOLE
   * mode-selection control within the PANEL (previously duplicated: once
   * here, once as GuidedEntryPanel's landing-only "journey-switcher-section",
   * now removed from GuidedEntryPanel). At desktop widths wide enough for the
   * shared header to host its own compact journey tabs (`DiscoverHeaderJourneyTabs`,
   * `useDiscoverHeaderHostsControls`), the header is the sole selector instead
   * and this component does not mount at all — see RightPanelFrame /
   * DiscoverJourneyPanelShell. Below that width, and on mobile, this stays the
   * only selector, reachable at every panel state. `activeJourney` drives
   * `aria-selected` on each tab — null/undefined (no journey chosen yet, e.g.
   * bare city landing) means no tab is selected.
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
  cta: string;
  cardHover: string;
  tile: string;
  glyph: string;
  ctaText: string;
  accentBorder: string;
  accentBg: string;
  checkBg: string;
};

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
      desc: getJourneyDescription('area-first', cityLabel),
      cta: 'Explore areas',
      cardHover: 'hover:border-[hsl(var(--copper))]',
      tile: 'bg-[hsl(var(--copper-tint))] text-[hsl(var(--copper))]',
      glyph: 'text-[hsl(var(--copper))]',
      ctaText: 'group-hover:text-[hsl(var(--copper))]',
      accentBorder: 'border-[hsl(var(--copper))]',
      accentBg: 'bg-[hsl(var(--copper-tint))]',
      checkBg: 'bg-[hsl(var(--copper))] text-white',
    },
    {
      key: 'school-first',
      testId: 'journey-card-school-first',
      ariaLabel: 'Search near a school',
      Icon: GraduationCap,
      title: 'Search near a school',
      primary: false,
      desc: getJourneyDescription('school-first', cityLabel),
      cta: 'Find homes near schools',
      cardHover: 'hover:border-slate-400',
      tile: 'bg-purple-100 group-hover:bg-purple-200',
      glyph: 'text-purple-700',
      ctaText: 'group-hover:text-[hsl(var(--plum))]',
      accentBorder: 'border-[hsl(var(--plum))]',
      accentBg: 'bg-[hsl(var(--plum-tint))]',
      checkBg: 'bg-[hsl(var(--plum))] text-white',
    },
    {
      key: 'agri-first',
      testId: 'journey-card-agri-first',
      ariaLabel: 'Find agricultural land',
      Icon: Sprout,
      title: 'Find agricultural land',
      primary: false,
      desc: getJourneyDescription('agri-first', cityLabel),
      cta: 'Search farmland',
      cardHover: 'hover:border-slate-400',
      tile: 'bg-emerald-100 group-hover:bg-emerald-200',
      glyph: 'text-emerald-700',
      ctaText: 'group-hover:text-[hsl(var(--evergreen))]',
      accentBorder: 'border-[hsl(var(--evergreen))]',
      accentBg: 'bg-[hsl(var(--evergreen-tint))]',
      checkBg: 'bg-[hsl(var(--evergreen))] text-white',
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
  const metadataJourney = activeJourney ?? 'area-first';

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
                      ? (isSelected ? 'border-[hsl(var(--copper))] bg-[hsl(var(--copper-tint))] text-foreground shadow-sm' : 'border-border bg-card text-foreground hover:border-[hsl(var(--copper))] shadow-xs')
                      : (isSelected ? cn(j.accentBorder, j.accentBg, 'text-foreground') : 'border-border bg-card text-foreground hover:border-slate-300 shadow-xs'),
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
                    <h3 className="text-[12.5px] font-bold leading-snug tracking-tight text-foreground">
                      {j.title}
                    </h3>
                    {j.primary && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-[hsl(var(--copper-tint))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.03em] text-[hsl(var(--copper))]">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="mb-0 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
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

                <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 text-muted-foreground" aria-hidden="true" />

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
      {/* Issue #2108 follow-up — visible metadata strip beneath the card row (now JourneySummaryStrip), reserved for the landing (non-compact) density only, same as the mock's placement directly under its `mode-selector`. */}
      {!isCompact && (
        <JourneySummaryStrip
          journey={metadataJourney}
          totalProperties={totalProperties}
          areasCount={areasCount}
        />
      )}
    </div>
  );
}
