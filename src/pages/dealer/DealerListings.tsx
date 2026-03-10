import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDealerMyListingsInfinite,
  useDeleteListing,
  useSubmitListing,
  type ListingResponse,
} from '@/hooks/useDealerListings';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Building2, Eye, ImageIcon, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED'];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Under Review',
  LIVE: 'Live',
  REJECTED: 'Rejected',
};

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
 * Submit button for DRAFT listings only.
 *
 * Rendered as a separate component so that `useSubmitListing` (a hook) can be
 * called at the top level rather than inside the parent's `.map()`.
 */
function DraftSubmitButton({ listing }: { listing: ListingResponse }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const submitMutation = useSubmitListing(listing.id);

  const isReady = listing.addressConfirmed && listing.imageCount >= 3;

  if (isReady) {
    return (
      <Button
        size="sm"
        disabled={submitMutation.isPending}
        onClick={() => {
          submitMutation.mutate(undefined, {
            onSuccess: () => {
              toast({ title: 'Submitted for review' });
            },
          });
        }}
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            Submitting…
          </>
        ) : (
          'Submit for Review'
        )}
      </Button>
    );
  }

  const bothMissing = !listing.addressConfirmed && listing.imageCount < 3;
  const hint = bothMissing
    ? 'Add images & confirm address to submit'
    : listing.imageCount < 3
      ? `Need ${3 - listing.imageCount} more image(s)`
      : 'Confirm address to submit';

  // Deep-link to the blocking wizard step: images (step 2) takes priority
  const targetStep = listing.imageCount < 3 ? 2 : 3;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/dealer/listings/${listing.id}/edit?step=${targetStep}`)}
      >
        Complete &amp; Submit
      </Button>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </div>
  );
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
  const {
    data,
    isLoading: listingsLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDealerMyListingsInfinite();

  const allListings = data?.pages.flatMap((p) => p.listings) ?? [];
  const totalElements = data?.pages[0]?.totalElements ?? 0;
  const deleteListingMutation = useDeleteListing();
  const { toast } = useToast();

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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="w-full h-32" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-8 space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">Failed to load your listings.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!listingsLoading && !isError && allListings.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">No listings yet</p>
            <p className="text-xs text-muted-foreground">
              Create your first listing to start reaching buyers.
            </p>
            <Button size="sm" asChild>
              <Link to="/dealer/listings/new">Create your first listing</Link>
            </Button>
          </div>
        )}

        {!listingsLoading && !isError && allListings.length > 0 && (
          <div className="space-y-4">
            {totalElements > 20 && (
              <p className="text-sm text-muted-foreground">
                Showing {allListings.length} of {totalElements} listings
              </p>
            )}
            {allListings.map((listing) => (
              <Card key={listing.id} className="overflow-hidden">
                {listing.firstImageUrl ? (
                  <div className="relative">
                    <img
                      src={listing.firstImageUrl}
                      alt={listing.title ?? 'Property listing image'}
                      className="w-full h-32 object-cover rounded-t-lg"
                    />
                    {listing.imageCount > 0 && (
                      <span
                        className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          listing.status === 'DRAFT' && listing.imageCount < 3
                            ? 'bg-amber-500/90 text-white'
                            : 'bg-black/60 text-white'
                        }`}
                      >
                        <ImageIcon className="h-3 w-3" />
                        {listing.imageCount}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-32 bg-secondary flex flex-col items-center justify-center rounded-t-lg gap-1">
                    <Building2 className="h-8 w-8 text-muted-foreground/40" />
                    {listing.status === 'DRAFT' && listing.imageCount === 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <ImageIcon className="h-3 w-3" />
                        No photos yet
                      </span>
                    )}
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-lg">
                      {listing.title ?? 'Untitled Listing'}
                    </CardTitle>
                    <Badge className={statusClassName(listing.status)}>
                      {STATUS_LABELS[listing.status] ?? listing.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mb-4">
                    <Badge variant="secondary" className="capitalize text-xs">{listing.propertyType}</Badge>
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
                  <div className="flex gap-2 flex-wrap items-start">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/listing/${listing.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Link>
                    </Button>
                    {EDITABLE_STATUSES.includes(listing.status) && (
                      <>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/dealer/listings/${listing.id}/edit`}>Edit</Link>
                        </Button>
                        {listing.status === 'DRAFT' ? (
                          <DraftSubmitButton listing={listing} />
                        ) : (
                          <Button size="sm" asChild>
                            <Link to={`/dealer/listings/${listing.id}/edit`}>
                              Edit &amp; Resubmit
                            </Link>
                          </Button>
                        )}
                      </>
                    )}
                    {(listing.status === 'DRAFT' || listing.status === 'REJECTED') && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete your listing. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => {
                                deleteListingMutation.mutate(listing.id, {
                                  onSuccess: () => {
                                    toast({ title: 'Listing deleted' });
                                  },
                                });
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
