import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useCallback } from 'react';
import type { Json, Tables } from '@/integrations/supabase/types';
import { propertyListingSelect } from '@/integrations/supabase/propertyListingColumns';
import type { InventoryTab, InventorySortKey, QualityBucket } from '@/lib/listingInventory';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085';

// Types
export interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  description: string | null;
  is_enabled: boolean;
  automation_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedRun {
  id: string;
  facebook_group_id: string | null;
  status: 'pending' | 'running' | 'success' | 'partial' | 'failed';
  started_at: string | null;
  ended_at: string | null;
  posts_fetched: number;
  posts_parsed: number;
  posts_failed: number;
  error_log: unknown[];
  created_at: string;
  facebook_groups?: FacebookGroup;
}

export interface RawPost {
  id: string;
  feed_run_id: string | null;
  external_post_id: string | null;
  content: string;
  posted_at: string | null;
  author_name: string | null;
  source_url: string | null;
  is_processed: boolean;
  created_at: string;
  images: Array<{ url: string; alt?: string | null; width?: number | null; height?: number | null }>;
}

// Facebook Groups Hooks
export function useFacebookGroups() {
  const { isAdmin } = useAuth();
  
  return useQuery({
    queryKey: ['facebook-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as FacebookGroup[];
    },
    enabled: isAdmin,
  });
}

