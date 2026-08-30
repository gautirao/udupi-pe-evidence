/**
 * useDiscoverTelemetry — PII-free anonymous discover-event telemetry hook.
 *
 * Issue #1531 — M30 anonymous discover_event telemetry (frontend).
 *
 * FIRE-AND-FORGET: telemetry failures (network error / 5xx / timeout / rejected promise)
 * MUST NOT throw, block, or alter Discover UX. All errors are silently swallowed.
 *
 * CONSENT CONTRACT (DEFAULT-DENY — see src/lib/discoverTelemetryConsent.ts):
 *   Telemetry is only emitted when localStorage 'discover_telemetry_consent' === 'granted'.
 *   Missing key / any other value / storage throws → FAIL CLOSED → emit nothing.
 *   The consent check happens BEFORE any network request is constructed or sent.
 *
 *   NOTE: No user-facing consent UI exists yet. It is tracked in issue #1576 and is NOT
 *   provided by this hook. Do NOT claim a user-facing consent mechanism exists.
 *
 * PRIVACY GUARANTEE:
 *   - NO PII is read or sent (no email, phone, name, user id, precise geo, raw price).
 *   - Price is sent only as a coarse band label (UNDER_5L … ABOVE_2CR | UNSPECIFIED).
 *     If a coarse band cannot be derived, price_band is omitted entirely.
 *   - Only backend allow-listed filter keys are sent (area_key, property_type,
 *     listing_purpose, price_band, sort_by, page; scalar values only).
 *
 * ANONYMOUS POST:
 *   Uses a direct fetch (skipAuth=true equivalent) — no Authorization header is attached.
 *   This is intentional: the endpoint accepts anonymous payloads.
 */

import { useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { isTelemetryConsented, getOrCreateSessionId } from '@/lib/discoverTelemetryConsent';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Coarse price-band labels accepted by the backend. */
export type PriceBand =
  | 'UNDER_5L'
  | '5L_20L'
  | '20L_50L'
  | '50L_1CR'
  | '1CR_2CR'
  | 'ABOVE_2CR'
  | 'UNSPECIFIED';

export type DiscoverEventType = 'FILTER_APPLY' | 'PANEL_OPEN' | 'LEAD_INTENT';

/**
 * Allow-listed filter fields accepted by the backend.
 * SCALAR values only — no arrays, no nested objects.
 */
export interface TelemetryFilters {
  area_key?: string;
  property_type?: string;
  listing_purpose?: string;
  price_band?: PriceBand;
  sort_by?: string;
  page?: number;
}

export interface DiscoverEventPayload {
  session_id: string;
  event_type: DiscoverEventType;
  area_key?: string;
  property_type?: string;
  listing_purpose?: string;
  price_band?: PriceBand;
  filters?: TelemetryFilters;
}

export interface UseDiscoverTelemetryReturn {
  /**
   * Emit a FILTER_APPLY event when the user clicks Apply on AgriFiltersPanel.
   * Pass only coarse, allow-listed, non-PII fields from filter state.
   * Fire-and-forget — never throws, never blocks.
   */
  emitFilterApply: (opts: {
    area_key?: string;
    property_type?: string;
    listing_purpose?: string;
    price_band?: PriceBand;
    filters?: TelemetryFilters;
  }) => void;

  /**
   * Emit a PANEL_OPEN event when DiscoverRightPanel mounts / becomes visible.
   * Fire-and-forget — never throws, never blocks.
   */
  emitPanelOpen: (opts?: {
    area_key?: string;
    property_type?: string;
    listing_purpose?: string;
  }) => void;

  /**
   * Emit a LEAD_INTENT event when the user submits the RequestViewingModal CTA.
   * Fire-and-forget — never throws, never blocks.
   */
  emitLeadIntent: (opts?: {
    area_key?: string;
    property_type?: string;
    listing_purpose?: string;
  }) => void;
}

// ─── Price-band helper ────────────────────────────────────────────────────────

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Maps a raw price in rupees to the coarse backend band label.
 * Returns undefined (omit the field) if priceRupees is undefined/null/non-positive.
 * Never sends a raw price.
 */
export function toPriceBand(priceRupees: number | undefined | null): PriceBand | undefined {
  if (priceRupees == null || priceRupees <= 0) return undefined;
  if (priceRupees < 5 * LAKH) return 'UNDER_5L';
  if (priceRupees < 20 * LAKH) return '5L_20L';
  if (priceRupees < 50 * LAKH) return '20L_50L';
  if (priceRupees < CRORE) return '50L_1CR';
  if (priceRupees < 2 * CRORE) return '1CR_2CR';
  return 'ABOVE_2CR';
}

// ─── Internal send ─────────────────────────────────────────────────────────────

/**
 * Sends a single event to POST /api/discover/events.
 * Anonymous (no auth header). Fire-and-forget.
 * All errors are swallowed — this function never throws.
 */
async function sendEvent(event: DiscoverEventPayload): Promise<void> {
  try {
    // Anonymous POST — skipAuth equivalent: we do NOT attach Authorization header.
    // The endpoint is designed to accept unauthenticated payloads.
    await fetch(`${API_BASE_URL}/api/discover/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ events: [event] }),
    });
    // Fire-and-forget: response body is intentionally NOT read (202 expected).
    // Any non-OK status is silently ignored — telemetry must not affect UX.
  } catch {
    // Network error, timeout, or any other failure → silently swallow.
    // Telemetry is best-effort; never surface to the user.
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDiscoverTelemetry(): UseDiscoverTelemetryReturn {
  /**
   * Core emit — validates consent + session id, then fires the event.
   * Returns immediately (fire-and-forget). Never throws.
   */
  const emit = useCallback(
    (event_type: DiscoverEventType, opts: Omit<DiscoverEventPayload, 'session_id' | 'event_type'> = {}) => {
      // CONSENT CHECK — must happen before any network request is built.
      if (!isTelemetryConsented()) return;

      // SESSION ID — fail closed if sessionStorage is unavailable.
      const session_id = getOrCreateSessionId();
      if (!session_id) return;

      const payload: DiscoverEventPayload = {
        session_id,
        event_type,
        ...opts,
      };

      // Fire-and-forget: do NOT await; do NOT chain .catch (sendEvent already swallows).
      void sendEvent(payload);
    },
    [],
  );

  const emitFilterApply = useCallback(
    (opts: {
      area_key?: string;
      property_type?: string;
      listing_purpose?: string;
      price_band?: PriceBand;
      filters?: TelemetryFilters;
    }) => {
      emit('FILTER_APPLY', opts);
    },
    [emit],
  );

  const emitPanelOpen = useCallback(
    (opts?: {
      area_key?: string;
      property_type?: string;
      listing_purpose?: string;
    }) => {
      emit('PANEL_OPEN', opts ?? {});
    },
    [emit],
  );

  const emitLeadIntent = useCallback(
    (opts?: {
      area_key?: string;
      property_type?: string;
      listing_purpose?: string;
    }) => {
      emit('LEAD_INTENT', opts ?? {});
    },
    [emit],
  );

  return { emitFilterApply, emitPanelOpen, emitLeadIntent };
}
