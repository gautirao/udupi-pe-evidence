/**
 * Issue #1793 PR-C — property-request ("Request a property") client hooks.
 *
 * FEATURE FLAG (dark by default): `VITE_PROPERTY_REQUESTS_ENABLED`
 *   - the request card AND the admin route render ONLY when this build-time variable is
 *     exactly the string "true". Absent / "false" / anything else => nothing renders and the
 *     admin route is not registered.
 *   - it mirrors the backend flag `app.property-requests.enabled`; set both together. (There is
 *     deliberately no `.env.example` entry in this PR — that file is outside this slice's
 *     boundary; this docblock is the documentation.)
 *   - read through {@link isPropertyRequestsEnabled} at call time so tests can `vi.stubEnv`.
 *
 * PUBLIC POST: `POST /api/public/property-requests` is anonymous. It goes through the shared
 * `api` client with `skipAuth: true` so NO `Authorization` header is attached (a stale/expired
 * Supabase token must never turn an anonymous request into a 401). The phone number is PII: it
 * is never logged, never put in a URL, a query key, or analytics.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export function isPropertyRequestsEnabled(): boolean {
  return import.meta.env.VITE_PROPERTY_REQUESTS_ENABLED === 'true';
}

// ─── Public create ───────────────────────────────────────────────────────────

export type PropertyRequestJourney = 'AREA' | 'SCHOOL' | 'MAP';
export type PropertyRequestIntent = 'BUY' | 'RENT';
export type PropertyRequestContactVia = 'PHONE' | 'WHATSAPP';

/** Mirrors backend CreatePropertyRequestDto. */
export interface CreatePropertyRequestPayload {
  city: string;
  areaKey?: string | null;
  areaLabel?: string | null;
  journey: PropertyRequestJourney;
  intent: PropertyRequestIntent;
  requirement?: string;
  budgetMin?: number;
  budgetMax?: number;
  phone: string;
  contactVia: PropertyRequestContactVia;
  consent: true;
  consentVersion: string;
}

export interface PropertyRequestCreated {
  id: string;
  status: string;
  createdAt: string;
}

export interface PropertyRequestFieldError {
  field: string;
  message: string;
}

export type PropertyRequestFailure =
  | { kind: 'validation'; fields: PropertyRequestFieldError[] }
  | { kind: 'rate-limit' }
  | { kind: 'unavailable' };

function isFieldErrorArray(value: unknown): value is PropertyRequestFieldError[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as { field?: unknown }).field === 'string' &&
        typeof (v as { message?: unknown }).message === 'string',
    )
  );
}

/**
 * Maps whatever the mutation threw to one of three buyer-facing outcomes. Anything that is not a
 * recognised 400/429 (5xx, 404 when the backend flag is off, network failure, malformed body) is
 * 'unavailable' => "could not send, Retry". It is NEVER mapped to a success.
 */
export function classifyPropertyRequestError(error: unknown): PropertyRequestFailure {
  if (error instanceof ApiError) {
    if (error.status === 429) return { kind: 'rate-limit' };
    if (error.status === 400) {
      const body = error.body;
      const fields =
        typeof body === 'object' && body !== null ? (body as { fields?: unknown }).fields : undefined;
      if (isFieldErrorArray(fields) && fields.length > 0) return { kind: 'validation', fields };
    }
  }
  return { kind: 'unavailable' };
}

export function useCreatePropertyRequest() {
  return useMutation<PropertyRequestCreated, unknown, CreatePropertyRequestPayload>({
    mutationFn: (payload) =>
      api.post<PropertyRequestCreated>('/api/public/property-requests', payload, { skipAuth: true }),
  });
}

// ─── Admin list ──────────────────────────────────────────────────────────────

/** Mirrors backend AdminPropertyRequestView. `phoneMasked` is the ONLY phone representation. */
export interface AdminPropertyRequest {
  id: string;
  city: string;
  areaKey: string | null;
  areaLabel: string | null;
  journey: PropertyRequestJourney;
  intent: PropertyRequestIntent;
  requirement: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  phoneMasked: string;
  contactVia: PropertyRequestContactVia;
  consentVersion: string;
  consentedAt: string;
  status: string;
  createdAt: string;
}

export const ADMIN_PROPERTY_REQUESTS_LIMIT = 200;
const ADMIN_PROPERTY_REQUESTS_QUERY_KEY = ['admin', 'property-requests'] as const;

export function useAdminPropertyRequests() {
  return useQuery<AdminPropertyRequest[]>({
    queryKey: [...ADMIN_PROPERTY_REQUESTS_QUERY_KEY, ADMIN_PROPERTY_REQUESTS_LIMIT],
    queryFn: () =>
      api.get<AdminPropertyRequest[]>(`/api/admin/property-requests?limit=${ADMIN_PROPERTY_REQUESTS_LIMIT}`),
    staleTime: 30_000,
    // The page owns an explicit error state with a Retry button; background retries would only
    // delay it (and a 403 can never succeed on retry).
    retry: false,
  });
}
