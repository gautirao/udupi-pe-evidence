import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Activity, AlertCircle, List } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ListingResponse } from '@/hooks/useBrokerListings';
import {
  listingLink,
  statusBadgeClassName,
  STATUS_LABELS,
} from '@/pages/broker/dashboardModel';

interface DashboardRecentActivityProps {
  listings?: ListingResponse[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function RecentActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function RecentActivityError({ onRetry }: Pick<DashboardRecentActivityProps, 'onRetry'>) {
  return (
    <div className="text-center py-8 space-y-2">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
      <p className="text-sm text-muted-foreground">Failed to load recent listings</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function EmptyRecentActivity() {
  return (
    <div className="text-center py-12 space-y-2">
      <List className="h-8 w-8 text-muted-foreground/50 mx-auto" />
      <p className="text-sm font-medium text-muted-foreground">No listings yet</p>
      <p className="text-xs text-muted-foreground">
        Create your first listing to get started.
      </p>
      <Button size="sm" variant="outline" asChild>
        <Link to="/broker/listings/new">Create Listing</Link>
      </Button>
    </div>
  );
}

function RecentListingRow({ listing }: { listing: ListingResponse }) {
  return (
    <Link
      to={listingLink(listing)}
      className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-secondary/50 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Badge className={statusBadgeClassName(listing.status)}>
          {STATUS_LABELS[listing.status] ?? listing.status}
        </Badge>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {listing.title ?? 'Untitled Listing'}
          </p>
          {listing.locality && (
            <p className="text-xs text-muted-foreground truncate">{listing.locality}</p>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 ml-3">
        {formatDistanceToNow(new Date(listing.updatedAt), { addSuffix: true })}
      </span>
    </Link>
  );
}

export function DashboardRecentActivity({
  listings,
  isLoading,
  isError,
  onRetry,
}: DashboardRecentActivityProps) {
  let content: ReactNode;

  if (isLoading) {
    content = <RecentActivitySkeleton />;
  } else if (isError) {
    content = <RecentActivityError onRetry={onRetry} />;
  } else if (!listings?.length) {
    content = <EmptyRecentActivity />;
  } else {
    content = (
      <div className="space-y-2">
        {listings.map((listing) => (
          <RecentListingRow key={listing.id} listing={listing} />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
