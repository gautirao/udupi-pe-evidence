import { useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  ArrowUpDown,
  ChevronRight,
  TrendingUp,
  Wrench,
  Star,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  BarChart2,
  RefreshCw,
} from 'lucide-react';
import { useBrokerListingQuality } from '@/hooks/useBrokerListingQuality';
import type {
  QualityListing,
  QualityBand,
  ImpactLevel,
  ListingQualityResponse,
} from '@/types/listingQuality';
import { formatDistanceToNow } from 'date-fns';

// ─── Filter chip type ─────────────────────────────────────────────────────────

type FilterKey = 'all' | 'buyerReady' | 'needImprovement' | 'priorityFix' | 'notScored';

interface FilterChip {
  key: FilterKey;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'all', label: 'All' },
  { key: 'priorityFix', label: 'Priority Fix' },
  { key: 'needImprovement', label: 'Needs Work' },
  { key: 'buyerReady', label: 'Buyer Ready' },
  { key: 'notScored', label: 'Not Scored' },
];

// ─── Sort type ────────────────────────────────────────────────────────────────

type SortKey = 'band' | 'score' | 'title';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_ORDER: Record<QualityBand, number> = {
  PRIORITY_FIX: 0,
  NEEDS_IMPROVEMENT: 1,
  BUYER_READY: 2,
  UNSCORED: 3,
};

function bandLabel(band: QualityBand): string {
  switch (band) {
    case 'BUYER_READY': return 'Buyer Ready';
    case 'NEEDS_IMPROVEMENT': return 'Needs Work';
    case 'PRIORITY_FIX': return 'Priority Fix';
    case 'UNSCORED': return 'Not Scored';
  }
}

function bandBadgeClass(band: QualityBand): string {
  switch (band) {
    case 'BUYER_READY':
      return 'bg-green-100 text-green-800 border-0';
    case 'NEEDS_IMPROVEMENT':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'PRIORITY_FIX':
      return 'bg-red-100 text-red-800 border-0';
    case 'UNSCORED':
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

function impactBadgeClass(impact: ImpactLevel): string {
  switch (impact) {
    case 'HIGH': return 'bg-red-100 text-red-800 border-0';
    case 'MEDIUM': return 'bg-amber-100 text-amber-800 border-0';
    case 'LOW': return 'bg-blue-100 text-blue-800 border-0';
  }
}

/**
 * Sort listings by the given key. Modifies a copy — never mutates the prop array.
 */
function sortListings(listings: QualityListing[], sortKey: SortKey): QualityListing[] {
  const copy = [...listings];
  switch (sortKey) {
    case 'band':
      return copy.sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]);
    case 'score':
      // Scored first (desc), then unscored at bottom
      return copy.sort((a, b) => {
        if (a.qualityScore === null && b.qualityScore === null) return 0;
        if (a.qualityScore === null) return 1;
        if (b.qualityScore === null) return -1;
        return b.qualityScore - a.qualityScore;
      });
    case 'title':
      return copy.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }
}

/**
 * Derive "today's priority" — the highest-impact PRIORITY_FIX listing, falling
 * back to first NEEDS_IMPROVEMENT if none exists.
 */
function deriveTodaysPriority(listings: QualityListing[]): QualityListing | null {
  const priorityFix = listings.filter(l => l.band === 'PRIORITY_FIX');
  if (priorityFix.length > 0) {
    // Pick the one with the highest number of HIGH-impact fixes
    return priorityFix.sort(
      (a, b) =>
        b.fixPlan.filter(f => f.impact === 'HIGH').length -
        a.fixPlan.filter(f => f.impact === 'HIGH').length,
    )[0] ?? null;
  }
  const needsWork = listings.filter(l => l.band === 'NEEDS_IMPROVEMENT');
  return needsWork[0] ?? null;
}

/**
 * Filter listings by selected chip.
 * Server filterCounts are used for chip labels; client filtering is by
 * the band field returned by the server — no recomputation that can drift.
 */
function filterListings(listings: QualityListing[], filter: FilterKey): QualityListing[] {
  switch (filter) {
    case 'all': return listings;
    case 'buyerReady': return listings.filter(l => l.band === 'BUYER_READY');
    case 'needImprovement': return listings.filter(l => l.band === 'NEEDS_IMPROVEMENT');
    case 'priorityFix': return listings.filter(l => l.band === 'PRIORITY_FIX');
    case 'notScored': return listings.filter(l => l.scoreStatus === 'NOT_SCORED');
  }
}

/**
 * Guard against null listingId before building an edit deep-link.
 * Backend guarantees non-null UUID, but be defensive.
 */
