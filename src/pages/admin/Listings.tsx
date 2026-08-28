import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import {
  useAdminListingById,
  useAdminListingFilterOptions,
  useAdminListingsPage,
  useAdminListingsTabCounts,
  type AdminListingRow,
  type AdminListingsQueryParams,
} from '@/hooks/useAdminData';
import { useQueryClient } from '@tanstack/react-query';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import { PROPERTY_TYPES } from '@/lib/listing-constants';
import {
  INVENTORY_SORT_OPTIONS,
  INVENTORY_TABS,
  LISTING_LIFECYCLE_STATUSES,
  QUALITY_BUCKET_LABELS,
  formatDisplayId,
  getQualityBucket,
  isPubliclyVisible,
  needsAttention,
  neutralizeCsvFormula,
  type InventorySortKey,
  type InventoryTab,
  type QualityBucket,
} from '@/lib/listingInventory';
import { ListingEditorDrawer } from '@/components/admin/listings/ListingEditorDrawer';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Home,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const DEFAULT_TAB_COUNTS: Record<InventoryTab, number> = {
  all: 0,
  published: 0,
  pending: 0,
  'needs-attention': 0,
  archived: 0,
};

const PROPERTY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  PROPERTY_TYPES.map((pt) => [pt.value, pt.label]),
);

const propertyTypeColors: Record<string, string> = {
  land: 'bg-green-500/10 text-green-600',
  agricultural_land: 'bg-lime-500/10 text-lime-700',
  house: 'bg-orange-500/10 text-orange-600',
  villa: 'bg-pink-500/10 text-pink-600',
  residential_plot: 'bg-emerald-500/10 text-emerald-700',
  apartment: 'bg-violet-500/10 text-violet-600',
  commercial: 'bg-blue-500/10 text-blue-600',
  commercial_building: 'bg-blue-600/10 text-blue-700',
  warehouse: 'bg-amber-500/10 text-amber-700',
  commercial_land: 'bg-teal-500/10 text-teal-700',
  other: 'bg-gray-500/10 text-gray-600',
};

const statusBadgeStyles: Record<string, string> = {
  SCRAPED: 'bg-blue-500/10 text-blue-600',
  DRAFT: 'bg-gray-500/10 text-gray-600',
  PENDING_REVIEW: 'bg-yellow-500/10 text-yellow-700',
  LIVE: 'bg-green-500/10 text-green-600',
  REJECTED: 'bg-red-500/10 text-red-600',
  ARCHIVED: 'bg-slate-500/10 text-slate-600',
};

