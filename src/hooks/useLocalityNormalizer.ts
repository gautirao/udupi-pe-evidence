import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface LocalityCandidate {
  raw: string;
  suggestedCanonical: string;
  listingCount: number;
  needsNormalization: boolean;
}

interface PreviewResult {
  affectedCount: number;
  from: string;
  to: string;
}

interface ApplyResult {
  updatedCount: number;
  from: string;
  to: string;
}

export function useLocalityCandidates() {
  return useQuery<LocalityCandidate[]>({
    queryKey: ['admin-locality-candidates'],
    queryFn: () => api.get<LocalityCandidate[]>('/api/admin/localities/candidates'),
  });
}

export function useLocalityPreview() {
  return useMutation<PreviewResult, Error, { from: string; to?: string }>({
    mutationFn: ({ from, to }) =>
      api.post<PreviewResult>('/api/admin/localities/preview', { from, to }),
  });
}

export function useLocalityApply() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<ApplyResult, Error, { from: string; to: string }>({
    mutationFn: ({ from, to }) =>
      api.post<ApplyResult>('/api/admin/localities/apply', { from, to }),
    onSuccess: (data) => {
      toast({
        title: 'Locality renamed',
        description: `${data.updatedCount} listing${data.updatedCount !== 1 ? 's' : ''} renamed from "${data.from}" to "${data.to}"`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-locality-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
    },
    onError: (err) => {
      toast({
        title: 'Rename failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
