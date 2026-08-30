/**
 * SignalLegend — 'About these signals' caveat + confidence legend.
 *
 * AC7: explains what signals mean and the confidence system.
 */

import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function SignalLegend() {
  return (
    <Card className="border-muted bg-muted/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">About these signals</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Demand gap signals are derived from anonymised buyer search and enquiry patterns in your
          areas. They identify where buyer demand exceeds available supply, giving you an opportunity
          to act before competitors.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Confidence levels</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-start gap-2">
              <span className="inline-block w-2 h-2 mt-0.5 rounded-full bg-evergreen flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">High</span> — strong signal, sufficient data
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block w-2 h-2 mt-0.5 rounded-full bg-copper flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Medium</span> — moderate data, directionally reliable
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block w-2 h-2 mt-0.5 rounded-full bg-destructive flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Low</span> — limited data, treat as indicative
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="inline-block w-2 h-2 mt-0.5 rounded-full bg-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Suppressed</span> — insufficient data to show without risking buyer privacy
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Buyer search counts and enquiry figures may be suppressed when fewer than the minimum
          threshold of distinct buyers are involved, to protect buyer privacy.
        </p>
      </CardContent>
    </Card>
  );
}
