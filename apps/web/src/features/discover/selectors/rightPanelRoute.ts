/**
 * Issue #2657 commit C1 — pure selector lifted VERBATIM in semantics from
 * DiscoverRightPanel.tsx's `case 'area-selected'` branch (the `!selectedArea`
 * sub-branch): "URL has an areaKey but areas are still hydrating" vs
 * "areas loaded and the key was not found" vs "no areaKey at all — fall
 * back to guided entry" (Issue #1064 AC3/AC4).
 *
 * Only reachable/meaningful when the caller has already established
 * `!selectedArea` (see DiscoverRightPanel.tsx's own `if (!selectedArea)`
 * guard, kept in the caller for TypeScript narrowing) — this selector does
 * not re-derive that condition itself.
 */
import { inferJourneyFromPanelContent, type DiscoverPanelContent } from '@/features/discover/utils/discoverPanelState';

export type AreaSelectedFallbackRoute = 'hydrating' | 'not-found' | 'guided';

export interface AreaSelectedFallbackRouteInput {
  urlAreaKey: string | null | undefined;
  isLoadingAreas: boolean | undefined;
}

export function resolveAreaSelectedFallbackRoute({
  urlAreaKey,
  isLoadingAreas,
}: AreaSelectedFallbackRouteInput): AreaSelectedFallbackRoute {
  if (urlAreaKey) {
    return isLoadingAreas ? 'hydrating' : 'not-found';
  }
  return 'guided';
}

/**
 * Issue #2657 C7 — architect plan §2 dispatcher. Lifts the routing DECISION
 * (never the rendering) out of DiscoverRightPanel's JSX: which of the three
 * "no resolved area yet" states applies (verbatim `resolveAreaSelectedFallbackRoute`
 * logic above, reused — NOT reimplemented — for both the 'area-selected' AND
 * 'schools-in-area' branches, which shared the exact same three-way rule
 * before this commit, see DiscoverRightPanel.tsx :1742-1750 / :1984-1990 as
 * of C6), or which journey panel owns the given `panelContent` otherwise
 * (via the existing `inferJourneyFromPanelContent`, never re-derived).
 *
 * A journey-panel route is never returned for 'area-selected'/'schools-in-area'
 * while `!hasArea` — those panels' own defensive `if (!area.point) return null`
 * nets stay unreachable in the live app, same as before this commit.
 *
 * Issue #2657 R1 (code-review Finding 1) — `{kind: 'entry'}` covers TWO
 * distinct origins that pre-refactor were also rendered differently:
 *  - `'guided-entry'`: the real `panelContent === 'guided-entry'` state
 *    (`inferJourneyFromPanelContent` returns null only for this value).
 *    Pre-refactor (DiscoverRightPanel.tsx :1419-1420 at 659a8b72) this
 *    branched on `isAnonViewport` and rendered `AnonViewportListings` when
 *    active.
 *  - `'hydration-fallback'`: the 'area-selected'/'schools-in-area'
 *    `!hasArea && !urlAreaKey` fallback (pre-refactor :1741-1750 / :1983-1989).
 *    That code path rendered `<GuidedEntryPanel {...guidedEntryProps}/>`
 *    UNCONDITIONALLY — it never read `isAnonViewport` — because a user who
 *    landed here via a dead/absent areaKey link was never inside the anon
 *    "Search this area" viewport flow. Collapsing both origins into one
 *    untagged `'entry'` kind silently let this fallback start rendering
 *    `AnonViewportListings` whenever `view.entry.anonViewport.active` was
 *    true, changing observable behaviour. `origin` lets the caller
 *    (DiscoverRightPanel.tsx) suppress the anon-viewport branch for the
 *    fallback origin, restoring the exact pre-refactor rendering.
 */
export type RightPanelRoute =
  | { kind: 'entry'; origin: 'guided-entry' | 'hydration-fallback' }
  | { kind: 'area-hydrating' }
  | { kind: 'area-not-found'; areaKey: string }
  | { kind: 'journey'; journey: 'area' | 'school' | 'agri' };

export interface ResolveRightPanelRouteInput {
  hasArea: boolean;
  urlAreaKey: string | null | undefined;
  isLoadingAreas: boolean | undefined;
}

/** The only two panelContent values whose rendering gates on `hasArea` (Issue #1064 AC3). */
const AREA_HYDRATION_GATED_PANELS = new Set<DiscoverPanelContent>(['area-selected', 'schools-in-area']);

export function resolveRightPanelRoute(
  panelContent: DiscoverPanelContent,
  { hasArea, urlAreaKey, isLoadingAreas }: ResolveRightPanelRouteInput,
): RightPanelRoute {
  if (AREA_HYDRATION_GATED_PANELS.has(panelContent) && !hasArea) {
    const fallback = resolveAreaSelectedFallbackRoute({ urlAreaKey, isLoadingAreas });
    if (fallback === 'guided') return { kind: 'entry', origin: 'hydration-fallback' };
    if (fallback === 'hydrating') return { kind: 'area-hydrating' };
    // fallback === 'not-found' here: `resolveAreaSelectedFallbackRoute` only
    // returns it from its `if (urlAreaKey)` branch, so `urlAreaKey` is
    // guaranteed truthy — TypeScript can't see across that call boundary, so
    // this narrows explicitly (`?? ''` is unreachable, never a real fallback)
    // rather than a non-null assertion.
    return { kind: 'area-not-found', areaKey: urlAreaKey ?? '' };
  }
  const journey = inferJourneyFromPanelContent(panelContent);
  if (journey === 'agri-first') return { kind: 'journey', journey: 'agri' };
  if (journey === 'area-first') return { kind: 'journey', journey: 'area' };
  if (journey === 'school-first') return { kind: 'journey', journey: 'school' };
  return { kind: 'entry', origin: 'guided-entry' };
}
