/**
 * #2836 (batch B of the #2750 retirement) — Auth page returnTo/redirect matrix.
 *
 * Replaces the open-redirect assertions of the legacy
 * e2e/auth-open-redirect-hardening-2232.spec.ts at the consumer seam.
 *
 * Design:
 *  - Only the supabase client and react-router's useNavigate are mocked. The REAL
 *    Auth page, REAL AuthProvider (AuthContext) and REAL AuthForms run, so the
 *    post-sign-in navigation target is produced by production code end to end.
 *  - Every security assertion checks the EXACT VALUE (navigate argument,
 *    OAuth redirectTo string), never mere field presence or a `not.toBe`.
 *  - Hostile list = the 5 legacy values + 'evil.com' (no slash, no scheme):
 *    the 'evil.com' row is the only one that separates a missing leading-'/'
 *    check (authUtils.ts:43) from the scheme regex (authUtils.ts:50).
 *  - Accept arms ('/discover?city=udupi', '/listing/123') prove the matrix
 *    cannot pass by always redirecting to '/discover'.
 *
 * LIMITATION (accepted, jsdom): the navigate target and the supabase mock-call
 * contents are asserted. A real-browser same-origin property is NOT observed here.
 * Dummy tokens only ('test-token'); no real session material.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ─── Hoisted mock handles ────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  listener: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigate };
});

// Only the supabase client is mocked: the real AuthContext + AuthForms run on top of it.
vi.mock('@/integrations/supabase/client', () => {
  const emptyRow = () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
  });
  return {
    supabase: {
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          h.listener = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        getSession: (...args: unknown[]) => h.getSession(...args),
        signInWithPassword: (...args: unknown[]) => h.signInWithPassword(...args),
        signInWithOAuth: (...args: unknown[]) => h.signInWithOAuth(...args),
        signUp: (...args: unknown[]) => h.signUp(...args),
        signOut: (...args: unknown[]) => h.signOut(...args),
      },
      from: () => emptyRow(),
    },
  };
});

// ─── Imports after mocks ──────────────────────────────────────────────────
import Auth from '@/pages/Auth';
import { AuthProvider } from '@/contexts/AuthContext';

// Fixture user: older than 120s AND onboarding_completed, so getRoleAwareDefaultLanding
// resolves '/discover' (a recent un-onboarded user would land on '/onboarding').
const USER = {
  id: 'u-2836',
  email: 'buyer@example.com',
  created_at: '2020-01-01T00:00:00Z',
  user_metadata: { onboarding_completed: true },
};
const SESSION = { access_token: 'test-token', user: USER };

const HOSTILE: ReadonlyArray<readonly [string, string]> = [
  ['protocol-relative', '//evil.com'],
  ['backslash', '/\\evil.com'],
  ['backslash + slash', '/\\/evil.com'],
  ['uppercase scheme', '/HTTP://evil.com'],
  ['absolute https URL', 'https://evil.com'],
  ['bare host (no slash, no scheme)', 'evil.com'],
];
const PARAMS = ['returnTo', 'redirect'] as const;

// jsdom's window.location members are non-configurable: replace the object wholesale
// (same technique as Auth.consumerInvariant.test.tsx) so assign/replace/href writes are observable.
const originalLocation = window.location;
let assignSpy: ReturnType<typeof vi.fn>;
let replaceSpy: ReturnType<typeof vi.fn>;
let hrefSpy: ReturnType<typeof vi.fn>;

function renderAuth(path: string, signedIn: boolean) {
  h.getSession.mockResolvedValue({ data: { session: signedIn ? SESSION : null } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

const authPath = (param: string, value: string) => `/auth?${param}=${encodeURIComponent(value)}`;

/** Let any extra (erroneous) navigate/effect re-run surface before asserting "exactly once". */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

function expectNoLocationWrites() {
  expect(assignSpy).not.toHaveBeenCalled();
  expect(replaceSpy).not.toHaveBeenCalled();
  expect(hrefSpy).not.toHaveBeenCalled();
}

async function clickGoogle() {
  fireEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));
  await waitFor(() => expect(h.signInWithOAuth).toHaveBeenCalledTimes(1));
  return h.signInWithOAuth.mock.calls[0][0] as { provider: string; options: { redirectTo: string } };
}

beforeEach(() => {
  h.navigate.mockReset();
  h.signInWithPassword.mockReset();
  h.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  h.signUp.mockReset();
  h.signOut.mockReset();
  h.getSession.mockReset();
  h.listener = null;

  assignSpy = vi.fn();
  replaceSpy = vi.fn();
  hrefSpy = vi.fn();
  // @ts-expect-error intentional test-only override of window.location
  delete window.location;
  window.location = {
    ...originalLocation,
    assign: assignSpy,
    replace: replaceSpy,
    get href() {
      return 'http://localhost/auth';
    },
    set href(v: string) {
      hrefSpy(v);
    },
  } as unknown as Location;
});

