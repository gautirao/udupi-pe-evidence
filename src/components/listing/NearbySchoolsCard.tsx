import { useState } from 'react';
import { useNearbySchools } from '@/hooks/useSchoolSearch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { GraduationCap, AlertCircle } from 'lucide-react';

interface NearbySchoolsCardProps {
  listingId: string;
  /** Callback to toggle school markers visibility on the PoiMiniMap */
  onToggleSchoolMarkers?: (visible: boolean) => void;
  showSchoolMarkers?: boolean;
  /**
   * When true, render without the surrounding Card chrome so the section can be
   * embedded inside a parent card (e.g. the residential "Location & Essentials"
   * card). Default false preserves the standalone-card behaviour and tests.
   */
  embedded?: boolean;
}

export function NearbySchoolsCard({
  listingId,
  onToggleSchoolMarkers,
  showSchoolMarkers = false,
  embedded = false,
}: NearbySchoolsCardProps) {
  const { data, isLoading, isError } = useNearbySchools(listingId, 2);

  // Header row shared across the embedded + card variants.
  const header = (count?: number) => (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <GraduationCap className="h-4 w-4" />
        Nearby Schools
        {count != null && (
          <span className="text-sm font-normal text-muted-foreground">
            ({count} within 2 km)
          </span>
        )}
      </h3>
      {onToggleSchoolMarkers && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-school-markers"
            checked={showSchoolMarkers}
            onCheckedChange={(checked) => onToggleSchoolMarkers(!!checked)}
          />
          <Label
            htmlFor="show-school-markers"
            className="text-xs font-normal cursor-pointer text-muted-foreground"
          >
            Show on map
          </Label>
        </div>
      )}
    </div>
  );

  // Wrapper picks Card chrome (standalone) or a plain section (embedded).
  const Frame = ({ children }: { children: React.ReactNode }) =>
    embedded ? (
      <div className="space-y-3">{children}</div>
    ) : (
      <Card>
        <CardHeader className="pb-3">{header()}</CardHeader>
        <CardContent className="pt-0">{children}</CardContent>
      </Card>
    );

  if (isLoading) {
    return (
      <Frame>
        {embedded && header()}
        <div className="space-y-3">
          <Skeleton className="h-[32px] w-full" />
          <Skeleton className="h-[32px] w-full" />
        </div>
      </Frame>
    );
  }

  if (isError) {
    return (
      <Frame>
        {embedded && header()}
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">School data temporarily unavailable.</span>
        </div>
      </Frame>
    );
  }

  if (!data || data.count === 0) return null;

  const list = (
    <div className="space-y-2">
      {data.schools.map((school) => (
        <div
          key={school.id}
          className="flex items-center justify-between text-sm py-1"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="truncate">{school.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              ({school.board ?? school.boardType})
            </span>
          </div>
          <span className="text-muted-foreground shrink-0 ml-2">
            {school.distanceKm < 1
              ? `${Math.round(school.distanceKm * 1000)} m`
              : `${school.distanceKm.toFixed(1)} km`}
          </span>
        </div>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        {header(data.count)}
        {list}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">{header(data.count)}</CardHeader>
      <CardContent className="pt-0">{list}</CardContent>
    </Card>
  );
}
