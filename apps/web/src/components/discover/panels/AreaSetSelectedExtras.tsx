import { useMemo, type ReactNode } from 'react';
import { ChevronRight, GraduationCap, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiscoverAreas, type DiscoverArea } from '@/hooks/useDiscoverAreas';
import { useDiscoverSummary } from '@/hooks/useDiscoverSummary';
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import {
  resolveDrawSearchAreaEligibility,
  DRAW_SEARCH_AREA_ELIGIBLE_TITLE,
  DRAW_SEARCH_AREA_UNAVAILABLE_TITLE,
} from '@/features/discover/state/drawSearchAreaEligibility';

/**
 * Issue #2017 — multi-area AREA_SET committed-scope extras for
 * `AreaSelectedPanel`. Split out of the main panel file rather than inlined
 * because the plural header replaces a >100-line JSX block; keeping it
 * separate lets the single-area path in `AreaSelectedPanel.tsx` stay
 * byte-identical to before this issue (the only change there is a
 * `multiAreaKeys ? <these> : <existing>` branch).
 *
 * Deliberately self-sources `useDiscoverAreas(city)` rather than accepting
 * area names/counts as props — this mirrors `AreaSetChips.tsx`'s own
 * established self-sourcing convention for the same data (see its
 * `combinedTotal`/`labelByKey` computation, which this file's "why" line is
 * adapted from) and keeps `AreaSelectedPanel`'s prop surface unchanged.
 */

/** Ghost action-row button — copper tokens, matching AreaSetChips.tsx's chip styling. */
function EPGhost({
  children,
  onClick,
  disabled = false,
  title,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(
        'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-copper/40 px-2.5 text-xs font-semibold text-copper transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-copper-tint hover:text-copper',
      )}
    >
      {children}
    </button>
  );
}

export interface DrawSearchAreaEntryProps {
  /**
   * True when this state actually produces a residential listing result set.
   * Both panel branches that render this pass `true` by construction — a
   * committed area IS a listing scope — but the predicate is still consulted
   * rather than assumed, because it is the ONE place the journey matrix lives
   * and PR-2's map-side reuse cannot make that guarantee.
   */
  hasResidentialListingScope: boolean;
  onDrawSearchArea?: () => void;
  onRevealMap?: () => void;
}

/**
 * Issue #2419 (PR-2) — the "Draw search area" entry, extracted so BOTH
 * committed-AREA_SET panel branches render the same control.
 *
 * It previously lived inline in the multi-area header only, which meant a
 * SINGLE committed area — much the more common state — had no draw entry at
 * all. That contradicted the issue's rule that the entry belongs in eligible
 * residential listing states, and it was invisible because the multi-area
 * header was simply where the disabled placeholder happened to sit when PR-1
 * inherited it.
 *
 * Extracted rather than duplicated: the eligibility call, the reveal-then-arm
 * ordering and the title copy are all decisions that must not drift between
 * two copies.
 */
export function DrawSearchAreaEntry({
  hasResidentialListingScope,
  onDrawSearchArea,
  onRevealMap,
}: DrawSearchAreaEntryProps) {
  const nav = useDiscoverNav();
  let user = null;
  let authLoading = false;
  try {
    const auth = useAuth();
    user = auth.user;
    authLoading = auth.isLoading;
  } catch {
    // safe fallback when rendered outside AuthProvider
  }
  const { data: summary } = useDiscoverSummary({ city: nav?.city || DEFAULT_CITY });

  const eligibility = resolveDrawSearchAreaEligibility({
    // The entry is live only once a handler exists; without one it stays
    // disabled, so a caller that has not adopted the prop cannot end up with
    // a control that looks usable and does nothing.
    isDrawModeWired: onDrawSearchArea != null,
    cityBoundaryAvailable: summary?.polygonSearchAvailable,
    journey: nav?.journey,
    hasResidentialListingScope,
    // `undefined` while auth loads rather than `false`, so the entry never
    // blinks out from under a shopper who is in fact signed in.
    isAuthenticated: authLoading ? undefined : user !== null,
  });

  if (eligibility.status === 'HIDDEN') return null;

  return (
    <EPGhost
      disabled={eligibility.status === 'UNAVAILABLE'}
      onClick={() => {
        // Reveal the map FIRST on the mobile shell. Below `lg` the map canvas
        // is not mounted until the shopper opens the Map view, so arming the
        // draw tool without this would put them in draw mode on a surface
        // they cannot see. A no-op on desktop.
        onRevealMap?.();
        onDrawSearchArea?.();
      }}
      title={
        eligibility.status === 'UNAVAILABLE'
          ? DRAW_SEARCH_AREA_UNAVAILABLE_TITLE[eligibility.reason]
          : DRAW_SEARCH_AREA_ELIGIBLE_TITLE
      }
      testId="area-set-draw-area"
    >
      Draw search area
    </EPGhost>
  );
}

