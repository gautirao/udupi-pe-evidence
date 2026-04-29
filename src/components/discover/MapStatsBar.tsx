import { PenTool, GraduationCap, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { SchoolResult } from '@/hooks/useSchoolSearch';

interface MapStatsBarProps {
  filters: PropertyFilters;
  selectedSchool: SchoolResult | null;
  onPolygonClear: () => void;
}

/**
 * Floating stats bar shown at the top-center of the map for authenticated users.
 * Displays polygon search indicator, selected school, on-map count, and total listing count.
 */
export function MapStatsBar({
  filters,
  selectedSchool,
  onPolygonClear,
}: MapStatsBarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
      <Card className="px-3 py-2 bg-card/95 backdrop-blur">
        <div className="flex items-center gap-4 text-sm">
          {filters.polygon && (
            <>
              <div className="flex items-center gap-1.5 text-primary">
                <PenTool className="h-4 w-4" />
                <span className="font-medium">Area search</span>
              </div>
              <div className="text-muted-foreground">|</div>
            </>
          )}
          {selectedSchool && (
            <>
              <div className="flex items-center gap-1.5 text-primary">
                <GraduationCap className="h-4 w-4" />
                <span className="font-medium truncate max-w-[150px]">{selectedSchool.name}</span>
                <span className="text-xs text-muted-foreground">({filters.schoolRadiusKm ?? 2} km)</span>
              </div>
            </>
          )}
          {filters.polygon && (
            <>
              <div className="text-muted-foreground">|</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onPolygonClear}
                aria-label="Clear polygon search"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear area
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
