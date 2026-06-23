/**
 * School journey panels.
 *
 * SchoolSelectedPanel is the full implementation (S3); other panels remain as
 * stubs until their milestones ship.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, GraduationCap, Home, Layers, LayoutGrid, MapPin, Search, SlidersHorizontal } from 'lucide-react';
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
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { clampSchoolRadiusKm } from '@/hooks/usePropertyListings';
import { SchoolsInAreaPanel as RealSchoolsInAreaPanel } from './SchoolsInAreaPanel';
import { haversineKm } from '@/lib/geo';

// ReTrends redesign: 3/5/10 km replaces 1/2/3/5 km
const RADIUS_OPTIONS = [3, 5, 10] as const;
type RadiusKm = (typeof RADIUS_OPTIONS)[number];

// ─── Shared local helpers ─────────────────────────────────────────────────────

/** Buy/Rent-aware noun for the homes count — never the vague "listings". */
function homesNoun(intent: DiscoverIntent, n: number): string {
  if (intent === 'rent') return n === 1 ? 'rental available' : 'rentals available';
  return n === 1 ? 'home for sale' : 'homes for sale';
}

/** Title-case a kebab slug for display (e.g. "university-belt" → "University Belt"). */
function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Snap a raw radiusKm to a supported chip value so exactly one radius chip is always
 * active. Valid 3/5/10 pass through unchanged. Null/non-finite and legacy out-of-set
 * values (e.g. 1/2 from older URLs) fall back to the NEAREST option (ties resolve to
 * the smaller radius), guaranteeing the UI never renders with zero active chips.
 * Built on clampSchoolRadiusKm so the existing sub-minimum normalisation still applies.
 */
function snapRadiusKm(radiusKm: number | null | undefined): RadiusKm {
  const raw = clampSchoolRadiusKm(radiusKm ?? DEFAULT_SCHOOL_RADIUS_KM);
  if ((RADIUS_OPTIONS as readonly number[]).includes(raw)) return raw as RadiusKm;
  return RADIUS_OPTIONS.reduce<RadiusKm>(
    (best, opt) => (Math.abs(opt - raw) < Math.abs(best - raw) ? opt : best),
    RADIUS_OPTIONS[0],
  );
}

// ─── Shared sub-components for the redesigned school-radius results panels ────

interface SchoolSummaryBandProps {
  school: SchoolResult;
  listings: DiscoverCityListingItem[];
  intent: DiscoverIntent;
  /** Breadcrumb: zone slug (groupId) — prettified; null if absent. */
  groupId?: string | null;
  /** Breadcrumb: area label (e.g. "Manipal"); null if absent. */
  areaLabel?: string | null;
  /** Called when the user clicks "Change school". */
  onChangeSchool: () => void;
}

function SchoolSummaryBand({
  school,
  listings,
  intent,
  groupId,
  areaLabel,
  onChangeSchool,
}: SchoolSummaryBandProps) {
  const boardDisplay = school.board ?? school.boardType ?? null;
  const count = listings.length;

  return (
    // Ink-navy band per the ReTrends mock (--surface-navy #1b2a45 + white text).
    <div
      className="m-4 rounded-2xl bg-[#1b2a45] p-5 text-white shadow-md"
      data-testid="school-summary-band"
    >
      {/* "Change school" affordance */}
      <button
        type="button"
        onClick={onChangeSchool}
        className="mb-3.5 flex items-center gap-1.5 text-[13px] font-semibold text-white/75 hover:text-white transition-colors"
        data-testid="change-school-btn"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Change school
      </button>

      {/* Breadcrumb */}
      {(groupId || areaLabel || school.name) && (
        <nav aria-label="School breadcrumb" className="mb-2.5">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-white/55">
            {groupId && (
              <>
                <li>{prettifySlug(groupId)}</li>
                <ChevronRight className="h-3 w-3 text-white/40" aria-hidden />
              </>
            )}
            {areaLabel && (
              <>
                <li>{areaLabel}</li>
                <ChevronRight className="h-3 w-3 text-white/40" aria-hidden />
              </>
            )}
            <li className="font-semibold text-white/90" aria-current="page">
              {school.name}
            </li>
          </ol>
        </nav>
      )}

      {/* School identity — plum icon tile + eyebrow/badge + serif name + address */}
      <div className="flex items-start gap-3.5">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#7e6ba8]">
          <GraduationCap className="h-[22px] w-[22px] text-white" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {/* Eyebrow + board badge (copper accent pill, mock tone="accent") */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
              Selected school
            </span>
            {boardDisplay && (
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--copper-tint))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--copper-hover))]">
                {boardDisplay}
              </span>
            )}
          </div>

          {/* School name — Fraunces serif headline in white (mock --text-on-navy), not copper */}
          <h2
            className="font-['Fraunces',_ui-serif,_Georgia,_serif] text-[22px] font-semibold leading-tight tracking-tight text-white"
            data-testid="school-summary-name"
          >
            {school.name}
          </h2>

          {/* Address */}
          {school.address && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/70">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden />
              {school.address}
            </p>
          )}
        </div>
      </div>

      {/* Count — separated by a hairline rule, mono numerals (mock layout) */}
      <div className="mt-[18px] flex gap-7 border-t border-white/[0.14] pt-4">
        <div data-testid="school-summary-count">
          <div className="font-['Geist_Mono',_ui-monospace,_monospace] text-[22px] font-semibold tabular-nums text-white">
            {count}
          </div>
          <div className="text-xs text-white/60">{homesNoun(intent, count)}</div>
        </div>
      </div>
    </div>
  );
}

