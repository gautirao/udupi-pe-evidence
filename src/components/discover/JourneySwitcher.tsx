import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Compass, GraduationCap, Layers, Sprout } from 'lucide-react';
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
  // Full LITERAL Tailwind class strings (no runtime concatenation — JIT scans statically).
  cardHover: string;
  tile: string;
  glyph: string;
  ctaText: string;
  // Permanent (non-hover) accent border/tint for the SELECTED state on the
  // landing card — same accent hue as `cardHover`/`tile` but applied
  // unconditionally (not `:hover`-scoped) so a selected card reads as
  // selected without requiring pointer hover. Combined with the "Rec"/
  // "Recommended" badge, selection is signalled via border + fill + text,
  // never colour alone (mock parity, r9).
  accentBorder: string;
  accentBg: string;
};

// Issue #2084 clarification rev 2 — a chip is either a resolved label
// (`loading` omitted/false) or an explicit loading/unknown placeholder
// (`loading: true`). This lets a null/undefined count render a state that is
// distinguishable from a genuine 0 both visually (different copy) and
// accessibly (`aria-busy`, see `Chip` below) — never a bare "0" standing in
// for "we don't know yet".
type ChipContent = { label: string; loading?: boolean };

// Chip — small warm mono pill, matched to the ReTrends mock exactly:
// surface-subtle #EEEDE9 fill, hairline border, Geist Mono 11.5/600, grey-700 text.
// `loading` renders the same pill shape with `aria-busy="true"` so assistive
// tech and sighted users alike can tell "still resolving" apart from a
// settled value (including a settled value of literal 0).
function Chip({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return (
    <span
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border border-border bg-muted px-[9px] py-[3px] font-mono text-[11.5px] font-semibold text-muted-foreground',
        loading && 'italic text-muted-foreground/80',
      )}
    >
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
      // WCAG 2.5.3 Label in Name — the compact tab's visible text is the
      // title ("Explore by area"); the accessible name must CONTAIN that
      // visible string so voice-control users saying "Explore by area" can
      // match it. Previously this was the longer "Explore properties by
      // area", which does not contain the visible label verbatim.
      // school-first/agri-first already satisfy this (ariaLabel === title).
      ariaLabel: 'Explore by area',
      Icon: Layers,
      title: 'Explore by area',
      primary: true,
      desc: `Start with the neighbourhood. Explore ${cityLabel} localities, then open the properties inside the area that fits.`,
      // `areasCount`/`totalProperties` are `number | null | undefined`:
      // null/undefined (not yet resolved) renders an explicit loading chip,
      // never a false "0 areas"/"0 properties"; a genuine 0 renders as the
      // literal number, same as any other resolved value.
      chips: [
        areasCount == null ? { label: 'Loading areas…', loading: true } : { label: `${areasCount} areas` },
        totalProperties == null
          ? { label: 'Loading properties…', loading: true }
          : { label: `${totalProperties} properties` },
        { label: 'Locality insights' },
      ],
      cta: 'Explore areas',
      cardHover: 'hover:border-primary',
      tile: 'bg-secondary group-hover:bg-primary',
      glyph: 'text-primary group-hover:text-primary-foreground',
      ctaText: '',
      accentBorder: 'border-primary',
      accentBg: 'bg-secondary',
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
      chips: [{ label: '5 or 10 km radius' }, { label: 'Homes near schools' }],
      cta: 'Find homes near schools',
      cardHover: 'hover:border-[hsl(var(--plum))]',
      tile: 'bg-[hsl(var(--plum-tint))] group-hover:bg-[hsl(var(--plum))]',
      glyph: 'text-[hsl(var(--plum))] group-hover:text-white',
      ctaText: 'group-hover:text-[hsl(var(--plum))]',
      accentBorder: 'border-[hsl(var(--plum))]',
      accentBg: 'bg-[hsl(var(--plum-tint))]',
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
      chips: [{ label: 'By corridor & direction' }, { label: 'Farmland only' }],
      cta: 'Search farmland',
      cardHover: 'hover:border-[hsl(var(--evergreen))]',
      tile: 'bg-[hsl(var(--evergreen-tint))] group-hover:bg-[hsl(var(--evergreen))]',
      glyph: 'text-[hsl(var(--evergreen))] group-hover:text-white',
      ctaText: 'group-hover:text-[hsl(var(--evergreen))]',
      accentBorder: 'border-[hsl(var(--evergreen))]',
      accentBg: 'bg-[hsl(var(--evergreen-tint))]',
    },
  ];

  // Issue #1808 (A3), relocated in #1953 build step 6 — the ring/key-remount
  // logic that used to live on GuidedEntryPanel's "journey-switcher-section"
  // wrapper now lives on THIS component's own outer container, since this
  // is the persistent mount point.
  const ringClass = regionGuideRingActive
    ? prefersReducedMotion
      ? 'dp-attn-static'
      : 'dp-attn-on'
    : undefined;

  // Issue #1953 (ARIA sweep) — role="tablist" was added (AC9) but the
  // aria-live helper <p> and the Compass heading <div> were left as direct
  // children of the tablist container, which is an invalid tablist
  // structure (a tablist's only valid children are its tabs) — an
  // incorrect role tells assistive tech something untrue, which is worse
  // than no role. Both non-tab children are now rendered OUTSIDE the
  // tablist, on this outer wrapper instead, with the SAME visual result
  // (this wrapper still keys/re-mounts on regionGuideNonce and carries
  // dp-attn-target — that class must stay on the outer container, never
  // per-tab; see JourneySwitcher.test.tsx). The inner div below is the
  // actual tablist and contains ONLY the three role="tab" buttons.
  const activeIndex = journeys.findIndex((j) => j.key === activeJourney);
  const [focusedIndex, setFocusedIndex] = useState(activeIndex >= 0 ? activeIndex : 0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Issue #1953 follow-up fix (roving-focus desync) — `focusedIndex`'s
  // useState initializer only runs on first mount. When the journey changes
  // by any route OTHER than a click on this tablist itself (a map marker,
  // a breadcrumb, StartOverButton, in-app navigation that changes the URL),
  // `activeIndex` moves but `focusedIndex` — and therefore which tab is in
  // the natural Tab order (tabIndex 0) — stays stranded on the previously
  // selected/focused tab. Resync whenever the selection actually changes.
  // Deliberately does NOT fire on pure Arrow/Home/End focus moves (those
  // call setFocusedIndex directly without changing `activeIndex`), so a
  // keyboard user can still move focus away from the selected tab without
  // this effect snapping it back.
  useEffect(() => {
    if (activeIndex >= 0) {
      setFocusedIndex(activeIndex);
    }
  }, [activeIndex]);

  // Roving tabIndex + arrow-key navigation per the WAI-ARIA tabs pattern:
  // only the "current" tab is in the natural Tab order (tabIndex 0), every
  // other tab is -1; ArrowLeft/ArrowRight/Home/End move focus between tabs
  // without changing selection (selection still only happens on click/Enter
  // via the existing onSelectJourney handler — no scope creep there).
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

  // Product-owner ruling (#1953 follow-up, mobile list-first motivation) —
  // full journey cards (icon tile, headline, description, chip row, CTA)
  // are reserved for the bare Discover LANDING (no journey chosen yet).
  // Once ANY non-landing panel is showing, this same persistent mount
  // switches to a compact tab strip so it stops consuming a large fraction
  // of the viewport above every result list at mobile widths.
  //
  // Issue #1953 follow-up fix — this was previously derived from
  // `activeJourney != null`, i.e. directly off the raw `journey` URL param.
  // That's wrong: `derivePanelContent` has journey-less inference branches
  // (areaKey/schoolId/groupId present with no `journey=` param — the exact
  // URLs LandingPage/AreaCtaBlock/AreaGuide/AreaGuideHero/Trends construct
  // without a journey param) that still land on a non-landing panel state,
  // so `activeJourney` stayed null there and the full cards kept rendering
  // above the results. Density must be driven by the caller-supplied
  // `compact` prop instead (DiscoverRightPanel computes it from
  // `panelContent !== 'guided-entry'`, the actual rendered panel state).
  // `activeJourney` continues to drive ONLY `aria-selected`.
  //
  // Every existing invariant is preserved in BOTH densities: the three
  // `journey-card-*` testids, role="tablist"/role="tab"/aria-selected,
  // `dp-attn-target` on the outer container only (never per-tab), the
  // roving tabIndex + Arrow/Home/End keyboard model, and click-to-switch —
  // only the CONTENT rendered inside each tab button (and the tablist's own
  // layout direction) changes with density.
  const isCompact = compact;

  return (
    <div
      key={regionGuideRingActive ? regionGuideNonce : 'static'}
      data-testid="journey-switcher-section"
      className={cn('dp-attn-target flex flex-col gap-3', ringClass)}
    >
      {/* Issue #1808 — ring + helper fire together, ONLY on an actual map/panel
          pick (regionGuideRingActive), never on deep-link/refresh. Kept
          density-independent: a fresh region pick can in principle arrive
          while a journey is already active, so this must not silently stop
          rendering in compact mode. */}
      {regionGuideRingActive && regionGuideHelperText && (
        <p
          aria-live="polite"
          data-testid="region-guide-helper"
          className="text-[13px] font-medium text-[hsl(var(--copper))]"
        >
          {regionGuideHelperText}
        </p>
      )}
      {!isCompact && (
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          <Compass className="h-[15px] w-[15px] text-[hsl(var(--copper))]" aria-hidden="true" />
          <span>Choose how you want to search</span>
        </div>
      )}
      <div
        role="tablist"
        aria-label="Choose how you want to search"
        className={
          isCompact
            ? 'flex items-center gap-2 overflow-x-auto'
            // Issue #1953 follow-up (product-owner BLOCKING defect) — the
            // landing tablist previously stacked three full-height cards
            // (~769px, 91% of a 390x844 viewport). It is now a 3-up grid
            // row at narrow widths (matching the frozen mock's ~122px-tall
            // side-by-side cards) and reverts to the original stacked
            // full-card layout at `sm:` (640px) and up — desktop is
            // unchanged (r10).
            : 'grid grid-cols-3 gap-2 sm:flex sm:flex-col sm:gap-3'
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
                    // Mobile-first: a compact column card (icon, title, one-
                    // line description) sized to the mock's ~106x122 card.
                    'group flex min-w-0 flex-col items-start gap-1.5 rounded-lg border-[1.5px] border-border bg-card p-2.5 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    // `sm:` and up: revert to the original full stacked
                    // card treatment — untouched from before this change.
                    'sm:block sm:w-full sm:rounded-xl sm:p-5 sm:shadow-sm',
                    'sm:transition-all sm:duration-200 sm:hover:-translate-y-0.5 sm:hover:shadow-lg',
                    j.cardHover,
                    // Selected accent — border + tint, never colour alone
                    // (paired with the "Recommended" badge text below).
                    isSelected && cn(j.accentBorder, j.accentBg),
                  )
            }
          >
            {isCompact ? (
              <>
                <j.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{j.title}</span>
              </>
            ) : (
              <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-3.5">
                {/* Icon tile — tinted at rest, solid accent on hover.
                    28x28/16px icon at mobile (mock parity), 46x46/22px at
                    sm: and up (unchanged desktop size). */}
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors sm:h-[46px] sm:w-[46px]',
                    j.tile,
                  )}
                >
                  <j.Icon className={cn('h-4 w-4 transition-colors sm:h-[22px] sm:w-[22px]', j.glyph)} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5 sm:mb-1 sm:flex-nowrap sm:gap-2.5">
                    <h3 className="text-[12px] font-bold leading-snug tracking-tight text-foreground sm:text-[16.5px] sm:leading-normal">
                      {j.title}
                    </h3>
                    {j.primary && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-[hsl(var(--copper-tint))] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.03em] text-[hsl(var(--copper-hover))] sm:px-2 sm:py-0.5 sm:text-[10.5px] sm:tracking-[0.04em]">
                        Recommended
                      </span>
                    )}
                  </div>
                  {/* Mobile: clamped to one line (mock parity, r3 height
                      budget) — the full sentence still sits in the DOM/
                      accessible text, just visually truncated below `sm:`.
                      Desktop: unchanged, full multi-line copy. */}
                  <p className="mb-0 line-clamp-1 text-[11px] leading-snug text-muted-foreground sm:mb-3 sm:line-clamp-none sm:text-[13.5px] sm:leading-relaxed">
                    {j.desc}
                  </p>

                  {/* Chips and CTA are part of the richer desktop card only —
                      hidden below `sm:` to keep the mobile row at the mock's
                      ~122px order of magnitude (r3, r6).
                      PRECISION, corrected after review: `hidden` is
                      `display:none`, so below `sm:` these are removed from the
                      rendered output AND THE ACCESSIBILITY TREE, not merely from
                      view. An earlier version of this comment said "the text
                      stays in the DOM" — true of the DOM, false of the a11y
                      tree, and a future reader could have relied on it for
                      screen-reader parity. No affordance is lost: the whole card
                      is the control (the CTA is a decorative span), the button's
                      aria-label is unaffected, and the counts remain available
                      via the landing count pill. */}
                  <div className="hidden gap-1.5 sm:mb-3.5 sm:flex sm:flex-wrap">
                    {j.chips.map((c, chipIndex) => (
                      <Chip key={chipIndex} loading={c.loading}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>

                  {j.primary ? (
                    <span className="hidden items-center gap-2 rounded-md bg-[hsl(var(--copper))] px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors group-hover:bg-[hsl(var(--copper-hover))] sm:inline-flex">
                      {j.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'hidden items-center gap-1.5 text-[13.5px] font-semibold text-foreground transition-colors sm:inline-flex',
                        j.ctaText,
                      )}
                    >
                      {j.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}
