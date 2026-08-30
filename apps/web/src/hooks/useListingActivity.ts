import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/** Mirrors AuditLog.tsx's AuditLogEntry — the real shape of GET /api/admin/audit-log rows. */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
}

/**
 * GET /api/admin/audit-log is NOT scoped by listing server-side (issue
 * #2370's real capability map) — it returns the most recent N admin actions
 * across the whole system. We fetch a reasonably-sized recent window and
 * filter client-side to this listing.
 *
 * Real gap (surfaced in the drawer's activity panel, not hidden here): plain
 * Supabase field updates via useUpdateListing — including the publish/
 * unpublish is_valid toggle — are NOT written to this audit log. Only calls
 * through AdminListingController (approve/reject/restore/archive/etc.) are.
 * A listing with no rows here may still have been edited.
 */
const ACTIVITY_LOG_WINDOW = 200;

export function useListingActivity(listingId: string | null) {
  const { isAdmin } = useAuth();

  const query = useQuery({
    queryKey: ['admin-audit-log', ACTIVITY_LOG_WINDOW],
    queryFn: () => api.get<AuditLogEntry[]>(`/api/admin/audit-log?limit=${ACTIVITY_LOG_WINDOW}`),
    enabled: isAdmin && !!listingId,
    staleTime: 30_000,
  });

  const entries = (query.data ?? []).filter(
    (entry) => entry.entityType === 'listing' && entry.entityId === listingId,
  );

  return {
    entries,
    isLoading: query.isLoading,
    isError: query.isError,
    /** True when the fetched window may not contain this listing's full history. */
    windowMayBeIncomplete: (query.data?.length ?? 0) >= ACTIVITY_LOG_WINDOW,
  };
}
