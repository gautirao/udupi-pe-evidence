import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, PageResponse } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// Allowlist of valid time slots (format: HH:MM-HH:MM)
export const TIME_SLOTS = [
  '09:00-10:00',
  '10:00-11:00',
  '11:00-12:00',
  '14:00-15:00',
  '15:00-16:00',
  '16:00-17:00',
];

// Mirrors backend ViewingRequest response DTO
export interface BookingResponse {
  id: string;
  listingId: string;
  requesterId: string;
  dealerId: string;
  requestedDate: string;       // "YYYY-MM-DD"
  requestedTimeSlot: string;   // "HH:MM-HH:MM"
  status: 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';
  requesterMessage: string | null;
  declineReason: string | null;
  cancelledBy: string | null;  // 'user' | 'dealer' | null
  createdAt: string;
  updatedAt: string;
}

// Mirrors backend CreateBookingRequest DTO
export interface CreateBookingRequest {
  listingId: string;
  requestedDate: string;       // "YYYY-MM-DD"
  requestedTimeSlot: string;   // "HH:MM-HH:MM"
  requesterMessage?: string;   // max 500 chars
}

/**
 * Creates a new viewing request for a listing.
 * POST /api/bookings
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateBookingRequest) =>
      api.post<BookingResponse>('/api/bookings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      toast({
        title: 'Viewing request sent',
        description: 'The dealer will confirm your request shortly.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send request',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Fetches the current user's own viewing requests.
 * GET /api/bookings/mine — backend returns Page<BookingResponse>.
 * Returns content array plus pagination metadata.
 */
export function useMyBookings() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => api.get<PageResponse<BookingResponse>>('/api/bookings/mine'),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    data: query.data?.content ?? undefined,
    totalPages: query.data?.page?.totalPages ?? 0,
    totalElements: query.data?.page?.totalElements ?? 0,
  };
}

/**
 * Fetches viewing requests for the current dealer's listings.
 * GET /api/bookings/dealer — backend returns Page<BookingResponse>.
 *
 * @param listingId  Optional UUID string. When provided, only bookings for that
 *                   listing are returned. Omit to fetch all dealer bookings.
 */
export function useDealerBookings(listingId?: string) {
  const { user, isDealer, isAdmin } = useAuth();

  const query = useQuery({
    queryKey: ['dealer-bookings', listingId ?? 'all'],
    queryFn: () => api.get<PageResponse<BookingResponse>>(
      listingId ? `/api/bookings/dealer?listingId=${listingId}` : '/api/bookings/dealer'
    ),
    enabled: !!user && (isDealer || isAdmin),
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    data: query.data?.content ?? undefined,
    totalPages: query.data?.page?.totalPages ?? 0,
    totalElements: query.data?.page?.totalElements ?? 0,
  };
}

/**
 * Confirms a REQUESTED booking.
 * PUT /api/bookings/:id/confirm
 */
export function useConfirmBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) =>
      api.put<BookingResponse>(`/api/bookings/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-bookings'] });
      toast({ title: 'Booking confirmed' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to confirm booking',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Declines a REQUESTED booking (dealer action).
 * PUT /api/bookings/:id/decline
 */
export function useDeclineBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, declineReason }: { id: string; declineReason?: string }) =>
      api.put<BookingResponse>(`/api/bookings/${id}/decline`, { declineReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-bookings'] });
      toast({ title: 'Booking declined' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to decline booking',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Cancels a REQUESTED or CONFIRMED booking (user or dealer action).
 * PUT /api/bookings/:id/cancel
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) =>
      api.put<BookingResponse>(`/api/bookings/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dealer-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      toast({ title: 'Booking cancelled' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to cancel booking',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
