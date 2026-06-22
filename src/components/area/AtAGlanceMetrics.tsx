import { Activity, BarChart2, Search, Star, Zap } from 'lucide-react';
import { AreaIntelligenceMetrics } from '@/hooks/useAreaIntelligence';
import { MetricCard, ConfidenceCard } from './MetricCard';
import { formatPrice } from '@/lib/formatters';

interface AtAGlanceMetricsProps {
  metrics: AreaIntelligenceMetrics;
  /** Top-level API confidenceLabel for the confidence card */
  topLevelConfidenceLabel: string;
}

/**
 * 6-card at-a-glance grid (AC3, AC4, AC5, AC15, AC16).
 *
 * Rules:
 * - value rendered only when Metric.value is non-null; else confidenceLabel (never 0)
 * - 'Typical price' label exactly (NOT 'Median price') — AC15
 * - helper copy exactly: 'Middle of current listings, so unusually expensive homes do not skew it.' — AC16
 * - mostSearchedBudget always renders the unavailable state (AC4, Q2=Option A)
 * - avgListingQuality null → 'Not enough data yet' (AC5)
 */
export function AtAGlanceMetrics({ metrics, topLevelConfidenceLabel }: AtAGlanceMetricsProps) {
  // Derive formatted values; null when the metric value is null (AC3)
  const formattedActiveListings =
    metrics.activeListingCount.value !== null
      ? String(metrics.activeListingCount.value)
      : null;

  // medianPricePaise is in paise — convert to ₹ (100 paise = 1 rupee; formatPrice takes rupees)
  const formattedTypicalPrice =
    metrics.medianPricePaise.value !== null
      ? formatPrice(metrics.medianPricePaise.value / 100)
      : null;

  // mostSearchedBudget: Metric<Void> — value is structurally ALWAYS null (AC4)
  // We never derive a value. Always pass null to MetricCard.
  const formattedMostSearchedBudget: string | null = null;

  const formattedAvgQuality =
    metrics.avgListingQuality.value !== null
      ? `${Number(metrics.avgListingQuality.value).toFixed(0)} / 100`
      : null;

  const formattedFreshListings =
    metrics.freshListingCount.value !== null
      ? String(metrics.freshListingCount.value)
      : null;

  const confidenceHelper =
    topLevelConfidenceLabel === 'Enough data'
      ? 'Enough recent listing and search activity here to show reliable figures.'
      : topLevelConfidenceLabel === 'Limited data'
      ? 'Limited recent activity — figures may not fully reflect this area.'
      : 'Not enough recent activity to show reliable figures for this area.';

  return (
    <section aria-labelledby="at-a-glance-heading" className="space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase mb-1">
          At a glance
        </p>
        <h2
          id="at-a-glance-heading"
          className="text-2xl font-bold text-slate-900 font-serif"
        >
          How active is the market here?
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          A quick read on what&apos;s live and what buyers are looking for in this area.
        </p>
      </div>

      {/* 6-card grid (AC3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Card 1 — Active listings */}
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Active listings"
          helper="Plots and homes live on ReTrends right now."
          value={formattedActiveListings}
          confidenceLabel={metrics.activeListingCount.confidenceLabel}
        />

        {/* Card 2 — Typical price (AC15/AC16) */}
        {/* Label MUST be 'Typical price' — NOT 'Median price' */}
        <MetricCard
          icon={<BarChart2 className="h-4 w-4" />}
          label="Typical price"
          helper="Middle of current listings, so unusually expensive homes do not skew it."
          value={formattedTypicalPrice}
          confidenceLabel={metrics.medianPricePaise.confidenceLabel}
        />

        {/* Card 3 — Most searched budget (AC4: always unavailable — Q2=Option A) */}
        <MetricCard
          icon={<Search className="h-4 w-4" />}
          label="Most searched budget"
          helper="The budget most buyers searching this area set."
          value={formattedMostSearchedBudget}
          confidenceLabel={metrics.mostSearchedBudget.confidenceLabel}
          className="bg-slate-50"
        />

        {/* Card 4 — Average listing quality (AC5) */}
        <MetricCard
          icon={<Star className="h-4 w-4" />}
          label="Average listing quality"
          helper="How complete listings are — location, photos and details."
          value={formattedAvgQuality}
          confidenceLabel={metrics.avgListingQuality.confidenceLabel}
        />

        {/* Card 5 — Fresh listings */}
        <MetricCard
          icon={<Zap className="h-4 w-4" />}
          label="Fresh listings"
          helper="Listings added or updated in the last 30 days."
          value={formattedFreshListings}
          confidenceLabel={metrics.freshListingCount.confidenceLabel}
        />

        {/* Card 6 — Data confidence (navy card) */}
        <ConfidenceCard
          label={topLevelConfidenceLabel}
          helper={confidenceHelper}
        />
      </div>
    </section>
  );
}
