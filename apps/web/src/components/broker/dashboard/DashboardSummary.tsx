import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BarChart2,
  BookOpen,
  CheckCircle2,
  FileEdit,
  Home,
  MapPin,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { BrokerQualitySummaryResponse } from '@/hooks/useBrokerListings';
import { buildActionCardDescriptors } from '@/pages/broker/dashboardModel';

interface QualitySectionProps {
  summary?: BrokerQualitySummaryResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

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

function SummaryCardError({ label = 'Failed' }: { label?: string }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="p-4 flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span className="text-xs">{label}</span>
      </CardContent>
    </Card>
  );
}

function QualityScoreDisplay({
  quality,
}: Pick<BrokerQualitySummaryResponse, 'quality'>) {
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
      <p className="text-xs text-muted-foreground font-medium mt-0.5">
        / 100 avg quality
      </p>
      {quality.state === 'PARTIAL' && (
        <p className="text-xs text-amber-700 mt-1">
          Based on {quality.countComputed} of {quality.countTotal} scored listings
        </p>
      )}
    </div>
  );
}

export function DashboardSummaryCards({
  summary,
  isLoading,
  isError,
  onRetry,
}: QualitySectionProps) {
  return (
    <section aria-label="Portfolio summary">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" aria-live="polite">
        {isLoading ? (
          <SummaryCardSkeleton />
        ) : isError ? (
          <SummaryCardError label="Quality failed" />
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
                  {summary?.portfolio.activeListings ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  of {summary?.portfolio.totalListings ?? 0} total
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {isLoading ? (
          <SummaryCardSkeleton />
        ) : isError ? (
          <SummaryCardError label="Quality failed" />
        ) : (
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
              {summary ? (
                <QualityScoreDisplay quality={summary.quality} />
              ) : (
                <p className="text-lg font-semibold text-muted-foreground">Not yet scored</p>
              )}
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

        {isLoading ? (
          <SummaryCardSkeleton />
        ) : isError ? (
          <SummaryCardError />
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
                {summary?.actionSignals.needsFixes.state === 'PENDING' &&
                summary.actionSignals.needsFixes.count === 0 ? (
                  <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                ) : summary?.actionSignals.needsFixes.count === 0 ? (
                  <p className="text-sm text-green-700 font-medium">All listings healthy</p>
                ) : (
                  <p className="text-3xl font-bold text-red-600">
                    {summary?.actionSignals.needsFixes.count ?? 0}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  listings need attention
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {isLoading ? (
          <SummaryCardSkeleton />
        ) : isError ? (
          <SummaryCardError />
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
                {summary?.actionSignals.missingLocation.state === 'PENDING' &&
                summary.actionSignals.missingLocation.count === 0 ? (
                  <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                ) : summary?.actionSignals.missingLocation.count === 0 ? (
                  <p className="text-sm text-green-700 font-medium">All location-confirmed</p>
                ) : (
                  <p className="text-3xl font-bold text-amber-700">
                    {summary?.actionSignals.missingLocation.count ?? 0}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  missing or approximate
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        {isLoading ? (
          <SummaryCardSkeleton />
        ) : isError ? (
          <SummaryCardError />
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
                {summary?.actionSignals.buyerReady.state === 'PENDING' &&
                summary.actionSignals.buyerReady.count === 0 ? (
                  <p className="text-sm text-muted-foreground">Not yet evaluated</p>
                ) : summary?.actionSignals.buyerReady.count === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet</p>
                ) : (
                  <p className="text-3xl font-bold text-green-700">
                    {summary?.actionSignals.buyerReady.count ?? 0}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">ready for buyers</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {isError && (
        <div className="text-center mb-6">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry quality summary
          </Button>
        </div>
      )}
    </section>
  );
}

export function DashboardActionCards({
  summary,
  isLoading,
  isError,
  onRetry,
}: QualitySectionProps) {
  const actions = buildActionCardDescriptors(summary);

  return (
    <section className="mb-6" aria-labelledby="start-here-heading">
      <h2 id="start-here-heading" className="text-base font-semibold text-primary mb-3">
        Start here today
      </h2>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">Could not load action signals.</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {actions.map((action) => {
            if (action.key === 'missingLocation') {
              const count = summary!.actionSignals.missingLocation.count;
              const isActive = action.isActionable && count > 0;

              return (
                <Link
                  key={action.key}
                  to="/broker/listings"
                  className="block"
                  aria-label={`Verify exact locations — ${count} listings affected`}
                >
                  <Card
                    className={`h-full transition-shadow ${
                      isActive ? 'hover:shadow-md border-amber-200' : 'opacity-60'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <MapPin
                          className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                            isActive ? 'text-amber-600' : 'text-muted-foreground'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium">Verify exact locations</p>
                          {isActive ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {count} listing{count !== 1 ? 's' : ''} have missing or
                              approximate location
                            </p>
                          ) : (
                            <p className="text-xs text-green-700 mt-0.5">
                              All location-confirmed
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            }

            if (action.key === 'incomplete') {
              const count = summary!.actionSignals.incomplete.count;
              const isActive = action.isActionable && count > 0;

              return (
                <Link
                  key={action.key}
                  to="/broker/listings?status=DRAFT"
                  className="block"
                  aria-label={`Finish incomplete listings — ${count} listings affected`}
                >
                  <Card
                    className={`h-full transition-shadow ${
                      isActive ? 'hover:shadow-md border-copper/30' : 'opacity-60'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <FileEdit
                          className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                            isActive ? 'text-copper' : 'text-muted-foreground'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium">Finish incomplete listings</p>
                          {isActive ? (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {count} draft{count !== 1 ? 's' : ''} still in progress
                            </p>
                          ) : (
                            <p className="text-xs text-green-700 mt-0.5">
                              All listings complete
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            }

            return (
              <Link
                key={action.key}
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
    </section>
  );
}

export function HowMetricsCalculated() {
  return (
    <div id="how-calculated-section" className="mt-8 pt-4 border-t">
      <div className="flex items-start gap-2 text-muted-foreground">
        <BookOpen className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">How are these calculated?</p>
          <p className="text-xs mt-1">
            <strong>Active Listings</strong> — listings that are Live or Under Review.{' '}
            <strong>Average Quality</strong> — scored across all listings with a
            computed quality score; shows a caveat when only some listings have been
            scored. <strong>Action signals</strong> — derived from listing field
            completeness and location accuracy checks run after each save.
          </p>
        </div>
      </div>
    </div>
  );
}
