/**
 * School journey panels.
 *
 * SchoolSelectedPanel is the full implementation (S3); other panels remain as
 * stubs until their milestones ship.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, GraduationCap, LayoutGrid, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { PanelHeader } from '../PanelHeader';
import { PropertyCard } from '../PropertyCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { useSchoolSearch } from '@/hooks/useSchoolSearch';
import { usePopularSchools } from '@/hooks/usePopularSchools';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { SchoolsInAreaPanel as RealSchoolsInAreaPanel } from './SchoolsInAreaPanel';

const RADIUS_OPTIONS = [1, 2, 3, 5] as const;
type RadiusKm = (typeof RADIUS_OPTIONS)[number];

// ─── Shared placeholder ───────────────────────────────────────────────────────

interface Milestone2PlaceholderProps {
  title: string;
  journey?: DiscoverJourney | null;
  onStartOver?: () => void;
}

function Milestone2Placeholder({ title, journey, onStartOver }: Milestone2PlaceholderProps) {
  return (
    <>
      <PanelHeader title={title} journey={journey} onStartOver={onStartOver} />
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-10 px-4">
        <EmptyState
          icon={<GraduationCap className="h-8 w-8 text-muted-foreground/40" />}
          heading="Coming in Milestone 2"
          description="School-journey features are not yet available"
        />
      </div>
    </>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** school-first journey — no area or school selected yet. */
export interface SchoolBrowsePanelProps {
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
  onSelectSchool: (schoolId: string) => void;
  onSelectAreaKey: (areaKey: string) => void;
  /** City to fetch schools/areas for — threaded from the parent to avoid a redundant useDiscoverUrlState call. */
  city: string;
  /**
   * Issue #1485 — zone/group cards for Level-1 school-browse (zones → areas → schools).
   * When provided (non-empty), zone cards replace the flat area list.
   * The flat area list is kept as a fallback when areaGroups is empty/loading.
   */
  areaGroups?: AreaGroup[];
  /** True while areaGroups is loading. */
  isLoadingAreaGroups?: boolean;
  /**
   * Called when the user clicks a zone card in Level-1.
   * Writes groupId to URL (PUSH) → routes to school-group-areas (Level 2).
   */
  onSelectGroup?: (groupId: string) => void;
  /**
   * Issue #1485 — discoverAreas for computing per-group school/listing counts.
   * The count badges on zone cards are client-side Σ of member area counts.
   */
  discoverAreas?: DiscoverArea[];
}

// ─── Internal sub-components ─────────────────────────────────────────────────

function SchoolCard({ school, onClick }: { school: SchoolResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg hover:border-purple-400 hover:shadow-md transition-all"
    >
      <div className="font-semibold text-gray-900">{school.name}</div>
      <div className="text-sm text-gray-600">{school.address}</div>
      {school.board && (
        <Badge variant="outline" className="mt-2 text-xs">
          {school.board}
        </Badge>
      )}
    </button>
  );
}

// Issue #1485 — ZoneCard for Level-1 school-browse zone cards.
// Displays group name, Σ schoolCount, Σ listingCount, area count.
// Counts are derived by joining group.area_keys against discoverAreas (client-side).
interface ZoneCardProps {
  group: AreaGroup;
  memberAreas: DiscoverArea[];
  onClick: () => void;
}

