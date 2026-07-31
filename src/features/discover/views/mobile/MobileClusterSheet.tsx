/**
 * MobileClusterSheet — Issue #1956 PR-5 (Slice 3, AC5.6/AC5.7).
 *
 * Presentational-only mobile Map-mode bottom sheet for a focused visual AREA
 * cluster. `DiscoverAreasJourneyPanel`'s own `focusedCluster` branch already
 * renders this content in LIST mode (and on desktop), but that panel sits
 * BEHIND MapDiscovery's z-[60] full-screen mobile map overlay, so it is
 * invisible whenever `mobileView === 'MAP'` — this component is the MAP-mode
 * counterpart, mounted INSIDE that z-[60] container by MapDiscovery.tsx
 * (never portalled), following the existing MarkerPopoverCard precedent
 * (`position:absolute` + a high explicit z-index INSIDE the overlay). The
 * shared `src/components/ui/sheet.tsx` primitive is not used here: it is
 * z-50 and Radix-portals to `document.body`, landing BELOW the z-[60]
 * overlay (see team-lead-plan-pr5.toml `[reuse_seams].sheet_stacking`).
 *
 * Owns NO state and issues NO query. `summary` is derived by the SAME
 * `deriveFocusedAreaClusterSummary` pure function
 * `DiscoverAreasJourneyPanel` uses for its own LIST-mode branch, from the
 * SAME `journey`/`focusedClusterMemberAreaKeys` MapDiscovery already threads
 * to both the map layer and the panel — so the map's cluster marker, the
 * LIST-mode panel and this MAP-mode sheet can never disagree on the focused
 * member set or its count copy (AC5.6). "Show all areas" calls the SAME
 * `onClusterFocusChange(null)` the LIST-mode branch calls; selecting a
 * member calls the SAME `journey.selectNode` every other selection affordance
 * (row, marker) uses — no parallel behaviour, no new node-identity, no new
 * history/URL write (AC5.7).
 *
 * Invariant 8 — renders no result-scope controls (Edit areas / Clear
 * selected areas / Add nearby areas / Draw search area / Search this area /
 * Create alert).
 */
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { deriveFocusedAreaClusterSummary } from '@/features/discover/views/DiscoverAreasJourneyPanel';

export interface MobileClusterSheetProps {
  /** The SAME journey instance MapDiscovery owns — never a second useAreasNavigationJourney() call. */
  journey: Pick<UseAreasNavigationJourneyResult, 'node' | 'children' | 'selectNode'>;
  focusedClusterMemberAreaKeys: readonly string[] | null;
  onClusterFocusChange: (memberAreaKeys: readonly string[] | null) => void;
}

export function MobileClusterSheet({
  journey,
  focusedClusterMemberAreaKeys,
  onClusterFocusChange,
}: MobileClusterSheetProps) {
  const summary = useMemo(
    () => deriveFocusedAreaClusterSummary(journey, focusedClusterMemberAreaKeys),
    [journey, focusedClusterMemberAreaKeys],
  );

  if (!summary) return null;

  return (
    <div
      // Mounted INSIDE MapDiscovery's z-[60] mobile map overlay container —
      // a plain positioned element inheriting that stacking context (no z
      // fight with the shared sheet primitive's z-50/document.body portal).
      className="absolute inset-x-3 bottom-3 z-[1100] flex max-h-[60vh] flex-col rounded-lg border border-border bg-card p-3 shadow-lg"
      data-testid="mobile-cluster-sheet"
    >
      <p className="text-sm text-muted-foreground mb-3 shrink-0" data-testid="mobile-cluster-sheet-summary">
        {summary.countLabel}
      </p>
      <ul className="space-y-2 overflow-y-auto">
        {summary.members.map((member) => (
          <li key={member.nodeKey}>
            <button
              type="button"
              data-testid={`mobile-cluster-sheet-member-${member.nodeKey}`}
              data-node-key={member.nodeKey}
              className="w-full text-left rounded-lg border border-border bg-card p-3 shadow-sm hover:border-primary/60"
              onClick={() => journey.selectNode(member.nodeKey)}
            >
              <span className="font-medium text-sm text-foreground">{member.displayLabel}</span>
              <span className="block text-xs text-muted-foreground mt-1">
                {formatListingCount(member.listingCount)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 shrink-0"
        data-testid="mobile-cluster-sheet-clear"
        onClick={() => onClusterFocusChange(null)}
      >
        Show all areas
      </Button>
    </div>
  );
}
