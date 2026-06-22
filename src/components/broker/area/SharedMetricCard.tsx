/**
 * SharedMetricCard — renders a single category-(a) Metric<T>.
 *
 * Suppression rule (AC5/AC13):
 *   - value !== null → render the formatted value
 *   - value === null → render the confidenceLabel (limited/unavailable state)
 *   NEVER render 0 for a null, NEVER use `value ?? 0`.
 */
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { Metric } from '@/types/brokerAreaInsights';

interface SharedMetricCardProps {
  label: string;
  metric: Metric<number | string>;
  icon: React.ReactNode;
  formatValue?: (v: number | string) => string;
}

export function SharedMetricCard({
  label,
  metric,
  icon,
  formatValue,
}: SharedMetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-md bg-primary/10">{icon}</div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        </div>
        {metric.value !== null ? (
          <p className="text-2xl font-bold text-primary">
            {formatValue ? formatValue(metric.value) : String(metric.value)}
          </p>
        ) : (
          // Suppressed/absent: render the confidence label, not 0
          <p
            className="text-sm text-muted-foreground italic"
            data-testid="suppressed-metric-label"
          >
            {metric.confidenceLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
