/**
 * SchoolRadiusEmptyState — moved verbatim from SchoolJourneyPanels.tsx (Issue
 * #2661 commit 3, no logic/JSX changes).
 */
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
