import { useMemo, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import { NavigationLevelPanel } from '@/components/discover/navigation/NavigationLevelPanel';
import { HierarchyBackButton } from '@/components/discover/navigation/HierarchyBackButton';
import { useDiscoverActions } from '@/features/discover/context/useDiscoverContext';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSchoolSearch, type SchoolResult } from '@/hooks/useSchoolSearch';
import { SchoolCard } from '@/components/discover/panels/SchoolJourneyPanels';
import { useDiscoverViewport } from '@/features/discover/context/useDiscoverContext';
import { deriveFocusedAreaClusterSummary } from '@/features/discover/views/DiscoverAreasJourneyPanel';
import { formatListingCount } from '@/features/discover/navigation/useAreasNavigationJourney';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';

export interface SchoolsNavigationJourneyPanelProps {
  journey: UseAreasNavigationJourneyResult;
  onSelectAreaKey: (areaKey: string) => void;
  buildNodeHref: (nodeKey: string) => string | null;
  hoveredNodeKey?: string | null;
  onHoverChange?: (nodeKey: string | null) => void;
  cityLabel?: string;
  focusedClusterMemberAreaKeys?: readonly string[] | null;
  onClusterFocusChange?: (memberAreaKeys: readonly string[] | null) => void;
  schoolSearchQuery?: string;
  onSchoolSearchQueryChange?: (q: string) => void;
}

