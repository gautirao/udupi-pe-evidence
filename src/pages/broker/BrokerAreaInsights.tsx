/**
 * BrokerAreaInsights — /broker/areas/:citySlug/:areaKey
 *
 * AC1:  Route param-driven (citySlug + areaKey from useParams), not hardcoded to Malpe.
 * AC2:  Calls GET /api/broker/areas/{citySlug}/{areaKey}/insights; no broker id in request.
 * AC5/AC13: Shared Metric<T> null → render confidenceLabel, never "0".
 *            Broker-own true-0 → render 0 with broker framing, distinct from null.
 * AC6:  Confidence labels from DTO, never hardcoded.
 * AC8:  CTAs route to existing paths; #1535/#1523 = disabled placeholders.
 * AC9:  Broker-action language only.
 * AC10: isLoading → Skeleton; isError → Alert; available===false → honest limited state.
 * AC11: ReTrends design-system tokens; SectionCard / ConfidenceBadge reuse.
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  Home,
  TrendingUp,
  MessageCircle,
  Zap,
  BarChart2,
  Tag,
  List,
  Star,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AppLayout } from '@/components/layout/AppLayout';
import { SectionCard } from '@/components/broker/SectionCard';
import { useBrokerAreaInsights } from '@/hooks/useBrokerAreaInsights';
import { formatPrice } from '@/lib/formatters';
import { SharedMetricCard } from '@/components/broker/area/SharedMetricCard';
import { BrokerCountCard } from '@/components/broker/area/BrokerCountCard';
import { LimitedDataState } from '@/components/broker/area/LimitedDataState';
import { AreaNextSteps } from '@/components/broker/area/AreaNextSteps';

// ── Skeleton blocks ────────────────────────────────────────────────────────────

function MetricCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrokerAreaInsights() {
  const { citySlug = '', areaKey = '' } = useParams<{
    citySlug: string;
    areaKey: string;
  }>();

  const { data, isLoading, isError, refetch } = useBrokerAreaInsights(citySlug, areaKey);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 max-w-7xl" aria-live="polite">
          <Skeleton className="h-6 w-48 mb-6" />
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-40 mb-6" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Could not load area insights for{' '}
                <span className="font-medium">{areaKey}</span>. Please try again.
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="ml-4 underline text-sm font-medium flex-shrink-0"
              >
                Retry
              </button>
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  const { areaLabel, available, confidenceLabel, area, broker } = data;
  // When areaLabel is null (available===false: backend buildUnavailableResponse), derive a
  // human-readable name from the last pipe-segment of the areaKey (format: IN|KA|{district}|{locality}).
  // Guards: no pipe → use raw key; empty last segment → use raw key; never blank.
  const humanizedAreaKey = areaKey.includes('|')
    ? (areaKey.split('|').filter(Boolean).pop() ?? areaKey)
    : areaKey;
  const title = areaLabel ?? humanizedAreaKey;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">

        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/broker/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/broker/dashboard">Areas</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span className="text-foreground font-medium">{title}</span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-primary">{title}</h1>
            {/* ConfidenceBadge takes enum not free string — use Badge with consistent outline token */}
            <Badge variant="outline" className="mt-1.5 text-xs text-muted-foreground border-muted-foreground/40">
              {confidenceLabel}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Area intelligence for your listings in{' '}
            <span className="font-medium">{title}</span> — broker action counts
            reflect only your own live listings.
          </p>
        </div>

        {/* Limited data notice when snapshot unavailable */}
        {!available && (
          <div className="mb-6">
            <LimitedDataState areaLabel={title} confidenceLabel={confidenceLabel} />
          </div>
        )}

        {/* ── Shared area aggregates (category a — Metric<T>) ────────────── */}
        <SectionCard
          className="mb-6"
          title="Area market overview"
          description="Shared area intelligence — metrics are suppressed below the data threshold"
          headerAdornment={
            <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40">
              {confidenceLabel}
            </Badge>
          }
        >
          <div
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
            aria-label="Shared area metrics"
          >
            <SharedMetricCard
              label="Median price"
              metric={area.medianPricePaise}
              icon={<Tag className="h-4 w-4 text-primary" />}
              formatValue={(v) =>
                typeof v === 'number' ? formatPrice(v / 100) : String(v)
              }
            />
            <SharedMetricCard
              label="Dominant property type"
              metric={area.dominantPropertyType}
              icon={<Home className="h-4 w-4 text-primary" />}
            />
            <SharedMetricCard
              label="Active listings (area)"
              metric={area.activeListingCount}
              icon={<List className="h-4 w-4 text-primary" />}
            />
            <SharedMetricCard
              label="Fresh listings (7d)"
              metric={area.freshListingCount}
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
            />
            <SharedMetricCard
              label="Avg listing quality"
              metric={area.avgListingQuality}
              icon={<Star className="h-4 w-4 text-primary" />}
              formatValue={(v) => `${typeof v === 'number' ? v.toFixed(1) : v}`}
            />
            <SharedMetricCard
              label="Top buyer need signals"
              metric={area.topBuyerNeedSignalCount}
              icon={<BarChart2 className="h-4 w-4 text-primary" />}
            />
          </div>
        </SectionCard>

        {/* ── Broker-own counts (category b — true ints) ─────────────────── */}
        <SectionCard
          className="mb-6"
          title="Your listing health in this area"
          description="Your own live listings and enquiries — a true 0 means none yet, not unavailable"
        >
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            aria-label="Broker listing health"
          >
            <BrokerCountCard
              label="Live listings here"
              count={broker.liveListingsInArea}
              icon={<Home className="h-4 w-4 text-primary" />}
              zeroLabel="No live listings here yet — add one"
              countClassName="text-primary"
            />
            <BrokerCountCard
              label="Need attention"
              count={broker.listingsNeedingAttention}
              icon={<Zap className="h-4 w-4 text-copper" />}
              zeroLabel="All listings are healthy"
              countClassName="text-copper"
            />
            <BrokerCountCard
              label="Enquiries on your listings"
              count={broker.enquiriesOnBrokerListings}
              icon={<MessageCircle className="h-4 w-4 text-primary" />}
              zeroLabel="No enquiries yet on your area listings"
              countClassName="text-primary"
            />
            <BrokerCountCard
              label="Opportunities to act"
              count={broker.opportunitiesToAct}
              icon={<TrendingUp className="h-4 w-4 text-evergreen" />}
              zeroLabel="No open gaps to act on right now"
              countClassName="text-evergreen"
            />
          </div>
        </SectionCard>

        {/* ── Buyer demand signals preview ────────────────────────────────── */}
        <SectionCard
          className="mb-6"
          title="Buyer demand signals in this area"
          description={
            area.topBuyerNeedSignalCount.value !== null
              ? `${area.topBuyerNeedSignalCount.value} active buyer signals detected — possible opportunities for your listings`
              : area.topBuyerNeedSignalCount.confidenceLabel
          }
        >
          {area.topBuyerNeedSignalCount?.value != null &&
          area.topBuyerNeedSignalCount.value > 0 ? (
            <p className="text-sm text-muted-foreground">
              There may be{' '}
              <span className="font-semibold text-foreground">
                {area.topBuyerNeedSignalCount.value}
              </span>{' '}
              buyer need signals in <span className="font-medium">{title}</span>.
              Add listings that match buyer preferences to capture potential enquiries.
            </p>
          ) : area.topBuyerNeedSignalCount.value === 0 ? (
            <p className="text-sm text-muted-foreground">
              No buyer demand signals detected in {title} yet.
            </p>
          ) : (
            // null — suppressed
            <p className="text-sm text-muted-foreground italic">
              {area.topBuyerNeedSignalCount.confidenceLabel}
            </p>
          )}
        </SectionCard>

        {/* ── Recommended next steps (CTAs) ──────────────────────────────── */}
        <AreaNextSteps citySlug={citySlug} areaKey={areaKey} areaLabel={title} />

      </div>
    </AppLayout>
  );
}
