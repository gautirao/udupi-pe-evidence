import type { ReactNode } from 'react';
import { AreaSetSelectedHeader, DrawSearchAreaEntry } from '@/components/discover/panels/AreaSetSelectedExtras';
import { AreaSelectedPanelScopeBar } from '@/components/discover/panels/AreaSelectedPanelScopeBar';
import { SCOPE_TITLE } from '@/features/discover/presentation/scopeTitles';

/**
 * The narrow slice of `DiscoverShellContextValue` this section actually
 * calls — camera-only actions plus the mobile-reveal affordance, never the
 * full context shape.
 */
export interface ResultHeadingShellActions {
  fitAreaSet: () => void;
  focusAreaSetMember: (areaKey: string) => void;
  startDrawSearchArea: () => void;
  isMobileShell: boolean;
  setMobileView: (view: 'LIST' | 'MAP') => void;
}

export interface ResultHeadingProps {
  /** Non-null (and length > 1) selects the committed multi-area AREA_SET branch. */
  multiAreaKeys: string[] | null;
  /** Already resolved via resolveAreasCity — this component does not re-derive it. */
  resolvedAreasCity: string;
  count: number;
  /** Matches AreaSetSelectedHeaderProps' own literal union — never a bare `string`. */
  intentNoun: 'sale' | 'rent';
  isLoadingListings?: boolean;
  onEditAreas: () => void;
  onClearAreas: () => void;
  onRemoveArea: (areaKey: string) => void;
  shell: ResultHeadingShellActions;
  isViewportScope: boolean;
  resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT';
  headingNoun: string;
  countNoun: string;
  areaLabel: string;
  returnLabel: string | null;
  onReturn: () => void;
  onRedrawPolygon?: () => void;
  activeContextChips?: ReactNode;
}

/**
 * Issue #2658 (C3) — extracted verbatim from AreaSelectedPanel.tsx: the
 * result-scope eyebrow / headline / count / sub-copy / intent-helper block
 * (Issue #2159 reskin, Issue #2596 filter placement, Issue #2461 POLYGON
 * scope awareness), branching on a committed multi-area AREA_SET
 * (`AreaSetSelectedHeader`) vs. the single-area/VIEWPORT/POLYGON heading
 * (this component's own JSX, including the Issue #2419 draw-search-area
 * entry row and the Issue #2478 scope bar).
 *
 * Every derived string (`headingNoun`, `countNoun`, `resolvedAreasCity`)
 * is computed by the caller and passed in already-resolved — this section
 * does no further derivation, matching every other C3 section's
 * presentational-only contract.
 */