function safeEditLink(listingId: string | null | undefined, fallbackHref: string): string {
  if (!listingId) return '/broker/listings';
  return fallbackHref || `/broker/listings/${listingId}/edit`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardsProps {
  data: ListingQualityResponse;
}

function SummaryCards({ data }: SummaryCardsProps) {
  const { averageQuality, priorityFixesCount, needImprovementCount, buyerReadyCount } =
    data.aggregates;

  // averageQuality === null means zero scored listings — NEVER render 0
  const avgDisplay =
    averageQuality === null ? '—' : `${Math.round(averageQuality)}`;
  const avgSubtitle =
    averageQuality === null ? 'No scored listings yet' : 'Average quality score';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Average quality */}
      <Card>
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            Avg Quality
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p
            className="text-3xl font-bold text-foreground"
            aria-label={`Average quality score: ${avgDisplay}`}
          >
            {avgDisplay}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{avgSubtitle}</p>
        </CardContent>
      </Card>

      {/* Priority fixes */}
      <Card className="border-red-200">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
            Priority Fix
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-3xl font-bold text-red-700">{priorityFixesCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Listings need urgent action</p>
        </CardContent>
      </Card>

      {/* Needs improvement */}
      <Card className="border-amber-200">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-amber-600" />
            Needs Work
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-3xl font-bold text-amber-700">{needImprovementCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Listings to improve</p>
        </CardContent>
      </Card>

      {/* Buyer ready */}
      <Card className="border-green-200">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Buyer Ready
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-3xl font-bold text-green-700">{buyerReadyCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">High-quality listings</p>
        </CardContent>
      </Card>
    </div>
  );
}

interface TodaysPriorityCardProps {
  listing: QualityListing;
  onSelect: (listing: QualityListing) => void;
}

