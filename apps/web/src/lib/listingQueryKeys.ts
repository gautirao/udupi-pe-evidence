/**
 * Centralized React Query key factory for listing detail queries.
 * Issue #1462: aligns peek (useAgriListingDetail) and detail page (useListingById)
 * cache keys so the cached peek data is reused when navigating to /listing/:id.
 *
 * Auth scope ('authed' | 'anon') is encoded explicitly — not the userId string —
 * because the disclosure policy is binary (authenticated vs anonymous) and
 * embedding the userId would prevent cache sharing across the same auth state.
 */
export const listingKeys = {
  /** Root prefix for all listing queries (used for bulk invalidation). */
  all: ['listing'] as const,

  /**
   * Full public listing detail.
   * Both useAgriListingDetail (peek) and useListingById (public path) use this key.
   * Anon and authed scopes are distinct cache entries — no cross-contamination.
   */
  public: (id: string | null | undefined, isAuthenticated: boolean) =>
    ['listing', 'public', id ?? null, isAuthenticated ? 'authed' : 'anon'] as const,

  /**
   * Preview (broker/admin) listing — separate from public.
   */
  preview: (id: string | undefined) =>
    ['listing', 'preview', id] as const,

  /**
   * Price history for a listing.
   */
  priceHistory: (id: string | undefined) =>
    ['listing', 'price-history', id] as const,

  /**
   * Trust badges for a listing.
   */
  trust: (id: string | undefined) =>
    ['listing', 'trust', id] as const,

  /**
   * Issue #1566 — saved-homes ids (hydration for the PropertyCard heart affordance).
   * Nested under the ['listing', ...] prefix (not a separate top-level key) so the
   * existing useAuthCacheSync invalidation (`invalidateQueries({ queryKey: listingKeys.all })`)
   * automatically covers it on sign-in/sign-out — no competing invalidation mechanism needed.
   * Auth-scoped like `public` above: the query itself is only enabled when authenticated
   * (there is no anonymous saved-listings concept), but the scope segment keeps the anon
   * and authed cache entries distinct across a sign-out/sign-in cycle.
   */
  savedListingIds: (isAuthenticated: boolean) =>
    ['listing', 'saved', 'ids', isAuthenticated ? 'authed' : 'anon'] as const,

  /**
   * Issue #1566 — full saved-listing cards for the "Saved homes" page.
   */
  savedListings: (isAuthenticated: boolean) =>
    ['listing', 'saved', 'list', isAuthenticated ? 'authed' : 'anon'] as const,
} as const;
