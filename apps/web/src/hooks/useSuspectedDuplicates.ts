import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PageResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface DuplicateCandidate {
  id: string;
  listingIdA: string;
  listingIdB: string;
  similarityScore: number;
  distanceMeters: number | null;
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type DuplicateCandidatesPage = PageResponse<DuplicateCandidate>;

const PAGE_SIZE = 20;
const QUERY_KEY_BASE = ['admin', 'duplicates'] as const;

export function useSuspectedDuplicates() {
  const [page, setPage] = useState(0);

  const query = useQuery<DuplicateCandidatesPage>({
    queryKey: [...QUERY_KEY_BASE, page],
    queryFn: () =>
      api.get<DuplicateCandidatesPage>(
        `/api/admin/duplicates?page=${page}&size=${PAGE_SIZE}`,
      ),
  });

  return { ...query, page, setPage };
}

export function useConfirmDuplicate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.post<void>(`/api/admin/duplicates/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Duplicate confirmed', description: 'The newer listing will be archived.' });
    },
    onError: (err) => {
      toast({ title: 'Confirm failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDismissDuplicateCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.post<void>(`/api/admin/duplicates/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Candidate dismissed', description: 'Pair marked as not a duplicate.' });
    },
    onError: (err) => {
      toast({ title: 'Dismiss failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUndoDuplicate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<void, Error, string>({
    mutationFn: (id) => api.post<void>(`/api/admin/duplicates/${id}/undo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
      toast({ title: 'Review undone', description: 'Pair status reset to pending.' });
    },
    onError: (err) => {
      toast({ title: 'Undo failed', description: err.message, variant: 'destructive' });
    },
  });
}