function TodaysPriorityCard({ listing, onSelect }: TodaysPriorityCardProps) {
  const topFix = listing.fixPlan.find(f => f.impact === 'HIGH') ?? listing.fixPlan[0];

  return (
    <Card className="border-[hsl(var(--copper))] bg-[hsl(var(--copper-tint))]">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-[hsl(var(--copper))] uppercase tracking-wide flex items-center gap-1.5">
          <Star className="h-4 w-4" />
          Today&apos;s Priority
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">
              {listing.title ?? 'Untitled listing'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={bandBadgeClass(listing.band)} variant="outline">
                {bandLabel(listing.band)}
              </Badge>
              {listing.qualityScore !== null && (
                <span className="text-sm text-muted-foreground">
                  Score: {listing.qualityScore}
                </span>
              )}
            </div>
            {topFix && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                Top action: {topFix.action}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {topFix && (
              <Link
                to={safeEditLink(listing.listingId, topFix.editDeepLink)}
                className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--copper))] hover:underline"
              >
                Fix now
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelect(listing)}
              className="text-muted-foreground"
            >
              Details
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface FixPlanPanelProps {
  listing: QualityListing;
  onClose: () => void;
}

function FixPlanPanel({ listing, onClose }: FixPlanPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {listing.title ?? 'Untitled listing'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={bandBadgeClass(listing.band)} variant="outline">
              {bandLabel(listing.band)}
            </Badge>
            {listing.qualityScore !== null ? (
              <span className="text-sm text-muted-foreground">Score: {listing.qualityScore}</span>
            ) : (
              <span className="text-sm text-muted-foreground" data-testid="score-unavailable">
                Not yet scored
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close fix plan panel">
          ✕
        </Button>
      </div>

      {/* Engagement */}
      <div className="mb-4 p-3 rounded-lg bg-muted/50">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Engagement
        </p>
        {listing.engagement.status === 'AVAILABLE' ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold">{listing.engagement.views ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Views</p>
            </div>
            <div>
              <p className="text-lg font-bold">{listing.engagement.enquiries ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Enquiries</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {listing.engagement.enquiryRate !== null
                  ? `${(listing.engagement.enquiryRate * 100).toFixed(1)}%`
                  : '—'}
              </p>
              <p className="text-xs text-muted-foreground">Rate</p>
            </div>
          </div>
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="engagement-unavailable"
          >
            {listing.engagement.status === 'LIMITED'
              ? 'Engagement data limited'
              : 'Engagement data unavailable — available after listing goes live'}
          </p>
        )}
      </div>

      {/* Score breakdown */}
      {listing.scoreStatus === 'NOT_SCORED' ? (
        <div className="mb-4 p-3 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground" data-testid="not-scored-message">
            This listing has not been scored yet. Scores are computed periodically.
          </p>
        </div>
      ) : listing.findings.length > 0 ? (
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Score Breakdown
          </p>
          <div className="space-y-1.5">
            {listing.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${f.applied ? 'bg-green-500' : 'bg-gray-300'}`}
                />
                <div className="min-w-0">
                  <span className="font-medium">{f.component}</span>
                  <span className="text-muted-foreground"> · {f.finding}</span>
                </div>
                <span className="shrink-0 text-muted-foreground ml-auto">{f.score}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Fix plan */}
      {listing.fixPlan.length > 0 && (
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Fix Plan
          </p>
          <div className="space-y-2">
            {listing.fixPlan.map((fix, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <Badge className={impactBadgeClass(fix.impact)} variant="outline">
                  {fix.impact}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">{fix.component}</p>
                  <p className="text-sm">{fix.action}</p>
                </div>
                <Link
                  to={safeEditLink(listing.listingId, fix.editDeepLink)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  aria-label={`Edit listing for: ${fix.action}`}
                >
                  Edit
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {listing.fixPlan.length === 0 && listing.scoreStatus === 'SCORED' && (
        <div className="p-3 rounded-lg bg-green-50 text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
          No fixes required — this listing is buyer ready.
        </div>
      )}

      {listing.computedAt && (
        <p className="text-xs text-muted-foreground mt-4">
          Scored {formatDistanceToNow(new Date(listing.computedAt), { addSuffix: true })}
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ListingQuality() {
  const { isBroker, isAdmin, isLoading: authLoading } = useAuth();
  const { data, isLoading, isError, error, refetch } = useBrokerListingQuality();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('band');
  const [selectedListing, setSelectedListing] = useState<QualityListing | null>(null);

  // All hooks must be called unconditionally before any early return.
  const todaysPriority = useMemo(
    () => (data ? deriveTodaysPriority(data.listings) : null),
    [data],
  );

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    const filtered = filterListings(data.listings, activeFilter);
    return sortListings(filtered, sortKey);
  }, [data, activeFilter, sortKey]);

  const filterCounts = data?.aggregates.filterCounts;

  // Broker-guard: redirect non-broker, non-admin users (after all hooks).
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
            {todaysPriority && (
              <div className="mt-4">
                <TodaysPriorityCard
                  listing={todaysPriority}
                  onSelect={setSelectedListing}
                />
              </div>
            )}

            {/* Filter chips */}
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter listings">
              {FILTER_CHIPS.map(chip => {
                // Counts come from the server — never recomputed client-side.
                const rawCount: number | undefined = filterCounts
                  ? chip.key === 'all'
                    ? filterCounts.all
                    : chip.key === 'buyerReady'
                    ? filterCounts.buyerReady
                    : chip.key === 'needImprovement'
                    ? filterCounts.needImprovement
                    : chip.key === 'priorityFix'
                    ? filterCounts.priorityFix
                    : chip.key === 'notScored'
                    ? filterCounts.notScored
                    : undefined
                  : undefined;

                const isActive = activeFilter === chip.key;
                return (
                  <button
                    key={chip.key}
                    onClick={() => {
                      setActiveFilter(chip.key);
                      setSelectedListing(null);
                    }}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {chip.label}
                    {rawCount !== undefined && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {rawCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sort control */}
            <div className="mt-3 flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Sort by:</span>
              {(['band', 'score', 'title'] as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`text-sm px-2 py-1 rounded transition-colors ${
                    sortKey === key
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {key === 'band' ? 'Priority' : key === 'score' ? 'Score' : 'Name'}
                </button>
              ))}
            </div>

            {/* Main split view: worklist + fix-plan panel */}
            <div
              className={`mt-4 grid gap-4 ${selectedListing ? 'lg:grid-cols-[1fr_380px]' : 'grid-cols-1'}`}
            >
              {/* Worklist */}
              <div>
                {filteredAndSorted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="font-medium text-foreground">No listings in this category</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {activeFilter === 'all'
                        ? "You don't have any listings yet."
                        : 'No listings match this filter.'}
                    </p>
                    {activeFilter === 'all' && (
                      <Button asChild className="mt-4" size="sm">
                        <Link to="/broker/listings/new">Create your first listing</Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div
                    className="divide-y divide-border rounded-lg border border-border overflow-hidden"
                    role="list"
                    aria-label="Listings worklist"
                  >
                    {filteredAndSorted.map(listing => {
                      const isSelected = selectedListing?.listingId === listing.listingId;
                      return (
                        <div
                          key={listing.listingId}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() =>
                            setSelectedListing(isSelected ? null : listing)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedListing(isSelected ? null : listing);
                            }
                          }}
                          className={`flex items-center gap-3 p-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                            isSelected
                              ? 'bg-primary/5 border-l-2 border-l-primary'
                              : 'bg-card hover:bg-muted/40'
                          }`}
                        >
                          {/* Band indicator */}
                          <div className="shrink-0">
                            <Badge
                              className={bandBadgeClass(listing.band)}
                              variant="outline"
                            >
                              {bandLabel(listing.band)}
                            </Badge>
                          </div>

                          {/* Listing info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {listing.title ?? (
                                <span className="text-muted-foreground italic">Untitled</span>
                              )}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{listing.status}</span>
                              {listing.scoreStatus === 'NOT_SCORED' ? (
                                <span
                                  className="text-xs text-muted-foreground"
                                  data-testid={`not-scored-${listing.listingId}`}
                                >
                                  · Not yet scored
                                </span>
                              ) : listing.qualityScore !== null ? (
                                <span className="text-xs text-muted-foreground">
                                  · Score: {listing.qualityScore}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Fix count */}
                          {listing.fixPlan.length > 0 && (
                            <div className="shrink-0 text-xs text-muted-foreground">
                              {listing.fixPlan.length} fix{listing.fixPlan.length !== 1 ? 'es' : ''}
                            </div>
                          )}

                          <ChevronRight
                            className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-primary' : 'text-muted-foreground'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fix-plan panel */}
              {selectedListing && (
                <div className="lg:sticky lg:top-20 self-start">
                  <Card>
                    <CardContent className="p-4">
                      <FixPlanPanel
                        listing={selectedListing}
                        onClose={() => setSelectedListing(null)}
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
