/**
 * LimitedDataState — shown when available===false or shared demand data is absent.
 * Honest limited/insufficient state (AC10).
 */
import React from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LimitedDataStateProps {
  areaLabel: string;
  confidenceLabel: string;
}

export function LimitedDataState({ areaLabel, confidenceLabel }: LimitedDataStateProps) {
  return (
    <Alert data-testid="limited-data-state">
      <Info className="h-4 w-4" />
      <AlertDescription>
        <span className="font-medium">{confidenceLabel}</span> — area intelligence snapshot
        for <span className="font-medium">{areaLabel}</span> is not yet available. Broker
        action counts below still reflect your own listings in this area.
      </AlertDescription>
    </Alert>
  );
}
