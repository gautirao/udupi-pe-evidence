import { NearSchoolSheet } from '@/components/map/NearSchoolSheet';
import { DiscoverConsentBanner } from '@/components/discover/DiscoverConsentBanner';
import { DiscoverPrivacyToggle } from '@/components/discover/DiscoverPrivacyToggle';
import { DEFAULT_SCHOOL_RADIUS_KM } from '@/constants/discover';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourneyTransitionsCommands } from '@/features/discover/state/useDiscoverJourneyTransitions';

/**
 * Issue #1824 Slice S11a — the sheets/overlays group (NearSchoolSheet +
 * DiscoverConsentBanner + DiscoverPrivacyToggle), lifted VERBATIM out of
 * MapDiscovery.tsx (@ 838f620e L2397-2418). Every value the JSX reads is
 * received as a PROP — no derived-const/handler/hook moves. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s11-design.md.
 */
export interface DiscoverOverlaySheetsProps {
  isAgriJourney: boolean;
  nearSchoolOpen: boolean;
  setNearSchoolOpen: (open: boolean) => void;
  selectedSchool: SchoolResult | null;
  journeyCommands: DiscoverJourneyTransitionsCommands;
  filters: PropertyFilters;
  handleFiltersChange: (next: PropertyFilters) => void;
  schoolBoardFilter: string[];
  handleBoardFilterChange: (boards: string[]) => void;
  isCityValid: boolean;
  city: string;
}

export function DiscoverOverlaySheets({
  isAgriJourney,
  nearSchoolOpen,
  setNearSchoolOpen,
  selectedSchool,
  journeyCommands,
  filters,
  handleFiltersChange,
  schoolBoardFilter,
  handleBoardFilterChange,
  isCityValid,
  city,
}: DiscoverOverlaySheetsProps) {
  return (
    <>
      {/* NearSchoolSheet — not mounted in the agri-first journey (MVP2): structurally
          prevents the sheet (which calls setSchoolJourney on select) from flipping
          agri-first to school-first. */}
      {!isAgriJourney && (
        <NearSchoolSheet
          open={nearSchoolOpen}
          onOpenChange={setNearSchoolOpen}
          selectedSchool={selectedSchool}
          onSchoolSelect={journeyCommands.wrappedSchoolSelect}
          radiusKm={filters.schoolRadiusKm ?? DEFAULT_SCHOOL_RADIUS_KM}
          onRadiusChange={(km) => handleFiltersChange({ ...filters, schoolRadiusKm: km })}
          boardFilter={schoolBoardFilter}
          onBoardFilterChange={handleBoardFilterChange}
          city={isCityValid ? city : null}
        />
      )}
      {/* Issue #1576 — telemetry consent banner (first-visit, undecided state only) */}
      <DiscoverConsentBanner />
      {/* Issue #1576 — persistent privacy toggle so users can revoke consent later */}
      <div className="fixed bottom-4 right-4 z-40">
        <DiscoverPrivacyToggle />
      </div>
    </>
  );
}
