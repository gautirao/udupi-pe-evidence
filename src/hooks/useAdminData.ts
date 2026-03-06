import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useCallback } from 'react';

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
export function useAdminListings(limit = 100) {
  const { isAdmin } = useAuth();

  return useQuery({
    queryKey: ['admin-listings', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_listings')
        .select('*, raw_posts(images)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
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