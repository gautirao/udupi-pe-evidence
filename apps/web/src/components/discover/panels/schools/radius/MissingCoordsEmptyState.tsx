/**
 * MissingCoordsEmptyState — moved verbatim from SchoolJourneyPanels.tsx (Issue
 * #2661 commit 3, no logic/JSX changes).
 */
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

export interface MissingCoordsEmptyStateProps {
  school: SchoolResult;
  areaLabel: string | null;
  onClearSchool: () => void;
}

export function MissingCoordsEmptyState({ school, areaLabel, onClearSchool }: MissingCoordsEmptyStateProps) {
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
