import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  BarChart2,
  ChevronRight,
  ExternalLink,
  Star,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import type { ListingQualityResponse, QualityListing } from '@/types/listingQuality';
import { bandBadgeClass, bandLabel, safeEditLink } from '@/pages/broker/listingQualityModel';

interface SummaryCardsProps {
  data: ListingQualityResponse;
}

export function SummaryCards({ data }: SummaryCardsProps) {
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

export function TodaysPriorityCard({ listing, onSelect }: TodaysPriorityCardProps) {
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
