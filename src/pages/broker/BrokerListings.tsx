import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBulkDeleteListings } from '@/hooks/useBrokerListings';
import { useBrokerListingsInventory } from '@/hooks/useBrokerListingsInventory';
import { useBrokerListingSelection } from '@/hooks/useBrokerListingSelection';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Building2, Loader2, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_LABELS } from '@/components/broker/listings/brokerListingStatus';
import { BrokerListingsList } from '@/components/broker/listings/BrokerListingsList';

const FILTER_CHIPS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Under Review' },
  { value: 'LIVE', label: 'Live' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'createdAt,desc', label: 'Newest first' },
  { value: 'createdAt,asc', label: 'Oldest first' },
  { value: 'updatedAt,desc', label: 'Recently updated' },
];

/**
 * "My Listings" page for brokers.
 *
 * Guards:
 *  - Unauthenticated: ProtectedRoute redirects to /auth before this component renders.
 *  - Not dealer/admin: redirect to / (access not permitted).
 *
 * Composition root only: filter/sort UI, loading/error/empty states and the
 * bulk-delete bar are wired here from useBrokerListingsInventory and
 * useBrokerListingSelection; per-listing rendering and lifecycle actions live
 * in BrokerListingsList/BrokerListingCard/BrokerListingActions.
 */
export default function BrokerListings() {
  const { isBroker, isAdmin, isLoading, userRole } = useAuth();
  const {
    activeFilter,
    setActiveFilter,
    activeSort,
    setActiveSort,
    listings: allListings,
    totalElements,
    isLoading: listingsLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBrokerListingsInventory();

  const { selectedIds, deletableListings, toggleSelect, selectAll, deselectAll } =
    useBrokerListingSelection(allListings);

  const bulkDeleteMutation = useBulkDeleteListings();
  const { toast } = useToast();

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: (result) => {
        toast({
          title: `${result.deleted} listing${result.deleted !== 1 ? 's' : ''} deleted`,
          description: result.skipped > 0
            ? `${result.skipped} could not be deleted (wrong status or not found).`
            : undefined,
        });
        deselectAll();
      },
      onError: (error: Error) => {
        toast({
          title: 'Bulk delete failed',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const isOwner = userRole === 'user';
  if (!isBroker && !isAdmin && !isOwner) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="container max-w-4xl py-6 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">My Listings</h1>
          <Button asChild>
            <Link to="/broker/listings/new">Create New Listing</Link>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {FILTER_CHIPS.map((chip) => (
              <Button
                key={chip.value}
                variant={activeFilter === chip.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(chip.value)}
              >
                {chip.label}
              </Button>
            ))}
          </div>
          <Select value={activeSort} onValueChange={setActiveSort}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {activeFilter ? (
              <>
                <p className="text-sm font-medium text-muted-foreground">
                  No {STATUS_LABELS[activeFilter]?.toLowerCase() ?? activeFilter.toLowerCase()} listings
                </p>
                <Button variant="outline" size="sm" onClick={() => setActiveFilter('')}>
                  View all listings
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-muted-foreground">No listings yet</p>
                <p className="text-xs text-muted-foreground">
                  Create your first listing to start reaching buyers.
                </p>
                <Button size="sm" asChild>
                  <Link to="/broker/listings/new">Create your first listing</Link>
                </Button>
              </>
            )}
          </div>
        )}

        {!listingsLoading && !isError && allListings.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {allListings.length} of {totalElements} listing{totalElements !== 1 ? 's' : ''}
              </p>
              {deletableListings.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 ? (
                    <Button variant="ghost" size="sm" onClick={deselectAll}>
                      Deselect all
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={selectAll}>
                      Select all deletable
                    </Button>
                  )}
                </div>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={bulkDeleteMutation.isPending}>
                      {bulkDeleteMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                      )}
                      Delete selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {selectedIds.size} listing{selectedIds.size !== 1 ? 's' : ''}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the selected listings. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleBulkDelete}
                      >
                        Delete {selectedIds.size} listing{selectedIds.size !== 1 ? 's' : ''}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Cancel
                </Button>
              </div>
            )}

            <BrokerListingsList
              listings={allListings}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
