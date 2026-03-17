import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  PlusCircle,
  List,
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { useBrokerListingStats, useBrokerMyListings } from '@/hooks/useBrokerListings';
import { formatDistanceToNow } from 'date-fns';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Under Review',
  LIVE: 'Live',
  REJECTED: 'Rejected',
};

function statusBadgeClassName(status: string): string {
  switch (status) {
    case 'LIVE':
      return 'bg-green-100 text-green-800 border-0';
    case 'PENDING_REVIEW':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-0';
    case 'DRAFT':
    default:
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

/** Returns the appropriate link for a listing based on its status. */
function listingLink(id: string, status: string): string {
  if (status === 'DRAFT' || status === 'REJECTED') {
    return `/broker/listings/${id}/edit`;
  }
  return `/listing/${id}`;
}

const STAT_CARDS = [
  { key: 'draftCount' as const, label: 'Draft', status: 'DRAFT', icon: FileEdit, color: 'text-gray-600', bg: 'bg-gray-100' },
  { key: 'pendingReviewCount' as const, label: 'Under Review', status: 'PENDING_REVIEW', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-100' },
  { key: 'liveCount' as const, label: 'Live', status: 'LIVE', icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-100' },
  { key: 'rejectedCount' as const, label: 'Rejected', status: 'REJECTED', icon: XCircle, color: 'text-red-700', bg: 'bg-red-100' },
] as const;

/**
 * Broker home page with stats overview, quick actions, and recent activity.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 */
export default function BrokerDashboard() {
  const { isBroker, isAdmin, isLoading } = useAuth();
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useBrokerListingStats();
  const { data: recentData, isLoading: recentLoading, isError: recentError, refetch: refetchRecent } = useBrokerMyListings(0, 5);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isBroker && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Broker Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your property listings
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map((card) => (
            <Link
              key={card.key}
              to={`/broker/listings?status=${card.status}`}
              className="block"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  {statsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ) : statsError ? (
                    <div className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-xs">Failed</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${card.bg}`}>
                        <card.icon className={`h-5 w-5 ${card.color}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats?.[card.key] ?? 0}</p>
                        <p className="text-sm text-muted-foreground">{card.label}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {statsError && (
          <div className="text-center mb-6">
            <Button variant="outline" size="sm" onClick={() => refetchStats()}>
              Retry loading stats
            </Button>
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-3 mb-6">
          <Button asChild>
            <Link to="/broker/listings/new">
              <PlusCircle className="h-4 w-4 mr-2" />
              Create New Listing
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/broker/listings">
              <List className="h-4 w-4 mr-2" />
              View All Listings
            </Link>
          </Button>
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : recentError ? (
              <div className="text-center py-8 space-y-2">
                <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-sm text-muted-foreground">Failed to load recent listings</p>
                <Button variant="outline" size="sm" onClick={() => refetchRecent()}>
                  Try again
                </Button>
              </div>
            ) : !recentData?.listings.length ? (
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
            ) : (
              <div className="space-y-2">
                {recentData.listings.map((listing) => (
                  <Link
                    key={listing.id}
                    to={listingLink(listing.id, listing.status)}
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
                          <p className="text-xs text-muted-foreground truncate">
                            {listing.locality}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-3">
                      {formatDistanceToNow(new Date(listing.updatedAt), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