export function ResultHeading({
  multiAreaKeys,
  resolvedAreasCity,
  count,
  intentNoun,
  isLoadingListings,
  onEditAreas,
  onClearAreas,
  onRemoveArea,
  shell,
  isViewportScope,
  resultScopeKind,
  headingNoun,
  countNoun,
  areaLabel,
  returnLabel,
  onReturn,
  onRedrawPolygon,
  activeContextChips,
}: ResultHeadingProps) {
  return (
    <div className="border-b border-border px-4 pb-2.5 pt-2.5">
      {/* Issue #2159 reskin — mock density rule (VISUAL_RULES §3): the scope
          eyebrow, area title and result count read as ONE compact block
          instead of a full-bleed hero headline. Count sits outside the <h1>
          (a sibling, not a child) so the heading's accessible name stays
          exactly "Properties in {areaLabel}" for existing tests/consumers.

          PR #2180 review fix — `count` is areaListings.length, the length
          of the bounded per-area fetch slice (caller wires
          useDiscoverCityListings with limitPerArea: 50), NOT an
          authoritative total. The evergreen result-summary strip further
          below gets to say "X verified properties" safely because it has
          an escape hatch to the caller-precomputed `areaResultSummaryText`.
          This hero block does not have that wiring, so for any area with
          >50 matches, labelling this number "for sale"/"for rent" would
          silently understate the true total. Labelled "shown" instead —
          true regardless of whether the area has more matches than the
          fetch limit. */}
      {multiAreaKeys ? (
        <AreaSetSelectedHeader
          areaKeys={multiAreaKeys}
          city={resolvedAreasCity}
          count={count}
          intentNoun={intentNoun}
          isLoadingListings={isLoadingListings}
          onEditAreas={onEditAreas}
          onClearAreas={onClearAreas}
          onRemoveArea={onRemoveArea}
          // Issue #2017 (Fit all / focus-one) — camera-only actions
          // registered by useDiscoverMapDataController; see
          // DiscoverShellContextValue's AreaSetCameraActions doc. Neither
          // call touches `resultScope`/`rareas`.
          onFitAll={shell.fitAreaSet}
          onFocusArea={shell.focusAreaSetMember}
          // Issue #2419 (PR-2) — "Draw search area". Same shell-registered
          // indirection as the two camera actions above; unlike them it
          // enters draw mode rather than moving the camera, and still
          // commits nothing on its own.
          onDrawSearchArea={shell.startDrawSearchArea}
          // Below the mobile breakpoint the map canvas is not mounted until
          // the Map view is open, so the draw tool must have a surface to
          // arm on. A no-op on desktop, where the map is always present.
          onRevealMap={shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined}
        />
      ) : (
        <>
          {/* Issue #2419 (PR-2) — the draw entry belongs in EVERY eligible
              residential listing state, not only the multi-area one. Hidden
              by its own eligibility rule for VIEWPORT scope, agri and
              anonymous shoppers, so this placement adds a control only
              where drawing genuinely applies.

              Issue #2596 density — `empty:hidden`. MEASURED, not guessed:
              this row renders at height 0 when its `DrawSearchAreaEntry`
              child is hidden by its own eligibility rule, while its `mb-2`
              still applies — `:empty` matches precisely when the child
              rendered null, so the margin survives wherever the row
              actually has content.

              Issue #2419 (remaining gap) — also exclude committed POLYGON
              scope. `AreaSelectedPanelScopeBar` already renders its own
              "Redraw" CTA for resultScopeKind === 'POLYGON' below; without
              this exclusion, that Redraw button and this "Draw search area"
              entry render side by side for the same committed polygon. */}
          {!isViewportScope && resultScopeKind !== 'POLYGON' && (
            <div
              className="mb-2 flex flex-wrap items-center gap-1.5 empty:hidden"
              data-testid="area-single-action-row"
            >
              <DrawSearchAreaEntry
                hasResidentialListingScope
                onDrawSearchArea={shell.startDrawSearchArea}
                onRevealMap={shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined}
              />
            </div>
          )}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {isViewportScope
                  ? `Result scope — ${SCOPE_TITLE.VIEWPORT}`
                  : resultScopeKind === 'POLYGON'
                    ? 'Result scope — Drawn area'
                    : 'Result scope — Selected area'}
              </p>
              <h1 className="mt-0.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                {/* Issue #2461 — a committed POLYGON now renders the
                    polygon-scoped card list, so the heading must stop
                    attributing those results to the previously-selected
                    area. Keyed off the same `resultScopeKind` the
                    zero-result recovery already reads. */}
                {isViewportScope
                  ? 'On screen right now'
                  : resultScopeKind === 'POLYGON'
                    ? `${headingNoun} in your drawn area`
                    : `${headingNoun} in ${areaLabel}`}
              </h1>
            </div>
            {!isLoadingListings && (
              <div className="shrink-0 text-right" data-testid="area-header-count">
                <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
                  {count}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground" data-testid="area-header-count-noun">
                  {countNoun}
                </p>
              </div>
            )}
          </div>
          {/* R-C — sub-copy: 15px, 1.55 line-height, --text-body colour. */}
          <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]">
            {isViewportScope
              ? 'Explore verified listings in this map area, with map context and area-first filters.'
              : resultScopeKind === 'POLYGON'
                ? 'Explore verified listings inside the area you drew, with map context and area-first filters.'
                : `Explore verified listings around ${areaLabel}, with map context and area-first filters.`}
          </p>
          <AreaSelectedPanelScopeBar
            resultScopeKind={resultScopeKind}
            returnLabel={returnLabel}
            onReturn={onReturn}
            onRedrawPolygon={onRedrawPolygon}
          />
        </>
      )}

      {/* Controls card — REMOVED (product-owner ruling, #1953 follow-up). See
          AreaSelectedPanel.tsx's own git history for the retirement note;
          this section never re-added it. */}

      <p className="mt-2.5 text-xs text-muted-foreground" data-testid="area-intent-helper">
        {isViewportScope
          ? `Showing ${intentNoun} prices in ₹ for this area.`
          : resultScopeKind === 'POLYGON'
            ? `Showing ${intentNoun} prices in ₹ for your drawn area.`
            : `Showing ${intentNoun} prices in ₹ for ${areaLabel}.`}
      </p>

      {/* Issue #2596 density — same `empty:hidden` reasoning as the action row above, and the
          same measurement: `activeContextChips` is frequently a non-null node that renders
          nothing, so the `!= null` guard passes and this div contributed 10px of top margin
          around zero content. */}
      {activeContextChips != null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">{activeContextChips}</div>
      )}
    </div>
  );
}
