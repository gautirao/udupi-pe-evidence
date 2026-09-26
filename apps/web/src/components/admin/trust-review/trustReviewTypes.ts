import type { QueryKey } from '@tanstack/react-query';

// ─── Identity evidence types ─────────────────────────────────────────────────

export interface PendingIdentityEvidence {
  evidenceId: string;
  profileId: string;
  listingId: string;
  legalName: string;
  phoneNumber: string;
  documentType: string;
  documentUrl: string;
  submittedAt: string;
  listingTitle: string | null;
  listingLocality: string | null;
}

export interface IdentityPendingResponse {
  items: PendingIdentityEvidence[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  AADHAAR: 'Aadhaar',
  PAN: 'PAN',
  VOTER_ID: 'Voter ID',
  PASSPORT: 'Passport',
  DRIVING_LICENSE: 'Driving License',
};

// ─── Badge review types ──────────────────────────────────────────────────────

export interface PendingTrustReview {
  dimensionId: string;
  listingId: string;
  dimensionType: 'PHOTOS' | 'AUTHORITY' | 'IDENTITY' | 'LOCATION';
  badgeState: 'PENDING';
  submittedAt: string;
  verificationAssetUrl: string | null;
  listingTitle: string | null;
  listingLocality: string | null;
  listingSellerType: 'owner' | 'broker';
}

export interface ApproveRejectResponse {
  message: string;
}

export const DIMENSION_TYPE_LABELS: Record<PendingTrustReview['dimensionType'], string> = {
  PHOTOS: 'Photos',
  AUTHORITY: 'Authority',
  IDENTITY: 'Identity',
  LOCATION: 'Location',
};

export const SELLER_TYPE_LABELS: Record<PendingTrustReview['listingSellerType'], string> = {
  owner: 'Owner',
  broker: 'Broker',
};

// ─── Query keys ───────────────────────────────────────────────────────────────
// Extracted from TrustReviewQueue.tsx (issue #2663). Cross-invalidation
// asymmetry between the two keys is intentional and behavior-preserving —
// see useTrustReviewMutations.ts for the exact matrix.

export const BADGE_QUERY_KEY: QueryKey = ['admin', 'trust', 'pending-reviews'];
export const IDENTITY_QUERY_KEY: QueryKey = ['admin', 'trust', 'identity', 'pending'];

// ─── Workflow action state ──────────────────────────────────────────────────
// Semantic capability consumed by the presentation layer — never a raw
// TanStack mutation object. See useTrustReviewMutations.ts.

export interface ReviewActionState {
  /** True while ANY of the 4 badge/identity approve/reject mutations is in
   * flight — globally disables every approve/reject button on BOTH tabs. */
  busy: boolean;
  /** True while this category's (badge or identity) approve action is in
   * flight — swaps that category's approve icon for a spinner. */
  approving: boolean;
}
