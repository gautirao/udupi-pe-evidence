import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TrialBannerProps {
  daysRemaining: number;
}

/**
 * Dismissible amber banner shown on the Insights page when the user's
 * trial access expires within 3 days.
 *
 * Dismissal is session-only (no localStorage persistence).
 */
export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const label = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium">
          Your trial ends in {label}. Upgrade to keep access to Market Insights.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
        aria-label="Dismiss trial banner"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
