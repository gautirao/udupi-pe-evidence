import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { buildBrokerGreeting } from '@/lib/brokerDashboardUtils';
import { DashboardHeader } from '@/components/broker/dashboard/DashboardHeader';
import {
  DashboardActionCards,
  DashboardSummaryCards,
  HowMetricsCalculated,
} from '@/components/broker/dashboard/DashboardSummary';
import { DashboardNavigation } from '@/components/broker/dashboard/DashboardNavigation';
import { DashboardRecentActivity } from '@/components/broker/dashboard/DashboardRecentActivity';
import {
  TrustProgressSection,
  TrustVerificationBanner,
  useTrustBanner,
} from '@/components/broker/dashboard/DashboardTrust';
import { useBrokerDashboardData } from './useBrokerDashboardData';

export default function BrokerDashboard() {
  const { isBroker, isAdmin, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isBroker && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <BrokerDashboardContent displayName={user?.user_metadata?.full_name} />
  );
}

/**
 * Mounted only after the access guard succeeds. This component boundary lets us
 * follow the Rules of Hooks without firing broker-only requests for a visitor
 * who is about to be redirected.
 */
function BrokerDashboardContent({ displayName }: { displayName?: unknown }) {
  const { quality, recent, featuredListing, trustData } = useBrokerDashboardData();

  const greeting = buildBrokerGreeting(displayName);
  const hasAvailableBadge =
    trustData?.badges.some((badge) => badge.badgeState === 'AVAILABLE') ?? false;
  const trustBanner = useTrustBanner(featuredListing?.id, hasAvailableBadge);

  const explainMetrics = () => {
    document
      .getElementById('how-calculated-section')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const retryQuality = () => {
    void quality.refetch();
  };

  const retryRecent = () => {
    void recent.refetch();
  };

  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <DashboardHeader greeting={greeting} onExplainMetrics={explainMetrics} />

        {trustBanner.showBanner && (
          <TrustVerificationBanner
            onDismiss={trustBanner.dismiss}
            onViewProgress={trustBanner.viewProgress}
          />
        )}

        <DashboardSummaryCards
          summary={quality.data}
          isLoading={quality.isLoading}
          isError={quality.isError}
          onRetry={retryQuality}
        />

        <DashboardActionCards
          summary={quality.data}
          isLoading={quality.isLoading}
          isError={quality.isError}
          onRetry={retryQuality}
        />

        <DashboardNavigation />

        {featuredListing && <TrustProgressSection listing={featuredListing} />}

        <DashboardRecentActivity
          listings={recent.data?.listings}
          isLoading={recent.isLoading}
          isError={recent.isError}
          onRetry={retryRecent}
        />

        <HowMetricsCalculated />
      </main>
    </AppLayout>
  );
}