interface RadiusChipsProps {
  effectiveRadius: number;
  listingCount: number;
  intent: DiscoverIntent;
  onRadiusChange: (km: number) => void;
  /** testid prefix — "radius-btn" for SchoolSelectedPanel, "combined-radius-btn" for AreaSchoolCombinedPanel */
  testIdPrefix?: string;
}

function RadiusChips({
  effectiveRadius,
  listingCount,
  intent,
  onRadiusChange,
  testIdPrefix = 'radius-btn',
}: RadiusChipsProps) {
  const noun = intent === 'rent' ? 'rental' : 'home';
  return (
    <div className="px-4 py-3 border-b border-border">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
        Search radius
      </p>
      <div className="flex gap-2" role="group" aria-label="Select search radius">
        {RADIUS_OPTIONS.map((km) => {
          const isActive = effectiveRadius === km;
          return (
            <button
              key={km}
              type="button"
              aria-pressed={isActive}
              data-testid={`${testIdPrefix}-${km}`}
              onClick={() => onRadiusChange(km)}
              className={cn(
                'flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                isActive
                  ? 'border-[hsl(var(--plum))] bg-[hsl(var(--plum))] text-white shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-[hsl(var(--plum))]/50 hover:text-foreground',
              )}
            >
              {km} km
              {/* Only show count on the active chip — cannot honestly show per-chip
                  counts for other radii without a separate fetch per radius. */}
              {isActive && (
                <span className="ml-1 opacity-80">
                  · {listingCount} {listingCount === 1 ? noun : `${noun}s`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface RadiusResultHeadingProps {
  listingCount: number;
  effectiveRadius: number;
  intent: DiscoverIntent;
}

function RadiusResultHeading({ listingCount, effectiveRadius, intent }: RadiusResultHeadingProps) {
  const headingText =
    intent === 'rent'
      ? 'Rentals near this school'
      : 'Homes for sale near this school';

  return (
    <div
      className="flex items-center justify-between px-4 py-2 border-b border-border"
      data-testid="radius-result-heading"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {headingText}
      </p>
      <p className="text-xs font-semibold tabular-nums text-muted-foreground">
        <span data-testid="radius-result-count">{listingCount}</span> within {effectiveRadius} km
      </p>
    </div>
  );
}

interface SchoolRadiusEmptyStateProps {
  school: SchoolResult | null;
  areaLabel: string | null;
  effectiveRadius: number;
  intent: DiscoverIntent;
  hasPropertyFilters: boolean;
  onRadiusChange: (km: number) => void;
  onClearSchool: () => void;
  onClearPropertyFilters: () => void;
}

function SchoolRadiusEmptyState({
  school,
  areaLabel,
  effectiveRadius,
  intent,
  hasPropertyFilters,
  onRadiusChange,
  onClearSchool,
  onClearPropertyFilters,
}: SchoolRadiusEmptyStateProps) {
  const noun = intent === 'rent' ? 'rentals' : 'homes';
  // Only offer "Try N km" for radii larger than current.
  const largerOptions = RADIUS_OPTIONS.filter((km) => km > effectiveRadius);

  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="school-radius-empty-state"
    >
      <GraduationCap className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden />
      <p className="text-sm font-semibold text-foreground mb-1">
        No {noun} found within {effectiveRadius} km{school != null ? ` of ${school.name}` : ''}
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Try a wider radius or explore the broader area.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {largerOptions.map((km) => (
          <Button
            key={km}
            variant="outline"
            size="sm"
            onClick={() => onRadiusChange(km)}
            data-testid={`try-radius-${km}-btn`}
          >
            Try {km} km
          </Button>
        ))}
        {areaLabel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSchool}
            data-testid="view-all-in-area-btn"
          >
            View all {noun} in {areaLabel}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSchool}
          data-testid="change-school-empty-btn"
        >
          Change school
        </Button>
        {hasPropertyFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearPropertyFilters}
            data-testid="clear-filters-btn"
          >
            Clear property filters
          </Button>
        )}
      </div>
    </div>
  );
}

interface MissingCoordsEmptyStateProps {
  school: SchoolResult;
  areaLabel: string | null;
  onClearSchool: () => void;
}

function MissingCoordsEmptyState({ school, areaLabel, onClearSchool }: MissingCoordsEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full p-6 text-center"
      data-testid="missing-coords-empty-state"
    >
      <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden />
      <p className="text-sm font-semibold text-foreground mb-1">
        Distance unavailable for {school.name}
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        We can&apos;t calculate distance for this school yet.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {areaLabel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSchool}
            data-testid="view-all-in-area-missing-coords-btn"
          >
            View all homes in {areaLabel}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSchool}
          data-testid="choose-another-school-btn"
        >
          Choose another school
        </Button>
      </div>
    </div>
  );
}

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
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-foreground truncate">{school.name}</span>
            {school.board && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {school.board}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{school.address}</span>
          </div>
        </div>
      </div>
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
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${group.name}: ${totalSchools} school${totalSchools === 1 ? '' : 's'}, ${totalListings} listing${totalListings === 1 ? '' : 's'}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <Layers className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate" data-testid="school-zone-card-name">{group.name}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="school-zone-card-area-count">
              {areaCount} area{areaCount === 1 ? '' : 's'}
            </span>
          </div>
          {group.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.subtitle}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
            <span data-testid="school-zone-card-school-count">
              <span className="font-semibold text-foreground tabular-nums">{totalSchools}</span> school{totalSchools === 1 ? '' : 's'}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="school-zone-card-listing-count">
            <Home className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
            <span className="font-semibold text-foreground tabular-nums">{totalListings}</span> listing{totalListings === 1 ? '' : 's'}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-colors group-hover:text-plum">
          Explore zone
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}

function AreaCard({
  area,
  onClick,
}: {
  area: { areaKey: string; name: string; schoolCount: number; listingCount?: number };
  onClick: () => void;
}) {
  const hasListings = typeof area.listingCount === 'number';
  return (
    <button
      onClick={onClick}
      data-testid="area-card"
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-foreground truncate">{area.name}</span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-plum"
              aria-hidden="true"
            />
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden="true" />
              <span className="font-semibold text-foreground tabular-nums">{area.schoolCount}</span> school{area.schoolCount === 1 ? '' : 's'}
            </span>
            {hasListings && (
              <span className="flex items-center gap-1">
                <Home className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
                <span className="font-semibold text-foreground tabular-nums">{area.listingCount}</span> listing{area.listingCount === 1 ? '' : 's'}
              </span>
            )}
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
  /**
   * Card↔marker shared selection. When the id matches a home card, that card renders the
   * copper selected frame and is scrolled into view (driven from a map home-marker click via
   * the `listing` URL param). Mirrors AreaSelectedPanel / SchoolSelectedPanel.
   */
  selectedListingId?: string | null;
  /** Card activation callback (URL sync). Usually undefined for residential cards (navigation is primary). */
  onSelectListing?: (id: string) => void;
  /** Ephemeral hover/focus signal: card hover highlights the matching map home-marker. */
  onHoverListing?: (id: string | null) => void;
}
export function SchoolsInAreaPanel({
  selectedArea,
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
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
}: SchoolsInAreaPanelProps) {
  const navigate = useNavigate();

  // Issue #1547 parity — scroll the selected home card into view when selection is driven
  // from the map marker side. Guards the missing-ref case (selected listing filtered out).
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  const areaLabel = selectedArea?.areaLabel || 'this area';
  const homesTitle = intent === 'rent' ? 'Rentals' : 'Homes for sale';

  // School-first must EXCLUDE agricultural land (design + #1463). Defensive client-side
  // guard on top of the backend exclusion: never surface an agri listing in this journey.
  const homeListings = (areaListings ?? []).filter(
    (l) => (l.propertyType ?? '').toLowerCase() !== AGRICULTURAL_LAND_PROPERTY_TYPE,
  );

  // Homes in the same area (Issue #1074 Slice A), restyled to the ReTrends two-column
  // grid. Rendered as the panel's footerSlot so it lives INSIDE the school panel's single
  // scroll surface — the whole right panel scrolls as one page (no nested scrollbars).
  // Buy/Rent-aware wording; agri excluded; card↔marker hover + selected-frame preserved.
  const homesSection =
    areaListings !== undefined || isLoadingAreaListings ? (
      <div className="border-t border-border bg-card" data-testid="schools-in-area-properties">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">
            {homesTitle} in {areaLabel}
          </h3>
          {!isLoadingAreaListings && (
            <span className="shrink-0 text-xs text-muted-foreground" data-testid="schools-in-area-homes-count">
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {homeListings.length}
              </span>{' '}
              {intent === 'rent'
                ? homeListings.length === 1 ? 'rental available' : 'rentals available'
                : homeListings.length === 1 ? 'home for sale' : 'homes for sale'}
            </span>
          )}
        </div>
        {/* Issue #1170 — dim during an in-flight refetch (isFetching) but NOT during the
            initial skeleton load. No overflow here: the parent scroll surface owns scrolling. */}
        <div
          className={cn(
            'transition-opacity duration-150',
            isFetching && !isLoadingAreaListings ? 'opacity-50 pointer-events-none' : 'opacity-100',
          )}
        >
          {isLoadingAreaListings ? (
            <div className="grid grid-cols-1 gap-3 p-3 2xl:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <div key={i} data-testid="listing-skeleton" className="rounded-lg border border-border p-3">
                  <Skeleton className="mb-3 h-32 w-full rounded-lg" />
                  <Skeleton className="mb-2 h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : homeListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
              <MapPin className="mb-2 h-6 w-6 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No {intent === 'rent' ? 'rentals' : 'homes for sale'} in {areaLabel} yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-3 2xl:grid-cols-2">
              {homeListings.map((listing) => (
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
                    areaLabel={selectedArea?.areaLabel}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : null;

  // Single scroll surface: the school panel owns the only scrollbar; the homes section
  // renders at the bottom of it via footerSlot.
  return (
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
      intent={intent}
      homesCount={areaListings !== undefined ? homeListings.length : undefined}
      footerSlot={homesSection}
    />
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
  const [urlState] = useDiscoverUrlState();

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
  const effectiveRadius = snapRadiusKm(radiusKm);

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

  // "Change school" navigates back (clears schoolId) — onBack is the correct handler.
  const handleChangeSchool = useCallback(() => {
    onBack?.();
  }, [onBack]);

  // Derive area label from URL groupId/areaKey for breadcrumb if available.
  const groupId = urlState.groupId ?? null;
  // areaLabel is not directly on urlState — extract from selectedArea if passed via school.areaKey
  const areaLabelForBreadcrumb: string | null = null; // SchoolSelectedPanel has no selectedArea prop

  // Detect missing school coordinates — listing fetch is disabled without coords so list will be empty.
  // SchoolResult types latitude/longitude as number, but legacy rows may have null at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasMissingCoords =
    school != null &&
    ((school.latitude as any) == null || (school.longitude as any) == null);

  return (
    <>
      {/* onBack is forwarded to PanelHeader which renders the single canonical Back
          chevron before the title — do NOT add a second Back button in the actions
          slot here (Option B from Issue #1143 review: unified affordance position). */}
      <PanelHeader
        title="Find homes near a school"
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

      {/* Single continuous scroll region (school-results-polish): only the PanelHeader
          stays pinned. The school summary band, radius chips, bounded-search controls,
          result heading and the listings all scroll together as one column — no nested
          scroll trap — while the left map stays stable. */}
      <div className="flex-1 overflow-y-auto" data-testid="school-selected-scroll">
      {/* School summary band — skeleton during cold load */}
      {school == null ? (
        <div className="m-4 rounded-xl bg-primary/20 p-5 shadow-md" data-testid="school-summary-skeleton">
          <Skeleton className="h-3 w-24 mb-3 opacity-40" />
          <Skeleton className="h-6 w-3/4 mb-2 opacity-40" />
          <Skeleton className="h-3 w-1/2 mb-3 opacity-40" />
          <Skeleton className="h-8 w-1/3 opacity-40" />
        </div>
      ) : (
        <SchoolSummaryBand
          school={school}
          listings={listings}
          intent={intent}
          groupId={groupId}
          areaLabel={areaLabelForBreadcrumb}
          onChangeSchool={handleChangeSchool}
        />
      )}

      {/* Issue #1261 — the anonymous school-radius listing set is now sourced from the
          PUBLIC /school-radius-listings endpoint, which performs the same cross-area
          ST_DWithin proximity query the authenticated path uses. The radius circle and the
          listing set are therefore consistent for anon users, so the prior #1193
          "Showing homes in this area only" limitation note has been removed. */}

      {/* Radius chips */}
      <RadiusChips
        effectiveRadius={effectiveRadius}
        listingCount={listings.length}
        intent={intent}
        onRadiusChange={onRadiusChange}
        testIdPrefix="radius-btn"
      />

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
      {/* Issue #1115 DEFECT 3 — suppress the count during an in-flight refetch */}
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

      {/* Result heading — only when we have listings or are loaded */}
      {!isLoadingListings && !hasMissingCoords && listings.length > 0 && (
        <RadiusResultHeading
          listingCount={listings.length}
          effectiveRadius={effectiveRadius}
          intent={intent}
        />
      )}

      {/* Listing body — Issue #1170: AreaSelectedPanel-style dim on an in-flight
          refetch (isFetching) but NOT during the initial skeleton load, so cached
          responses never flash and the settled empty state stays readable/clickable.
          Scroll is owned by the parent school-selected-scroll container, so this
          wrapper carries only the refetch dim — not its own overflow. */}
      <div
        data-testid="school-listings-body"
        className={cn(
          'transition-opacity duration-150',
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
        ) : hasMissingCoords ? (
          <MissingCoordsEmptyState
            school={school!}
            areaLabel={areaLabelForBreadcrumb}
            onClearSchool={handleChangeSchool}
          />
        ) : listings.length === 0 ? (
          <SchoolRadiusEmptyState
            school={school!}
            areaLabel={areaLabelForBreadcrumb}
            effectiveRadius={effectiveRadius}
            intent={intent}
            hasPropertyFilters={hasPropertyFilters}
            onRadiusChange={onRadiusChange}
            onClearSchool={handleChangeSchool}
            onClearPropertyFilters={handleClearPropertyFilters}
          />
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 p-3">
            {listings.map((listing) => {
              // Compute real haversine distance — only when both school and listing have coords.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const distanceKm =
                school != null &&
                (school.latitude as any) != null &&
                (school.longitude as any) != null &&
                listing.lat != null &&
                listing.lon != null
                  ? haversineKm(school.latitude, school.longitude, listing.lat, listing.lon)
                  : null;

              return (
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
                    distanceKm={distanceKm}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
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
  /** ReTrends redesign — Buy/Rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * ReTrends redesign — id of the currently selected listing (from `listing` URL param).
   * Drives the copper selected card frame + scroll-into-view. Mirrors SchoolSelectedPanel.
   */
  selectedListingId?: string | null;
  /** Card activation callback for URL sync. Mirrors SchoolSelectedPanel. */
  onSelectListing?: (id: string) => void;
  /**
   * Ephemeral hover/focus signal for card→marker highlight.
   * Not safely wirable for school-first (RISK-3), accepted here for prop-shape parity.
   */
  onHoverListing?: (id: string | null) => void;
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
  intent = 'buy',
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
}: AreaSchoolCombinedPanelProps) {
  const navigate = useNavigate();
  const [urlState] = useDiscoverUrlState();

  // Issue #1547 — scroll selected card into view when selection changes.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

  // Issue #1210: clamp sub-minimum/non-finite radii up to minimum.
  const effectiveRadius = snapRadiusKm(radiusKm);

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
    filters.bedrooms?.length ||
    filters.priceMin != null ||
    filters.priceMax != null,
  );

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

  // Derive display values.
  const areaLabel = selectedArea?.areaLabel ?? null;
  const groupId = urlState.groupId ?? null;

  // Detect missing school coordinates — legacy rows may have null at runtime despite number type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasMissingCoords =
    selectedSchool != null &&
    ((selectedSchool.latitude as any) == null || (selectedSchool.longitude as any) == null);

  // Loading skeleton — shown when either dimension is still resolving on cold load.
  if (!selectedArea || !selectedSchool) {
    return (
      <>
        <PanelHeader
          title="Find homes near a school"
          journey={journey}
          onStartOver={onStartOver}
          onBack={onBack}
          backLabel={selectedArea?.areaLabel ?? undefined}
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

  return (
    <>
      <PanelHeader
        title="Find homes near a school"
        journey={journey}
        onStartOver={onStartOver}
        onBack={onBack}
        backLabel={selectedArea?.areaLabel ?? undefined}
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

      {/* Single continuous scroll region (school-results-polish): only the PanelHeader
          stays pinned. Summary band, radius chips, result heading and listings scroll
          together as one column — no nested scroll trap — while the left map stays
          stable. Mirrors SchoolSelectedPanel; this combined panel is what the canonical
          school-first URL (areaKey + schoolId both set) actually renders. */}
      <div className="flex-1 overflow-y-auto" data-testid="combined-selected-scroll">
      {/* Ink-navy school summary band */}
      <SchoolSummaryBand
        school={selectedSchool}
        listings={listings}
        intent={intent}
        groupId={groupId}
        areaLabel={areaLabel}
        onChangeSchool={onClearSchool}
      />

      {/* Issue #1261 — anonymous school-radius listing set is from the PUBLIC endpoint. */}

      {/* Radius chips */}
      <RadiusChips
        effectiveRadius={effectiveRadius}
        listingCount={listings.length}
        intent={intent}
        onRadiusChange={onRadiusChange}
        testIdPrefix="combined-radius-btn"
      />

      {/* Result heading — above the grid, only when loaded with results */}
      {!isLoadingListings && !hasMissingCoords && listings.length > 0 && (
        <RadiusResultHeading
          listingCount={listings.length}
          effectiveRadius={effectiveRadius}
          intent={intent}
        />
      )}

      {/* Listing body — Issue #1170: dim on in-flight refetch, not initial skeleton load.
          Scroll is owned by the parent combined-selected-scroll container, so this
          wrapper carries only the refetch dim — not its own overflow. */}
      <div
        data-testid="combined-listings-body"
        className={cn(
          'transition-opacity duration-150',
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
        ) : hasMissingCoords ? (
          <MissingCoordsEmptyState
            school={selectedSchool}
            areaLabel={areaLabel}
            onClearSchool={onClearSchool}
          />
        ) : listings.length === 0 ? (
          <SchoolRadiusEmptyState
            school={selectedSchool}
            areaLabel={areaLabel}
            effectiveRadius={effectiveRadius}
            intent={intent}
            hasPropertyFilters={hasPropertyFilters}
            onRadiusChange={onRadiusChange}
            onClearSchool={onClearSchool}
            onClearPropertyFilters={handleClearPropertyFilters}
          />
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 p-3">
            {listings.map((listing) => {
              // Compute real haversine distance — only when both school and listing have coords.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const distanceKm =
                (selectedSchool.latitude as any) != null &&
                (selectedSchool.longitude as any) != null &&
                listing.lat != null &&
                listing.lon != null
                  ? haversineKm(
                      selectedSchool.latitude,
                      selectedSchool.longitude,
                      listing.lat,
                      listing.lon,
                    )
                  : null;

              return (
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
                    distanceKm={distanceKm}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
