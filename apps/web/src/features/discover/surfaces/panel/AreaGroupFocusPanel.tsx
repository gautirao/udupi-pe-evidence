import { useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

export interface AreaGroupFocusPanelProps {
  group: AreaGroup;
  /**
   * The already-fetched city area list (`view.geography.discoverAreasForPanel`)
   * — joined against `group.area_keys` for display name/listing count, never a
   * new fetch (#2213 design direction: reuse data already threaded through
   * `useDiscoverPageComposition`).
   */
  discoverAreas: readonly DiscoverArea[];
  /**
   * `commands.geography.selectGroupMemberArea` — owned by
   * `useDiscoverJourneySwitchController` (the SAME controller that already
   * resolves a legacy `areaKey` to a canonical node for its own conversion
   * seam, #1956 PR 6 `[rulings.oq_a_v2]`). This surface is a RENDERER (see
   * `surfaces/__tests__/surfaceLayering.guard.test.ts`): it never calls the
   * `.../navigation-path` mutation or `useToast` itself, only dispatches
   * through this injected command.
   */
  onSelectArea: (areaKey: string) => void;
  /** True while a member-area selection's node resolution is in flight. */
  isResolvingArea: boolean;
  /**
   * `urlActions.enterAreasJourney(null)` — clears the stale `groupId` and
   * mounts the canonical journey at the city root in ONE write (the same
   * "groupId-only, no areaKey" path `useDiscoverJourneySwitchController`
   * already uses). Plain URL-action command, already the established pattern
   * for this surface tree (see `AreaFirstJourneyPanel`'s direct
   * `urlActions.*` calls).
   */
  onBack: () => void;
}

/**
 * Issue #2213 — the group-FOCUS panel for the journeyless/#2088-virtual-default
 * `?groupId=<group>` state (`resolveIsSelectedGroupState` in
 * `displayEligibility.ts`): a group is resolved, no area selected yet. Until
 * this fix, `DiscoverPanelSurface` routed this exact state to the group-BLIND
 * canonical `AreaFirstJourneyPanel` (city-root Direction cards), while the map
 * already narrowed its marker fetch to the group's member areas
 * (`groupAreaKeysForMapData`) — a real map/panel scope split.
 *
 * This is a FRESH, presentational-only component — not a resurrection of the
 * legacy `AreaGroupsLandingPanel`/`AreaGroupSelectedPanel` deleted by commit
 * 1bd4ae0f (issue #1956 PR-6 Step 3). It owns no group-membership derivation
 * of its own (`group.area_keys` is #2201's sole server-owned group-identity
 * signal, resolved upstream by `useDiscoverAreaGroupsController`) and writes
 * no new URL identity — `groupId=` stays canonical PUSH navigation, and a
 * member-area selection becomes a REAL canonical `node=` hop through the
 * sanctioned `.../navigation-path` resolution endpoint (owned by the
 * `journeySwitch` controller, never fabricated here).
 */
export function AreaGroupFocusPanel({
  group,
  discoverAreas,
  onSelectArea,
  isResolvingArea,
  onBack,
}: AreaGroupFocusPanelProps) {
  const [pendingAreaKey, setPendingAreaKey] = useState<string | null>(null);

  // Clears the local "which row is spinning" flag once the shared resolver
  // settles — covers BOTH outcomes: on success this panel unmounts (the URL
  // navigates away) before it matters, and on error (stale/unresolved
  // areaKey) the panel stays mounted and the row must re-enable so another
  // area can be tried.
  useEffect(() => {
    if (!isResolvingArea) setPendingAreaKey(null);
  }, [isResolvingArea]);

  const areaByKey = new Map(discoverAreas.map((a) => [a.areaKey, a] as const));
  const memberAreas = group.area_keys.map((areaKey) => {
    const match = areaByKey.get(areaKey);
    return {
      areaKey,
      displayLabel: match?.name ?? areaKey,
      listingCount: match?.listingCount ?? 0,
    };
  });

  const handleSelectArea = (areaKey: string) => {
    if (isResolvingArea) return;
    setPendingAreaKey(areaKey);
    onSelectArea(areaKey);
  };

  return (
    <div className="p-4" data-testid="area-group-focus-panel">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        data-testid="area-group-focus-back"
        onClick={onBack}
      >
        <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
        All areas
      </Button>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground" data-testid="area-group-focus-heading">
          {group.name}
        </h2>
        {group.subtitle && <p className="text-sm text-muted-foreground">{group.subtitle}</p>}
      </div>
      {memberAreas.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 p-4 text-center"
          data-testid="area-group-focus-empty"
        >
          <AlertCircle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No areas found in this group yet.</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="area-group-focus-list">
          {memberAreas.map((area) => {
            // Code review fix (PR #2214) — was scoped to `pendingAreaKey ===
            // area.areaKey`, so every OTHER row stayed enabled while a
            // resolution was in flight: clicking a second area before the
            // first settled silently swallowed the click (`handleSelectArea`'s
            // own `isResolvingArea` guard returns early with no feedback).
            // `isResolvingArea` reflects ONE shared in-flight resolver
            // (`useDiscoverJourneySwitchController`'s `resolveAreaNavigationPath`
            // — see that controller's own doc), so every row must disable
            // together, matching the real one-resolution-at-a-time model.
            const isThisRowPending = isResolvingArea && pendingAreaKey === area.areaKey;
            return (
              <li key={area.areaKey}>
                <button
                  type="button"
                  data-testid={`area-group-focus-member-${area.areaKey}`}
                  className="w-full rounded-lg border bg-card p-3 text-left shadow-sm hover:border-primary/60 disabled:opacity-60"
                  onClick={() => handleSelectArea(area.areaKey)}
                  disabled={isResolvingArea}
                >
                  <span className="text-sm font-medium text-foreground">{area.displayLabel}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {isThisRowPending ? 'Opening…' : formatListingCount(area.listingCount)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
