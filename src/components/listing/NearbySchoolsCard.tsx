import { useState } from 'react';
import { useNearbySchools } from '@/hooks/useSchoolSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { GraduationCap, AlertCircle } from 'lucide-react';

interface NearbySchoolsCardProps {
  listingId: string;
  /** Callback to toggle school markers visibility on the PoiMiniMap */
  onToggleSchoolMarkers?: (visible: boolean) => void;
  showSchoolMarkers?: boolean;
}

export function NearbySchoolsCard({
  listingId,
  onToggleSchoolMarkers,
  showSchoolMarkers = false,
}: NearbySchoolsCardProps) {
  const { data, isLoading, isError } = useNearbySchools(listingId, 2);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" />
            Nearby Schools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-[32px] w-full" />
            <Skeleton className="h-[32px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" />
            Nearby Schools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">School data temporarily unavailable.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.count === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" />
            Nearby Schools
            <span className="text-sm font-normal text-muted-foreground">
              ({data.count} within 2 km)
            </span>
          </CardTitle>
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
      </CardHeader>
      <CardContent className="pt-0">
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
      </CardContent>
    </Card>
  );
}
