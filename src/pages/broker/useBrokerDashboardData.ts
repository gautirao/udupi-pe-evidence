import { useQuery } from '@tanstack/react-query';
import {
  useBrokerMyListings,
  useBrokerQualitySummary,
} from '@/hooks/useBrokerListings';
import { api } from '@/lib/api';
import type { TrustProgressResponse } from '@/components/trust/TrustProgressPanel';

const RECENT_LISTING_LIMIT = 5;

/**
 * Owns the dashboard's server-state dependencies.
 *
 * The page consumes a small view model instead of knowing query keys, endpoints,
 * pagination details, or the rule used to choose the featured listing.
 */
export function useBrokerDashboardData() {
  const quality = useBrokerQualitySummary();
  const recent = useBrokerMyListings(0, RECENT_LISTING_LIMIT);

  const featuredListing = recent.data?.listings.find(
    (listing) => listing.status === 'LIVE' || listing.status === 'PENDING_REVIEW',
  );

  const trust = useQuery({
    queryKey: ['trust-progress', featuredListing?.id],
    queryFn: () =>
      api.get<TrustProgressResponse>(
        `/api/listings/${featuredListing!.id}/trust-progress`,
      ),
    staleTime: 60_000,
    enabled: Boolean(featuredListing),
  });

  return {
    quality,
    recent,
    featuredListing,
    trustData: trust.data,
  };
}
