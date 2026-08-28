import type { ListingResponse } from '@/hooks/useBrokerListings';

/**
 * #2369 — pure, testable derivations for the pending-approvals review queue.
 *
 * These functions compute everything the redesigned queue shows client-side
 * from the real `ListingResponse` fields the backend already returns. See
 * PendingListings.tsx for the full "honest capability mapping" this feature
 * is built against — anything without a backing real field (broker identity,
 * duplicate detection, price-range checks) is intentionally NOT computed here.
 */

export const AGE_BUCKETS = ['any', 'today', '3plus', '7plus', '21plus'] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export const REVIEW_FLAGS = ['missing_info', 'no_photos', 'location_unconfirmed'] as const;
export type ReviewFlag = (typeof REVIEW_FLAGS)[number];

export const RETURN_FOR_EDITS_REASONS = [
  'Incorrect or incomplete details',
  'Better photos required',
  'Price needs verification',
  'Location needs correction',
  'Duplicate listing',
  'Other',
] as const;

export const SORT_ORDERS = ['oldest', 'newest'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface PendingApprovalsFilterState {
  search: string;
  propertyTypes: string[];
  localities: string[];
  ageBucket: AgeBucket;
  flags: ReviewFlag[];
  sort: SortOrder;
}

export const DEFAULT_FILTER_STATE: PendingApprovalsFilterState = {
  search: '',
  propertyTypes: [],
  localities: [],
  ageBucket: 'any',
  flags: [],
  sort: 'oldest',
};

/** Age in whole days since createdAt, floor-based (matches formatRelativeDate's convention). */
export function ageInDays(createdAt: string, now: Date = new Date()): number {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function isMissingInfo(listing: ListingResponse): boolean {
  return !listing.title?.trim() || listing.price == null || !listing.locality?.trim();
}

export function hasNoPhotos(listing: ListingResponse): boolean {
  return listing.imageCount === 0;
}

export function isLocationUnconfirmed(listing: ListingResponse): boolean {
  return listing.addressConfirmed === false;
}

/**
 * "Needs attention" rule (documented per issue #2369 requirement): a listing
 * needs attention when it is older than 7 days OR its address has not been
 * confirmed. This is the ONLY definition used anywhere in this feature —
 * do not redefine it elsewhere.
 */
export function needsAttention(listing: ListingResponse, now: Date = new Date()): boolean {
  return ageInDays(listing.createdAt, now) > 7 || isLocationUnconfirmed(listing);
}

export function getReviewFlags(listing: ListingResponse): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (isMissingInfo(listing)) flags.push('missing_info');
  if (hasNoPhotos(listing)) flags.push('no_photos');
  if (isLocationUnconfirmed(listing)) flags.push('location_unconfirmed');
  return flags;
}

/**
 * Bulk-approval eligibility (issue #2369 Part 2): a listing is eligible for
 * one-click bulk approval only when it has NO review flags — i.e. the same
 * "No issues detected" state already shown per-row in the table. This is a
 * client-side moderation-quality guard, not an authorization decision: the
 * real authorization + status-transition check still happens server-side on
 * every individual /approve call the bulk action issues.
 */
export function isBulkApprovalEligible(listing: ListingResponse): boolean {
  return getReviewFlags(listing).length === 0;
}

export interface QueueStats {
  newToday: number;
  overSevenDays: number;
  needsAttention: number;
}

export function computeQueueStats(listings: ListingResponse[], now: Date = new Date()): QueueStats {
  let newToday = 0;
  let overSevenDays = 0;
  let attention = 0;
  for (const listing of listings) {
    const age = ageInDays(listing.createdAt, now);
    if (age === 0) newToday += 1;
    if (age > 7) overSevenDays += 1;
    if (needsAttention(listing, now)) attention += 1;
  }
  return { newToday, overSevenDays, needsAttention: attention };
}

function matchesAgeBucket(listing: ListingResponse, bucket: AgeBucket, now: Date): boolean {
  if (bucket === 'any') return true;
  const age = ageInDays(listing.createdAt, now);
  if (bucket === 'today') return age === 0;
  if (bucket === '3plus') return age >= 3;
  if (bucket === '7plus') return age >= 7;
  return age >= 21;
}

function matchesSearch(listing: ListingResponse, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const haystack = [listing.title, listing.displayId, listing.locality]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

/**
 * Next item to open in the review drawer after a decision on `currentId`,
 * within the currently filtered/sorted queue order (issue #2369 — "advance
 * to the next item while preserving queue state"). Wraps around so the
 * admin can keep working through the whole filtered queue; returns null
 * once nothing besides `currentId` itself remains.
 */
export function findNextListing(
  list: ListingResponse[],
  currentId: string,
): ListingResponse | null {
  const index = list.findIndex((listing) => listing.id === currentId);
  if (index === -1) return null;
  for (let i = index + 1; i < list.length; i += 1) {
    if (list[i].id !== currentId) return list[i];
  }
  for (let i = 0; i < index; i += 1) {
    if (list[i].id !== currentId) return list[i];
  }
  return null;
}

export function filterAndSortListings(
  listings: ListingResponse[],
  filters: PendingApprovalsFilterState,
  now: Date = new Date(),
): ListingResponse[] {
  const filtered = listings.filter((listing) => {
    if (!matchesSearch(listing, filters.search)) return false;
    if (filters.propertyTypes.length > 0 && !filters.propertyTypes.includes(listing.propertyType)) {
      return false;
    }
    if (filters.localities.length > 0 && (!listing.locality || !filters.localities.includes(listing.locality))) {
      return false;
    }
    if (!matchesAgeBucket(listing, filters.ageBucket, now)) return false;
    if (filters.flags.length > 0) {
      const listingFlags = getReviewFlags(listing);
      if (!filters.flags.every((flag) => listingFlags.includes(flag))) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return filters.sort === 'oldest' ? aTime - bTime : bTime - aTime;
  });
}

export const REVIEW_FLAG_LABELS: Record<ReviewFlag, string> = {
  missing_info: 'Missing information',
  no_photos: 'No photos',
  location_unconfirmed: 'Location not confirmed',
};

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  any: 'Any',
  today: 'Today',
  '3plus': '3+ days',
  '7plus': '7+ days',
  '21plus': '21+ days',
};
