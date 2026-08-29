import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, RefreshCw } from 'lucide-react';
import { SummaryCards, TodaysPriorityCard } from '@/components/broker/listing-quality/ListingQualitySummary';
import { QualityFilterBar } from '@/components/broker/listing-quality/QualityFilterBar';
import { QualityListingWorklist } from '@/components/broker/listing-quality/QualityListingWorklist';
import { FixPlanPanel } from '@/components/broker/listing-quality/FixPlanPanel';
import { useListingQualityView } from './useListingQualityView';

export default function ListingQuality() {
  const { isBroker, isAdmin, isLoading: authLoading } = useAuth();
  const view = useListingQualityView();
  const { data, isLoading, isError, error, refetch, selectedListing } = view;

  // Broker-guard: redirect non-broker, non-admin users (after all hooks, via the view hook).
  if (!authLoading && !isBroker && !isAdmin) {
    return <Navigate to="/broker/setup" replace />;
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-[hsl(var(--copper))]" />
            <h1 className="text-2xl font-bold text-foreground">Listing Quality</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Improve your listings to attract more buyers and increase enquiries.
          </p>
        </div>

        {/* Backfill incomplete banner */}
        {data?.backfill.status === 'INCOMPLETE' && (
          <Alert className="mb-4 border-amber-300 bg-amber-50" role="status" aria-live="polite">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Quality scores are being computed — {data.backfill.scoredCount} of{' '}
              {data.backfill.totalCount} listings scored so far. Refresh to see the latest.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading state */}
        {isLoading && (
          <div aria-busy="true" aria-label="Loading listing quality data">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
              {[0, 1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-8 w-16 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-24 w-full mb-4" />
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                {error?.status === 403
                  ? 'Access denied. Broker or admin role required.'
                  : 'Failed to load listing quality data. Please try again.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="ml-3 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success state */}
        {data && !isLoading && (
          <>
            {/* Summary cards */}
            <SummaryCards data={data} />

            {/* Today's priority */}
            {view.todaysPriority && (
              <div className="mt-4">
                <TodaysPriorityCard
                  listing={view.todaysPriority}
                  onSelect={view.setSelectedListing}
                />
              </div>
            )}

            <QualityFilterBar
              filterCounts={view.filterCounts}
              activeFilter={view.activeFilter}
              onSelectFilter={view.selectFilter}
              sortKey={view.sortKey}
              onSelectSort={view.setSortKey}
            />

            {/* Main split view: worklist + fix-plan panel */}
            <div
              className={`mt-4 grid gap-4 ${selectedListing ? 'lg:grid-cols-[1fr_380px]' : 'grid-cols-1'}`}
            >
              {/* Worklist */}
              <div>
                <QualityListingWorklist
                  listings={view.filteredAndSorted}
                  activeFilter={view.activeFilter}
                  selectedListing={selectedListing}
                  onToggleListing={view.toggleListing}
                />
              </div>

              {/* Fix-plan panel */}
              {selectedListing && (
                <div className="lg:sticky lg:top-20 self-start">
                  <Card>
                    <CardContent className="p-4">
                      <FixPlanPanel
                        listing={selectedListing}
                        onClose={() => view.setSelectedListing(null)}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