export interface AreaSetSelectedHeaderProps {
  /** The committed AREA_SET's areaKeys (already confirmed length > 1 by the caller). */
  areaKeys: string[];
  city: string;
  /** Combined listing count for the header's count block (same source as the single-area header). */
  count: number;
  intentNoun: 'sale' | 'rent';
  isLoadingListings: boolean;
  onEditAreas: () => void;
  onClearAreas: () => void;
  /**
   * Issue #2596 — removes ONE area from the COMMITTED set, immediately. Distinct from the map
   * overlay's chips, which edit the uncommitted draft and take effect only on "Show listings".
   * The caller commits the remaining keys, or clears the scope when the last one goes.
   */
  onRemoveArea: (areaKey: string) => void;
  /**
   * Issue #2017 (Fit all / focus-one, confirmed MUST-HAVE) — republishes the
   * union camera framing for the currently committed areaKeys. Camera intent
   * only; must never mutate the committed result scope.
   */
  onFitAll: () => void;
  /**
   * Frames the camera on ONE committed area's own bounds, leaving the other
   * committed areas — and the combined result set — untouched. Camera intent
   * only; must never mutate the committed result scope.
   */
  onFocusArea: (areaKey: string) => void;
  /**
   * Issue #2419 (PR-2) — "Draw search area". Enters draw mode on the map;
   * commits nothing by itself. Optional so callers that predate PR-2 keep
   * compiling — without it the entry falls back to the disabled treatment,
   * which is exactly what PR-1 shipped.
   */
  onDrawSearchArea?: () => void;
  /**
   * Issue #2419 (PR-2) — reveals the map on the mobile shell. Below the `lg`
   * breakpoint the map canvas is not mounted at all until the shopper opens
   * the Map view (verified in PR-1's browser evidence), so arming the draw
   * tool from a panel button would otherwise put them in draw mode on a
   * surface they cannot see. Optional; omitted on desktop, where the map is
   * always present.
   */
  onRevealMap?: () => void;
}

/**
 * Plural committed-header: action row ("Edit areas" / "Clear selected
 * areas" / "Draw search area" / "Create alert") + heading with joined area
 * names + a "why" line summing per-area counts.
 *
 * "Create alert" is rendered disabled — no alert-creation action exists
 * anywhere in this app yet (only in the design-mock docs), so wiring a fake
 * handler would be worse than an honest disabled state.
 *
 * Issue #2419 (PR-1) — "Draw search area" is no longer unconditionally
 * disabled with a placeholder title. It now runs the binding journey matrix
 * (`state/drawSearchAreaEligibility.ts`): hidden outright where POLYGON scope
 * does not apply, and where it does apply, disabled with a title that says
 * what is actually true. It stays disabled for the whole of PR-1 because
 * nothing can enter draw mode yet — `shared/map/DrawControl.tsx` exposes no
 * external start handle, and adding one requires the map canvas, owned by the
 * #2426 lane. PR-2 supplies the handler and flips `isDrawModeWired`.
 */
