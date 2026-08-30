/**
 * Pure, testable logic for the admin Listings inventory workspace (#2370).
 *
 * Every function here operates on a minimal structural shape (not the full
 * `PropertyListing`/`AdminListingRow` type) so it can be unit tested without
 * constructing a full listing fixture, and reused by both the table and the
 * editor drawer.
 *
 * IMPORTANT: `needsAttention`/`isPubliclyVisible` mirror real backend fields
 * only (`status`, `is_valid`, `quality_score`, `locality`, `latitude`,
 * `longitude`) — see the issue's "real capability map" for why each clause
 * exists. Do not add clauses backed by fields that aren't genuinely stored.
 */

export type ListingLifecycleStatus =
  | 'SCRAPED'
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'LIVE'
  | 'REJECTED'
  | 'ARCHIVED';

export const LISTING_LIFECYCLE_STATUSES: ListingLifecycleStatus[] = [
  'SCRAPED',
  'DRAFT',
  'PENDING_REVIEW',
  'LIVE',
  'REJECTED',
  'ARCHIVED',
];

export interface InventoryListingLike {
  status: string | null;
  is_valid: boolean;
  quality_score?: number | null;
  locality?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Public visibility is NOT a separate stored field — it's derived from the
 * real lifecycle status plus the real `is_valid` flag (which genuinely gates
 * anon/authenticated Supabase reads via RLS — see V10/V34 policies — and is
 * excluded from several analytics rollups).
 */
export function isPubliclyVisible(listing: InventoryListingLike): boolean {
  return listing.status === 'LIVE' && listing.is_valid === true;
}

/**
 * A listing where is_valid=true but status isn't LIVE is a real, contradictory
 * state (e.g. a listing that was valid, then rejected, without is_valid being
 * cleared). Surface it — never silently normalize it away.
 */
export function isContradictoryVisibilityState(listing: InventoryListingLike): boolean {
  return listing.is_valid === true && listing.status !== 'LIVE';
}

export function hasMissingCoordinates(listing: InventoryListingLike): boolean {
  const hasLocality = !!listing.locality && listing.locality.trim().length > 0;
  const hasCoords = listing.latitude != null && listing.longitude != null;
  return hasLocality && !hasCoords;
}

export function isLowQuality(listing: InventoryListingLike): boolean {
  return listing.quality_score != null && listing.quality_score < 50;
}

/**
 * Single reusable "needs attention" definition — used identically for the
 * tab count, the tab filter, and any row-level indicator (per the issue's
 * explicit instruction not to fork this logic).
 */
export function needsAttention(listing: InventoryListingLike): boolean {
  if (listing.status === 'REJECTED') return true;
  if (isContradictoryVisibilityState(listing)) return true;
  if (isLowQuality(listing)) return true;
  if (hasMissingCoordinates(listing)) return true;
  return false;
}

export type QualityBucket = 'high' | 'medium' | 'low' | 'unscored';

export function getQualityBucket(score: number | null | undefined): QualityBucket {
  if (score == null) return 'unscored';
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export const QUALITY_BUCKET_LABELS: Record<QualityBucket, string> = {
  high: 'High (80–100)',
  medium: 'Medium (50–79)',
  low: 'Low (<50)',
  unscored: 'Not yet scored',
};

/** Real display ID scheme — `PROP-{listing_number}`. Never invent an ID. */
export function formatDisplayId(listingNumber: number | null | undefined): string {
  return listingNumber != null ? `PROP-${listingNumber}` : '—';
}

export type InventoryTab = 'all' | 'published' | 'pending' | 'needs-attention' | 'archived';

export const INVENTORY_TABS: { value: InventoryTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'archived', label: 'Archived' },
];

export function matchesTab(listing: InventoryListingLike, tab: InventoryTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'published':
      return listing.status === 'LIVE';
    case 'pending':
      return listing.status === 'PENDING_REVIEW';
    case 'needs-attention':
      return needsAttention(listing);
    case 'archived':
      return listing.status === 'ARCHIVED';
    default:
      return true;
  }
}

