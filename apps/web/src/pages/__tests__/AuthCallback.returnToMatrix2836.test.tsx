/**
 * #2836 (batch B of the #2750 retirement) — AuthCallback returnTo matrix.
 *
 * Replaces the open-redirect assertions of the legacy
 * e2e/auth-open-redirect-hardening-2232.spec.ts at the OAuth-callback seam.
 *
 * AuthCallback reads ONLY ?returnTo= (AuthCallback.tsx:16), so there is no `redirect` axis here.
 * Both navigate sites are covered: the existing-session path (:32) and the
 * onAuthStateChange path (:39). Every security assertion checks the EXACT navigate
 * argument. Hostile list = 5 legacy values + 'evil.com' (no slash, no scheme), the
 * only value that separates a missing leading-'/' check from the scheme regex.
 * Accept arms prove the matrix cannot pass by always redirecting to '/discover'.
 *
 * Mocked: react-router useNavigate, useAuth (role flags only), the supabase auth client.
 * Dummy ids only; no real session material.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  useAuth: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => h.useAuth(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => h.getSession(...args),
      onAuthStateChange: (...args: unknown[]) => h.onAuthStateChange(...args),
    },
  },
}));

import AuthCallback from '@/pages/AuthCallback';

// Older than 120s + onboarding done => getRoleAwareDefaultLanding resolves '/discover'.
const USER = {
  id: 'u-2836',
  created_at: '2020-01-01T00:00:00Z',
  user_metadata: { onboarding_completed: true },
};

const HOSTILE: ReadonlyArray<readonly [string, string]> = [
  ['protocol-relative', '//evil.com'],
  ['backslash', '/\\evil.com'],
  ['backslash + slash', '/\\/evil.com'],
  ['uppercase scheme', '/HTTP://evil.com'],
  ['absolute https URL', 'https://evil.com'],
  ['bare host (no slash, no scheme)', 'evil.com'],
];

const originalLocation = window.location;
let assignSpy: ReturnType<typeof vi.fn>;
let replaceSpy: ReturnType<typeof vi.fn>;
let hrefSpy: ReturnType<typeof vi.fn>;

const path = (value: string) => `/auth/callback?returnTo=${encodeURIComponent(value)}`;

function renderCallbackAt(p: string) {
  return render(
    <MemoryRouter initialEntries={[p]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </MemoryRouter>
  );
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

function expectNoLocationWrites() {
  expect(assignSpy).not.toHaveBeenCalled();
  expect(replaceSpy).not.toHaveBeenCalled();
  expect(hrefSpy).not.toHaveBeenCalled();
}

/** Session already present: navigate fires from AuthCallback.tsx:32. */
function withExistingSession() {
  h.getSession.mockResolvedValue({ data: { session: { user: USER } } });
}

/** No session yet: navigate fires from the onAuthStateChange handler (AuthCallback.tsx:39). */
function withAuthStateChangeSession() {
  h.getSession.mockResolvedValue({ data: { session: null } });
}

async function fireAuthStateChange() {
  await waitFor(() => expect(h.onAuthStateChange).toHaveBeenCalledTimes(1));
  const cb = h.onAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;
  await act(async () => {
    cb('SIGNED_IN', { user: USER });
  });
}

beforeEach(() => {
  h.navigate.mockReset();
  h.useAuth.mockReset().mockReturnValue({ isAdmin: false, isBroker: false, isLoading: false });
  h.getSession.mockReset();
  h.onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

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
      return 'http://localhost/auth/callback';
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

describe('canary: the location spies are live', () => {
  it('records href / assign / replace writes made through window.location', () => {
    window.location.href = 'http://evil.com/x';
    window.location.assign('/y');
    window.location.replace('/z');
    expect(hrefSpy).toHaveBeenCalledWith('http://evil.com/x');
    expect(assignSpy).toHaveBeenCalledWith('/y');
    expect(replaceSpy).toHaveBeenCalledWith('/z');
  });
});

describe('AuthCallback — existing session path (AuthCallback.tsx:32)', () => {
  it.each(HOSTILE)('hostile %s (%s) -> navigate("/discover", {replace:true}) exactly once; location never written', async (_label, value) => {
    withExistingSession();
    renderCallbackAt(path(value));

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/discover', { replace: true });
    expectNoLocationWrites();
  });

  it('accept arm: /discover?city=udupi is honoured EXACTLY', async () => {
    withExistingSession();
    renderCallbackAt(path('/discover?city=udupi'));

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/discover?city=udupi', { replace: true });
    expectNoLocationWrites();
  });

  it('accept arm: /listing/123 is honoured EXACTLY (differs from the /discover fallback)', async () => {
    withExistingSession();
    renderCallbackAt(path('/listing/123'));

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/listing/123', { replace: true });
  });
});

describe('AuthCallback — onAuthStateChange path (AuthCallback.tsx:39)', () => {
  it.each(HOSTILE)('hostile %s (%s) -> navigate("/discover", {replace:true}) exactly once; location never written', async (_label, value) => {
    withAuthStateChangeSession();
    renderCallbackAt(path(value));

    await fireAuthStateChange();
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/discover', { replace: true });
    expectNoLocationWrites();
  });

  it('accept arm: /discover?city=udupi is honoured EXACTLY', async () => {
    withAuthStateChangeSession();
    renderCallbackAt(path('/discover?city=udupi'));

    await fireAuthStateChange();
    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    await settle();

    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('/discover?city=udupi', { replace: true });
  });
});