afterEach(() => {
  window.location = originalLocation;
  vi.restoreAllMocks();
});

describe('canary: the location spies are live (a vacuous spy would make every "never written" assertion meaningless)', () => {
  it('records href / assign / replace writes made through window.location', () => {
    window.location.href = 'http://evil.com/x';
    window.location.assign('/y');
    window.location.replace('/z');
    expect(hrefSpy).toHaveBeenCalledWith('http://evil.com/x');
    expect(assignSpy).toHaveBeenCalledWith('/y');
    expect(replaceSpy).toHaveBeenCalledWith('/z');
  });
});

describe('Auth page — authenticated user: post-sign-in target is the EXACT sanitised value', () => {
  describe.each(PARAMS)('?%s=', (param) => {
    it.each(HOSTILE)('hostile %s (%s) -> navigate("/discover", {replace:true}) exactly once; location never written', async (_label, value) => {
      renderAuth(authPath(param, value), true);

      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      await settle();

      expect(h.navigate).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/discover', { replace: true });
      expectNoLocationWrites();
    });

    it('accept arm: /discover?city=udupi is honoured EXACTLY', async () => {
      renderAuth(authPath(param, '/discover?city=udupi'), true);

      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      await settle();

      expect(h.navigate).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/discover?city=udupi', { replace: true });
      expectNoLocationWrites();
    });

    it('accept arm: /listing/123 is honoured EXACTLY (differs from the /discover fallback)', async () => {
      renderAuth(authPath(param, '/listing/123'), true);

      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      await settle();

      expect(h.navigate).toHaveBeenCalledTimes(1);
      expect(h.navigate).toHaveBeenCalledWith('/listing/123', { replace: true });
      expectNoLocationWrites();
    });
  });
});

describe('Auth page — anonymous user: the value forwarded to the REAL AuthForms is sanitised', () => {
  // The real AuthForms folds its returnTo prop into the OAuth redirectTo. A null prop => no returnTo param at all.
  describe.each(PARAMS)('?%s=', (param) => {
    it.each(HOSTILE)('hostile %s (%s) -> OAuth redirectTo is exactly <origin>/auth/callback (prop === null, no returnTo)', async (_label, value) => {
      renderAuth(authPath(param, value), false);

      const call = await clickGoogle();

      expect(call.options.redirectTo).toBe(`${window.location.origin}/auth/callback`);
      expect(JSON.stringify(h.signInWithOAuth.mock.calls)).not.toContain('evil.com');
      expect(h.navigate).not.toHaveBeenCalled();
      expectNoLocationWrites();
    });

    it('accept arm: /discover?city=udupi is forwarded unchanged, url-encoded', async () => {
      renderAuth(authPath(param, '/discover?city=udupi'), false);

      const call = await clickGoogle();

      expect(call.options.redirectTo).toBe(
        `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent('/discover?city=udupi')}`
      );
    });
  });
});

describe('S1-8: REAL AuthForms sign-in (only the supabase client is mocked) never leaves the origin', () => {
  async function signInThroughForm() {
    await screen.findByRole('button', { name: /sign in with google/i });
    const email = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('#signin-email');
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    fireEvent.change(email, { target: { value: 'buyer@example.com' } });
    fireEvent.change(document.querySelector('#signin-password') as HTMLInputElement, {
      target: { value: 'dummy-pass-1' },
    });
    // Wait until the listener is registered (provider mounted), then submit the real form.
    await waitFor(() => expect(h.listener).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(h.signInWithPassword).toHaveBeenCalledTimes(1));
  }

  beforeEach(() => {
    // A successful password sign-in: the supabase client fires SIGNED_IN to the provider's listener.
    h.signInWithPassword.mockImplementation(async () => {
      await act(async () => {
        h.listener?.('SIGNED_IN', SESSION);
      });
      return { data: { session: SESSION, user: USER }, error: null };
    });
  });

  it.each(HOSTILE)('hostile %s (%s): after a real form sign-in, navigate target is exactly /discover; no location write; no hostile host reaches any auth call', async (_label, value) => {
    renderAuth(authPath('returnTo', value), false);
    await signInThroughForm();

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/discover', { replace: true });
    expectNoLocationWrites();
    // signInWithPassword has no redirect option; assert nothing hostile was passed to any auth call.
    expect(JSON.stringify(h.signInWithPassword.mock.calls)).not.toContain('evil.com');
    expect(JSON.stringify(h.signInWithOAuth.mock.calls)).not.toContain('evil.com');
  });

  it('control arm: a safe /listing/123 returnTo IS honoured exactly after a real form sign-in (the sub-arm is not always-/discover)', async () => {
    renderAuth(authPath('returnTo', '/listing/123'), false);
    await signInThroughForm();

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/listing/123', { replace: true });
    expectNoLocationWrites();
  });
});