const qualityDotColors: Record<QualityBucket, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
  unscored: 'bg-muted-foreground/40',
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={cn('border-0 font-medium', statusBadgeStyles[status] ?? 'bg-gray-500/10 text-gray-600')}
    >
      {status.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

function VisibilityBadge({ listing }: { listing: AdminListingRow }) {
  return isPubliclyVisible(listing) ? (
    <Badge variant="outline" className="gap-1 border-0 bg-green-500/10 font-medium text-green-700">
      <CheckCircle2 className="h-3 w-3" />
      Public
    </Badge>
  ) : (
    <Badge variant="outline" className="border-0 bg-muted font-medium text-muted-foreground">
      Hidden
    </Badge>
  );
}

function QualityIndicator({ score }: { score: number | null | undefined }) {
  const bucket = getQualityBucket(score);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', qualityDotColors[bucket])} aria-hidden="true" />
      {score != null ? score : <span className="text-muted-foreground">Unscored</span>}
    </div>
  );
}

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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedListings, setSelectedListings] = useState<Map<string, AdminListingRow>>(new Map());

  const tab = (searchParams.get('tab') as InventoryTab) || 'all';
  const q = searchParams.get('q') || '';
  const sort = (searchParams.get('sort') as InventorySortKey) || 'updated-desc';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const propertyTypeFilter = searchParams.get('pt') || 'all';
  const localityFilter = searchParams.get('loc') || 'all';
  const sellerFilter = searchParams.get('seller') || 'all';
  const lifecycleFilter = searchParams.get('status') || 'all';
  const visibilityFilter = (searchParams.get('vis') as AdminListingsQueryParams['visibility']) || 'all';
  const qualityFilter = (searchParams.get('quality') as QualityBucket | 'all') || 'all';
  const editingId = searchParams.get('edit');
  const editingSection = (searchParams.get('editTab') as 'details' | 'activity') || 'details';

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Reset to page 1 whenever the scope of results changes.
  function updateFilters(patch: Record<string, string | null>) {
    updateParams({ ...patch, page: null });
  }

  useEffect(() => {
    setSelectedListings(new Map());
  }, [tab]);

  // Server-side paginated/filtered/sorted inventory page — see #2370: this
  // replaces the old `useAdminListings(FETCH_LIMIT)` + client-side
  // filter/sort/slice, which silently lost any listing outside the first
  // 200 rows fetched.
  const queryParams: AdminListingsQueryParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      tab,
      q,
      sort,
      propertyType: propertyTypeFilter,
      locality: localityFilter,
      sellerType: sellerFilter,
      lifecycleStatus: lifecycleFilter,
      visibility: visibilityFilter,
      quality: qualityFilter,
    }),
    [page, tab, q, sort, propertyTypeFilter, localityFilter, sellerFilter, lifecycleFilter, visibilityFilter, qualityFilter],
  );

  const { data: pageData, isLoading, isError, refetch } = useAdminListingsPage(queryParams);
  const pageItems = useMemo(() => pageData?.items ?? [], [pageData]);
  const totalCount = pageData?.totalCount ?? 0;

  const { data: tabCounts = DEFAULT_TAB_COUNTS } = useAdminListingsTabCounts();

  const { data: filterOptions } = useAdminListingFilterOptions();
  const propertyTypeOptions = filterOptions?.propertyTypes ?? [];
  const localityOptions = filterOptions?.localities ?? [];
  const sellerTypeOptions = filterOptions?.sellerTypes ?? [];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Deep-link resolution (#2370): if the requested id isn't on the current
  // page, fetch it directly by id rather than reporting "not found" for a
  // listing that's simply outside this page/window.
  const editingListingFromPage = editingId ? pageItems.find((l) => l.id === editingId) : undefined;
  const needsDirectLookup = !!editingId && !editingListingFromPage;
  const { data: editingListingById, isLoading: isLoadingEditingListingById } = useAdminListingById(
    needsDirectLookup ? editingId : null,
  );
  const editingListing = editingListingFromPage ?? (needsDirectLookup ? editingListingById : null);
  const isResolvingListing =
    !!editingId && (isLoading || (needsDirectLookup && isLoadingEditingListingById));

  const [archiveTarget, setArchiveTarget] = useState<AdminListingRow | null>(null);

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((l) => selectedListings.has(l.id));

  function toggleSelectAll() {
    setSelectedListings((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        pageItems.forEach((l) => next.delete(l.id));
      } else {
        pageItems.forEach((l) => next.set(l.id, l));
      }
      return next;
    });
  }

  function toggleSelect(listing: AdminListingRow) {
    setSelectedListings((prev) => {
      const next = new Map(prev);
      if (next.has(listing.id)) next.delete(listing.id);
      else next.set(listing.id, listing);
      return next;
    });
  }

  function openEditor(id: string, section: 'details' | 'activity' = 'details') {
    updateParams({ edit: id, editTab: section === 'activity' ? 'activity' : null });
  }

  function closeEditor() {
    updateParams({ edit: null, editTab: null });
  }

  async function refreshInventory() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-listings-page'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-listings-tab-counts'] }),
    ]);
  }

  const hasActiveFilters =
    q ||
    lifecycleFilter !== 'all' ||
    propertyTypeFilter !== 'all' ||
    localityFilter !== 'all' ||
    sellerFilter !== 'all' ||
    visibilityFilter !== 'all' ||
    qualityFilter !== 'all';

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

        {/* Search, filters, sort */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 mb-4">
          <Input
            placeholder="Search title, ID, seller type, or locality…"
            value={q}
            onChange={(e) => updateFilters({ q: e.target.value || null })}
            className="h-9 max-w-xs"
            aria-label="Search listings"
          />

          <Select value={lifecycleFilter} onValueChange={(v) => updateFilters({ status: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Lifecycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lifecycles</SelectItem>
              {LISTING_LIFECYCLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={visibilityFilter} onValueChange={(v) => updateFilters({ vis: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visibility</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>

          <Select value={propertyTypeFilter} onValueChange={(v) => updateFilters({ pt: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Property type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {propertyTypeOptions.map((pt) => (
                <SelectItem key={pt} value={pt}>
                  {PROPERTY_TYPE_LABELS[pt] ?? pt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={localityFilter} onValueChange={(v) => updateFilters({ loc: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Locality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All localities</SelectItem>
              {localityOptions.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sellerFilter} onValueChange={(v) => updateFilters({ seller: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Seller type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sellers</SelectItem>
              {sellerTypeOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={qualityFilter} onValueChange={(v) => updateFilters({ quality: v === 'all' ? null : v })}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Quality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quality</SelectItem>
              {(Object.keys(QUALITY_BUCKET_LABELS) as QualityBucket[]).map((bucket) => (
                <SelectItem key={bucket} value={bucket}>
                  {QUALITY_BUCKET_LABELS[bucket]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() =>
                updateFilters({ q: null, status: null, pt: null, loc: null, seller: null, vis: null, quality: null })
              }
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear filters
            </Button>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {totalCount} {totalCount === 1 ? 'result' : 'results'}
            </span>
            <Select value={sort} onValueChange={(v) => updateParams({ sort: v === 'updated-desc' ? null : v })}>
              <SelectTrigger className="h-9 w-48 text-sm">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedListings.size > 0 && (
          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2 mb-3">
            <span className="text-sm font-medium">{selectedListings.size} selected</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportSelectedCsv(Array.from(selectedListings.values()))}
              >
                Export selected (CSV)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedListings(new Map())}>
                Clear selection
              </Button>
            </div>
          </div>
        )}

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
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">Listing</TableHead>
                  <TableHead className="hidden xl:table-cell text-xs font-medium uppercase tracking-wide">
                    Source
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-medium uppercase tracking-wide">
                    Type
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">Locality</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">Price</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">Lifecycle</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-medium uppercase tracking-wide">
                    Quality
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide">Visibility</TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-medium uppercase tracking-wide">
                    Updated
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((listing) => {
                  const images = Array.isArray(listing.raw_posts?.images)
                    ? (listing.raw_posts?.images as Array<{ url?: string }>)
                    : [];
                  const firstImage = images[0]?.url;
                  const flagged = needsAttention(listing);

                  return (
                    <TableRow key={listing.id} className={cn('group', !listing.is_valid && 'opacity-70')}>
                      <TableCell className="py-3">
                        <Checkbox
                          checked={selectedListings.has(listing.id)}
                          onCheckedChange={() => toggleSelect(listing)}
                          aria-label={`Select ${formatDisplayId(listing.listing_number)}`}
                        />
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-border">
                            {firstImage ? (
                              <img src={firstImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium leading-snug truncate max-w-[200px]">
                              {listing.title || 'Untitled listing'}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="font-mono">{formatDisplayId(listing.listing_number)}</span>
                              {flagged && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-amber-600"
                                  title="Needs attention"
                                >
                                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                  <span className="sr-only">Needs attention</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell py-3 text-sm text-muted-foreground capitalize">
                        {listing.seller_type || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell py-3">
                        <Badge
                          variant="outline"
                          className={cn('border-0 font-medium', propertyTypeColors[listing.property_type] ?? propertyTypeColors.other)}
                        >
                          {PROPERTY_TYPE_LABELS[listing.property_type] ?? listing.property_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[140px]">
                            {listing.locality || <span className="text-muted-foreground">Unknown</span>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-medium">
                        {listing.price ? formatPrice(listing.price, listing.price_unit) : '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        <StatusBadge status={listing.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-3">
                        <QualityIndicator score={listing.quality_score} />
                      </TableCell>
                      <TableCell className="py-3">
                        <VisibilityBadge listing={listing} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-3 text-sm text-muted-foreground">
                        {formatRelativeDate(listing.updated_at)}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => openEditor(listing.id)}>
                            Open
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="More actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/listing/${listing.id}`} target="_blank" rel="noopener noreferrer">
                                  {isPubliclyVisible(listing) ? 'Preview public listing' : 'Preview (draft)'}
                                  <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                                </Link>
                              </DropdownMenuItem>
                              {listing.latitude != null && listing.longitude != null ? (
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=17/${listing.latitude}/${listing.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View on map
                                  </a>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>View on map (no coordinates)</DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEditor(listing.id, 'activity')}>
                                View activity
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {listing.status !== 'ARCHIVED' ? (
                                <DropdownMenuItem onClick={() => setArchiveTarget(listing)}>
                                  Archive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => openEditor(listing.id)}>
                                  Restore…
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t pt-4 mt-4 text-sm text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of{' '}
              {totalCount} total
            </span>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => updateParams({ page: String(currentPage - 1) })}
              >
                Previous
              </Button>
              <span className="tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => updateParams({ page: String(currentPage + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
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
