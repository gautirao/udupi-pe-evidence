import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

export interface PopularSchoolCardProps {
  school: SchoolResult;
  isSelected?: boolean;
  onSelect: (school: SchoolResult) => void;
}

/**
 * Compact presentational card for a "popular" (notable) school.
 *
 * Renders the school name, board, and address. Distance is shown only when the
 * backend supplied one (proximity-narrowed responses). Per product constraint
 * (issue #968) this card intentionally does NOT show a nearby-listing-count badge.
 */
export function PopularSchoolCard({
  school,
  isSelected = false,
  onSelect,
}: PopularSchoolCardProps) {
  const board = school.board ?? school.boardType;
  // distanceKm is `number` in SchoolResult but the backend returns `Double` which can be null;
  // guard the runtime case where it's missing or NaN.
  const hasDistance =
    typeof school.distanceKm === 'number' && Number.isFinite(school.distanceKm);

  return (
    <button
      type="button"
      onClick={() => onSelect(school)}
      aria-pressed={isSelected}
      aria-label={`Select ${school.name}`}
      className={cn(
        'w-full text-left rounded-md border p-3 transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-2">
        <GraduationCap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight truncate">
            {school.name}
          </p>
          {(board || school.address) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {board ?? ''}
              {board && school.address ? ' · ' : ''}
              {school.address ?? ''}
            </p>
          )}
          {hasDistance && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {school.distanceKm.toFixed(1)} km away
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
