/**
 * SchoolBrowsePanel — school-first journey, no area or school selected yet.
 * Moved verbatim from SchoolJourneyPanels.tsx (Issue #2661 commit 4, pure
 * move — no logic/JSX changes, flat props unchanged).
 *
 * Issue #2661 commit 5 — public props narrowed from 14 flat fields to a
 * `{view, commands}` contract (see SchoolBrowsePanelProps below). The dead
 * `onSelectSchool` prop (never read in this component's body) is dropped
 * entirely, and `commands` structurally has no select-school-equivalent
 * action anywhere — this panel can never delegate a school selection to a
 * parent (see schoolBrowsePanel.noSelectSchoolCommand.test.ts).
 */
import React, { useState } from 'react';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { AlertTriangle, LayoutGrid, MapPin, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../../../PanelHeader';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';
import { Input } from '@/components/ui/input';
import { useDiscoverActions, useDiscoverViewport } from '@/features/discover/context/useDiscoverContext';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { useSchoolSearch } from '@/hooks/useSchoolSearch';
import { usePopularSchools } from '@/hooks/usePopularSchools';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { SchoolCard } from '../shared/SchoolCard';
import { SchoolBrowseIntro } from './SchoolBrowseIntro';
import { ZoneCard } from './ZoneCard';
import { AreaCard } from './AreaCard';
import {
  displayCity as computeDisplayCity,
  scopedGroups as computeScopedGroups,
  activeScopeLabel as computeActiveScopeLabel,
  macroRegionSections as computeMacroRegionSections,
  totalSchoolCount as computeTotalSchoolCount,
  zoneMemberAreas,
} from './schoolBrowseZones';
import type { SchoolChromeCommands, SchoolChromeView } from '../shared/schoolJourneyContracts';

export interface SchoolBrowsePanelView {
  chrome: SchoolChromeView;
  /** City identifier + human-readable label for the "Discover {City}" header/intro card. */
  city: {
    /** City slug to fetch schools/areas for — threaded from the parent to avoid a redundant useDiscoverUrlState call. */
    slug: string;
    /** Issue #1770 — falls back to capitalised `slug` when not provided. */
    label?: string | null;
  };
  /** Issue #1770 — active macro region scope + summary regions for zone filtering/matching. */
  scope: {
    key?: string | null;
    summaryRegions?: SummaryRegionRef[];
  };
  /**
   * Issue #1485 — zone/group cards for Level-1 school-browse (zones → areas → schools),
   * plus the flat discoverAreas fallback used when groups is empty/loading.
   */
  zones: {
    groups?: AreaGroup[];
    loading?: boolean;
    discoverAreas?: DiscoverArea[];
  };
}

export interface SchoolBrowsePanelCommands {
  chrome: SchoolChromeCommands & {
    /**
     * Visual-parity polish (cycle 2) — Area/School segmented toggle under the hero.
     * Reuses the exact same journey-switch setter JourneySwitcher already calls at the
     * guided-entry stage. Optional: when absent, the toggle is not rendered (defensive
     * — never a dead/no-op control). "School" always renders as the active pill (this
     * panel IS the school-first landing); "Area" calls selectJourney('area-first').
     */
    selectJourney?: (journey: DiscoverJourney) => void;
  };
  scope: {
    /** Issue #1770 — clears the active macro region scope. */
    clear?: () => void;
  };
  /**
   * Navigation commands. NOTE: deliberately no select-school-equivalent action
   * anywhere in this shape — SchoolBrowsePanel can never delegate school
   * selection to a parent (guarded by schoolBrowsePanel.noSelectSchoolCommand.test.ts).
   */
  navigation: {
    /** Called when the user clicks a zone card in Level-1 — writes groupId to URL (PUSH). */
    selectGroup?: (groupId: string) => void;
    /** Called when the user picks an area from the flat Browse-all fallback list. */
    selectAreaKey: (areaKey: string) => void;
  };
}

export interface SchoolBrowsePanelProps {
  view: SchoolBrowsePanelView;
  commands: SchoolBrowsePanelCommands;
}

export function SchoolBrowsePanel({ view, commands }: SchoolBrowsePanelProps) {
  const {
    chrome: { journey },
    city: { slug: city, label: cityLabel = null },
    scope: { key: scope = null, summaryRegions = [] },
    zones: { groups: areaGroups = [], loading: isLoadingAreaGroups = false, discoverAreas = [] },
  } = view;
  const {
    chrome: { startOver: onStartOver, selectJourney: onSelectJourney },
    scope: { clear: onClearScope },
    navigation: { selectGroup: onSelectGroup, selectAreaKey: onSelectAreaKey },
  } = commands;
  // Issue #1882 (Track A PR2 Slice S2c) — region-scope filtering now compares
  // the group's backend-derived region_key against scope with strict
  // equality. REPLACES matchesMacroRegion (label/direction heuristic).
  const scopedGroups = React.useMemo(
    () => computeScopedGroups(areaGroups, scope),
    [areaGroups, scope],
  );

  const activeScopeLabel = React.useMemo(
    () => computeActiveScopeLabel(scope, summaryRegions, scopedGroups),
    [scope, summaryRegions, scopedGroups],
  );

  const macroRegionSections = React.useMemo(
    () => computeMacroRegionSections(areaGroups, scope),
    [scope, areaGroups],
  );

  const [searchQuery, setSearchQuery] = useState('');
  // Issue #1160 cycle-2: must call setSchoolJourney (not delegate via onSelectSchool(id))
  // so that areaKey is resolved and written to the URL in the same atomic push.
  // Issue #1953 (build step 2) — consumes the DiscoverProvider facade instead
  // of calling useDiscoverUrlState() directly (state plumbing only).
  const viewport = useDiscoverViewport();
  const urlActions = useDiscoverActions();

  const schoolSearchResult = useSchoolSearch(searchQuery, city);
  const popularSchoolsResult = usePopularSchools(city, undefined, 6);
  const discoverAreasResult = useDiscoverAreas(city);

  // Selects a school: writes journey + school coords + resolved areaKey atomically.
  //
  // Issue #1160 cycle-3: do NOT call onSelectSchool(school.id) here.
  // onSelectSchool delegates to MapDiscovery's handleSelectSchoolById, which calls
  // urlActions.setSchoolParams({ schoolId, radiusKm }) — a second setUrlParams call in
  // the same synchronous event handler. React 18 automatic batching causes both
  // setSchoolJourney and setSchoolParams to flush together. React-Router v6 processes
  // queued setUrlParams calls sequentially; the second call's functional updater (prev =>)
  // receives the pre-batch URL (before setSchoolJourney's changes), so its output
  // replaces the first write and areaKey is lost.
  //
  // setSchoolJourney already writes journey + schoolId + radiusKm + lat + lon + zoom +
  // areaKey in a single PUSH — it is self-contained. Local selectedSchool + filter
  // state are restored by the existing urlSchoolId/schoolById effect in MapDiscovery
  // (the useSchoolById async restore path) once the URL update settles.
  const handleSchoolSelect = (school: SchoolResult) => {
    urlActions.setSchoolJourney({
      schoolId: school.id,
      radiusKm: DEFAULT_SCHOOL_RADIUS_KM,
      lat: school.latitude,
      lon: school.longitude,
      // Use current viewport zoom if available; 14 is a safe school-journey default.
      zoom: viewport?.zoom ?? 14,
      areaKey: school.areaKey,
    });
  };

  const isSearching = searchQuery.trim().length >= 2;

  // Issue #1770 — build a human-readable city label for the intro card.
  // Use the provided cityLabel prop; fall back to capitalising the city slug.
  const displayCity = computeDisplayCity(city, cityLabel);

  // Total school count across visible (scoped or unscoped) zones for the intro card stat.
  // Issue #1882 (Slice S2c) — reuses scopedGroups (region_key equality) rather
  // than re-deriving via the deleted matchesMacroRegion.
  const totalSchoolCount = React.useMemo(
    () => computeTotalSchoolCount(areaGroups, discoverAreas, scope, scopedGroups),
    [areaGroups, discoverAreas, scope, scopedGroups],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader
        title={`Discover ${displayCity}`}
        onStartOver={onStartOver}
        journey={journey}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Issue #1770 — dark navy intro card (mirrors area-first AreaGroupsIntro) */}
        {!isSearching && (
          <SchoolBrowseIntro
            displayCity={displayCity}
            activeScopeLabel={activeScopeLabel}
            totalSchoolCount={totalSchoolCount}
            onClearScope={onClearScope}
          />
        )}

        {/* Area/School segmented toggle (mock parity, cycle 2) — reuses the exact
            journey-switch setter JourneySwitcher already calls at guided-entry; no
            useDiscoverUrlState/discoverPanelState changes. Only rendered when the
            parent threads onSelectJourney (defensive — never a dead control). */}
        {onSelectJourney && (
          <div
            className="inline-flex rounded-full border border-border bg-muted/50 p-1"
            role="group"
            aria-label="Browse by area or school"
            data-testid="area-school-toggle"
          >
            <button
              type="button"
              onClick={() => onSelectJourney('area-first')}
              data-testid="area-school-toggle-area"
              aria-pressed={false}
              className="rounded-full px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Area
            </button>
            <button
              type="button"
              disabled
              data-testid="area-school-toggle-school"
              aria-pressed={true}
              className="rounded-full bg-[hsl(var(--plum))] px-4 py-1.5 text-sm font-semibold text-white shadow-sm"
            >
              School
            </button>
          </div>
        )}

        {/* Search input. NOTE (cycle 2): the mock shows placeholder "Search {City}", but
            "Search school name..." is kept verbatim — it is used as a live TESTING LOCATOR
            (getByPlaceholderText), not just an assertion, by 2 unit test files and 5 e2e
            specs (DiscoverRightPanel.routing, SchoolBrowsePanel.no-results-headline, plus
            e2e/discover-school-first-*.spec.ts, e2e/capture-school-first-polish-1770.spec.ts).
            Changing it would silently break every one of those locators. Styling (rounded
            pill + icon) is updated for mock parity; the copy itself is an intentional,
            flagged deviation — see cycle-2 report. */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search school name..."
            className="h-11 rounded-full pl-10"
          />
        </div>

        {isSearching ? (
          /* Search results */
          schoolSearchResult.isLoading ? (
            /* Issue #1150: while a school search is in flight the Popular schools /
               Browse by area sections are replaced by skeletons. Label the loading
               view so buyers understand WHY those sections disappeared. Derived from
               existing state only — no new query/effect. */
            <div className="space-y-2" aria-live="polite">
              <p
                data-testid="school-search-loading-label"
                className="text-sm text-muted-foreground"
              >
                Searching for &ldquo;{searchQuery.trim()}&rdquo;&hellip;
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
            // Issue #1954 (AC10) — no-search-results empty state now carries a real
            // "Clear search" action (previously inert copy with no way out of the
            // zero state) so the user can return to the popular-schools/zones view.
            <EmptyState
              icon={<Search size={32} />}
              heading="No schools found"
              description={`Nothing matches "${searchQuery.trim()}". Try a different search term.`}
              primaryAction={{ label: 'Clear search', onClick: () => setSearchQuery('') }}
            />
          )
        ) : (
          <>
            {/* Popular schools */}
            {popularSchoolsResult.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : popularSchoolsResult.isError ? (
              <div
                role="alert"
                data-testid="popular-schools-error-state"
                className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-red-800 flex-1">Could not load popular schools.</span>
                <button
                  onClick={() => popularSchoolsResult.refetch()}
                  data-testid="popular-schools-error-retry"
                  className="text-red-700 underline hover:no-underline font-medium flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            ) : popularSchoolsResult.data && popularSchoolsResult.data.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Popular schools
                </h3>
                {popularSchoolsResult.data.map((school) => (
                  <SchoolCard
                    key={school.id}
                    school={school}
                    onClick={() => handleSchoolSelect(school)}
                  />
                ))}
              </div>
            ) : null}

            {/* Issue #1485 — Browse by zone (Level 1 grouped hierarchy).
                When areaGroups are available, show zone cards with per-group
                Σ school/listing/area counts. Falls back to the flat area list
                when groups are empty (e.g. city has no groups configured). */}
            {isLoadingAreaGroups ? (
              <div className="space-y-2" data-testid="school-zones-loading">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : areaGroups.length > 0 && onSelectGroup ? (
              <div className="space-y-4" data-testid="school-zones-list">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5" data-testid="school-zones-heading">
                    <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                    School zones
                  </h3>
                  <span className="shrink-0 text-xs text-muted-foreground" data-testid="school-zones-count">
                    {(scope ? scopedGroups.length : areaGroups.length)}{' '}
                    zone{(scope ? scopedGroups.length : areaGroups.length) === 1 ? '' : 's'}
                  </span>
                </div>
                {scope ? (
                  <div className="space-y-2">
                    {scopedGroups.map((group) => {
                      const memberAreas = zoneMemberAreas(group, discoverAreas);
                      return (
                        <ZoneCard
                          key={group.id}
                          group={group}
                          memberAreas={memberAreas}
                          onClick={() => onSelectGroup(group.id)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {macroRegionSections.map((section) => (
                      <div key={section.label} className="space-y-2" data-testid={`macro-region-section-${section.label}`}>
                        <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-plum" aria-hidden="true" />
                            <h4 className="text-[12px] font-bold uppercase tracking-[0.06em] text-foreground">
                              {section.label}
                            </h4>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                            {section.groups.length} zone{section.groups.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {section.groups.map((group) => {
                            const memberAreas = zoneMemberAreas(group, discoverAreas);
                            return (
                              <ZoneCard
                                key={group.id}
                                group={group}
                                memberAreas={memberAreas}
                                onClick={() => onSelectGroup(group.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : discoverAreasResult.isLoading ? (
              /* Flat area fallback loading */
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : discoverAreasResult.isError ? (
              <div
                role="alert"
                data-testid="discover-areas-error-state"
                className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-red-800 flex-1">Could not load school areas.</span>
                <button
                  onClick={() => discoverAreasResult.refetch()}
                  data-testid="discover-areas-error-retry"
                  className="text-red-700 underline hover:no-underline font-medium flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            ) : discoverAreasResult.data?.areas && discoverAreasResult.data.areas.length > 0 ? (
              /* Flat area list fallback (no groups configured) */
              <div className="space-y-2" data-testid="school-flat-areas-list">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Browse schools by area
                </h3>
                {discoverAreasResult.data.areas.map((area) => (
                  <AreaCard
                    key={area.areaKey}
                    area={area}
                    onClick={() => onSelectAreaKey(area.areaKey)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