export function AreaSetSelectedHeader({
  areaKeys,
  city,
  count,
  intentNoun,
  isLoadingListings,
  onEditAreas,
  onClearAreas,
  onRemoveArea,
  onFitAll,
  onFocusArea,
  onDrawSearchArea,
  onRevealMap,
}: AreaSetSelectedHeaderProps) {
  const { data } = useDiscoverAreas(city);

  const areasByKey = useMemo(() => {
    const map = new Map<string, DiscoverArea>();
    for (const area of data?.areas ?? []) {
      map.set(area.areaKey, area);
    }
    return map;
  }, [data?.areas]);

  const selectedAreas = useMemo(
    () => areaKeys.map((key) => areasByKey.get(key)).filter((area): area is DiscoverArea => Boolean(area)),
    [areaKeys, areasByKey],
  );

  const namesJoined =
    selectedAreas.length > 0 ? selectedAreas.map((area) => area.name).join(' · ') : `${areaKeys.length} areas`;

  // Issue #2017 fix (truthfulness) — this line USED to sum each selected
  // area's own `listingCount` from useDiscoverAreas (per-area metadata: the
  // area's raw/lifetime count, ignoring the shopper's active Buy/Rent,
  // property-type, bedroom, price, etc. filters) and present it as
  // `${sum} = ${a} in X + ${b} in Y`. That number can — and, live-verified,
  // does — visibly DISAGREE with the honest, already-filtered `count` badge
  // shown right above it (e.g. "20 shown for sale" next to "29 = 24 in JP
  // Nagar + 5 in Jayanagar"), because `count` reflects the caller's active
  // filters (areaListings.length) while the per-area `listingCount` never
  // did. Presenting two different totals for the same result set as if they
  // were both authoritative is worse than useless — it reads as a bug (it
  // is one) and erodes trust in whichever number IS correct.
  //
  // Neither this component nor its caller currently has access to a
  // filter-aware, per-area, deduplicated breakdown (that requires either a
  // backend endpoint or grouping the already-fetched, already-filtered
  // `areaListings` by area — out of scope for this fix, and flagged as a
  // follow-up). Rather than keep showing a number that can contradict the
  // one above it, this now states ONLY the qualitative fact this component
  // CAN say honestly — which areas are included — with no numeric claim at
  // all. `count` above remains the single source of truth for "how many".
  const hasFullBreakdown = selectedAreas.length === areaKeys.length && selectedAreas.length > 0;
  const whyText = hasFullBreakdown
    ? `Includes ${selectedAreas.map((area) => area.name).join(' + ')}. No other area is included.`
    : null;

  return (
    <>
      {/* Issue #2596 owner follow-up — ORDER FOLLOWS THE KIT, which is not where this action row
          used to sit. The kit's committed AREA_SET panel reads:
            RESULT SCOPE — SELECTED AREAS  ->  heading + count  ->  chips  ->  Edit / Clear  ->  Draw / Alert
          This component previously rendered the action row ABOVE the heading. The chips go
          between the heading and the actions, so the action row moves below the heading to put
          them there — which also satisfies "chips above the action row" literally.

          The reorder is therefore NOT purely additive, and is called out here because it was
          authorised as an additive change: the position is the kit's, and leaving the actions on
          top would have put the chips above the heading they belong to. */}
      <AreaSetHeadingBlock
        selectedAreas={selectedAreas}
        areaKeys={areaKeys}
        namesJoined={namesJoined}
        hasFullBreakdown={hasFullBreakdown}
        count={count}
        intentNoun={intentNoun}
        isLoadingListings={isLoadingListings}
        onFocusArea={onFocusArea}
      />

      {/* The committed area chips, in the RIGHT PANEL. Owner: "the area name chips come on the
          map, it should be on the right panel as in the mock."

          These read the COMMITTED `areaKeys` this component already receives and remove by
          committing the remaining set, so they act immediately — distinct from the map overlay's
          chips, which edit the uncommitted DRAFT via `commands.remove` and take effect only on
          "Show listings". Same AREA_SET state either way; no second selection state is created.

          Removing the LAST area clears the scope rather than committing an empty AREA_SET, which
          is not a state the rest of the app models. */}
      {selectedAreas.length > 0 && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Selected areas"
          data-testid="area-set-panel-committed-chips"
        >
          {selectedAreas.map((area) => (
            <span
              key={area.areaKey}
              className="inline-flex items-center gap-1 rounded-full border border-copper/40 bg-accent-tint px-2.5 py-1 text-xs font-medium text-foreground"
              data-testid={`area-set-panel-committed-chip-${area.areaKey}`}
            >
              {area.name}
              <button
                type="button"
                onClick={() => onRemoveArea(area.areaKey)}
                aria-label={`Remove ${area.name} from the selected areas`}
                data-testid={`area-set-panel-committed-chip-${area.areaKey}-dismiss`}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="area-set-action-row">
        <EPGhost onClick={onEditAreas} testId="area-set-edit-areas">
          Edit areas
        </EPGhost>
        <EPGhost onClick={onClearAreas} testId="area-set-clear-areas">
          Clear selected areas
        </EPGhost>
        <EPGhost
          onClick={onFitAll}
          title="Reframe the map to fit every selected area"
          testId="area-set-fit-all"
        >
          Fit all
        </EPGhost>
        <DrawSearchAreaEntry
          hasResidentialListingScope={areaKeys.length > 0}
          onDrawSearchArea={onDrawSearchArea}
          onRevealMap={onRevealMap}
        />
        <EPGhost disabled title="Create alert is not available yet" testId="area-set-create-alert">
          Create alert
        </EPGhost>
      </div>

      <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]" data-testid="area-set-why">
        {whyText ??
          `Explore verified listings across ${areaKeys.length} selected areas, with map context and area-first filters.`}
      </p>
    </>
  );
}

/**
 * The AREA_SET heading block — eyebrow, per-area focus links and the count — lifted out of
 * {@link AreaSetSelectedHeader} unchanged when the kit's order put the committed chips between it
 * and the action row (Issue #2596). Extracted rather than duplicated so the two cannot drift.
 */
function AreaSetHeadingBlock({
  selectedAreas,
  areaKeys,
  namesJoined,
  hasFullBreakdown,
  count,
  intentNoun,
  isLoadingListings,
  onFocusArea,
}: {
  selectedAreas: DiscoverArea[];
  areaKeys: string[];
  namesJoined: string;
  hasFullBreakdown: boolean;
  count: number;
  intentNoun: 'sale' | 'rent';
  isLoadingListings: boolean;
  onFocusArea: (areaKey: string) => void;
}) {
  return (
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Result scope — Selected areas
          </p>
          <h1
            className="mt-0.5 flex flex-wrap items-baseline gap-x-1 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground"
            data-testid="area-set-heading"
          >
            {hasFullBreakdown ? (
              selectedAreas.map((area, idx) => (
                <span key={area.areaKey} className="inline-flex items-baseline">
                  {idx > 0 && <span className="mr-1 text-muted-foreground" aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => onFocusArea(area.areaKey)}
                    title={`Focus the map on ${area.name}`}
                    aria-label={`Focus the map on ${area.name}`}
                    data-testid={`area-set-focus-${area.areaKey}`}
                    className="rounded-sm text-left underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-copper focus-visible:decoration-copper focus-visible:outline-none"
                  >
                    {area.name}
                  </button>
                </span>
              ))
            ) : (
              namesJoined
            )}
          </h1>
        </div>
        {!isLoadingListings && (
          <div className="shrink-0 text-right" data-testid="area-header-count">
            <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">{count}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {intentNoun === 'rent' ? 'shown for rent' : 'shown for sale'}
            </p>
          </div>
        )}
      </div>
  );
}

export interface AreaSetTwoTileRowProps {
  /** First area in the committed set — used as the schools-tile label. */
  primaryAreaName: string;
  /** That same area's `areaKey` — resolves its school count out of the shared areas query. */
  primaryAreaKey: string;
  /** City slug for `useDiscoverAreas`, self-sourced per this file's convention (see header). */
  city: string;
  /**
   * The count the caller's own `AreaPoint` already carries, if any. The map
   * journey populates it (`useDiscoverMapData` maps `DiscoverArea.schoolCount`
   * through); the node journey's `deriveAreaPointFromNode` does not. Used only
   * until the shared areas query resolves — never as a substitute for it.
   */
  fallbackSchoolCount?: number | null;
  /** Omit (undefined) to render the schools tile disabled, mirroring the single-area CTA's `onAddSchool &&` gate. */
  onAddSchool?: () => void;
  onAddNearbyAreas: () => void;
}

/**
 * Two-tile panel row shown directly below the multi-area header, replacing
 * the single-area "Add a school in this area" CTA card. "Add nearby areas"
 * reuses the SAME draft popover `AreaSetChips.tsx` already provides (that
 * widget has no external open handle, so both tiles reveal the map — where
 * the widget lives — via `useDiscoverShell().setMobileView('MAP')`, the
 * confirmed real mechanism; on desktop the map is already visible).
 */
export function AreaSetTwoTileRow({
  primaryAreaName,
  primaryAreaKey,
  city,
  fallbackSchoolCount,
  onAddSchool,
  onAddNearbyAreas,
}: AreaSetTwoTileRowProps) {
  // Issue #2596 — the kit's schools tile reads "{schoolN} schools · keeps this area"
  // (ExpPanel.jsx L399), so the number has to be REAL or absent; there is no honest
  // placeholder for it. Self-sourced from `useDiscoverAreas(city)` following this file's
  // established convention (see the header comment). `schoolCount` is non-optional on
  // `DiscoverArea`, and no new endpoint is involved.
  //
  // WHY THIS COSTS NO EXTRA REQUEST, anchored correctly (PR #2601 review, MEDIUM-2).
  // An earlier version of this comment credited the dedupe to sharing a React Query key with
  // `AreaSetSelectedHeader`. That reason is FALSE, though the conclusion happens to hold: the
  // two can never co-render. The header requires `multiAreaKeys` truthy and this row requires
  // it falsy (`AreaSelectedPanel.tsx`: `multiAreaKeys ? <AreaSetSelectedHeader/> : …` against
  // `multiAreaKeys ? null : <this row/>`), so they are mutually exclusive by construction and
  // the header's own query is never the one this hook rides on.
  //
  // The real guarantee is the PARENT's own call. `AreaSelectedPanel.tsx:1449-1450` runs
  // `useDiscoverAreas(resolvedAreasCity)` UNCONDITIONALLY — it feeds the previous-scope
  // restore path and has nothing to do with this tile — and hands this row the identical
  // `city || nav.city || DEFAULT_CITY` expression, so both resolve to one key and this hook
  // is served from that cache.
  //
  // THE COUPLING IS LATENT AND SILENT: delete that parent call, make it conditional, or let
  // the two city expressions drift apart, and this row becomes the first subscriber — adding
  // exactly the request this paragraph claims is impossible. Nothing would fail or warn; it
  // would simply fetch. If `1449-1450` moves, re-derive this claim instead of trusting it.
  const { data } = useDiscoverAreas(city);
  const schoolCount = useMemo(() => {
    const fromAreas = data?.areas.find((area) => area.areaKey === primaryAreaKey)?.schoolCount;
    const resolved = fromAreas ?? fallbackSchoolCount;
    // A genuine 0 is kept and shown; only a missing/non-finite value degrades.
    return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : null;
  }, [data?.areas, primaryAreaKey, fallbackSchoolCount]);

  // Two-up from `sm`, stacked below it. The mock's two-column geometry is authoritative on the
  // desktop panel and reproduces exactly there. At 390px, though, two columns leave each tile
  // ~175px: measured, "Schools in Sanjeevini Nagar" wrapped to three ragged lines and the row
  // came to 124px — barely better than the stacked card this replaces, and uglier. One column
  // per row at mobile gives each tile the full width, so the label fits on one line and the
  // tiles stay at their compact single-row height.
  //
  // No border or padding of its own any more (Issue #2596): this row is now a child of the
  // panel's search + recommendations workflow group, which owns the single hairline and the
  // px-4 rhythm for both. The kit has no divider between the search box and this grid.
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      data-testid="area-set-two-tile-row"
    >
      <button
        type="button"
        onClick={onAddSchool}
        disabled={!onAddSchool}
        data-testid="area-set-schools-tile"
        className={cn(
          // `rounded-md`, NOT `rounded-lg` (Issue #2596, owner-authorised kit parity).
          // This project overrides the radius scale: `--radius: 0.625rem`, so `rounded-lg`
          // is 10px and `rounded-md` is `calc(var(--radius) - 2px)` = 8px. The kit sets
          // these tiles to `var(--radius-md)`, which its own tokens/spacing.css defines as
          // 8px — so `rounded-md` is an exact match, and the Tailwind default scale (where
          // `rounded-md` would be 6px) does not apply here.
          'flex items-center gap-[9px] rounded-md border border-plum/20 bg-plum-tint px-[11px] py-[9px] text-left transition-colors',
          onAddSchool ? 'hover:border-plum/50' : 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-plum text-plum-foreground">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {/*
            NOT `truncate`. At 390px this grid gives each tile ~175px, and a clamped single line
            rendered "Schools i…" / "Add near…" — compact, and unreadable. Wrap with tight leading
            instead: the row grows a little at mobile and stays far below the stacked-card baseline.
          */}
          <span className="block text-[13px] font-bold leading-tight text-foreground">Schools in {primaryAreaName}</span>
          {/*
            The kit sets this sub-label in the MONO face, plum, 11.5px (ExpPanel.jsx L399) —
            it is a figure, and the mono face is how this design system marks figures.
            "1 school" rather than the kit's literal "{n} schools" when the count is one:
            the kit's fixture never renders that case, and shipping "1 schools" to a real
            area that has one school is a defect, not parity.
            With no truthful count available the tile keeps its previous copy instead of
            inventing a number or asserting a zero the data never stated.
          */}
          <span className="block font-mono text-[11.5px] text-plum" data-testid="area-set-schools-tile-sub">
            {schoolCount === null
              ? 'See nearby schools'
              : `${schoolCount} ${schoolCount === 1 ? 'school' : 'schools'} · keeps this area`}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onAddNearbyAreas}
        data-testid="area-set-add-nearby-tile"
        // `rounded-md` = 8px here — see the schools tile above for the token derivation.
        className="flex items-center gap-[9px] rounded-md border border-border bg-card px-[11px] py-[9px] text-left transition-colors hover:border-copper/40"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight text-foreground">Add nearby areas</span>
          {/* Issue #2596 — the kit's wording (ExpPanel.jsx L403), and truthful on this
              surface: the row renders only in the single-area state, so exactly one area
              is already committed and `AREA_SET_MAX_AREAS` (3) leaves room for two more. */}
          <span className="block text-[11.5px] text-muted-foreground" data-testid="area-set-add-nearby-tile-sub">
            Add up to 2 nearby areas
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
      </button>
    </div>
  );
}
