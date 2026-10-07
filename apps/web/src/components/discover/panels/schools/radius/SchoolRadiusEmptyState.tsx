/**
 * SchoolRadiusEmptyState — moved verbatim from SchoolJourneyPanels.tsx (Issue
 * #2661 commit 3, no logic/JSX changes).
 */
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RequestPropertyCard } from '@/components/discover/RequestPropertyCard';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import { RADIUS_OPTIONS } from './radiusOptions';

export interface SchoolRadiusEmptyStateProps {
  school: SchoolResult | null;
  areaLabel: string | null;
  effectiveRadius: number;
  intent: DiscoverIntent;
  hasPropertyFilters: boolean;
  onRadiusChange: (km: number) => void;
  onClearSchool: () => void;
  onClearPropertyFilters: () => void;
  /**
   * Issue #1793 PR-C — all three are ADDITIVE and optional; without `city` and
   * `requestSettled === true` the "Request a property" card never renders (existing callers and
   * tests are unchanged).
   * `requestSettled` is the caller's proof that the radius query settled SUCCESSFULLY (not
   * loading, not fetching, not errored): this component alone cannot tell a settled-empty from an
   * in-flight one.
   */
  city?: string | null;
  areaKey?: string | null;
  requestSettled?: boolean;
  /**
   * #1793 PR-C r4 — a results refetch is in flight: dim + click-block the recovery content, but NEVER the
   * request card (a dimmed ancestor cannot be undone by a child, and the buyer may be mid-typing).
   */
  dimmed?: boolean;
}

/** The request DTO has no school field, so the school + radius ride in areaLabel (<= 200 chars). */
function buildSchoolRequestAreaLabel(areaLabel: string | null, schoolName: string, radiusKm: number): string {
  const near = `${areaLabel ? 'near' : 'Near'} ${schoolName} (${radiusKm} km)`;
  return (areaLabel ? `${areaLabel} · ${near}` : near).slice(0, 200);
}

export function SchoolRadiusEmptyState({
  school,
  areaLabel,
  effectiveRadius,
  intent,
  hasPropertyFilters,
  onRadiusChange,
  onClearSchool,
  onClearPropertyFilters,
  city,
  areaKey,
  requestSettled = false,
  dimmed = false,
}: SchoolRadiusEmptyStateProps) {
  const noun = intent === 'rent' ? 'rentals' : 'homes';
  // Only offer "Try N km" for radii larger than current.
  const largerOptions = RADIUS_OPTIONS.filter((km) => km > effectiveRadius);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-full p-6 text-center"
      data-testid="school-radius-empty-state"
    >
      <div
        className={cn(
          'flex w-full flex-col items-center transition-opacity duration-150',
          dimmed ? 'pointer-events-none opacity-50' : 'opacity-100',
        )}
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
      {requestSettled && city && school != null && (
        <RequestPropertyCard
          className="mt-6 w-full max-w-sm"
          context={{
            city,
            areaKey: areaKey ?? null,
            areaLabel: buildSchoolRequestAreaLabel(areaLabel, school.name, effectiveRadius),
            journey: 'SCHOOL',
            intent: intent === 'rent' ? 'RENT' : 'BUY',
            contextLabel: `${school.name}, within ${effectiveRadius} km`,
          }}
        />
      )}
    </div>
  );
}
