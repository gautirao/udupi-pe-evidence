import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { listingKeys } from '@/lib/listingQueryKeys';

/**
 * Invalidates all listing-detail cache entries when auth state changes.
 * Issue #1462: prevents stale disclosure-gated data (price, pricePaise, surveyNumber,
 * lat/lng) from persisting in cache across sign-in/sign-out boundaries.
 *
 * IMPORTANT: depends on `isAuthed` (boolean derived from session), NOT the session
 * object reference, so token refreshes do not trigger unnecessary invalidations.
 *
 * Mount this hook in a component that is a child of both QueryClientProvider and
 * AuthProvider (e.g., a wrapper component in App.tsx).
 */
export function useAuthCacheSync() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Derive a stable boolean — avoids re-running the effect on Supabase token refresh
  // (which changes the session object but not the auth state).
  const isAuthed = !!session;
  const prevAuthedRef = useRef(isAuthed);

  useEffect(() => {
    // Skip the initial mount — only invalidate when auth state actually changes.
    // This prevents an unnecessary refetch of all listing queries on every page load.
    if (prevAuthedRef.current === isAuthed) {
      return;
    }
    prevAuthedRef.current = isAuthed;
    // Invalidate all ['listing', ...] keys (public, preview, price-history, trust).
    // Active queries will refetch immediately; inactive entries are marked stale.
    queryClient.invalidateQueries({ queryKey: listingKeys.all });
  }, [isAuthed, queryClient]);
}
