/**
 * DiscoverConsentBanner tests
 *
 * B1  renders when getConsentState() === 'undecided' (no key)
 * B2  does NOT render when getConsentState() === 'granted'
 * B3  Accept click → localStorage contains exactly 'granted'
 * B4  no auto-grant on mount (consent key absent immediately after render without interaction)
 * B5  no network/fetch call made by the banner
 * B6  Decline click → banner hides (local dismissed flag); storage key is removed/absent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DiscoverConsentBanner } from '../DiscoverConsentBanner';

const CONSENT_KEY = 'discover_telemetry_consent';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('DiscoverConsentBanner', () => {
  it('B1: renders when consent key is absent (undecided)', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverConsentBanner />);
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();
  });

  it('B2: does NOT render when consent is already granted', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<DiscoverConsentBanner />);
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
  });

  it('B3: Accept click writes exactly "granted" to localStorage', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
  });

  it('B4: consent key is absent immediately after render without any interaction', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverConsentBanner />);
    // Banner rendered but user has NOT clicked anything
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it('B5: no fetch/network call is made by the banner (not even after Accept)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('B7: does NOT render when consent key is present but not "granted" (denied state)', () => {
    localStorage.setItem(CONSENT_KEY, 'someOtherValue');
    render(<DiscoverConsentBanner />);
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
  });

  it('B6: Decline click hides the banner for the session without writing a sentinel', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverConsentBanner />);
    // Banner is visible before decline
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /decline/i }));

    // Banner hidden after dismiss
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
    // Key is absent (not a 'revoked' / 'denied' sentinel)
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  // #2750 PR-5 1576-N2 — Accept must REMOVE the banner from the DOM (not just write storage).
  // B3 only reads storage; without the setDismissed(true) re-render the banner stays on screen.
  it('1576-N2: Accept click removes the banner from the DOM (and storage is granted)', () => {
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    render(<DiscoverConsentBanner />);
    expect(screen.getByTestId('discover-consent-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
  });
});
