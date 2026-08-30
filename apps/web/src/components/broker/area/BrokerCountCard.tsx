/**
 * BrokerCountCard — renders a single category-(b) broker-own count.
 *
 * Suppression rule (AC5/AC13):
 *   Broker-own counts are always present primitive ints.
 *   A real 0 IS a true zero rendered with broker-action framing.
 *   This is visually and semantically DISTINCT from a suppressed null Metric.
 */
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface BrokerCountCardProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  /** Copy to show when count is 0 — broker-action framing (e.g. "No live listings here yet — add one") */
  zeroLabel: string;
  /** Optional CTA element rendered below the count */
  cta?: React.ReactNode;
  /** Accent class for the count number (e.g. text-primary, text-amber-700) */
  countClassName?: string;
}

export function BrokerCountCard({
  label,
  count,
  icon,
  zeroLabel,
  cta,
  countClassName = 'text-primary',
}: BrokerCountCardProps) {
  return (
    <Card className="border-l-4 border-l-primary/30">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-md bg-primary/10">{icon}</div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        </div>
        {count === 0 ? (
          // True zero: render the numeral 0 prominently so it is unambiguous as a
          // real count (not a suppressed null), with a broker-action sub-label beneath.
          // Distinct from SharedMetricCard null which shows NO number at all.
          <div data-testid="broker-true-zero">
            <p className={`text-3xl font-bold ${countClassName}`}>0</p>
            <p className="text-xs text-muted-foreground mt-0.5">{zeroLabel}</p>
          </div>
        ) : (
          <p className={`text-3xl font-bold ${countClassName}`}>{count}</p>
        )}
        {cta && <div className="mt-2">{cta}</div>}
      </CardContent>
    </Card>
  );
}
