import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';

export interface PriceHistoryEntry {
  date: string;   // ISO date string
  price: number;  // price in paise or the unit used by the API
  delta: number;  // positive = increase, negative = decrease
}

interface ListingTransparencyCardProps {
  daysOnMarket?: number;
  backOnMarket?: boolean;
  lastUpdatedAt?: string | null;
  isSuspectedDuplicate?: boolean;
  priceHistory: PriceHistoryEntry[];
}

function formatDelta(delta: number): string {
  const absFormatted = Math.abs(delta).toLocaleString('en-IN');
  return delta < 0 ? `↓ ₹${absFormatted}` : `↑ ₹${absFormatted}`;
}

function formatPriceHistoryDate(isoDate: string): string {
  try {
    const d = parseISO(isoDate);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

function daysAgoLabel(isoDate: string): string {
  try {
    const days = differenceInDays(new Date(), parseISO(isoDate));
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  } catch {
    return '';
  }
}

export function ListingTransparencyCard({
  daysOnMarket,
  backOnMarket,
  lastUpdatedAt,
  isSuspectedDuplicate,
  priceHistory,
}: ListingTransparencyCardProps) {
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);

  const showDaysOnMarket = typeof daysOnMarket === 'number' && daysOnMarket > 0;
  const showPriceHistory = priceHistory.length > 0;
  const showBackOnMarket = backOnMarket === true;
  const showLastUpdated = !!lastUpdatedAt;
  const showDuplicate = isSuspectedDuplicate === true;

  // Render nothing if there is no supplementary info to show
  if (!showDaysOnMarket && !showPriceHistory && !showBackOnMarket && !showLastUpdated && !showDuplicate) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Listing Transparency</h3>

        {showBackOnMarket && (
          <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">
            Back on Market
          </Badge>
        )}

        {showDaysOnMarket && (
          <p className="text-sm text-muted-foreground">
            Listed <span className="font-medium text-foreground">{daysOnMarket} {daysOnMarket === 1 ? 'day' : 'days'} ago</span>
          </p>
        )}

        {showLastUpdated && (
          <p className="text-sm text-muted-foreground">
            Last updated{' '}
            <span className="font-medium text-foreground">{daysAgoLabel(lastUpdatedAt!)}</span>
          </p>
        )}

        {showPriceHistory && (
          <Collapsible open={priceHistoryOpen} onOpenChange={setPriceHistoryOpen}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Price changed{' '}
                <span className="font-medium text-foreground">
                  {priceHistory.length} {priceHistory.length === 1 ? 'time' : 'times'}
                </span>
              </p>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                  {priceHistoryOpen ? (
                    <>Hide <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Show <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <ul className="mt-2 space-y-1.5 text-sm border-l-2 border-muted pl-3">
                {priceHistory.map((entry, idx) => (
                  <li key={idx} className="flex items-center justify-between text-muted-foreground">
                    <span>{formatPriceHistoryDate(entry.date)}</span>
                    <span className={entry.delta < 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                      {formatDelta(entry.delta)}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        {showDuplicate && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>A similar listing has been detected. Verify details with the seller before proceeding.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