export function useCreateFacebookGroup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (group: Omit<FacebookGroup, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('facebook_groups')
        .insert({ ...group, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-groups'] });
      toast({ title: 'Group Created', description: 'Facebook group added successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateFacebookGroup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<FacebookGroup> }) => {
      const { data, error } = await supabase
        .from('facebook_groups')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-groups'] });
      toast({ title: 'Group Updated', description: 'Changes saved successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteFacebookGroup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('facebook_groups')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facebook-groups'] });
      toast({ title: 'Group Deleted', description: 'Facebook group removed.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Feed Runs Hooks
export function useFeedRuns(limit = 50) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['feed-runs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feed_runs')
        .select('*, facebook_groups(name, url)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as FeedRun[];
    },
    enabled: isAdmin,
  });
}

export function useCreateFeedRun() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (facebookGroupId?: string) => {
      const { data, error } = await supabase
        .from('feed_runs')
        .insert({
          facebook_group_id: facebookGroupId || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed-runs'] });
      toast({ title: 'Feed Run Created', description: 'New feed run initiated.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Raw Posts Hooks
export function useRawPosts(feedRunId?: string, limit = 100) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['raw-posts', feedRunId, limit],
    queryFn: async () => {
      let query = supabase
        .from('raw_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (feedRunId) {
        query = query.eq('feed_run_id', feedRunId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as RawPost[];
    },
    enabled: isAdmin,
  });
}

export function useCreateRawPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (post: { content: string; feed_run_id?: string; author_name?: string; posted_at?: string }) => {
      const { data, error } = await supabase
        .from('raw_posts')
        .insert({
          content: post.content,
          feed_run_id: post.feed_run_id || null,
          author_name: post.author_name || null,
          posted_at: post.posted_at || null,
          is_processed: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-posts'] });
      toast({ title: 'Post Added', description: 'Raw post saved successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateRawPost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RawPost> }) => {
      const { data, error } = await supabase
        .from('raw_posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-posts'] });
      toast({ title: 'Post Updated', description: 'Raw post updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResetPostForReprocessing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase
        .from('raw_posts')
        .update({ is_processed: false })
        .eq('id', postId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw-posts'] });
      toast({ title: 'Post Reset', description: 'Post marked for reprocessing.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Admin Listings Hook (shows all including invalid)
/**
 * `property_listings` row joined with `raw_posts(images)`, plus the
 * backend-computed `reraValid` field (see PropertyListing.reraValid in
 * usePropertyListings.ts) that is never persisted as a DB column, so it can
 * never appear in `Tables<'property_listings'>`.
 *
 * NOTE (issue #1850 Slice 6): `seller_type` here is intentionally left as the
 * DB-generated `string` (not narrowed to PropertyListing's `'owner' | 'dealer' |
 * 'broker' | 'builder' | null`). Narrowing it — even only within this local
 * type — requires an unsafe cast at the `return data` statement below, because
 * the actual query result's `seller_type` is genuinely typed `string`. A
 * shared-level narrow (in types.ts) was also tried and rejected: it breaks
 * usePropertyListings.ts:322's `.in('seller_type', filters.sellerTypes)` call
 * (a forbidden, read-only file) by requiring `filters.sellerTypes` to be
 * `('owner' | 'dealer' | 'builder')[]` instead of `string[]`. See the Slice 6
 * report for the full analysis; Listings.tsx:409/422 remain unresolved as a
 * result — flagged as a STOP condition rather than forced with `as`.
 */
// Issue #2280: contact_phone/contact_info re-declared optional (mirroring
// PropertyListing's base optionality) because the query below projects
// through propertyListingSelect(), which omits both revoked-grant columns.
// Tables<'property_listings'> is codegen'd straight from the schema and
// still lists them as required `string | null`, which would otherwise be a
// lie for every row this hook returns.
export type AdminListingRow = Omit<Tables<'property_listings'>, 'contact_phone' | 'contact_info'> & {
  contact_phone?: string | null;
  contact_info?: string | null;
  raw_posts: { images: Json | null } | null;
  reraValid?: boolean;
  /**
   * Issue #2370 — these columns are real (see PROPERTY_LISTING_COLUMNS, and
   * they ARE selected here via propertyListingSelect()), but are absent from
   * the Supabase codegen'd `Tables<'property_listings'>` Row type: the type
   * generator hasn't been re-run since these columns were added, so codegen
   * only knows about ~50 of the table's 161 real columns. Typed explicitly
   * here rather than regenerating the schema (out of scope for this UI
   * change) or fabricating them — the runtime values are genuine.
   */
  listing_number: number | null;
  quality_score: number | null;
  quality_breakdown: Json | null;
  quality_computed_at: string | null;
  super_built_area: number | null;
  super_built_area_unit: string | null;
};

export function useAdminListings(limit = 100) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listings', limit],
    queryFn: async (): Promise<AdminListingRow[]> => {
      const { data, error } = await supabase
        .from('property_listings')
        .select(propertyListingSelect('raw_posts(images)'))
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as unknown as AdminListingRow[];
    },
    enabled: isAdmin,
  });
}

// ---------------------------------------------------------------------------
// Server-side paginated/filtered/sorted admin inventory (#2370)
//
// `useAdminListings` above snapshots at most `limit` rows into memory — fine
// for ProcessPosts.tsx's small triage list, but wrong for the full Listings
// inventory page once real inventory exceeds that snapshot: every filter,
// search, sort, tab count, and pagination control derived from a truncated
// in-memory array silently loses older rows. The hooks below push
// pagination/filtering/sorting/counts down to the Supabase query boundary so
// the UI reflects the real table, not a fixed-size window of it.
// ---------------------------------------------------------------------------

/**
 * Server-side equivalent of `needsAttention()` in listingInventory.ts,
 * expressed as a PostgREST `or()` filter string. Mirrors:
 *   status === 'REJECTED'
 *   || (is_valid === true && status !== 'LIVE')
 *   || (quality_score != null && quality_score < 50)
 *   || (locality is a non-empty string && (latitude or longitude is null))
 *
 * Documented gap: `hasMissingCoordinates` trims the locality string
 * client-side before checking it's non-empty; PostgREST's `neq.""` only
 * excludes the exact empty string, so a whitespace-only locality (e.g. " ")
 * would count as "present" here but not in the pure client-side function.
 * This is an intentionally accepted edge case (whitespace-only locality
 * values are not expected in real scraped/submitted data).
 */
const NEEDS_ATTENTION_OR_FILTER =
  'status.eq.REJECTED,and(is_valid.eq.true,status.neq.LIVE),quality_score.lt.50,and(locality.not.is.null,locality.neq."",or(latitude.is.null,longitude.is.null))';

/**
 * Server-side equivalent of `matchesSearch()` in listingInventory.ts for the
 * fields that are real, indexable columns (title/locality/seller_type).
 *
 * Documented gap: the pure client-side `matchesSearch` also matches a
 * *substring* of the formatted display id (`formatDisplayId(listing_number)`,
 * e.g. "PROP-101"), so a bare "1" would substring-match "PROP-101",
 * "PROP-210", etc. PostgREST has no ilike-on-computed-expression support for
 * a plain integer column, so only an exact display-id match ("PROP-101" /
 * "prop-101") or an exact numeric listing_number match ("101") is
 * translated here — the fuzzy-substring-of-a-number case is dropped. This
 * covers the realistic admin workflow (typing the exact display id or
 * listing number) without a false sense of exhaustive substring search.
 */
export function buildAdminListingsSearchFilter(rawQuery: string): string | null {
  const q = rawQuery.trim();
  if (!q) return null;

  // Two escaping passes are required, in order:
  //  1. Postgres ILIKE escaping — a literal backslash, "%" or "_" in the
  //     search term must not be read as an ILIKE escape/wildcard character.
  //  2. PostgREST filter-grammar escaping — the value is embedded in a
  //     `column.ilike."value"` clause inside a comma-joined `.or()` list, so
  //     any backslash/quote produced by pass 1 (or present in the raw term)
  //     must be escaped again, and the value wrapped in double quotes so
  //     grammar-reserved characters (",", ".", ":", "(", ")") inside it are
  //     treated as literal content rather than filter syntax.
  const ilikeEscaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const postgrestEscaped = ilikeEscaped.replace(/[\\"]/g, (c) => `\\${c}`);
  const quotedValue = `"%${postgrestEscaped}%"`;
  const clauses = [
    `title.ilike.${quotedValue}`,
    `locality.ilike.${quotedValue}`,
    `seller_type.ilike.${quotedValue}`,
  ];

  const displayIdMatch = /^prop-?(\d+)$/i.exec(q);
  if (displayIdMatch) {
    clauses.push(`listing_number.eq.${displayIdMatch[1]}`);
  } else if (/^\d+$/.test(q)) {
    clauses.push(`listing_number.eq.${q}`);
  }

  return clauses.join(',');
}

export interface AdminListingsQueryParams {
  page: number;
  pageSize: number;
  tab: InventoryTab;
  q: string;
  sort: InventorySortKey;
  propertyType: string;
  locality: string;
  sellerType: string;
  lifecycleStatus: string;
  visibility: 'all' | 'public' | 'hidden';
  quality: QualityBucket | 'all';
}

export interface AdminListingsPageResult {
  items: AdminListingRow[];
  totalCount: number;
}

/**
 * Paginated, server-filtered, server-sorted admin inventory page. Replaces
 * `useAdminListings(FETCH_LIMIT)` + client-side `.filter()/.sort()/.slice()`
 * as the data source for the Listings inventory table: `count: 'exact'` on
 * the `.select()` gives a real total (not a "200+ maybe more" guess), and
 * `.range()` fetches only the requested page.
 */
export function useAdminListingsPage(params: AdminListingsQueryParams) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listings-page', params],
    queryFn: async (): Promise<AdminListingsPageResult> => {
      let query = supabase
        .from('property_listings')
        .select(propertyListingSelect('raw_posts(images)'), { count: 'exact' });

      if (params.tab === 'published') query = query.eq('status', 'LIVE');
      else if (params.tab === 'pending') query = query.eq('status', 'PENDING_REVIEW');
      else if (params.tab === 'archived') query = query.eq('status', 'ARCHIVED');
      else if (params.tab === 'needs-attention') query = query.or(NEEDS_ATTENTION_OR_FILTER);

      if (params.lifecycleStatus !== 'all') query = query.eq('status', params.lifecycleStatus);
      if (params.propertyType !== 'all') {
        // Supabase codegen's `property_type` enum is stale (only 5 of the
        // real ~15 PropertyType values — same known gap documented on
        // AdminListingRow above and on usePropertyListings.ts:322's
        // `.in('seller_type', ...)` call). `params.propertyType` only ever
        // comes from `propertyTypeOptions`, itself sourced from real
        // distinct column values, so this is a safe, intentional widening.
        query = query.eq('property_type', params.propertyType as Tables<'property_listings'>['property_type']);
      }
      if (params.locality !== 'all') query = query.eq('locality', params.locality);
      if (params.sellerType !== 'all') query = query.eq('seller_type', params.sellerType);

      if (params.visibility === 'public') query = query.eq('status', 'LIVE').eq('is_valid', true);
      else if (params.visibility === 'hidden') query = query.or('status.neq.LIVE,is_valid.eq.false');

      if (params.quality === 'high') query = query.gte('quality_score', 80);
      else if (params.quality === 'medium') query = query.gte('quality_score', 50).lt('quality_score', 80);
      else if (params.quality === 'low') query = query.lt('quality_score', 50);
      else if (params.quality === 'unscored') query = query.is('quality_score', null);

      const searchFilter = buildAdminListingsSearchFilter(params.q);
      if (searchFilter) query = query.or(searchFilter);

      if (params.sort === 'updated-desc') query = query.order('updated_at', { ascending: false });
      else if (params.sort === 'updated-asc') query = query.order('updated_at', { ascending: true });
      else if (params.sort === 'created-desc') query = query.order('created_at', { ascending: false });
      else if (params.sort === 'price-desc') query = query.order('price', { ascending: false, nullsFirst: false });
      else if (params.sort === 'completeness-desc')
        query = query.order('quality_score', { ascending: false, nullsFirst: false });

      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;
      const { data, error, count } = await query.range(from, to);

      if (error) throw error;
      return { items: (data ?? []) as unknown as AdminListingRow[], totalCount: count ?? 0 };
    },
    enabled: isAdmin,
    placeholderData: (previousData) => previousData,
  });
}

export interface AdminListingsTabCounts {
  all: number;
  published: number;
  pending: number;
  'needs-attention': number;
  archived: number;
}

/**
 * Real per-tab counts over the *entire* inventory (not just the current
 * page), via lightweight `head: true` count-only queries — no row data is
 * transferred, just the count.
 */
export function useAdminListingsTabCounts() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listings-tab-counts'],
    queryFn: async (): Promise<AdminListingsTabCounts> => {
      function baseCountQuery() {
        return supabase.from('property_listings').select('id', { count: 'exact', head: true });
      }
      async function countWhere(
        apply?: (q: ReturnType<typeof baseCountQuery>) => ReturnType<typeof baseCountQuery>,
      ) {
        const base = baseCountQuery();
        const { count, error } = await (apply ? apply(base) : base);
        if (error) throw error;
        return count ?? 0;
      }

      const [all, published, pending, needsAttentionCount, archived] = await Promise.all([
        countWhere(),
        countWhere((q) => q.eq('status', 'LIVE')),
        countWhere((q) => q.eq('status', 'PENDING_REVIEW')),
        countWhere((q) => q.or(NEEDS_ATTENTION_OR_FILTER)),
        countWhere((q) => q.eq('status', 'ARCHIVED')),
      ]);

      return { all, published, pending, 'needs-attention': needsAttentionCount, archived };
    },
    enabled: isAdmin,
  });
}

const FILTER_OPTIONS_SCAN_LIMIT = 5000;

export interface AdminListingFilterOptions {
  propertyTypes: string[];
  localities: string[];
  sellerTypes: string[];
}

/**
 * Distinct filter-dropdown values across the *full* inventory. PostgREST has
 * no `SELECT DISTINCT`, so this selects only the 3 needed columns (cheap —
 * no joined images, no wide row) across up to `FILTER_OPTIONS_SCAN_LIMIT`
 * rows and dedupes client-side.
 *
 * Documented gap: this is still a bounded scan, not a true distinct-values
 * query — an inventory with more than `FILTER_OPTIONS_SCAN_LIMIT` rows could
 * theoretically have a property_type/locality/seller_type value that only
 * appears past that window and so wouldn't show up as a filter option. This
 * is a large, deliberately-chosen ceiling (25x the old 200-row snapshot) to
 * cover realistic inventory sizes without a dedicated distinct-values view
 * or RPC, which is out of scope for this fix.
 */
export function useAdminListingFilterOptions() {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listings-filter-options'],
    queryFn: async (): Promise<AdminListingFilterOptions> => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('property_type, locality, seller_type')
        .limit(FILTER_OPTIONS_SCAN_LIMIT);

      if (error) throw error;
      const rows = (data ?? []) as Array<{
        property_type: string;
        locality: string | null;
        seller_type: string | null;
      }>;

      return {
        propertyTypes: Array.from(new Set(rows.map((r) => r.property_type))).sort(),
        localities: Array.from(new Set(rows.map((r) => r.locality).filter((v): v is string => !!v))).sort(),
        sellerTypes: Array.from(new Set(rows.map((r) => r.seller_type).filter((v): v is string => !!v))).sort(),
      };
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Direct-by-id fetch for the `?edit=<id>` deep link. Used when the requested
 * id isn't present in the currently loaded page of `useAdminListingsPage` —
 * without this, a listing outside the current page/window was
 * indistinguishable from a genuinely deleted/non-existent one (#2370).
 */
export function useAdminListingById(id: string | null) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listing-by-id', id],
    queryFn: async (): Promise<AdminListingRow | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('property_listings')
        .select(propertyListingSelect('raw_posts(images)'))
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as AdminListingRow) ?? null;
    },
    enabled: isAdmin && !!id,
  });
}

// Geocode missing coordinates hook with streaming
interface GeocodeLogEvent {
  type: 'info' | 'success' | 'warning' | 'error' | 'done';
  message?: string;
  details?: string;
  timestamp?: string;
  processed?: number;
  geocoded?: number;
  failed?: number;
}

export function useGeocodeMissing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<GeocodeLogEvent[]>([]);
  const [progress, setProgress] = useState<{ processed: number; geocoded: number; failed: number } | null>(null);

  const geocodeMissing = useCallback(async (batchSize = 20) => {
    setIsProcessing(true);
    setLogs([]);
    setProgress(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Stream from Spring Boot backend endpoint
      const response = await fetch(
        `${API_BASE_URL}/api/admin/geocode/missing?batchSize=${batchSize}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: GeocodeLogEvent = JSON.parse(line.slice(6));
              if (event.type === 'done') {
                setProgress({
                  processed: event.processed || 0,
                  geocoded: event.geocoded || 0,
                  failed: event.failed || 0,
                });
              } else {
                setLogs(prev => [...prev.slice(-99), event]);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      queryClient.invalidateQueries({ queryKey: ['property-listings'] });
      
      toast({
        title: 'Geocoding Complete',
        description: 'Listings have been updated with coordinates.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Geocoding Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [queryClient, toast]);

  const reset = useCallback(() => {
    setLogs([]);
    setProgress(null);
  }, []);

  return { geocodeMissing, isProcessing, logs, progress, reset };
}