import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDealerMyListings } from '@/hooks/useDealerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];

function statusClassName(status: string): string {
  switch (status) {
    case 'LIVE':
      return 'bg-green-100 text-green-800 border-0';
    case 'PENDING_REVIEW':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-0';
    case 'DRAFT':
      return 'bg-gray-100 text-gray-600 border-0';
    default:
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

/**
 * "My Listings" page for dealers.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 */
export default function DealerListings() {
  const { isDealer, isAdmin, isLoading } = useAuth();
  const { data, isLoading: listingsLoading, isError } = useDealerMyListings();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isDealer && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl py-6 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Listings</h1>
          <Button asChild>
            <Link to="/dealer/listings/new">Create New Listing</Link>
          </Button>
        </div>

        {listingsLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load your listings. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {!listingsLoading && !isError && data?.listings.length === 0 && (
          <p className="text-muted-foreground mt-4">
            You have no listings yet. Create your first listing to get started.
          </p>
        )}

        {!listingsLoading && !isError && data && data.listings.length > 0 && (
          <div className="space-y-4">
            {data.listings.map((listing) => (
              <Card key={listing.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-lg">
                      {listing.title ?? 'Untitled Listing'}
                    </CardTitle>
                    <Badge className={statusClassName(listing.status)}>
                      {listing.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-4">
                    <span>{listing.propertyType}</span>
                    {listing.locality && <span>· {listing.locality}</span>}
                    {listing.price != null && (
                      <span>· &#8377;{listing.price.toLocaleString('en-IN')}</span>
                    )}
                  </div>
                  {listing.rejectionReason && (
                    <p className="text-sm text-destructive mb-3">
                      Rejection reason: {listing.rejectionReason}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {EDITABLE_STATUSES.includes(listing.status) && (
                      <>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/dealer/listings/${listing.id}/edit`}>Edit</Link>
                        </Button>
                        <Button size="sm" asChild>
                          <Link to={`/dealer/listings/${listing.id}/edit`}>
                            Submit for Review
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
