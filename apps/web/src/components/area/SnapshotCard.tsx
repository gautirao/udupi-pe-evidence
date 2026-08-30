import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { AreaOverviewResponse } from '@/hooks/useAreaOverview';

interface SnapshotCardProps {
  snapshot: AreaOverviewResponse['snapshot'];
  confidence: 'full' | 'limited' | 'fallback';
}

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10_000_000) {
    const crores = rupees / 10_000_000;
    return `\u20b9${crores.toFixed(crores % 1 === 0 ? 0 : 2)} Cr`;
  }
  if (rupees >= 100_000) {
    const lakhs = rupees / 100_000;
    return `\u20b9${lakhs.toFixed(lakhs % 1 === 0 ? 0 : 2)} L`;
  }
  if (rupees >= 1_000) {
    const thousands = rupees / 1_000;
    return `\u20b9${thousands.toFixed(thousands % 1 === 0 ? 0 : 1)}K`;
  }
  return `\u20b9${rupees.toLocaleString('en-IN')}`;
}

const PROPERTY_TYPE_COLORS: Record<string, string> = {
  apartment: 'bg-blue-400',
  house: 'bg-green-400',
  villa: 'bg-emerald-400',
  plot: 'bg-orange-400',
  commercial: 'bg-purple-400',
  land: 'bg-yellow-400',
};

const FALLBACK_COLOR = 'bg-gray-400';

interface PropertyTypeMixBarProps {
  dist: Record<string, number>;
}

function PropertyTypeMixBar({ dist }: PropertyTypeMixBarProps) {
  const total = Object.values(dist).reduce((sum, v) => sum + v, 0);
  if (total === 0) return null;

  const sortedEntries = Object.entries(dist)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  // Compute widths so the last segment absorbs rounding error, ensuring sum === 100.
  const segments = sortedEntries.map(([type, count], index, arr) => {
    const fraction = count / total;
    const width =
      index === arr.length - 1
        ? 100 - arr.slice(0, -1).reduce((sum, [, v]) => sum + Math.round((v / total) * 100), 0)
        : Math.round(fraction * 100);
    return { type, width };
  });

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">Property type mix</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map(({ type, width }) => {
          const colorClass = PROPERTY_TYPE_COLORS[type] ?? FALLBACK_COLOR;
          return (
            <div
              key={type}
              className={`${colorClass} first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${width}%` }}
              title={`${type}: ${width}%`}
              aria-label={`${type} ${width}%`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map(({ type, width }) => {
          const colorClass = PROPERTY_TYPE_COLORS[type] ?? FALLBACK_COLOR;
          return (
            <span key={type} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className={`inline-block h-2 w-2 rounded-full ${colorClass}`} />
              {type} {width}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function SnapshotCard({ snapshot, confidence }: SnapshotCardProps) {
  const showTrend =
    confidence !== 'fallback' && snapshot?.trendDirection != null;

  const hasRange =
    snapshot?.priceP10Paise != null && snapshot?.priceP90Paise != null;

  const hasPropertyMix =
    snapshot?.propertyTypeDist != null &&
    Object.keys(snapshot.propertyTypeDist).length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-base font-semibold">Price snapshot</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Median price</p>
          <p className="text-2xl font-bold">
            {snapshot?.medianPricePaise != null
              ? `${formatRupees(snapshot.medianPricePaise)} per cent`
              : '\u2014'}
          </p>
        </div>

        {hasRange && (
          <div>
            <p className="text-xs text-muted-foreground">Price range</p>
            <p className="text-sm font-medium">
              {formatRupees(snapshot!.priceP10Paise!)} &ndash;{' '}
              {formatRupees(snapshot!.priceP90Paise!)} per cent
            </p>
          </div>
        )}

        {showTrend && (
          <div>
            <p className="text-xs text-muted-foreground">Trend</p>
            <p className="text-sm font-medium">
              {snapshot!.trendDirection === 'rising' && (() => {
                const pct = snapshot!.trendPctChange != null
                  ? ` (~${Math.abs(snapshot!.trendPctChange).toFixed(1)}%)`
                  : '';
                return `Prices are rising${pct}`;
              })()}
              {snapshot!.trendDirection === 'falling' && (() => {
                const pct = snapshot!.trendPctChange != null
                  ? ` (~${Math.abs(snapshot!.trendPctChange).toFixed(1)}%)`
                  : '';
                return `Prices have fallen${pct}`;
              })()}
              {snapshot!.trendDirection === 'stable' && 'Prices are stable'}
            </p>
          </div>
        )}

        {hasPropertyMix && (
          <PropertyTypeMixBar dist={snapshot!.propertyTypeDist!} />
        )}
      </CardContent>
    </Card>
  );
}
