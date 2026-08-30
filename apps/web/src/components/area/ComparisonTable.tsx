import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatPrice } from '@/lib/formatters';

export interface ComparisonEntry {
  areaKey: string;
  areaLabel: string;
  medianPricePaise: number | null;
  listingCount90d: number;
  trendDirection: 'rising' | 'falling' | 'stable' | null;
  isApproximate: boolean;
}

export interface ComparisonTableProps {
  currentAreaLabel: string;
  currentMedianPricePaise: number | null;
  currentListingCount90d: number;
  currentTrendDirection: 'rising' | 'falling' | 'stable' | null;
  comparisons: ComparisonEntry[] | undefined;
}

function formatPaisePrice(paise: number | null, isApproximate: boolean): string {
  if (paise === null) return '—';
  const prefix = isApproximate ? '~' : '';
  return `${prefix}${formatPrice(paise / 100)} per cent`;
}

function TrendCell({ direction }: { direction: 'rising' | 'falling' | 'stable' | null }) {
  if (direction === 'rising') {
    return <span className="text-green-600 font-medium">↑</span>;
  }
  if (direction === 'falling') {
    return <span className="text-red-600 font-medium">↓</span>;
  }
  if (direction === 'stable') {
    return <span className="text-muted-foreground">→</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

export function ComparisonTable({
  currentAreaLabel,
  currentMedianPricePaise,
  currentListingCount90d,
  currentTrendDirection,
  comparisons,
}: ComparisonTableProps) {
  if (!comparisons || comparisons.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 className="text-base font-semibold">Nearby area comparison</h2>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Area</TableHead>
              <TableHead>Median price</TableHead>
              <TableHead>Listings (90d)</TableHead>
              <TableHead>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Current area row — always first */}
            <TableRow className="bg-primary/5">
              <TableCell className="font-bold">{currentAreaLabel}</TableCell>
              <TableCell>{formatPaisePrice(currentMedianPricePaise, false)}</TableCell>
              <TableCell>{currentListingCount90d}</TableCell>
              <TableCell>
                <TrendCell direction={currentTrendDirection} />
              </TableCell>
            </TableRow>

            {/* Comparison rows */}
            {comparisons.map((entry) => (
              <TableRow key={entry.areaKey}>
                <TableCell>{entry.areaLabel}</TableCell>
                <TableCell>
                  {entry.medianPricePaise === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      {entry.isApproximate && '~'}
                      {formatPrice(entry.medianPricePaise / 100)} per cent
                      {entry.isApproximate && (
                        <span
                          title="Based on fewer than 5 listings — treat as approximate"
                          className="ml-1 cursor-help text-muted-foreground"
                          aria-label="Approximate value based on fewer than 5 listings"
                        >
                          ⓘ
                        </span>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell>{entry.listingCount90d}</TableCell>
                <TableCell>
                  <TrendCell direction={entry.trendDirection} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
