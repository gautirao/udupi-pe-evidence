import { useState } from 'react';
import { useNearbySchools } from '@/hooks/useSchoolSearch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, LayoutGrid, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface NearbySchoolsCardProps {
  listingId: string;
  onToggleSchoolMarkers?: (visible: boolean) => void;
  showSchoolMarkers?: boolean;
  embedded?: boolean;
}

const INITIAL_VISIBLE = 4;

export function NearbySchoolsCard({ listingId, onToggleSchoolMarkers, showSchoolMarkers = false, embedded = false }: NearbySchoolsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError } = useNearbySchools(listingId, 2);

  const header = (count?: number) => (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        Nearby schools
        {count != null && (
          <span className="text-sm font-normal text-muted-foreground">
            ({count} within 2 km)
          </span>
        )}
      </h3>
    </div>
  );

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
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
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

  const hasMore = data.schools.length > INITIAL_VISIBLE;
  const visibleSchools = expanded ? data.schools : data.schools.slice(0, INITIAL_VISIBLE);

  const list = (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {visibleSchools.map((school) => {
          const distanceText =
            school.distanceKm < 1
              ? `${Math.round(school.distanceKm * 1000)} m`
              : `${school.distanceKm.toFixed(1)} km`;
          return (
            <div key={school.id} className="flex items-center gap-1.5 text-sm min-w-0">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{school.name}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-1">
                {school.board ?? school.boardType}
              </span>
              <span className="font-bold text-foreground shrink-0 ml-1.5 tabular-nums">{distanceText}</span>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? (
            <>Show fewer <ChevronUp className="h-4 w-4" /></>
          ) : (
            <>Show all {data.count} schools <ChevronDown className="h-4 w-4" /></>
          )}
        </button>
      )}
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