function ZoneCard({ group, memberAreas, onClick }: ZoneCardProps) {
  const totalSchools = memberAreas.reduce((sum, a) => sum + a.schoolCount, 0);
  const totalListings = memberAreas.reduce((sum, a) => sum + a.listingCount, 0);
  const areaCount = group.area_keys.length;

  return (
    <button
      type="button"
      data-testid={`school-zone-card-${group.id}`}
      onClick={onClick}
      className="w-full text-left p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-lg hover:border-purple-400 hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${group.name}: ${totalSchools} school${totalSchools === 1 ? '' : 's'}, ${totalListings} listing${totalListings === 1 ? '' : 's'}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate" data-testid="school-zone-card-name">{group.name}</p>
          {group.subtitle && (
            <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{group.subtitle}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-purple-700">
              <GraduationCap className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span data-testid="school-zone-card-school-count">{totalSchools} school{totalSchools === 1 ? '' : 's'}</span>
            </span>
            <span className="text-xs text-blue-700" data-testid="school-zone-card-listing-count">
              {totalListings} listing{totalListings === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground bg-white/70 rounded-full px-2 py-0.5 font-medium border border-purple-200" data-testid="school-zone-card-area-count">
          {areaCount} area{areaCount === 1 ? '' : 's'}
        </span>
      </div>
    </button>
  );
}

function AreaCard({
  area,
  onClick,
}: {
  area: { areaKey: string; name: string; schoolCount: number };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid="area-card"
      className="w-full text-left p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">{area.name}</div>
          <div className="text-sm text-blue-700 flex items-center gap-1.5 mt-1">
            <GraduationCap size={14} />
            {area.schoolCount} schools
          </div>
        </div>
      </div>
    </button>
  );
}

export function SchoolBrowsePanel({
  onStartOver,
  journey,
  onSelectSchool,
  onSelectAreaKey,
  city,
  areaGroups = [],
  isLoadingAreaGroups = false,
  onSelectGroup,
  discoverAreas = [],
}: SchoolBrowsePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // Issue #1160 cycle-2: must call setSchoolJourney (not delegate via onSelectSchool(id))
  // so that areaKey is resolved and written to the URL in the same atomic push.
  const [urlState, urlActions] = useDiscoverUrlState();

  const schoolSearchResult = useSchoolSearch(searchQuery);
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
      zoom: urlState.viewport?.zoom ?? 14,
      areaKey: school.areaKey,
    });
  };

  const isSearching = searchQuery.trim().length >= 2;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader
        title="Find homes near a school"
        subtitle="Search for a school, or explore school areas on the map."
        onStartOver={onStartOver}
        journey={journey}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search school name..."
            className="pl-9"
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
            <EmptyState
              icon={<Search size={32} />}
              heading="No schools found"
              description="Try a different search term."
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
              <div className="space-y-2" data-testid="school-zones-list">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                  Browse schools by zone
                </h3>
                {areaGroups.map((group) => {
                  const memberAreas = discoverAreas.filter((a) =>
                    group.area_keys.includes(a.areaKey),
                  );
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

/** school-first journey — area selected but no school selected yet. */
export interface SchoolsInAreaPanelProps {
  selectedArea: AreaPoint;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
  /** Pre-fetched schools from MapDiscovery — forwarded to avoid duplicate API calls. */
  schools?: SchoolResult[];
  /** Whether the parent-owned schools query is loading. */
  schoolsLoading?: boolean;
  /**
   * Whether the parent-owned schools query errored (Issue #1144).
   * When true, the panel renders a named error state with a Retry button.
   * Should be wired from MapDiscovery's useSchoolsByArea isError result.
   */
  schoolsError?: boolean;
  /**
   * Callback to retry the parent-owned schools query (Issue #1144).
   * Called when the Retry button is clicked in the error state.
   */
  onSchoolsRetry?: () => void;
  /**
   * Issue #1198 — whether the parent-owned schools query is refetching. Forwarded to the
   * inner panel to drive its #1170 Retry loading feedback (disabled + "Retrying…" + aria-busy).
   * NOTE: distinct from `isFetching` below, which is the AREA-LISTINGS refetch flag.
   */
  schoolsFetching?: boolean;
  /**
   * Issue #1157 Option (i) — area-first school select. When provided, selecting a
   * school calls this (MapDiscovery.handleSelectSchoolById → setSchoolParams) which
   * sets schoolId + drops schoolPicking WITHOUT flipping the journey, routing the panel
   * to area-school-combined. When omitted (school-first), the inner panel keeps its
   * existing setSchoolJourney path (journey flips to school-first).
   */
  onSelectSchool?: (schoolId: string) => void;
  /**
   * Issue #1074 Slice A — property listings for the selected area. When present,
   * a property-cards section renders below the schools list (mirrors AreaSelectedPanel).
   */
  areaListings?: DiscoverCityListingItem[];
  /** Whether the area-listings query is loading. */
  isLoadingAreaListings?: boolean;
  /**
   * Issue #1170 — true while an area-listings refetch is in flight (filter change /
   * radius change), distinct from the initial skeleton load. Drives the
   * AreaSelectedPanel-style opacity dim on the "Homes in this area" body.
   */
  isFetching?: boolean;
  /** Forwarded to PropertyCard so unauth users get the gated card variant. */
  isAuthenticated?: boolean;
  /** Active context chips rendered in the panel header (mirrors SchoolSelectedPanel). */
  activeContextChips?: React.ReactNode;
  /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
}
export function SchoolsInAreaPanel({
  onStartOver,
  onBack,
  journey,
  schools,
  schoolsLoading,
  schoolsError,
  onSchoolsRetry,
  schoolsFetching,
  onSelectSchool,
  areaListings,
  isLoadingAreaListings,
  isFetching = false,
  isAuthenticated = false,
  activeContextChips,
  intent = 'buy',
}: SchoolsInAreaPanelProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top half: the existing schools-in-area surface */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <RealSchoolsInAreaPanel
          journey={journey ?? 'area-first'}
          onStartOver={onStartOver || (() => undefined)}
          onBack={onBack}
          schools={schools}
          schoolsLoading={schoolsLoading}
          schoolsError={schoolsError}
          onSchoolsRetry={onSchoolsRetry}
          schoolsFetching={schoolsFetching}
          onSelectSchool={onSelectSchool}
          activeContextChips={activeContextChips}
        />
      </div>

      {/* Bottom half: property listings in the same area (Issue #1074 Slice A).
          Mirrors AreaSelectedPanel's listing surface — only rendered when the
          parent passes areaListings (school-first + areaKey state). */}
      {(areaListings !== undefined || isLoadingAreaListings) && (
        <div
          className="border-t border-border flex-shrink-0 max-h-[45%] flex flex-col bg-card"
          data-testid="schools-in-area-properties"
        >
          <div className="px-4 py-2 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              Properties for {intent === 'rent' ? 'rent' : 'sale'} in this area
            </h3>
          </div>
          {/* Issue #1170 — mirror AreaSelectedPanel: dim during an in-flight refetch
              (isFetching) but NOT during the initial skeleton load, so cached responses
              never flash and the settled empty state stays readable. */}
          <div
            className={cn(
              'flex-1 overflow-y-auto transition-opacity duration-150',
              isFetching && !isLoadingAreaListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
            )}
          >
            {isLoadingAreaListings ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} data-testid="listing-skeleton" className="rounded-lg border border-border p-3">
                    <Skeleton className="w-full h-32 rounded-lg mb-3" />
                    <Skeleton className="h-4 w-2/3 mb-2" />
                    <Skeleton className="h-3 w-1/3 mb-2" />
                  </div>
                ))}
              </div>
            ) : !areaListings || areaListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
                <MapPin className="h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No properties for {intent === 'rent' ? 'rent' : 'sale'} in this area yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {areaListings.map((listing) => (
                  <PropertyCard
                    key={listing.id}
                    listing={listing}
                    isAuthenticated={isAuthenticated}
                    onNavigate={() => navigate(`/listing/${listing.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** school-first journey — schoolId present. */
export interface SchoolSelectedPanelProps {
  /** The resolved school object. Null during cold-load while schoolById is fetching. */
  school: SchoolResult | null;
  /** Proximity-filtered listings from MapDiscovery (already server-filtered). */
  listings: DiscoverCityListingItem[];
  isLoadingListings: boolean;
  /**
   * Issue #1170 — true while a school-radius/filter refetch is in flight (distinct from
   * the initial skeleton load). Drives the AreaSelectedPanel-style opacity dim so active
   * loads of the selected-school property set are visible without a cached-response flash.
   */
  isFetching?: boolean;
  /** Current radius in km — null before URL param resolves (uses default). */
  radiusKm: number | null;
  /** Called when the user picks a new radius button. Parent writes URL + filter. */
  onRadiusChange: (radiusKm: number) => void;
  /** Current property filters — used for the "clear property filters" empty-state action. */
  filters?: PropertyFilters;
  /** Called when property filters are cleared via the empty-state CTA. */
  onFiltersChange?: (filters: PropertyFilters) => void;
  isAuthenticated?: boolean;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  activeContextChips?: React.ReactNode;
  /**
   * Issue #1115 — when provided (auth users only), renders a CTA that the user must
   * click before the backend /api/discover/markers fetch is allowed. Undefined = CTA
   * hidden (anon users, or panel not wired yet). Called once; parent sets
   * boundedSearchTriggered=true which gates markersEnabled.
   */
  onBoundedSearch?: () => void;
  /**
   * Issue #1115 — true once the user has clicked the CTA; switches panel from
   * "Search" call-to-action to a results count helper line.
   */
  boundedSearchTriggered?: boolean;
  /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * Issue #1547 — id of the currently selected listing (URL/parent-derived).
   * Drives copper selected card frame + scroll-into-view. RISK-3 note: school markers
   * come from 3 desynced tier sources so card↔marker sync is visual-only (card side);
   * marker copper highlighting is intentionally NOT wired for school-first.
   */
  selectedListingId?: string | null;
  /**
   * Issue #1547 — called when a card is activated, for parent to sync state.
   * Optional; when absent card simply navigates.
   */
  onSelectListing?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus callback for card→marker highlight.
   * Not safely wirable for school-first (RISK-3), but accepted here to match
   * the PropertyCard prop shape and enable future wiring.
   */
  onHoverListing?: (id: string | null) => void;
}

export function SchoolSelectedPanel({
  school,
  listings,
  isLoadingListings,
  isFetching = false,
  radiusKm,
  onRadiusChange,
  filters = {},
  onFiltersChange,
  isAuthenticated = false,
  onStartOver,
  onBack,
  journey,
  filtersContent,
  activeContextChips,
  onBoundedSearch,
  boundedSearchTriggered = false,
  intent = 'buy',
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
}: SchoolSelectedPanelProps) {
  const navigate = useNavigate();

  // Issue #1547 — scroll selected card into view when selection changes.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  // Issue #1210: clamp sub-minimum/non-finite radii (e.g. ?radiusKm=0) up to the
  // minimum so the radius control shows a selected button and the empty-state text
  // never reads "within 0 km". `??` alone misses 0 (not null/undefined).
  const effectiveRadius = clampSchoolRadiusKm(radiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);

  // Intentionally scoped to the four filters surfaced in the "Clear filters" chip
  // (price range, bedrooms, property types). Toggle filters (sellerTypes, backOnMarket,
  // newToMarket, reraRegistered, readyToMove) are not shown in this panel's chip row
  // and are excluded by design.
  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
    filters.bedrooms?.length ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );

  // Cycle to next radius value; stays at 5 if already at max.
  const nextRadius = (): RadiusKm => {
    const idx = RADIUS_OPTIONS.indexOf(effectiveRadius as RadiusKm);
    return idx >= 0 && idx < RADIUS_OPTIONS.length - 1
      ? RADIUS_OPTIONS[idx + 1]
      : RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
  };

  const handleIncreaseRadius = () => {
    onRadiusChange(nextRadius());
  };

  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
    });
  }, [filters, onFiltersChange]);

  const isAtMaxRadius = effectiveRadius >= RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];

  return (
    <>
      {/* onBack is forwarded to PanelHeader which renders the single canonical Back
          chevron before the title — do NOT add a second Back button in the actions
          slot here (Option B from Issue #1143 review: unified affordance position). */}
      <PanelHeader
        title={school ? school.name : 'School'}
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        activeContextChips={activeContextChips}
        actions={
          <>
            {filtersContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Filters</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  {filtersContent}
                </SheetContent>
              </Sheet>
            )}
          </>
        }
      />

      {/* School info — radius is shown via the ActiveContextChips school chip, not here */}
      {school && (school.board || school.boardType || school.address) && (
        <div className="px-4 py-3 border-b border-border">
          {(school.board || school.boardType) && (
            <p className="text-xs text-muted-foreground mb-0.5">
              {school.board ?? school.boardType}
            </p>
          )}
          {school.address && (
            <p className="text-xs text-muted-foreground truncate">{school.address}</p>
          )}
        </div>
      )}

      {/* Issue #1261 — the anonymous school-radius listing set is now sourced from the
          PUBLIC /school-radius-listings endpoint, which performs the same cross-area
          ST_DWithin proximity query the authenticated path uses. The radius circle and the
          listing set are therefore consistent for anon users, so the prior #1193
          "Showing homes in this area only" limitation note has been removed. */}

      {/* Radius selector */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2">Radius</p>
        <div className="flex gap-2" role="group" aria-label="Select search radius">
          {RADIUS_OPTIONS.map((km) => (
            <Button
              key={km}
              variant={effectiveRadius === km ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs px-3 flex-1',
                effectiveRadius === km && 'bg-primary text-primary-foreground',
              )}
              onClick={() => onRadiusChange(km)}
              aria-pressed={effectiveRadius === km}
              data-testid={`radius-btn-${km}`}
            >
              {km} km
            </Button>
          ))}
        </div>
      </div>

      {/* Issue #1115 — bounded-search CTA.
          Auth users see a "Search within N km" button before markers are fetched.
          Hidden for anon (marker fetch is auth-gated; a no-op CTA is confusing).
          Switches to a results count helper line once the user has triggered the search. */}
      {isAuthenticated && onBoundedSearch && !boundedSearchTriggered && (
        <div className="px-4 py-3 border-b border-border">
          <Button
            variant="default"
            size="sm"
            className="w-full"
            onClick={onBoundedSearch}
            data-testid="school-bounded-search-cta"
          >
            Search within {effectiveRadius} km
          </Button>
        </div>
      )}
      {/* Issue #1115 DEFECT 3 — suppress the count during an in-flight refetch: the
          listing body is already dimmed (#1170 pattern) but the count would otherwise
          stay fully visible with a stale number, undermining the "honest count" (AC5).
          Mirrors the isLoadingListings guard: both hide the label during unsettled state.
          The condition uses isFetching (available as a prop) consistently with the dim. */}
      {isAuthenticated && boundedSearchTriggered && !isLoadingListings && !isFetching && (
        <p
          className="px-4 py-2 text-xs text-muted-foreground border-b border-border"
          data-testid="school-bounded-search-count"
          aria-live="polite"
        >
          {listings.length} {listings.length === 1 ? 'property' : 'properties'} for{' '}
          {intent === 'rent' ? 'rent' : 'sale'} found
          {school ? ` near ${school.name}` : ''}
        </p>
      )}

      {/* Listing body — Issue #1170: AreaSelectedPanel-style dim on an in-flight
          refetch (isFetching) but NOT during the initial skeleton load, so cached
          responses never flash and the settled empty state stays readable/clickable. */}
      <div
        className={cn(
          'flex-1 overflow-y-auto transition-opacity duration-150',
          isFetching && !isLoadingListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="listing-skeleton" className="rounded-lg border border-border p-3">
                <Skeleton className="w-full h-40 rounded-lg mb-3" />
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-4" data-testid="empty-state-message">
              No properties for {intent === 'rent' ? 'rent' : 'sale'} found within {effectiveRadius} km
              {school ? ` of ${school.name}` : ''}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={handleIncreaseRadius}
                disabled={isAtMaxRadius}
                data-testid="increase-radius-btn"
              >
                Increase radius
              </Button>
              {hasPropertyFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearPropertyFilters}
                  data-testid="clear-filters-btn"
                >
                  Clear property filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 p-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(listing.id, node);
                  else cardRefs.current.delete(listing.id);
                }}
              >
                <PropertyCard
                  listing={listing}
                  isAuthenticated={isAuthenticated}
                  onNavigate={() => navigate(`/listing/${listing.id}`)}
                  isSelected={selectedListingId === listing.id}
                  onSelect={onSelectListing}
                  onHover={onHoverListing}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Both area and school are selected (cross-journey combined state). */
export interface AreaSchoolCombinedPanelProps {
  /** Resolved area — null while cold-load hydration is in progress. */
  selectedArea: AreaPoint | null;
  /** Resolved school — null while schoolById is fetching on cold load. */
  selectedSchool: SchoolResult | null;
  /** Proximity + area-scoped listings from MapDiscovery (server-filtered). */
  listings: DiscoverCityListingItem[];
  isLoadingListings: boolean;
  /**
   * Issue #1170 — true while a school-radius/filter refetch is in flight (distinct from
   * the initial skeleton load). Drives the AreaSelectedPanel-style opacity dim.
   */
  isFetching?: boolean;
  /** Current radius in km — null before URL param resolves. */
  radiusKm: number | null;
  /** Called when the user picks a new radius. */
  onRadiusChange: (radiusKm: number) => void;
  /** Called when the user dismisses the school chip — removes schoolId/radiusKm, preserves areaKey + board/category. */
  onClearSchool: () => void;
  /** Called when the user dismisses the area chip — removes areaKey, preserves schoolId/radiusKm + board/category + property filters. */
  onClearArea: () => void;
  /** Current property filters. */
  filters?: PropertyFilters;
  /** Called when property filters are cleared via empty-state CTA. */
  onFiltersChange?: (filters: PropertyFilters) => void;
  isAuthenticated?: boolean;
  onStartOver?: () => void;
  onBack?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  activeContextChips?: React.ReactNode;
}

export function AreaSchoolCombinedPanel({
  selectedArea,
  selectedSchool,
  listings,
  isLoadingListings,
  isFetching = false,
  radiusKm,
  onRadiusChange,
  onClearSchool,
  onClearArea,
  filters = {},
  onFiltersChange,
  isAuthenticated = false,
  onStartOver,
  onBack,
  journey,
  filtersContent,
  activeContextChips,
}: AreaSchoolCombinedPanelProps) {
  const navigate = useNavigate();

  // Issue #1210: clamp sub-minimum/non-finite radii (e.g. ?radiusKm=0) up to the
  // minimum so the radius control shows a selected button and the empty-state text
  // never reads "within 0 km". `??` alone misses 0 (not null/undefined).
  const effectiveRadius = clampSchoolRadiusKm(radiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
    filters.bedrooms?.length ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );

  const nextRadius = (): RadiusKm => {
    const idx = RADIUS_OPTIONS.indexOf(effectiveRadius as RadiusKm);
    return idx >= 0 && idx < RADIUS_OPTIONS.length - 1
      ? RADIUS_OPTIONS[idx + 1]
      : RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
  };

  const handleIncreaseRadius = () => {
    onRadiusChange(nextRadius());
  };

  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
    });
  }, [filters, onFiltersChange]);

  const isAtMaxRadius = effectiveRadius >= RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];

  // Derive the human-readable title string. While either dimension is still loading,
  // fall back gracefully — the title is cosmetic and does not block the listing body.
  const areaLabel = selectedArea?.areaLabel ?? null;
  const schoolName = selectedSchool?.name ?? null;

  const title =
    areaLabel && schoolName
      ? `Homes in ${areaLabel} near ${schoolName}`
      : 'Area + School';

  // Loading skeleton — shown when either dimension is still resolving on cold load.
  if (!selectedArea || !selectedSchool) {
    return (
      <>
        <PanelHeader
          title="Area + School"
          journey={journey}
          onStartOver={onStartOver}
          onBack={onBack}
          activeContextChips={activeContextChips}
        />
        <div className="space-y-3 p-4" data-testid="combined-loading-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <Skeleton className="w-full h-40 rounded-lg mb-3" />
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-3 w-1/3 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </>
    );
  }

  // Area-scoping chips — placed after the null-guard so they only render when both
  // selectedArea and selectedSchool are resolved (areaLabel and schoolName are non-null here).
  const combinedChips = (
    <div className="flex flex-wrap gap-1" data-testid="combined-chips">
      {areaLabel && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          onClick={onClearArea}
          aria-label={`Clear area: ${areaLabel}`}
          data-testid="clear-area-chip"
        >
          <MapPin className="h-3 w-3 shrink-0" />
          {areaLabel}
          <span aria-hidden="true" className="ml-0.5">×</span>
        </button>
      )}
      {schoolName && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          onClick={onClearSchool}
          aria-label={`Clear school: ${schoolName}`}
          data-testid="clear-school-chip"
        >
          <GraduationCap className="h-3 w-3 shrink-0" />
          {schoolName}
          <span aria-hidden="true" className="ml-0.5">×</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <PanelHeader
        title={title}
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        activeContextChips={activeContextChips}
        actions={
          <>
            {filtersContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Filters</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  {filtersContent}
                </SheetContent>
              </Sheet>
            )}
          </>
        }
      />

      {/* Dimension chips */}
      <div className="px-4 py-2 border-b border-border">
        {combinedChips}
      </div>

      {/* Issue #1261 — the anonymous school-radius listing set is now sourced from the
          PUBLIC /school-radius-listings endpoint (cross-area ST_DWithin), so the radius
          circle and the listing set are consistent for anon users. The prior #1193
          "Showing homes in this area only" limitation note has been removed. */}

      {/* Radius selector */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2">Radius</p>
        <div className="flex gap-2" role="group" aria-label="Select search radius">
          {RADIUS_OPTIONS.map((km) => (
            <Button
              key={km}
              variant={effectiveRadius === km ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 text-xs px-3 flex-1',
                effectiveRadius === km && 'bg-primary text-primary-foreground',
              )}
              onClick={() => onRadiusChange(km)}
              aria-pressed={effectiveRadius === km}
              data-testid={`combined-radius-btn-${km}`}
            >
              {km} km
            </Button>
          ))}
        </div>
      </div>

      {/* Listing body — Issue #1170: dim on in-flight refetch, not initial skeleton load. */}
      <div
        className={cn(
          'flex-1 overflow-y-auto transition-opacity duration-150',
          isFetching && !isLoadingListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="combined-listing-skeleton" className="rounded-lg border border-border p-3">
                <Skeleton className="w-full h-40 rounded-lg mb-3" />
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-4" data-testid="combined-empty-state-message">
              No properties found within {effectiveRadius} km
              {' '}of {selectedSchool.name} in {selectedArea.areaLabel}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={handleIncreaseRadius}
                disabled={isAtMaxRadius}
                data-testid="combined-increase-radius-btn"
              >
                Increase radius
              </Button>
              {hasPropertyFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearPropertyFilters}
                  data-testid="combined-clear-filters-btn"
                >
                  Clear property filters
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {listings.map((listing) => (
              <PropertyCard
                key={listing.id}
                listing={listing}
                isAuthenticated={isAuthenticated}
                onNavigate={() => navigate(`/listing/${listing.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
