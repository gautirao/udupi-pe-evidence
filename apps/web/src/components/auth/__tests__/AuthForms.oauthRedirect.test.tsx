import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// LIMITATION (accepted, not fixable at this unit level): supabase.auth.signInWithOAuth
// is mocked here, so the real OAuth redirect/callback round-trip through Supabase and
// Google never fires. These tests prove the URL this component HANDS TO the OAuth
// call is same-origin-safe; they do not exercise the actual browser redirect or the
// real /auth/callback response from Supabase — that boundary is outside a unit test.
// ─── Hoisted mock handles ────────────────────────────────────────────────
const mockSignInWithOAuth = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockToast = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────
import { AuthForms } from '@/components/auth/AuthForms';

async function clickGoogleButton() {
  const button = screen.getByRole('button', { name: /sign in with google/i });
  fireEvent.click(button);
  await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
}

describe('AuthForms — OAuth redirect same-origin invariant (load-bearing protection)', () => {
  beforeEach(() => {
    mockSignInWithOAuth.mockClear();
    mockToast.mockClear();
  });

  it('builds a redirectTo whose origin is exactly window.location.origin and whose path is /auth/callback (no returnTo)', async () => {
    render(<AuthForms returnTo={null} />);
    await clickGoogleButton();

    const { redirectTo } = mockSignInWithOAuth.mock.calls[0][0].options;
    expect(redirectTo.startsWith(window.location.origin)).toBe(true);
    const parsed = new URL(redirectTo);
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/auth/callback');
    // Falsifiability: if signInWithGoogle ever built cbUrl from `returnTo` directly
    // (e.g. `returnTo + '/auth/callback'` or similar) instead of always prefixing
    // window.location.origin, parsed.origin would diverge from window.location.origin
    // for a hostile returnTo and this test would fail.
  });

  it.each([
    ['protocol-relative host', '//evil.com'],
    ['backslash-prefixed host', '/\\evil.com'],
    ['full https URL', 'https://evil.com'],
    ['full https URL with path', 'https://evil.com/steal'],
  ])('a hostile returnTo prop (%s) cannot change the redirectTo host — it is confined to the query string', async (_label, hostileReturnTo) => {
    render(<AuthForms returnTo={hostileReturnTo} />);
    await clickGoogleButton();

    const { redirectTo } = mockSignInWithOAuth.mock.calls[0][0].options;
    const parsed = new URL(redirectTo);

    // THE load-bearing assertion: host must never be attacker-influenceable.
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.host).toBe(window.location.host);
    expect(parsed.pathname).toBe('/auth/callback');

    // The hostile value may only appear url-encoded inside the query string,
    // never as a literal unencoded fragment of the URL (which could otherwise
    // smuggle a second '//' or '@' host-boundary token past a naive same-origin check).
    expect(parsed.searchParams.get('returnTo')).toBe(hostileReturnTo);
    expect(redirectTo).not.toContain(hostileReturnTo);
    // Falsifiability: this test asserts more than "signInWithOAuth was called" — it
    // decodes the actual redirectTo URL and checks its host. If a future change made
    // cbUrl e.g. `${returnTo}${window.location.origin}/auth/callback` or otherwise let
    // the hostile string reach the URL's authority component, parsed.origin/.host would
    // no longer equal window.location.origin/.host and this test would fail. A test that
    // only checked signInWithOAuth was called would NOT catch this class of bug.
  });

  it('a safe same-origin returnTo is carried through in the query string, url-encoded', async () => {
    render(<AuthForms returnTo="/discover?city=x&node=y" />);
    await clickGoogleButton();

    const { redirectTo } = mockSignInWithOAuth.mock.calls[0][0].options;
    const parsed = new URL(redirectTo);
    expect(parsed.origin).toBe(window.location.origin);
    expect(parsed.pathname).toBe('/auth/callback');
    expect(parsed.searchParams.get('returnTo')).toBe('/discover?city=x&node=y');
  });

  it('omits the returnTo query param entirely when returnTo is null', async () => {
    render(<AuthForms returnTo={null} />);
    await clickGoogleButton();

    const { redirectTo } = mockSignInWithOAuth.mock.calls[0][0].options;
    const parsed = new URL(redirectTo);
    expect(parsed.searchParams.has('returnTo')).toBe(false);
  });
});