export function computeTabCounts(
  listings: InventoryListingLike[],
): Record<InventoryTab, number> {
  const counts: Record<InventoryTab, number> = {
    all: listings.length,
    published: 0,
    pending: 0,
    'needs-attention': 0,
    archived: 0,
  };
  for (const listing of listings) {
    if (listing.status === 'LIVE') counts.published += 1;
    if (listing.status === 'PENDING_REVIEW') counts.pending += 1;
    if (needsAttention(listing)) counts['needs-attention'] += 1;
    if (listing.status === 'ARCHIVED') counts.archived += 1;
  }
  return counts;
}

export interface SearchableListingLike {
  title?: string | null;
  locality?: string | null;
  seller_type?: string | null;
  listing_number?: number | null;
}

/**
 * Search across title / display ID / seller-type (stand-in for "broker
 * source" — no real broker-name field exists) / locality. Deliberately never
 * matches contact_phone/contact_info (revoked columns, not searchable
 * server-side — see the issue's real capability map).
 */
export function matchesSearch(listing: SearchableListingLike, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const haystacks = [
    listing.title,
    listing.locality,
    listing.seller_type,
    formatDisplayId(listing.listing_number),
  ];

  return haystacks.some((value) => value != null && String(value).toLowerCase().includes(query));
}

export type InventorySortKey =
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'price-desc'
  | 'completeness-desc';

export const INVENTORY_SORT_OPTIONS: { value: InventorySortKey; label: string }[] = [
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'updated-asc', label: 'Oldest updated' },
  { value: 'created-desc', label: 'Newest created' },
  { value: 'price-desc', label: 'Price (high to low)' },
  { value: 'completeness-desc', label: 'Completeness (high to low)' },
];

export interface SortableListingLike {
  updated_at?: string | null;
  created_at?: string | null;
  price?: number | null;
  quality_score?: number | null;
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Nullish numeric values always sort last, regardless of sort direction. */
function compareNullsLast(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export function compareListings<T extends SortableListingLike>(
  a: T,
  b: T,
  sortKey: InventorySortKey,
): number {
  switch (sortKey) {
    case 'updated-desc':
      return toTime(b.updated_at) - toTime(a.updated_at);
    case 'updated-asc':
      return toTime(a.updated_at) - toTime(b.updated_at);
    case 'created-desc':
      return toTime(b.created_at) - toTime(a.created_at);
    case 'price-desc':
      return compareNullsLast(a.price, b.price);
    case 'completeness-desc':
      return compareNullsLast(a.quality_score, b.quality_score);
    default:
      return 0;
  }
}

/**
 * Publish/Unpublish is modeled as the existing `is_valid` toggle, gated to
 * LIVE listings only — this is the entire reason it can never bypass
 * approval: it can only ever affect an already-LIVE record's visibility,
 * never its lifecycle status.
 */
export function canTogglePublish(listing: { status: string | null }): boolean {
  return listing.status === 'LIVE';
}

/**
 * Neutralizes CSV formula injection ("CSV injection" / "formula injection").
 * Scraped/unmoderated listing fields (title, locality) are exported verbatim
 * by "Export selected" — a value starting with =, +, -, or @ is interpreted
 * as a formula by Excel/Sheets when the CSV is opened, which can execute
 * arbitrary lookups (e.g. `=HYPERLINK(...)`). Prefixing with a single quote
 * forces spreadsheet apps to treat it as literal text while remaining valid,
 * human-readable CSV content.
 */
export function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/**
 * A plain field-update payload (used by the editor's "Save changes") must
 * never include `status` — that's the PENDING_REVIEW no-implicit-approval
 * guard from #2369. This helper strips it defensively so a save can never
 * mutate lifecycle status, however the payload was built.
 */
export function stripStatusFromUpdate<T extends Record<string, unknown>>(
  updates: T,
): Omit<T, 'status'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional discard
  const { status: _status, ...rest } = updates;
  return rest;
}
