import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: string | null;
  isRead: boolean;
  createdAt: string;
}

interface UnreadCountResponse {
  count: number;
}

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationResponse[]>('/api/notifications'),
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get<UnreadCountResponse>('/api/notifications/unread-count'),
    enabled: !!user,
    refetchInterval: 60_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.put(`/api/notifications/${id}/read`),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      await queryClient.cancelQueries({ queryKey: ['notifications-unread-count'] });

      // Snapshot previous values
      const prevNotifications = queryClient.getQueryData<NotificationResponse[]>(['notifications']);
      const prevCount = queryClient.getQueryData<UnreadCountResponse>(['notifications-unread-count']);

      // Optimistically update the notification list
      if (prevNotifications) {
        queryClient.setQueryData<NotificationResponse[]>(
          ['notifications'],
          prevNotifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
      }

      // Optimistically decrement the unread count
      if (prevCount && prevCount.count > 0) {
        const wasUnread = prevNotifications?.find((n) => n.id === id && !n.isRead);
        if (wasUnread) {
          queryClient.setQueryData<UnreadCountResponse>(
            ['notifications-unread-count'],
            { count: prevCount.count - 1 },
          );
        }
      }

      return { prevNotifications, prevCount };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.prevNotifications) {
        queryClient.setQueryData(['notifications'], context.prevNotifications);
      }
      if (context?.prevCount) {
        queryClient.setQueryData(['notifications-unread-count'], context.prevCount);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}
