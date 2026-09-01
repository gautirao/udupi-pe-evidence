import { useAuth } from '@/contexts/AuthContext';

export interface InsightsAccess {
  hasAccess: boolean;
  daysRemaining: number;
  showPaywall: boolean;
  showTrialBanner: boolean;
}

/**
 * Derives Insights paywall/trial-banner state from auth's insightsAccessUntil.
 * Trial banner shows when access is active and expires within 3 days.
 */
export function useInsightsAccess(): InsightsAccess {
  const { insightsAccessUntil, isLoading: authLoading } = useAuth();
  const now = new Date();
  const accessUntil = insightsAccessUntil ? new Date(insightsAccessUntil) : null;
  const hasAccess = accessUntil !== null && accessUntil > now;
  const daysRemaining = accessUntil && hasAccess
    ? Math.ceil((accessUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const showPaywall = !authLoading && !hasAccess;
  const showTrialBanner = hasAccess && daysRemaining <= 3;

  return { hasAccess, daysRemaining, showPaywall, showTrialBanner };
}
