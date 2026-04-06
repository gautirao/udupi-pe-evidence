import { useSearchParams, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAreaOverview } from '@/hooks/useAreaOverview';
import { AreaHeader } from '@/components/area/AreaHeader';
import { FallbackNotice } from '@/components/area/FallbackNotice';
import { SnapshotCard } from '@/components/area/SnapshotCard';

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

  if (!areaKey || isError) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Area not found</p>
          <Link to="/" className="text-sm text-primary underline underline-offset-4">
            Back to map
          </Link>
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

      {/* Placeholder for #731 */}
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-sm">Coming soon</p>
        </CardContent>
      </Card>

      {/* Placeholder for #732 */}
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-sm">Coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