export function SchoolsNavigationJourneyPanel({
  journey,
  onSelectAreaKey,
  buildNodeHref,
  hoveredNodeKey = null,
  onHoverChange,
  cityLabel,
  focusedClusterMemberAreaKeys = null,
  onClusterFocusChange,
  schoolSearchQuery: propSearchQuery,
  onSchoolSearchQueryChange,
}: SchoolsNavigationJourneyPanelProps) {
  const actions = useDiscoverActions();
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const schoolSearchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const setSchoolSearchQuery = (q: string) => {
    if (onSchoolSearchQueryChange) {
      onSchoolSearchQueryChange(q);
    } else {
      setLocalSearchQuery(q);
    }
  };

  // Build nodeKey → areaKey lookup from the raw server NavigationChildSummary data.
  // The frontend NEVER constructs or strips node keys — we read areaKey verbatim
  // from the server's child summary (NavigationChildSummary.areaKey, non-null for
  // AREA nodes). Keyed by nodeKey so handleSelectNode can do an O(1) lookup.
  const areaKeyByNodeKey = useMemo(
    () =>
      new Map(
        (journey.node?.children ?? [])
          .filter((c) => c.areaKey != null)
          .map((c) => [c.nodeKey, c.areaKey as string]),
      ),
    [journey.node?.children],
  );

  const focusedCluster = useMemo(
    () => deriveFocusedAreaClusterSummary(journey, focusedClusterMemberAreaKeys, 'schools'),
    [journey, focusedClusterMemberAreaKeys],
  );

  const isSearching = (schoolSearchQuery?.trim() ?? '').length >= 2;
  // Use a fallback empty string for the city parameter if undefined.
  // The backend uses city to constrain search results.
  const cityParam = cityLabel?.toLowerCase() ?? '';
  const schoolSearchResult = useSchoolSearch(schoolSearchQuery || '', cityParam);
  const viewport = useDiscoverViewport();

  const handleSchoolSelect = (school: SchoolResult) => {
    actions.setSchoolJourney({
      schoolId: school.id,
      radiusKm: DEFAULT_SCHOOL_RADIUS_KM,
      lat: school.latitude,
      lon: school.longitude,
      zoom: viewport?.zoom ?? 14,
      areaKey: school.areaKey,
    });
  };

  const handleSelectNode = (nodeKey: string) => {
    const child = journey.children.find((c) => c.nodeKey === nodeKey);
    if (!child) return;

    if (child.isLeafArea) {
      // Use the server-supplied areaKey from the raw NavigationChildSummary —
      // never strip a prefix from the nodeKey (would be frontend key construction).
      const areaKey = areaKeyByNodeKey.get(nodeKey);
      if (areaKey) onSelectAreaKey(areaKey);
    } else {
      actions.enterSchoolsJourney(nodeKey);
    }
  };

  if (journey.isLoading) {
    return (
      <div className="p-4" data-testid="schools-journey-panel-loading">
        <div className="h-6 w-1/3 animate-pulse rounded bg-secondary mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] w-full animate-pulse rounded-xl bg-card border" />
          ))}
        </div>
      </div>
    );
  }

  if (journey.isError) {
    return (
      <div className="p-4" data-testid="schools-journey-panel-error">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">Couldn't load regions</p>
            <p className="text-sm text-muted-foreground mt-1">Please try again.</p>
          </div>
          <Button variant="outline" onClick={journey.refetch}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!journey.node) {
    return null;
  }

  if (focusedCluster) {
    const clusterHeadingSchoolsLabel =
      journey.nodeCount != null
        ? `${journey.nodeCount.schoolCount} school${journey.nodeCount.schoolCount === 1 ? '' : 's'}`
        : null;
    return (
      <div className="flex flex-col p-4" data-testid="schools-cluster-focus-panel">
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          cityLabel={cityLabel || 'this city'}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-3"
        />
        <div className="mb-3" data-testid="schools-cluster-focus-heading">
          <h2 className="text-base font-semibold text-foreground">{journey.node.displayLabel}</h2>
          {clusterHeadingSchoolsLabel != null && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="schools-cluster-focus-heading-schools"
            >
              {clusterHeadingSchoolsLabel}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-3" data-testid="schools-cluster-focus-summary">
          {focusedCluster.countLabel}
        </p>
        <p className="text-xs text-muted-foreground mb-3" data-testid="schools-cluster-focus-subset-note">
          {focusedCluster.members.length} area{focusedCluster.members.length === 1 ? '' : 's'} in this map view
        </p>
        <ul className="space-y-2">
          {focusedCluster.members.map((member) => (
            <li key={member.nodeKey}>
              <button
                type="button"
                data-testid={`schools-cluster-focus-member-${member.nodeKey}`}
                data-node-key={member.nodeKey}
                className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:border-plum/60 transition-all hover:-translate-y-[1px] hover:shadow-md"
                onClick={() => {
                  if (member.areaKey) {
                    onSelectAreaKey(member.areaKey);
                  }
                }}
              >
                <span className="font-medium text-sm text-foreground">{member.displayLabel}</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {member.schoolCount ?? 0} school{(member.schoolCount ?? 0) === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2.5 rounded-md bg-secondary/60 px-3 py-2 text-[12.5px] leading-snug text-foreground/80">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--plum))]" aria-hidden="true" />
          <span className="flex-1" data-testid="schools-inside-note">
            School counts show schools located inside these areas. They are not a measure of distance from any home.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-fit rounded-full"
          data-testid="schools-cluster-focus-clear"
          onClick={() => onClusterFocusChange?.(null)}
        >
          Show all {journey.children.length} area{journey.children.length === 1 ? '' : 's'}
        </Button>
      </div>
    );
  }

  const isCityRoot = journey.node.nodeKey === ROOT_NODE_KEY;

  return (
    <div className="flex flex-col p-4" data-testid="schools-journey-panel">
      {!isCityRoot && (
        <HierarchyBackButton
          node={journey.node}
          buildHref={buildNodeHref}
          cityLabel={cityLabel || 'this city'}
          historyAdjacencyLog={journey.historyAdjacencyLog}
          className="mb-4"
        />
      )}
      
      {/* Search input (mock parity styling, functional parity locators) */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="school-search-input"
          value={schoolSearchQuery}
          onChange={(e) => setSchoolSearchQuery(e.target.value)}
          placeholder="Search school name..."
          className="h-11 rounded-full pl-10"
        />
      </div>

      {isSearching ? (
        schoolSearchResult.isLoading ? (
          <div className="space-y-2" aria-live="polite">
            <p data-testid="school-search-loading-label" className="text-sm text-muted-foreground">
              Searching for &ldquo;{schoolSearchQuery?.trim()}&rdquo;&hellip;
            </p>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : schoolSearchResult.data && schoolSearchResult.data.length > 0 ? (
          <div className="space-y-2">
            {schoolSearchResult.data.map((school) => (
              <SchoolCard
                key={school.id}
                school={school}
                onClick={() => handleSchoolSelect(school)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-[15px] font-semibold text-foreground">No schools found</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              We couldn&apos;t find any schools matching &ldquo;{schoolSearchQuery?.trim()}&rdquo; in {cityLabel || 'this city'}.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSchoolSearchQuery('')}
              className="mt-4 rounded-full"
            >
              Clear search
            </Button>
          </div>
        )
      ) : (
        <NavigationLevelPanel
          journey={{
            ...journey,
            selectNode: handleSelectNode,
          }}
          cityLabel={cityLabel}
          hoveredNodeKey={hoveredNodeKey}
          onHoverChange={onHoverChange}
          countKind="schools"
        />
      )}
    </div>
  );
}
