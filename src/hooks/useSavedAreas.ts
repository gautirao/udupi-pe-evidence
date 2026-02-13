import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ===== Type Definitions from Backend API =====

export interface SavedArea {
  id: string;
  areaKey: string;
  areaLabel: string | null;
  createdAt: string | null;
}

export interface SaveAreaRequest {
  areaKey: string;
  areaLabel?: string | null;
}

// ===== Custom Hooks =====

/**
 * Fetch user's saved areas
 */
export function useSavedAreas() {
  return useQuery<SavedArea[]>({
    queryKey: ['saved-areas'],
    queryFn: async () => {
      return api.get<SavedArea[]>('/api/saved-areas');
    },
  });
}

/**
 * Save a new area for the user
 */
export function useSaveArea() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: SaveAreaRequest) => {
      return api.post<SavedArea>('/api/saved-areas', request);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['saved-areas'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      toast({
        title: 'Area Saved',
        description: `${data.areaLabel || data.areaKey} has been added to your saved areas.`,
      });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: 'Already Saved',
          description: 'This area is already in your saved list.',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Save Failed',
          description: error.message || 'Failed to save area. Please try again.',
          variant: 'destructive',
        });
      }
    },
  });
}

/**
 * Remove a saved area
 */
export function useDeleteSavedArea() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/api/saved-areas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-areas'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      toast({
        title: 'Area Removed',
        description: 'The area has been removed from your saved list.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to remove area. Please try again.',
        variant: 'destructive',
      });
    },
  });
}
