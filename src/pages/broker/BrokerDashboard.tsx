import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  ShieldAlert,
  X,
  MapPin,
  Zap,
  BarChart2,
  Eye,
  TrendingUp,
  BookOpen,
  Home,
} from 'lucide-react';
import {
  useBrokerListingStats,
  useBrokerMyListings,
  useBrokerQualitySummary,
  type BrokerQualitySummaryResponse,
} from '@/hooks/useBrokerListings';
import { TrustProgressPanel, type TrustProgressResponse } from '@/components/trust/TrustProgressPanel';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  sortActionCards,
  type ActionCardDescriptor,
} from '@/lib/brokerDashboardUtils';

// ── Listing status helpers (carried from v1) ──────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Under Review',
  LIVE: 'Live',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

function statusBadgeClassName(status: string): string {
  switch (status) {
    case 'LIVE':
      return 'bg-green-100 text-green-800 border-0';
    case 'PENDING_REVIEW':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-0';
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-700 border-0';
    case 'DRAFT':
    default:
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

function listingLink(id: string, status: string): string {
  if (status === 'DRAFT' || status === 'REJECTED') {
    return `/broker/listings/${id}/edit`;
  }
  return `/listing/${id}`;
}

// ── Trust banner helpers (carried from v1) ────────────────────────────────────

function isDismissed(listingId: string): boolean {
  try {
    return localStorage.getItem(`trust-banner-dismissed-${listingId}`) === 'true';
  } catch {
    return false;
  }
}

// ── Quality score display helpers (AC3) ──────────────────────────────────────

interface QualityDisplayProps {
  quality: BrokerQualitySummaryResponse['quality'];
}

function QualityScoreDisplay({ quality }: QualityDisplayProps) {
  if (quality.state === 'PENDING' || quality.averageQualityScore === null) {
    return (
      <div>
        <p className="text-lg font-semibold text-muted-foreground">Not yet scored</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Scores are computed after listing review
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-3xl font-bold text-primary">{quality.averageQualityScore}</p>
      <p className="text-xs text-muted-foreground font-medium mt-0.5">/ 100 avg quality</p>
      {quality.state === 'PARTIAL' && (
        <p className="text-xs text-amber-700 mt-1">
          Based on {quality.countComputed} of {quality.countTotal} scored listings
        </p>
      )}
    </div>
  );
}

// ── Summary card skeletons ────────────────────────────────────────────────────

function SummaryCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BrokerDashboard() {
  const { isBroker, isAdmin, isLoading, user } = useAuth();
  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? 'there';

  const {
    data: qualitySummary,
    isLoading: qualityLoading,
    isError: qualityError,
    refetch: refetchQuality,
  } = useBrokerQualitySummary();

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useBrokerListingStats();

  const {
    data: recentData,
    isLoading: recentLoading,
    isError: recentError,
    refetch: refetchRecent,
  } = useBrokerMyListings(0, 5);

  // Trust panel: first LIVE/PENDING_REVIEW listing
  const featuredListing = recentData?.listings.find(
    (l) => l.status === 'LIVE' || l.status === 'PENDING_REVIEW',
  );
  const { data: trustData } = useQuery({
    queryKey: ['trust-progress', featuredListing?.id],
    queryFn: () =>
      api.get<TrustProgressResponse>(`/api/listings/${featuredListing!.id}/trust-progress`),
    staleTime: 60_000,
    enabled: !!featuredListing,
  });

  const featuredId = featuredListing?.id;
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const hasAvailableBadge = trustData?.badges.some((b) => b.badgeState === 'AVAILABLE') ?? false;
  const bannerDismissed =
    (featuredId != null && dismissedId === featuredId) ||
    (featuredId != null && isDismissed(featuredId));
  const showBanner = !!featuredId && hasAvailableBadge && !bannerDismissed;

  function handleDismissBanner() {
    if (featuredId) {
      try {
        localStorage.setItem(`trust-banner-dismissed-${featuredId}`, 'true');
      } catch {
        /* quota exceeded — ignore */
      }
      setDismissedId(featuredId);
    }
  }

  function scrollToTrustProgress() {
    document.getElementById('trust-progress-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Auth guard ──────────────────────────────────────────────────────────────
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

  // ── AC6: Build and sort action cards ───────────────────────────────────────
  // isActionable = true for real signals (missingLocation, incomplete) regardless
  // of quality.state — the sort already handles active/inactive via count > 0.
  // isActionable = false only for UNAVAILABLE/LIMITED_DATA signals (demandGap).
  const actionCardDescriptors: ActionCardDescriptor[] = qualitySummary
    ? sortActionCards([
        {
          key: 'missingLocation',
          count: qualitySummary.actionSignals.missingLocation.count,
          isActionable: true,
          priority: 0,
        },
        {
          key: 'incomplete',
          count: qualitySummary.actionSignals.incomplete.count,
          isActionable: true,
          priority: 1,
        },
        {
          key: 'demandGap',
          count: 0,
          isActionable: false, // always LIMITED_DATA — sorts last
          priority: 2,
        },
      ])
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">

        {/* ── Welcome header ──────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">
              Welcome back, {firstName}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's your portfolio at a glance.{' '}
              <button
                type="button"
                className="underline text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() =>
                  document
                    .getElementById('how-calculated-section')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                How are these calculated?
              </button>
            </p>
          </div>
          <div className="flex items-center gap-2 mt-3 sm:mt-0">
            <Button asChild size="sm">
              <Link to="/broker/listings/new">
                <PlusCircle className="h-4 w-4 mr-1.5" />
                New Listing
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/broker/listings">
                <List className="h-4 w-4 mr-1.5" />
                All Listings
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Trust verification banner (carried from v1) ─────────────────── */}
        {showBanner && (
          <Alert className="mb-6 border-amber-300 bg-amber-50">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Complete your trust verification to rank higher in buyer searches.{' '}
                <button
                  type="button"
                  onClick={scrollToTrustProgress}
                  className="underline font-medium text-amber-800 hover:text-amber-900"
                >
                  View trust progress
                </button>
              </span>
              <button
                type="button"
                onClick={handleDismissBanner}
                className="ml-4 flex-shrink-0 text-amber-600 hover:text-amber-800"
                aria-label="Dismiss trust verification banner"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* ── 5 Summary cards (AC1, AC3, AC4) ────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" aria-live="polite">

          {/* Card 1: Active Listings — sourced exclusively from qualitySummary to avoid
               semantic mismatch: portfolio.activeListings = LIVE+PENDING_REVIEW, while
               stats.liveCount = LIVE-only. Using stats as fallback would show a different
               count under the same label, which is dishonest. */}
          {qualityLoading ? (
            <SummaryCardSkeleton />
          ) : qualityError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs">Quality failed</span>
              </CardContent>
            </Card>
          ) : (
            <Link to="/broker/listings?status=LIVE" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-primary/10">
                      <Home className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Active Listings
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    {qualitySummary?.portfolio.activeListings ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    of {qualitySummary?.portfolio.totalListings ?? 0} total
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Card 2: Average Listing Quality (AC3) */}
          {qualityLoading ? (
            <SummaryCardSkeleton />
          ) : qualityError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs">Quality failed</span>
              </CardContent>
            </Card>
          ) : (
            /* AC7: /broker/listing-quality does not exist yet (#1538) — disabled link */
            <Card className="h-full opacity-90">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-md bg-copper-tint">
                    <BarChart2 className="h-4 w-4 text-copper" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Avg Quality
                  </span>
                </div>
                {qualitySummary ? (
                  <QualityScoreDisplay quality={qualitySummary.quality} />
                ) : (
                  <p className="text-lg font-semibold text-muted-foreground">Not yet scored</p>
                )}
                {/* AC7: listing-quality page coming in #1538 */}
                <span
                  className="text-xs text-muted-foreground/60 mt-1 inline-block cursor-not-allowed"
                  title="Listing quality page coming soon (#1538)"
                  aria-label="Listing quality details — coming soon"
                >
                  Details coming soon
                </span>
              </CardContent>
            </Card>
          )}

          {/* Card 3: Needs Fixes */}
          {qualityLoading ? (
            <SummaryCardSkeleton />
          ) : qualityError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs">Failed</span>
              </CardContent>
            </Card>
          ) : (
            <Link to="/broker/listings?status=DRAFT" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-red-100">
                      <Zap className="h-4 w-4 text-red-600" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Needs Fixes
                    </span>
                  </div>
                  {/* AC3: PENDING state → show pending copy, not 0 */}
                  {qualitySummary?.actionSignals.needsFixes.state === 'PENDING' &&
                  qualitySummary.actionSignals.needsFixes.count === 0 ? (
                    <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                  ) : qualitySummary?.actionSignals.needsFixes.count === 0 ? (
                    <p className="text-sm text-green-700 font-medium">All listings healthy</p>
                  ) : (
                    <p className="text-3xl font-bold text-red-600">
                      {qualitySummary?.actionSignals.needsFixes.count ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">listings need attention</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Card 4: Missing / Approximate Location */}
          {qualityLoading ? (
            <SummaryCardSkeleton />
          ) : qualityError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs">Failed</span>
              </CardContent>
            </Card>
          ) : (
            <Link to="/broker/listings" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-amber-100">
                      <MapPin className="h-4 w-4 text-amber-600" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Missing Location
                    </span>
                  </div>
                  {/* AC3: PENDING + count 0 → not yet evaluated */}
                  {qualitySummary?.actionSignals.missingLocation.state === 'PENDING' &&
                  qualitySummary.actionSignals.missingLocation.count === 0 ? (
                    <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                  ) : qualitySummary?.actionSignals.missingLocation.count === 0 ? (
                    <p className="text-sm text-green-700 font-medium">All location-confirmed</p>
                  ) : (
                    <p className="text-3xl font-bold text-amber-700">
                      {qualitySummary?.actionSignals.missingLocation.count ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">missing or approximate</p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Card 5: Buyer-Ready */}
          {qualityLoading ? (
            <SummaryCardSkeleton />
          ) : qualityError ? (
            <Card className="border-destructive/30">
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs">Failed</span>
              </CardContent>
            </Card>
          ) : (
            <Link to="/broker/listings?status=LIVE" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-md bg-green-100">
                      <CheckCircle2 className="h-4 w-4 text-green-700" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Buyer-Ready
                    </span>
                  </div>
                  {/* AC3: PENDING state → not yet evaluated */}
                  {qualitySummary?.actionSignals.buyerReady.state === 'PENDING' &&
                  qualitySummary.actionSignals.buyerReady.count === 0 ? (
                    <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                  ) : qualitySummary?.actionSignals.buyerReady.count === 0 ? (
                    <p className="text-sm text-muted-foreground">None yet</p>
                  ) : (
                    <p className="text-3xl font-bold text-green-700">
                      {qualitySummary?.actionSignals.buyerReady.count ?? 0}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">ready for buyers</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Stats retry (AC: error state) */}
        {(statsError || qualityError) && (
          <div className="text-center mb-6 flex items-center justify-center gap-2">
            {statsError && (
              <Button variant="outline" size="sm" onClick={() => void refetchStats()}>
                Retry listing stats
              </Button>
            )}
            {qualityError && (
              <Button variant="outline" size="sm" onClick={() => void refetchQuality()}>
                Retry quality summary
              </Button>
            )}
          </div>
        )}

        {/* ── Start here today — action cards (AC6) ───────────────────────── */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-primary mb-3">Start here today</h2>
          {qualityLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : qualityError ? (
            <Card>
              <CardContent className="p-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">Could not load action signals.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void refetchQuality()}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {actionCardDescriptors.map((card) => {
                if (card.key === 'missingLocation') {
                  const count = qualitySummary!.actionSignals.missingLocation.count;
                  const isActive = card.isActionable && count > 0;
                  return (
                    <Link
                      key={card.key}
                      to="/broker/listings"
                      className="block"
                      aria-label={`Verify exact locations — ${count} listings affected`}
                    >
                      <Card
                        className={`h-full transition-shadow ${isActive ? 'hover:shadow-md border-amber-200' : 'opacity-60'}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <MapPin className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-amber-600' : 'text-muted-foreground'}`} />
                            <div>
                              <p className="text-sm font-medium">Verify exact locations</p>
                              {isActive ? (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {count} listing{count !== 1 ? 's' : ''} have missing or approximate location
                                </p>
                              ) : (
                                <p className="text-xs text-green-700 mt-0.5">All location-confirmed</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                }

                if (card.key === 'incomplete') {
                  const count = qualitySummary!.actionSignals.incomplete.count;
                  const isActive = card.isActionable && count > 0;
                  return (
                    <Link
                      key={card.key}
                      to="/broker/listings?status=DRAFT"
                      className="block"
                      aria-label={`Finish incomplete listings — ${count} listings affected`}
                    >
                      <Card
                        className={`h-full transition-shadow ${isActive ? 'hover:shadow-md border-copper/30' : 'opacity-60'}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <FileEdit className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-copper' : 'text-muted-foreground'}`} />
                            <div>
                              <p className="text-sm font-medium">Finish incomplete listings</p>
                              {isActive ? (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {count} draft{count !== 1 ? 's' : ''} still in progress
                                </p>
                              ) : (
                                <p className="text-xs text-green-700 mt-0.5">All listings complete</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                }

                // demandGap — AC5: LIMITED_DATA, always non-actionable, sorts last
                return (
                  <Link
                    key={card.key}
                    to="/broker/listings"
                    className="block"
                    aria-label="Possible demand gap — limited data available"
                  >
                    <Card className="h-full opacity-60">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                          <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Possible demand gap</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Limited data — more signals coming soon
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Broker workspaces — navigation cards ────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-primary mb-3">Broker workspaces</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            {/* All Listings */}
            <Link to="/broker/listings" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-start gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <List className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">My Listings</p>
                    <p className="text-xs text-muted-foreground">Browse and manage all listings</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Drafts */}
            <Link to="/broker/listings?status=DRAFT" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-start gap-2">
                  <div className="p-2 rounded-lg bg-gray-100">
                    <FileEdit className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Drafts</p>
                    <p className="text-xs text-muted-foreground">Continue editing unpublished listings</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Engagement — AC4: always UNAVAILABLE */}
            <Card className="h-full opacity-60 cursor-default">
              <CardContent className="p-4 flex flex-col items-start gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Engagement</p>
                  <p className="text-xs text-muted-foreground">
                    Engagement tracking coming soon
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Demand Gaps — AC5: LIMITED_DATA */}
            <Card className="h-full opacity-60 cursor-default">
              <CardContent className="p-4 flex flex-col items-start gap-2">
                <div className="p-2 rounded-lg bg-muted">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Demand Gaps</p>
                  <p className="text-xs text-muted-foreground">
                    Limited data — coming in a future update
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Trust progress (carried from v1) ────────────────────────────── */}
        {featuredListing && (
          <Card id="trust-progress-section" className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">
                Trust Progress —{' '}
                {featuredListing.title ?? featuredListing.displayId ?? 'Your listing'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrustProgressPanel listingId={featuredListing.id} variant="full" />
            </CardContent>
          </Card>
        )}

        {/* ── Recent Activity ──────────────────────────────────────────────── */}
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
                <Button variant="outline" size="sm" onClick={() => void refetchRecent()}>
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

        {/* ── How are these calculated? anchor ────────────────────────────── */}
        <div id="how-calculated-section" className="mt-8 pt-4 border-t">
          <div className="flex items-start gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">How are these calculated?</p>
              <p className="text-xs mt-1">
                <strong>Active Listings</strong> — listings with status Live.{' '}
                <strong>Average Quality</strong> — scored across all listings with a computed
                quality score; shows a caveat when only some listings have been scored.{' '}
                <strong>Action signals</strong> — derived from listing field completeness and
                location accuracy checks run after each save.
              </p>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
