import {
  sortActionCards,
  type ActionCardDescriptor,
} from '@/lib/brokerDashboardUtils';
import type {
  BrokerQualitySummaryResponse,
  ListingResponse,
} from '@/hooks/useBrokerListings';

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Under Review',
  LIVE: 'Live',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
};

export function statusBadgeClassName(status: string): string {
  switch (status) {
    case 'LIVE':
      return 'bg-green-100 text-green-800 border-0';
    case 'PENDING_REVIEW':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 border-0';
    case 'ARCHIVED':
      return 'bg-slate-100 text-slate-700 border-0';
    case 'DRAFT':
    default:
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

export function listingLink(listing: Pick<ListingResponse, 'id' | 'status'>): string {
  if (listing.status === 'DRAFT' || listing.status === 'REJECTED') {
    return `/broker/listings/${listing.id}/edit`;
  }

  return `/listing/${listing.id}`;
}

export function buildActionCardDescriptors(
  summary?: BrokerQualitySummaryResponse,
): ActionCardDescriptor[] {
  if (!summary) {
    return [];
  }

  return sortActionCards([
    {
      key: 'missingLocation',
      count: summary.actionSignals.missingLocation.count,
      isActionable: true,
      priority: 0,
    },
    {
      key: 'incomplete',
      count: summary.actionSignals.incomplete.count,
      isActionable: true,
      priority: 1,
    },
    {
      key: 'demandGap',
      count: 0,
      isActionable: false,
      priority: 2,
    },
  ]);
}
