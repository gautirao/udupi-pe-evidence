import React from 'react';
import { ChevronRight, Layers, MapPin, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { CitySelect } from '../CitySelect';
import { IntentSelector } from '../IntentSelector';
import { AreaGroupSelectedPanel } from './AreaGroupSelectedPanel';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';

// Shared uppercase eyebrow for the in-panel control labels (mirrors GuidedEntryPanel).
const CONTROL_EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Discriminated union: when fallbackAreas is supplied (possibly non-empty),
 * onSelectArea must also be supplied so Browse-all buttons are never silent no-ops.
 * When fallbackAreas is omitted the component renders the no-areas empty state.
 */
export type AreaGroupsLandingPanelProps = {
  groups: AreaGroup[];
  isLoading: boolean;
  onSelectGroup: (groupId: string) => void;
  onStartOver: () => void;
  /**
   * Issue #1178 — the active groupId from the URL (deep-link). When it matches a
   * loaded group, that group's card is highlighted. When it is a non-empty value
   * that matches no loaded group, a non-alarming "not available" message is shown.
   */
  groupId?: string | null;
  /**
   * Issue #1483 — clears the active groupId, returning from Level-2 area list
   * back to the Level-1 group-card list. Called by the "up to all groups" affordance.
   * When omitted the affordance is not rendered (safe for contexts without group support).
   */
  onClearGroup?: () => void;
  /**
   * Issue #1595 — human-readable city label (e.g. "Udupi") used by the Level-2
   * selected-group drill-down for the breadcrumb + "Choose an area in {city}" heading.
   * Falls back to a neutral label when omitted so non-city contexts (tests) render cleanly.
   */
  cityLabel?: string;
  /**
   * Issue #1597 — "View all" CTA callback for AreaGroupSelectedPanel.
   * When provided, the CTA navigates to the real group-results state (server-filtered
   * list + map). Threaded from DiscoverRightPanel → AreaGroupsLandingPanel → AreaGroupSelectedPanel.
   */
  onViewAllResults?: () => void;
  /**
   * Issue #1607 — city + Buy/Rent controls live inside the panel (mock parity, mirrors
   * GuidedEntryPanel). All four must be supplied together to render the controls card;
   * when any is omitted (e.g. unit tests) the card is simply not shown — the existing
   * URL-state controls are unchanged, only their placement moves off the map.
   */
  city?: string;
  onCityChange?: (city: string) => void;
  intent?: DiscoverIntent;
  onIntentChange?: (intent: DiscoverIntent) => void;
} & (
  | { fallbackAreas: DiscoverArea[]; onSelectArea: (areaKey: string) => void }
  | { fallbackAreas?: never; onSelectArea?: never }
);

// ─── Derived-metric helpers ─────────────────────────────────────────────────
//
// Truthful aggregation only: per-group "for sale" counts are derived by summing
// the real DiscoverArea.listingCount of the areas that belong to the group
// (matched by areaKey) — the same join the Level-2 area list already relies on.
// When NONE of a group's area_keys resolve to a loaded area (or no areas were
// supplied at all), the count is reported as null and the figure is simply not
// shown — never fabricated.

function buildListingIndex(areas: DiscoverArea[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const area of areas) {
    index.set(area.areaKey, area.listingCount);
  }
  return index;
}

function forSaleForKeys(
  areaKeys: string[],
  listingIndex: Map<string, number>,
): number | null {
  let sum = 0;
  let matched = 0;
  for (const key of areaKeys) {
    const count = listingIndex.get(key);
    if (count != null) {
      sum += count;
      matched += 1;
    }
  }
  return matched > 0 ? sum : null;
}

// ─── Summary stat tile ──────────────────────────────────────────────────────

interface StatProps {
  value: number;
  label: string;
  accent?: boolean;
  /** Adds the mock's hairline divider + left padding (used for the 2nd/3rd tiles). */
  divider?: boolean;
}

function Stat({ value, label, accent = false, divider = false }: StatProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', divider && 'border-l border-border pl-4')}>
      <span
        className={cn(
          'font-mono text-xl font-bold leading-none tracking-tight tabular-nums',
          accent ? 'text-copper' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-1.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function GroupCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3.5">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

// ─── Browse-all fallback ──────────────────────────────────────────────────────

interface BrowseAllFallbackProps {
  areas: DiscoverArea[];
  onSelectArea: (areaKey: string) => void;
}

function BrowseAllFallback({ areas, onSelectArea }: BrowseAllFallbackProps) {
  if (areas.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
        role="status"
        aria-label="No areas available"
      >
        <MapPin className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground mb-1">No areas found</p>
        <p className="text-xs text-muted-foreground">
          No neighbourhoods are available for this city yet.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Browse all areas
      </p>
      <ul className="space-y-2" role="list" aria-label="All areas in city">
        {areas.map((area) => (
          <li key={area.areaKey}>
            <button
              type="button"
              className="group w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-all hover:border-copper/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelectArea(area.areaKey)}
              aria-label={`Browse ${area.name}, ${area.listingCount} listing${area.listingCount === 1 ? '' : 's'}`}
              data-testid={`browse-all-area-${area.areaKey}`}
            >
              <span className="min-w-0 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-foreground truncate">
                  {area.name}
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {area.listingCount} listing{area.listingCount === 1 ? '' : 's'}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-copper"
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Intro / summary card ──────────────────────────────────────────────────────

interface AreaGroupsIntroProps {
  groupCount: number;
  areaCount: number;
  forSaleCount: number | null;
  /** City label used for the mock's "Browse {city} localities…" copy. */
  cityLabel: string;
}

function AreaGroupsIntro({ groupCount, areaCount, forSaleCount, cityLabel }: AreaGroupsIntroProps) {
  // Issue #1607 — "Browse Udupi localities…" in real cities; drop the label cleanly
  // for the neutral default so it never reads "Browse this city localities".
  const cityPhrase = cityLabel && cityLabel !== 'this city' ? `${cityLabel} ` : '';
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
      data-testid="area-groups-intro"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-copper-tint text-copper">
          <MapPin className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[16.5px] font-bold tracking-[-0.01em] text-foreground">
            Explore by area
          </h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            Browse {cityPhrase}localities on the map, or choose a neighbourhood
            group below to start.
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 border-t border-border pt-4">
        <Stat value={groupCount} label={groupCount === 1 ? 'group' : 'groups'} />
        <Stat value={areaCount} label={areaCount === 1 ? 'area' : 'areas'} divider />
        {forSaleCount != null && (
          <Stat value={forSaleCount} label={forSaleCount === 1 ? 'property' : 'properties'} accent divider />
        )}
      </div>
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: AreaGroup;
  onSelect: (groupId: string) => void;
  /** Issue #1178 — highlight this card as the active (deep-linked) group. */
  isSelected: boolean;
  /**
   * Derived count of homes for sale across this group's areas. Null when no
   * area data resolves (never fabricated) — the figure is then omitted.
   */
  forSale: number | null;
}

function GroupCard({ group, onSelect, isSelected, forSale }: GroupCardProps) {
  const areaCount = group.area_keys.length;

  return (
    <button
      type="button"
      className={cn(
        'group w-full text-left rounded-xl p-5 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border border-copper bg-copper-tint shadow-lg ring-2 ring-copper/25'
          : 'border border-border bg-card shadow-sm hover:-translate-y-0.5 hover:border-copper/60 hover:shadow-lg',
      )}
      onClick={() => onSelect(group.id)}
      aria-current={isSelected ? 'true' : undefined}
      aria-label={`Select group ${group.name}${group.region_label ? `, ${group.region_label}` : ''}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
      data-testid={`area-group-card-${group.id}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground',
          )}
        >
          <Layers className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-bold tracking-[-0.01em] text-foreground truncate">{group.name}</p>
            <span className="shrink-0 rounded-full border border-border bg-[#EEEDE9] px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {areaCount} area{areaCount === 1 ? '' : 's'}
            </span>
          </div>
          {group.subtitle && (
            <p className="text-[13px] leading-relaxed text-muted-foreground mt-1 line-clamp-2">{group.subtitle}</p>
          )}
          {group.region_label && (
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-[#EEEDE9] px-2 py-0.5 font-mono text-[11.5px] font-semibold text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {group.region_label}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        {forSale === 0 ? (
          // Issue #1607 — a resolved-but-empty group is de-emphasised, never shown as
          // an active listing area. The card stays navigable so the localities inside
          // remain discoverable; the copy makes the empty state clear.
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-muted-foreground/50" aria-hidden="true" />
            No listings yet
          </span>
        ) : forSale != null ? (
          <span className="text-[12.5px] text-muted-foreground">
            <span className="font-mono font-semibold text-copper tabular-nums">{forSale}</span>{' '}
            propert{forSale === 1 ? 'y' : 'ies'} for sale
          </span>
        ) : (
          <span />
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[13.5px] font-semibold transition-colors group-hover:text-copper',
            isSelected ? 'text-copper' : 'text-foreground',
          )}
        >
          View areas
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform group-hover:translate-x-0.5',
              isSelected && 'translate-x-0.5',
            )}
            aria-hidden="true"
          />
        </span>
      </div>
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function AreaGroupsLandingPanel({
  groups,
  isLoading,
  onSelectGroup,
  onStartOver,
  groupId = null,
  onClearGroup,
  cityLabel = 'this city',
  city,
  onCityChange,
  intent,
  onIntentChange,
  fallbackAreas = [],
  onSelectArea,
  onViewAllResults,
}: AreaGroupsLandingPanelProps) {
  // Issue #1178 — a groupId is "active" only when it is a non-blank string.
  // Trim guards against whitespace-only deep links (e.g. `?groupId=%20`), which
  // must behave like normal browse (no highlight, no message). Store the trimmed
  // value so padded-but-valid deep links (e.g. `?groupId=%20group-A%20`) still
  // match `g.id` and highlight instead of showing the invalid-group notice.
  const activeGroupId = groupId?.trim() || null;
  const focusedGroup = activeGroupId
    ? groups.find((g) => g.id === activeGroupId) ?? null
    : null;

  // Show the non-alarming "not available" notice only once groups have loaded and
  // the active groupId matched nothing. The `!isLoading` gate prevents the message
  // flashing during the cold-load window, and `groups.length > 0` keeps the
  // Browse-all fallback (no-groups) path untouched.
  const showInvalidGroupMessage =
    !isLoading && !!activeGroupId && !focusedGroup && groups.length > 0;

  // Issue #1483 — Level-2: when a valid group is resolved, build the area rows by
  // joining focusedGroup.area_keys against the discoverAreas passed as fallbackAreas.
  // This reuses the existing BrowseAllFallback primitive and the same
  // fallbackAreas/onSelectArea discriminated-union contract already in this component —
  // no new data model needed. The join is O(k·n) where k = area_keys (2–6) and
  // n = discoverAreas (bounded by city count, typically < 100).
  // We only enter this branch when groups have loaded (not isLoading), so cold-load
  // shows skeletons; when the group is valid (focusedGroup != null); and when the
  // discriminated union provides onSelectArea (the real runtime discriminant —
  // fallbackAreas has a default of [] so it is never undefined at runtime).
  const showLevel2 =
    !isLoading &&
    focusedGroup !== null &&
    onSelectArea !== undefined;

  // Build the Level-2 area list: keep only discoverAreas whose areaKey is in the group.
  // Entries missing from discoverAreas are silently dropped; BrowseAllFallback handles
  // the empty-list case gracefully ("No areas found").
  //
  // The casts below are safe: showLevel2 being true guarantees onSelectArea is defined
  // (checked above) and focusedGroup is non-null (checked above). TypeScript cannot
  // narrow the discriminated union through the boolean flag, so we assert explicitly
  // rather than re-checking inline.
  const level2Areas: DiscoverArea[] = showLevel2
    ? (fallbackAreas as DiscoverArea[]).filter((a) =>
        (focusedGroup as AreaGroup).area_keys.includes(a.areaKey),
      )
    : [];

  // Derived, truthful summary + per-group "for sale" figures (see helpers above).
  // Cheap to compute; bounded by city area count. Distinct area_keys across all
  // groups so a shared area is never double-counted.
  const listingIndex = React.useMemo(
    () => buildListingIndex(fallbackAreas as DiscoverArea[]),
    [fallbackAreas],
  );
  const distinctAreaKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const k of g.area_keys) set.add(k);
    return set;
  }, [groups]);
  const totalAreaCount = distinctAreaKeys.size;
  const totalForSale = React.useMemo(
    () => forSaleForKeys([...distinctAreaKeys], listingIndex),
    [distinctAreaKeys, listingIndex],
  );

  // ── Level 2: resolved group → rich selected-group drill-down (Issue #1595) ────
  // Owns its own header (breadcrumb + "Choose an area in {city}") and scroll body,
  // so it renders as a full-height sibling rather than inside the group-list scroller.
  if (showLevel2) {
    return (
      <div data-testid="area-group-level2" className="flex flex-1 flex-col overflow-hidden">
        <AreaGroupSelectedPanel
          group={focusedGroup as AreaGroup}
          areas={level2Areas}
          cityLabel={cityLabel}
          onBack={onClearGroup}
          onStartOver={onStartOver}
          // onSelectArea cast: safe — showLevel2 guarantees it is defined (see comment above).
          onSelectArea={onSelectArea as (areaKey: string) => void}
          // Issue #1597 — thread the group-results CTA callback.
          onViewAllResults={onViewAllResults}
        />
      </div>
    );
  }

  // Issue #1607 — mock-aligned hero title. When a real city label is supplied
  // (e.g. "Udupi") it reads "Choose an area in Udupi"; the neutral default keeps
  // non-city contexts (tests) clean without a dangling "in this city".
  const cityHeading =
    cityLabel && cityLabel !== 'this city'
      ? `Choose an area in ${cityLabel}`
      : 'Choose an area';

  // Issue #1607 — render the in-panel city + Buy/Rent controls card only when all four
  // control props are wired in (production). Unit tests that omit them simply skip it.
  const showControls =
    city != null && onCityChange != null && intent != null && onIntentChange != null;

  // Mock-faithful single-scroll layout (mirrors GuidedEntryPanel): the eyebrow, Fraunces
  // hero, subcopy and controls card scroll with the content instead of a compact sticky
  // header, so the panel reads like the approved area-first mock.
  return (
    <div
      className="flex-1 overflow-y-auto bg-background px-5 py-7 lg:px-11 lg:py-10"
      aria-busy={isLoading}
      aria-label="Area groups"
    >
      <div className="mx-auto max-w-[560px]">
        {/* Eyebrow row: Area-first tag + Start over */}
        <div className="mb-[14px] flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-secondary-foreground">
            <Layers className="h-[13px] w-[13px]" aria-hidden="true" />
            Area-first
          </span>
          {onStartOver && (
            <button
              type="button"
              data-testid="start-over-button"
              onClick={onStartOver}
              aria-label="Start over and return to journey selection"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Start over
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Hero */}
        <h1 className="mb-[13px] font-['Fraunces',_ui-serif,_Georgia,_serif] text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-3xl lg:text-[38px]">
          {cityHeading}
        </h1>
        <p className="mb-6 max-w-[48ch] text-[14.5px] leading-relaxed text-muted-foreground lg:text-[16px]">
          Start with a neighbourhood group, then narrow down to the localities and
          properties inside it.
        </p>

        {/* Controls card: city + Buy/Rent (mock parity, mirrors GuidedEntryPanel) */}
        {showControls && (
          <>
            <div className="mb-2.5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <label className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <span className={CONTROL_EYEBROW}>City</span>
                <CitySelect
                  value={city as string}
                  onChange={onCityChange as (city: string) => void}
                  className="h-11 w-full rounded-md border-border bg-[hsl(var(--input-bg))] px-3 text-sm font-semibold text-foreground"
                />
              </label>
              <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <span className={CONTROL_EYEBROW}>Looking to</span>
                <IntentSelector
                  intent={intent as DiscoverIntent}
                  onIntentChange={onIntentChange as (intent: DiscoverIntent) => void}
                  hideLabel
                  fill
                />
              </div>
            </div>
            <p className="mb-[22px] pl-0.5 text-[12.5px] text-muted-foreground">
              {intent === 'rent'
                ? 'Showing monthly rents — same properties, reworded for renting.'
                : 'Showing sale prices in ₹ across every area.'}
            </p>
          </>
        )}

        {/* Body: skeletons → group cards → browse-all fallback */}
        {isLoading ? (
          <div className="space-y-3.5" data-testid="area-groups-loading">
            {[0, 1, 2, 3].map((i) => (
              <GroupCardSkeleton key={i} />
            ))}
          </div>
        ) : groups.length > 0 ? (
          // ── Level 1: no resolved group (or invalid groupId) → show group cards ─
          <div className="space-y-6" data-testid="area-groups-list">
            {showInvalidGroupMessage && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground"
                data-testid="area-group-invalid-message"
              >
                This group is not available. Please select a group below.
              </div>
            )}

            <AreaGroupsIntro
              groupCount={groups.length}
              areaCount={totalAreaCount}
              forSaleCount={totalForSale}
              cityLabel={cityLabel}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                    Neighbourhood groups
                  </p>
                </div>
                <span className="font-mono text-[11.5px] font-semibold text-muted-foreground">
                  {groups.length} group{groups.length === 1 ? '' : 's'}
                </span>
              </div>

              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onSelect={onSelectGroup}
                  isSelected={group.id === focusedGroup?.id}
                  forSale={forSaleForKeys(group.area_keys, listingIndex)}
                />
              ))}
            </div>

            {/* Issue #1607 — trust strip (mock parity, mirrors GuidedEntryPanel). */}
            <div className="flex items-center gap-3 border-t border-border pt-5">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-[hsl(var(--evergreen-tint))]">
                <ShieldCheck className="h-[19px] w-[19px] text-[hsl(var(--evergreen))]" aria-hidden="true" />
              </span>
              <p className="text-[13px] leading-snug text-muted-foreground">
                <strong className="text-foreground">Every listing is verified.</strong> Documents
                checked, RERA registered, broker confirmed — before it reaches you.
              </p>
            </div>
          </div>
        ) : (
          // ── No groups: Browse-all fallback across all city areas ────────────────
          <BrowseAllFallback
            areas={fallbackAreas as DiscoverArea[]}
            // onSelectArea is guaranteed by the discriminated union when fallbackAreas is present
            onSelectArea={onSelectArea!}
          />
        )}
      </div>
    </div>
  );
}
