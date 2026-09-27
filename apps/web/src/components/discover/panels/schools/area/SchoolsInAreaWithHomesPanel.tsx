/**
 * SchoolsInAreaPanel (wrapper) — school-first journey, area selected but no
 * school selected yet. Wraps the real `SchoolsInAreaPanel.tsx` picker
 * component and adds a "Homes in area" footer.
 *
 * Moved verbatim from SchoolJourneyPanels.tsx as `SchoolsInAreaWithHomesPanel`
 * (Issue #2661 commit 4, pure move — no logic/JSX changes, flat props
 * unchanged), re-exported under the original name `SchoolsInAreaPanel` from
 * the barrel.
 *
 * Issue #2661 commit 5 — public props narrowed from 19 flat fields to a
 * `{view, commands}` contract (see SchoolsInAreaPanelProps below).
 * `commands.schools.select` stays OPTIONAL (qa-fast H2 — only the area-first
 * journey wires it); `view.schools.data`/`view.homes.data` stay
 * `T | undefined` (never defaulted to `[]`) — the H4 distinction the
 * `homesSection` gating below depends on.
 */
import { SchoolsInAreaPanel as RealSchoolsInAreaPanel } from '../../SchoolsInAreaPanel';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import { useSelectedCardScroll } from '../shared/useSelectedCardScroll';
import { AreaHomesSection } from './AreaHomesSection';
import { AGRICULTURAL_LAND_PROPERTY_TYPE } from '@/lib/listing-constants';
import type {
  SchoolChromeCommands,
  SchoolChromeView,
  SchoolListingsCommands,
  SchoolQueryState,
  SchoolViewerView,
} from '../shared/schoolJourneyContracts';

export interface SchoolsInAreaPanelView {
  chrome: SchoolChromeView;
  viewer: SchoolViewerView;
  /** The resolved area this panel is scoped to. */
  area: AreaPoint;
  /** Pre-fetched schools from MapDiscovery — forwarded to avoid duplicate API calls. */
  schools: SchoolQueryState<SchoolResult[] | undefined>;
  /**
   * Issue #1074 Slice A — property listings for the selected area. `data` MUST
   * stay `T | undefined` (never `?? []`) — the H4 undefined-vs-empty-array
   * distinction the wrapper's `homesSection` gating below depends on.
   */
  homes: SchoolQueryState<DiscoverCityListingItem[] | undefined> & {
    /** Card↔marker shared selection for the homes grid. */
    selectedId?: string | null;
  };
}

export interface SchoolsInAreaPanelCommands {
  chrome: SchoolChromeCommands;
  schools: {
    /** Retries the parent-owned schools query (Issue #1144/#1198). */
    retry?: () => void;
    /**
     * Issue #1157 Option (i) — area-first school select. OPTIONAL: only wired
     * by the area-first journey call site (qa-fast H2). When omitted
     * (school-first), the inner panel keeps its internal setSchoolJourney path.
     */
    select?: (schoolId: string) => void;
  };
  homes: SchoolListingsCommands;
}

export interface SchoolsInAreaPanelProps {
  view: SchoolsInAreaPanelView;
  commands: SchoolsInAreaPanelCommands;
}

export function SchoolsInAreaPanel({ view, commands }: SchoolsInAreaPanelProps) {
  const {
    chrome: { journey, activeContextChips },
    viewer: { intent = 'buy', isAuthenticated = false },
    area: selectedArea,
    schools: { data: schools, loading: schoolsLoading, fetching: schoolsFetching, error: schoolsError },
    homes: {
      data: areaListings,
      loading: isLoadingAreaListings,
      fetching: isFetching = false,
      selectedId: selectedListingId = null,
    },
  } = view;
  const {
    chrome: { startOver: onStartOver, back: onBack },
    schools: { retry: onSchoolsRetry, select: onSelectSchool },
    homes: { select: onSelectListing, hover: onHoverListing },
  } = commands;
  // Issue #1547 parity — scroll the selected home card into view when selection is driven
  // from the map marker side. Guards the missing-ref case (selected listing filtered out).
  const cardRefs = useSelectedCardScroll(selectedListingId);

  // School-first must EXCLUDE agricultural land (design + #1463). Defensive client-side
  // guard on top of the backend exclusion: never surface an agri listing in this journey.
  const homeListings = (areaListings ?? []).filter(
    (l) => (l.propertyType ?? '').toLowerCase() !== AGRICULTURAL_LAND_PROPERTY_TYPE,
  );

  // Homes in the same area (Issue #1074 Slice A), restyled to the ReTrends two-column
  // grid. Rendered as the panel's footerSlot so it lives INSIDE the school panel's single
  // scroll surface — the whole right panel scrolls as one page (no nested scrollbars).
  // Buy/Rent-aware wording; agri excluded; card↔marker hover + selected-frame preserved.
  const homesSection = (
    <AreaHomesSection
      areaListings={areaListings}
      isLoadingAreaListings={isLoadingAreaListings}
      isFetching={isFetching}
      isAuthenticated={isAuthenticated}
      selectedAreaLabel={selectedArea?.areaLabel}
      intent={intent}
      selectedListingId={selectedListingId}
      onSelectListing={onSelectListing}
      onHoverListing={onHoverListing}
      cardRefs={cardRefs}
    />
  );

  // Single scroll surface: the school panel owns the only scrollbar; the homes section
  // renders at the bottom of it via footerSlot.
  return (
    <RealSchoolsInAreaPanel
      journey={(journey ?? 'area-first') as 'area-first' | 'school-first'}
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
