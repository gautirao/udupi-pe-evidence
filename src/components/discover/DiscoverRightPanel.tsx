import React from 'react';
import { AreaPoint } from '@/components/map/AreaMarkerLayer';
import { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import { GuidedEntryPanel } from './panels/GuidedEntryPanel';
import { AreaSelectionPanel } from './panels/AreaSelectionPanel';
import { AreaGroupsLandingPanel } from './panels/AreaGroupsLandingPanel';
import { AreaSelectedPanel } from './panels/AreaSelectedPanel';
import {
  SchoolBrowsePanel,
  SchoolsInAreaPanel,
  SchoolSelectedPanel,
  AreaSchoolCombinedPanel,
} from './panels/SchoolJourneyPanels';

export interface DiscoverRightPanelProps {
  panelContent: DiscoverPanelContent;
  areas: AreaPoint[];
  selectedArea?: AreaPoint | null;
  areaListings?: DiscoverCityListingItem[];
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onAreaSelect?: (area: AreaPoint) => void;
  onBack?: () => void;
  onStartOver: () => void;
  onSelectJourney: (journey: DiscoverJourney) => void;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  footerContent?: React.ReactNode;
  /** True while a filter-change refetch is in-flight (isFetching && !isLoading). */
  isFetching?: boolean;
  /** True during the initial full-screen load — disables the opacity overlay so the skeleton shows normally. */
  isInitialLoading?: boolean;
  /** Current free-text search query. Empty string when no search is active. */
  searchQuery?: string;
  /** Called when the user changes the search query. */
  onSearchChange?: (q: string) => void;
  /** Active journey (passed through from URL state for panel headers). */
  journey?: DiscoverJourney | null;
  /** Area groups for the area-groups-landing panel. */
  areaGroups?: AreaGroup[];
  /** True while area groups are loading. */
  isLoadingAreaGroups?: boolean;
  /** Called when the user selects a group from the landing panel. */
  onSelectGroup?: (groupId: string) => void;
  /** All areas in the city — used as Browse-all fallback when groups is empty. */
  discoverAreas?: DiscoverArea[];
  /** Called when the user selects an area from Browse-all fallback. */
  onSelectAreaKey?: (areaKey: string) => void;
}

export function DiscoverRightPanel({
  panelContent,
  areas: _areas,
  selectedArea,
  areaListings,
  isLoadingListings,
  isAuthenticated = false,
  onBack,
  onStartOver,
  onSelectJourney,
  filtersContent,
  trendsHref,
  footerContent,
  isFetching = false,
  isInitialLoading = false,
  searchQuery = '',
  onSearchChange,
  journey,
  areaGroups = [],
  isLoadingAreaGroups = false,
  onSelectGroup,
  discoverAreas = [],
  onSelectAreaKey,
}: DiscoverRightPanelProps) {
  function renderPanel(): React.ReactNode {
    switch (panelContent) {
      case 'guided-entry':
        return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;

      case 'area-groups-landing':
        return (
          <AreaGroupsLandingPanel
            groups={areaGroups}
            isLoading={isLoadingAreaGroups}
            onSelectGroup={onSelectGroup ?? (() => undefined)}
            onStartOver={onStartOver}
            // Satisfy the discriminated union: only spread fallbackAreas + onSelectArea
            // when onSelectAreaKey is defined, so Browse-all buttons are never silent no-ops.
            {...(onSelectAreaKey
              ? { fallbackAreas: discoverAreas, onSelectArea: onSelectAreaKey }
              : {})}
          />
        );

      case 'area-selection':
        return <AreaSelectionPanel onStartOver={onStartOver} />;

      case 'area-selected':
        if (!selectedArea) {
          // Defensive fallback: state machine says area-selected but area not yet resolved.
          return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;
        }
        return (
          <AreaSelectedPanel
            selectedArea={selectedArea}
            areaListings={areaListings}
            isLoadingListings={isLoadingListings}
            isAuthenticated={isAuthenticated}
            onBack={onBack}
            onStartOver={onStartOver}
            journey={journey}
            filtersContent={filtersContent}
            trendsHref={trendsHref}
            isFetching={isFetching}
            isInitialLoading={isInitialLoading}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
          />
        );

      case 'school-browse':
        return <SchoolBrowsePanel onStartOver={onStartOver} journey={journey} />;

      case 'schools-in-area':
        if (!selectedArea) {
          // Defensive fallback: state machine says schools-in-area but area not yet resolved.
          return <GuidedEntryPanel onSelectJourney={onSelectJourney} />;
        }
        return (
          <SchoolsInAreaPanel
            selectedArea={selectedArea}
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
          />
        );

      case 'school-selected':
        return (
          <SchoolSelectedPanel
            schoolId=""
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
          />
        );

      case 'area-school-combined':
        return (
          <AreaSchoolCombinedPanel
            selectedArea={selectedArea}
            onStartOver={onStartOver}
            onBack={onBack}
            journey={journey}
          />
        );
    }
  }

  return (
    <div
      className="flex flex-col lg:w-1/2 border-l border-border bg-card overflow-hidden order-2 lg:order-2"
      data-testid="discover-right-panel"
    >
      {renderPanel()}
      {footerContent}
    </div>
  );
}
