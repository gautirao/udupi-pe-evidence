import { ConfidenceBadge } from './ConfidenceBadge';
import type { AreaOverviewResponse } from '@/hooks/useAreaOverview';

interface AreaHeaderProps {
  areaLabel: string;
  districtLabel: string;
  confidence: 'full' | 'limited' | 'fallback';
  listingCount90d: number;
  fallback: AreaOverviewResponse['fallback'];
}

function DataBasisLine({
  confidence,
  listingCount90d,
  fallbackDistrictLabel,
}: {
  confidence: 'full' | 'limited' | 'fallback';
  listingCount90d: number;
  fallbackDistrictLabel: string;
}) {
  if (confidence === 'full') {
    return (
      <p className="text-sm text-muted-foreground">
        Based on {listingCount90d} listings in the last 90 days
      </p>
    );
  }

  if (confidence === 'limited') {
    return (
      <p className="text-sm text-muted-foreground">
        Based on {listingCount90d} listings in the last 90 days. Prices may vary as more data
        becomes available.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      This area is new on our platform. Showing price overview for {fallbackDistrictLabel} district.
    </p>
  );
}

export function AreaHeader({
  areaLabel,
  districtLabel,
  confidence,
  listingCount90d,
  fallback,
}: AreaHeaderProps) {
  const fallbackDistrictLabel = fallback?.districtLabel ?? districtLabel;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{areaLabel}</h1>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <p className="text-sm text-muted-foreground">{districtLabel}</p>
      <DataBasisLine
        confidence={confidence}
        listingCount90d={listingCount90d}
        fallbackDistrictLabel={fallbackDistrictLabel}
      />
    </div>
  );
}
