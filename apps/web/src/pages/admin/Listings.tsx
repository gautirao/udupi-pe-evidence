import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import type { AdminListingRow } from '@/hooks/useAdminData';
import { useAdminListingsInventory } from '@/hooks/admin/useAdminListingsInventory';
import { INVENTORY_TABS, formatDisplayId, neutralizeCsvFormula } from '@/lib/listingInventory';
import { ListingEditorDrawer } from '@/components/admin/listings/ListingEditorDrawer';
import { ListingsFilterBar } from '@/components/admin/listings/ListingsFilterBar';
import { ListingsTable } from '@/components/admin/listings/ListingsTable';
import { ListingsPagination } from '@/components/admin/listings/ListingsPagination';
import { ListingsBulkActionBar } from '@/components/admin/listings/ListingsBulkActionBar';
import { AlertTriangle, Home, ListChecks, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function toCsvValue(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const s = neutralizeCsvFormula(raw);
  return `"${s.replace(/"/g, '""')}"`;
}

function exportSelectedCsv(listings: AdminListingRow[]) {
  const headers = [
    'display_id',
    'title',
    'property_type',
    'locality',
    'price',
    'status',
    'is_valid',
    'quality_score',
    'seller_type',
    'created_at',
    'updated_at',
  ];
  const rows = listings.map((l) =>
    [
      formatDisplayId(l.listing_number),
      l.title ?? '',
      l.property_type,
      l.locality ?? '',
      l.price ?? '',
      l.status ?? '',
      l.is_valid,
      l.quality_score ?? '',
      l.seller_type ?? '',
      l.created_at,
      l.updated_at,
    ]
      .map(toCsvValue)
      .join(','),
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listings-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Listings() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const inventory = useAdminListingsInventory();
  const {
    tab,
    q,
    sort,
    propertyTypeFilter,
    localityFilter,
    sellerFilter,
    lifecycleFilter,
    visibilityFilter,
    qualityFilter,
    editingId,
    editingSection,
    updateParams,
    updateFilters,
    pageItems,
    totalCount,
    isLoading,
    isError,
    refetch,
    tabCounts,
    propertyTypeOptions,
    localityOptions,
    sellerTypeOptions,
    totalPages,
    currentPage,
    pageSize,
    editingListing,
    isResolvingListing,
    openEditor,
    closeEditor,
    selectedListings,
    setSelectedListings,
    allOnPageSelected,
    toggleSelect,
    toggleSelectAll,
    refreshInventory,
    hasActiveFilters,
  } = inventory;

  const [archiveTarget, setArchiveTarget] = useState<AdminListingRow | null>(null);

  return (
    <AppLayout>
      <div className="container py-6 max-w-7xl">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Home className="h-6 w-6 text-primary" />
              Listings inventory
            </h1>
            <p className="text-muted-foreground">
              Manage every listing's lifecycle, visibility, and details.
            </p>
          </div>
          {isAdmin && (
            <Button asChild>
              <Link to="/broker/listings/new">
                <Plus className="h-4 w-4 mr-2" />
                Add listing
              </Link>
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => updateFilters({ tab: v === 'all' ? null : v })} className="mb-5">
          <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
            {INVENTORY_TABS.map((t) => {
              const active = tab === t.value;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="gap-2 rounded-none border-b-2 border-transparent px-0.5 pb-3 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {t.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
                      active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tabCounts[t.value]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <ListingsFilterBar
          q={q}
          lifecycleFilter={lifecycleFilter}
          visibilityFilter={visibilityFilter}
          propertyTypeFilter={propertyTypeFilter}
          localityFilter={localityFilter}
          sellerFilter={sellerFilter}
          qualityFilter={qualityFilter}
          sort={sort}
          propertyTypeOptions={propertyTypeOptions}
          localityOptions={localityOptions}
          sellerTypeOptions={sellerTypeOptions}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          updateFilters={updateFilters}
          updateParams={updateParams}
        />

        <ListingsBulkActionBar
          selectedListings={selectedListings}
          onExportCsv={exportSelectedCsv}
          onClearSelection={() => setSelectedListings(new Map())}
        />

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
            heading="Couldn't load listings"
            description="Something went wrong fetching the inventory."
            primaryAction={{ label: 'Retry', onClick: () => void refetch() }}
          />
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-6 w-6 text-muted-foreground" />}
            heading={hasActiveFilters ? 'No listings match these filters' : 'No listings yet'}
            description={
              hasActiveFilters
                ? 'Try clearing search or filters to see more results.'
                : 'Listings will show up here once scraped or submitted.'
            }
            primaryAction={
              hasActiveFilters
                ? {
                    label: 'Clear filters',
                    onClick: () =>
                      updateFilters({
                        q: null,
                        status: null,
                        pt: null,
                        loc: null,
                        seller: null,
                        vis: null,
                        quality: null,
                      }),
                  }
                : undefined
            }
          />
        ) : (
          <ListingsTable
            pageItems={pageItems}
            selectedListings={selectedListings}
            allOnPageSelected={allOnPageSelected}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            openEditor={openEditor}
            onArchiveRequested={setArchiveTarget}
          />
        )}

        <ListingsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          updateParams={updateParams}
        />
      </div>

      <ListingEditorDrawer
        listing={editingListing}
        isResolvingListing={isResolvingListing}
        open={!!editingId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeEditor();
        }}
        initialSection={editingSection}
      />

      {/* Archive confirmation triggered from the table's overflow menu (mirrors
          the drawer's own archive dialog for the "archive without opening the
          editor first" path). */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this listing?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.title || 'This listing'} will be removed from active inventory and
              hidden from the public. You can restore it to draft later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!archiveTarget) return;
                try {
                  await api.post(`/api/admin/listings/${archiveTarget.id}/archive`);
                  toast({ title: 'Listing archived' });
                  await refreshInventory();
                } catch (error) {
                  toast({
                    title: 'Archive failed',
                    description: error instanceof Error ? error.message : undefined,
                    variant: 'destructive',
                  });
                } finally {
                  setArchiveTarget(null);
                }
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
