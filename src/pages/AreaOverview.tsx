import { useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAreaOverview } from '@/hooks/useAreaOverview';
import { AreaHeader } from '@/components/area/AreaHeader';
import { FallbackNotice } from '@/components/area/FallbackNotice';
import { SnapshotCard } from '@/components/area/SnapshotCard';
import { ComparisonTable } from '@/components/area/ComparisonTable';
import { SchoolsList } from '@/components/area/SchoolsList';
import { MarketActivity } from '@/components/area/MarketActivity';

function LoadingSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

export default function AreaOverview() {
  const [searchParams] = useSearchParams();
  const areaKey = searchParams.get('areaKey') ?? '';

  const { data, isLoading, isError } = useAreaOverview(areaKey);

  if (!areaKey) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">Select an area to explore</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Choose a locality from the map to see price trends, market activity, and nearby schools.
          </p>
          <Button asChild variant="default" size="sm">
            <Link to="/discover">Explore on Map</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Area not found</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/discover">Back to map</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!data) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <AreaHeader
        areaLabel={data.areaLabel}
        districtLabel={data.districtLabel}
        confidence={data.confidence}
        listingCount90d={data.listingCount90d}
        fallback={data.fallback}
      />

      <FallbackNotice fallback={data.fallback} />

      <SnapshotCard snapshot={data.snapshot} confidence={data.confidence} />

      {data.comparison && data.comparison.length > 0 && (
        <ComparisonTable
          currentAreaLabel={data.areaLabel}
          currentMedianPricePaise={data.snapshot?.medianPricePaise ?? null}
          currentListingCount90d={data.listingCount90d}
          currentTrendDirection={data.snapshot?.trendDirection ?? null}
          comparisons={data.comparison}
        />
      )}

      <SchoolsList schools={data.schools} />
      <MarketActivity activity={data.activity} confidence={data.confidence} />
    </div>
  );
}
