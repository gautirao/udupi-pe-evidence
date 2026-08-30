import { describe, expect, it } from 'vitest';
import type { BrokerQualitySummaryResponse } from '@/hooks/useBrokerListings';
import {
  buildActionCardDescriptors,
  listingLink,
  statusBadgeClassName,
} from '../dashboardModel';

const summary: BrokerQualitySummaryResponse = {
  portfolio: {
    activeListings: 3,
    totalListings: 8,
  },
  quality: {
    state: 'COMPLETE',
    averageQualityScore: 82,
    countComputed: 8,
    countTotal: 8,
    percentageComputed: 100,
  },
  actionSignals: {
    needsFixes: { count: 2, state: 'COMPLETE' },
    missingLocation: { count: 2, state: 'COMPLETE' },
    incomplete: { count: 5, state: 'COMPLETE' },
    buyerReady: { count: 3, state: 'COMPLETE' },
  },
  engagement: {
    state: 'UNAVAILABLE',
    views: null,
    enquiries: null,
    reason: 'Not available',
  },
  demandGap: {
    state: 'LIMITED_DATA',
    signal: null,
    reason: 'Limited data',
  },
};

describe('dashboardModel', () => {
  it.each(['DRAFT', 'REJECTED'])('routes %s listings to edit', (status) => {
    expect(listingLink({ id: 'listing-1', status })).toBe(
      '/broker/listings/listing-1/edit',
    );
  });

  it('routes published listings to their public detail page', () => {
    expect(listingLink({ id: 'listing-1', status: 'LIVE' })).toBe(
      '/listing/listing-1',
    );
  });

  it('uses the neutral badge style for an unknown status', () => {
    expect(statusBadgeClassName('NEW_STATUS')).toBe(
      'bg-gray-100 text-gray-600 border-0',
    );
  });

  it('builds and sorts actions from the quality-summary contract', () => {
    expect(buildActionCardDescriptors(summary).map((action) => action.key)).toEqual([
      'incomplete',
      'missingLocation',
      'demandGap',
    ]);
  });

  it('returns no actions until the quality summary exists', () => {
    expect(buildActionCardDescriptors()).toEqual([]);
  });
});
