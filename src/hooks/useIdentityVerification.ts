import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { API_BASE_URL, ApiError } from '@/lib/api';

interface SubmitEvidenceResponse {
  message: string;
  evidenceId: string;
}

export interface IdentityEvidencePayload {
  legalName: string;
  phoneNumber: string;
  documentType: string;
  file: File;
}

export function useIdentityVerification(listingId: string) {
  const queryClient = useQueryClient();

  const submitEvidence = useMutation({
    mutationFn: async (payload: IdentityEvidencePayload): Promise<SubmitEvidenceResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        throw new Error('Session expired — please log in again');
      }

      const formData = new FormData();
      formData.append('legal_name', payload.legalName);
      formData.append('phone_number', payload.phoneNumber);
      formData.append('document_type', payload.documentType);
      formData.append('file', payload.file);

      const response = await fetch(
        `${API_BASE_URL}/api/listings/${listingId}/trust/identity/submit-evidence`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
        const errorMsg =
          typeof body === 'object' && body !== null && 'error' in body
            ? (body as { error: string }).error
            : `HTTP ${response.status}`;
        throw new ApiError(errorMsg, response.status, body);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trust-progress', listingId] });
    },
  });

  return { submitEvidence };
}
