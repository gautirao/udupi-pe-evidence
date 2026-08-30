import type { QualityListing, QualityBand, ImpactLevel } from '@/types/listingQuality';

// ─── Filter chip type ─────────────────────────────────────────────────────────

export type FilterKey = 'all' | 'buyerReady' | 'needImprovement' | 'priorityFix' | 'notScored';

export interface FilterChip {
  key: FilterKey;
  label: string;
}

export const FILTER_CHIPS: FilterChip[] = [
  { key: 'all', label: 'All' },
  { key: 'priorityFix', label: 'Priority Fix' },
  { key: 'needImprovement', label: 'Needs Work' },
  { key: 'buyerReady', label: 'Buyer Ready' },
  { key: 'notScored', label: 'Not Scored' },
];

// ─── Sort type ────────────────────────────────────────────────────────────────

export type SortKey = 'band' | 'score' | 'title';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_ORDER: Record<QualityBand, number> = {
  PRIORITY_FIX: 0,
  NEEDS_IMPROVEMENT: 1,
  BUYER_READY: 2,
  UNSCORED: 3,
};

export function bandLabel(band: QualityBand): string {
  switch (band) {
    case 'BUYER_READY': return 'Buyer Ready';
    case 'NEEDS_IMPROVEMENT': return 'Needs Work';
    case 'PRIORITY_FIX': return 'Priority Fix';
    case 'UNSCORED': return 'Not Scored';
  }
}

export function bandBadgeClass(band: QualityBand): string {
  switch (band) {
    case 'BUYER_READY':
      return 'bg-green-100 text-green-800 border-0';
    case 'NEEDS_IMPROVEMENT':
      return 'bg-amber-100 text-amber-800 border-0';
    case 'PRIORITY_FIX':
      return 'bg-red-100 text-red-800 border-0';
    case 'UNSCORED':
      return 'bg-gray-100 text-gray-600 border-0';
  }
}

export function impactBadgeClass(impact: ImpactLevel): string {
  switch (impact) {
    case 'HIGH': return 'bg-red-100 text-red-800 border-0';
    case 'MEDIUM': return 'bg-amber-100 text-amber-800 border-0';
    case 'LOW': return 'bg-blue-100 text-blue-800 border-0';
  }
}

/**
 * Sort listings by the given key. Modifies a copy — never mutates the prop array.
 */
export function sortListings(listings: QualityListing[], sortKey: SortKey): QualityListing[] {
  const copy = [...listings];
  switch (sortKey) {
    case 'band':
      return copy.sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]);
    case 'score':
      // Scored first (desc), then unscored at bottom
      return copy.sort((a, b) => {
        if (a.qualityScore === null && b.qualityScore === null) return 0;
        if (a.qualityScore === null) return 1;
        if (b.qualityScore === null) return -1;
        return b.qualityScore - a.qualityScore;
      });
    case 'title':
      return copy.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }
}

/**
 * Derive "today's priority" — the highest-impact PRIORITY_FIX listing, falling
 * back to first NEEDS_IMPROVEMENT if none exists.
 */
export function deriveTodaysPriority(listings: QualityListing[]): QualityListing | null {
  const priorityFix = listings.filter(l => l.band === 'PRIORITY_FIX');
  if (priorityFix.length > 0) {
    // Pick the one with the highest number of HIGH-impact fixes
    return priorityFix.sort(
      (a, b) =>
        b.fixPlan.filter(f => f.impact === 'HIGH').length -
        a.fixPlan.filter(f => f.impact === 'HIGH').length,
    )[0] ?? null;
  }
  const needsWork = listings.filter(l => l.band === 'NEEDS_IMPROVEMENT');
  return needsWork[0] ?? null;
}

/**
 * Filter listings by selected chip.
 * Server filterCounts are used for chip labels; client filtering is by
 * the band field returned by the server — no recomputation that can drift.
 */
export function filterListings(listings: QualityListing[], filter: FilterKey): QualityListing[] {
  switch (filter) {
    case 'all': return listings;
    case 'buyerReady': return listings.filter(l => l.band === 'BUYER_READY');
    case 'needImprovement': return listings.filter(l => l.band === 'NEEDS_IMPROVEMENT');
    case 'priorityFix': return listings.filter(l => l.band === 'PRIORITY_FIX');
    case 'notScored': return listings.filter(l => l.scoreStatus === 'NOT_SCORED');
  }
}

/**
 * Guard against null listingId before building an edit deep-link.
 * Backend guarantees non-null UUID, but be defensive.
 */
export function safeEditLink(listingId: string | null | undefined, fallbackHref: string): string {
  if (!listingId) return '/broker/listings';
  return fallbackHref || `/broker/listings/${listingId}/edit`;
}
