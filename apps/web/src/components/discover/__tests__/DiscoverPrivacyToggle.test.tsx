/**
 * DiscoverPrivacyToggle tests
 *
 * T1  reflects 'undecided' state (key absent) on render — shows "Off"
 * T2  reflects 'granted' state on render — shows "On"
 * T3  Allow click (when off/undecided) → localStorage contains exactly 'granted'; shows "On"
 * T4  Off click (when on/granted) → key removed from localStorage; shows "Off"
 * T5  storage-throw path during getConsentState on init does not crash the component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DiscoverPrivacyToggle } from '../DiscoverPrivacyToggle';

const CONSENT_KEY = 'discover_telemetry_consent';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('DiscoverPrivacyToggle', () => {
  it('T1: shows "Off" when consent key is absent (undecided)', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverPrivacyToggle />);
    expect(screen.getByRole('button', { name: /allow anonymous usage/i })).toBeInTheDocument();
    expect(screen.getByRole('button').textContent).toBe('Off');
  });

  it('T2: shows "On" when consent is granted', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<DiscoverPrivacyToggle />);
    expect(screen.getByRole('button', { name: /turn off anonymous usage/i })).toBeInTheDocument();
    expect(screen.getByRole('button').textContent).toBe('On');
  });

  it('T3: Allow click → writes "granted" to storage and shows "On"', () => {
    localStorage.removeItem(CONSENT_KEY);
    render(<DiscoverPrivacyToggle />);
    fireEvent.click(screen.getByRole('button', { name: /allow anonymous usage/i }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(screen.getByRole('button').textContent).toBe('On');
  });

  it('T4: Off click → removes key from storage and shows "Off"', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<DiscoverPrivacyToggle />);
    fireEvent.click(screen.getByRole('button', { name: /turn off anonymous usage/i }));
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    expect(screen.getByRole('button').textContent).toBe('Off');
  });

  it('T5: does not crash when localStorage.getItem throws during init', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('SecurityError: storage unavailable');
    });
    // Should render without throwing; defaults to 'undecided' → "Off" state
    expect(() => render(<DiscoverPrivacyToggle />)).not.toThrow();
    expect(screen.getByTestId('discover-privacy-toggle')).toBeInTheDocument();
  });
});
