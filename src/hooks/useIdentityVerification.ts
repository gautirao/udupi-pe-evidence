import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface RequestOtpResponse {
  message: string;
}

interface VerifyOtpResponse {
  message: string;
}

export function useIdentityVerification(listingId: string) {
  const queryClient = useQueryClient();

  const requestOtp = useMutation({
    mutationFn: () =>
      api.post<RequestOtpResponse>(`/api/listings/${listingId}/trust/identity/request-otp`),
  });

  const verifyOtp = useMutation({
    mutationFn: (code: string) =>
      api.post<VerifyOtpResponse>(`/api/listings/${listingId}/trust/identity/verify-otp`, {
        listingId,
        code,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trust-progress', listingId] });
    },
  });

  return { requestOtp, verifyOtp };
}
