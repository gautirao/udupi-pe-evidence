import { useMemo } from 'react';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { useListingMarketContext } from '@/hooks/useListingMarketContext';
import { PropertyListing } from '@/hooks/usePropertyListings';
import { format } from 'date-fns';

// Issue #2159 (phase 2) — reuses the SAME `rounded-2xl border border-border
// bg-card p-5` card shell as ListingDetailSidebar's other sections (viewing-
// request panel, area-insights, contact card) and DetailSection in
// ListingDetailMainContent.tsx, instead of the plain shadcn `Card` this
// widget used before (which rendered a different radius/border/shadow and
// stood out against every other sidebar section). Visual only — no change
// to the data/query below.
function MarketCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5">{children}</div>;
}

interface AreaMarketWidgetProps {
  listing: PropertyListing;
}

function computeListingRate(listing: PropertyListing): number | null {
  if (!['apartment', 'house', 'commercial'].includes(listing.property_type)) {
    return listing.price_per_cent_paise ? listing.price_per_cent_paise / 100 : null;
  }
  if (
    listing.built_area &&
    listing.built_area > 0 &&
    listing.built_area_unit === 'sqft' &&
    listing.price
  ) {
    return Math.round(listing.price / listing.built_area);
  }
  return null;
}

function getMarketBadge(
  listingRate: number,
  median: number
): { label: string; bold: boolean } | null {
  const ratio = listingRate / median;
  if (ratio <= 0.7) return { label: 'Great deal', bold: true };
  if (ratio <= 0.85) return { label: 'Good value', bold: false };
  return null;
}

export function AreaMarketWidget({ listing }: AreaMarketWidgetProps) {
  const { data, isLoading, error } = useListingMarketContext({
    locality: listing.locality,
    propertyType: listing.property_type,
    bedrooms: listing.bedrooms ?? null,
    enabled: !!listing.locality,
  });

  const listingRate = useMemo(() => computeListingRate(listing), [listing]);

  if (!listing.locality) return null;

  if (isLoading) {
    return (
      <MarketCard>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </MarketCard>
    );
  }

  if (error) {
    return (
      <MarketCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          Could not load market data.
        </div>
      </MarketCard>
    );
  }

  const totalSimilarCount = data?.[0]?.totalSimilarCount ?? 0;
  const hasData = !!data && data.length > 0 && totalSimilarCount >= 5;

  if (!hasData) {
    return (
      <MarketCard>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-base font-bold text-foreground">Area Market</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Not enough data for this area yet.
          <br />
          Check back as more listings are added.
        </p>
      </MarketCard>
    );
  }

  const priceBasis = data[0].priceBasis;
  const unit = priceBasis === 'per_sqft' ? '/ sqft' : '/ cent';

  const latestMedian =
    [...data].reverse().find((d) => d.medianPricePerUnit !== null)?.medianPricePerUnit ?? null;

  const badge =
    listingRate && latestMedian ? getMarketBadge(listingRate, latestMedian) : null;
  const pctBelow =
    listingRate && latestMedian && listingRate < latestMedian
      ? Math.round((1 - listingRate / latestMedian) * 100)
      : null;

  const chartData = data.map((d) => ({
    month: format(new Date(d.month), 'MMM'),
    median: d.medianPricePerUnit ? Math.round(Number(d.medianPricePerUnit)) : null,
    p25: d.p25PricePerUnit ? Math.round(Number(d.p25PricePerUnit)) : null,
    p75: d.p75PricePerUnit ? Math.round(Number(d.p75PricePerUnit)) : null,
  }));

  const typeLabel =
    listing.property_type.charAt(0).toUpperCase() + listing.property_type.slice(1);
  const bedroomsLabel = listing.bedrooms ? `${listing.bedrooms}BHK ` : '';

  return (
    <MarketCard>
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-base font-bold text-foreground">Area Market</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {bedroomsLabel}
        {typeLabel}s · {listing.locality} · 6 months
      </p>

      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [
              `₹${value.toLocaleString('en-IN')} ${unit}`,
              '',
            ]}
            contentStyle={{ fontSize: 11 }}
            labelStyle={{ fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="p75"
            stroke="#a7f3d0"
            strokeWidth={1}
            dot={false}
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="p25"
            stroke="#a7f3d0"
            strokeWidth={1}
            dot={false}
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        {latestMedian && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Area median</span>
            {/* Issue #2159 (phase 2) — font-mono for the metric value, matching
                every other price/count in this app (PropertyCard, ListingSpecsGrid,
                the mock's own MarketStat). */}
            <span className="font-mono font-medium text-foreground">
              ₹{Math.round(Number(latestMedian)).toLocaleString('en-IN')} {unit}
            </span>
          </div>
        )}
        {listingRate && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground shrink-0">This listing</span>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className="font-mono font-medium text-foreground">
                ₹{listingRate.toLocaleString('en-IN')} {unit}
              </span>
              {badge && pctBelow !== null && pctBelow > 0 && (
                // Issue #2159 (phase 2) — evergreen token, not a hardcoded
                // Tailwind green, matching the RERA/trust badges elsewhere on
                // this same page (ListingDetailMainContent.tsx).
                <span
                  className={`rounded bg-evergreen-tint px-1.5 py-0.5 text-xs text-evergreen ${
                    badge.bold ? 'font-semibold' : ''
                  }`}
                >
                  {badge.label} · {pctBelow}% below
                </span>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Based on {totalSimilarCount} listing{totalSimilarCount !== 1 ? 's' : ''}
        </p>
      </div>
    </MarketCard>
  );
}
