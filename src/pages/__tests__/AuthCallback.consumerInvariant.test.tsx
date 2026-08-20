import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ─── Hoisted mock handles ────────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ isAdmin: false, isBroker: false, isLoading: false }))
);
const mockGetSession = vi.hoisted(() => vi.fn());
const mockOnAuthStateChange = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────
import AuthCallback from '@/pages/AuthCallback';
import * as authUtils from '@/lib/authUtils';

function renderCallbackAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AuthCallback page — consumer invariants for getSafeReturnTo', () => {
  // jsdom's window.location own-properties (assign/replace/href) are
  // non-configurable, so neither Object.defineProperty nor vi.spyOn can
  // intercept them in place. Replace window.location wholesale with a plain
  // mock object instead — the standard jsdom workaround for spying on
  // location navigation.
  const originalLocation = window.location;
  let locationAssignSpy: ReturnType<typeof vi.fn>;
  let locationReplaceSpy: ReturnType<typeof vi.fn>;
  let hrefSpy: ReturnType<typeof vi.fn>;
  // Real getSafeReturnTo, spied-on-but-still-called-through — proves
  // AuthCallback actually invokes the sanitiser (mechanism), not merely that
  // a sanitised-looking value happens to come out the other end (output).
  let getSafeReturnToSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ isAdmin: false, isBroker: false, isLoading: false });
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    getSafeReturnToSpy = vi.spyOn(authUtils, 'getSafeReturnTo');

    locationAssignSpy = vi.fn();
    locationReplaceSpy = vi.fn();
    hrefSpy = vi.fn();
    // @ts-expect-error intentional test-only override of window.location
    delete window.location;
    window.location = {
      ...originalLocation,
      assign: locationAssignSpy,
      replace: locationReplaceSpy,
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

  it('routes via react-router navigate(), never via a location assignment, on session resolution', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallbackAt('/auth/callback?returnTo=/discover');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/discover', { replace: true });
    });

    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('/discover');
    // Falsifiability: if AuthCallback.tsx ever added a `window.location.href = target`
    // (or .assign/.replace) alongside or instead of navigate(), this test goes red.
    // Also falsifies a hardcoded-fallback regression: if AuthCallback.tsx stopped
    // calling getSafeReturnTo (e.g. hardcoded '/discover'), the spy assertion fails
    // even though the navigate() assertion above would still pass.
  });

  it('re-sanitises a hostile returnTo from the URL before navigating (never navigates to it verbatim)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallbackAt('/auth/callback?returnTo=https://evil.com');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    const [target] = mockNavigate.mock.calls[0];
    expect(target).not.toBe('https://evil.com');
    expect(target).toBe('/discover');
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('https://evil.com');
    expect(getSafeReturnToSpy).toHaveReturnedWith(null);
    // Falsifiability: if AuthCallback.tsx navigated to safeReturnTo without having run it
    // through getSafeReturnTo first, `target` would equal the raw hostile string. The
    // toHaveBeenCalledWith proves the raw hostile value actually reached the sanitiser
    // (mechanism), not just that the eventual output happened to look sanitised.
  });

  it('a same-origin returnTo IS honoured verbatim once sanitised', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallbackAt('/auth/callback?returnTo=/listing/42');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/listing/42', { replace: true });
    });
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('/listing/42');
    expect(getSafeReturnToSpy).toHaveReturnedWith('/listing/42');
  });

  it('pinned-risky backslash returnTo: sanitiser passes it through, but AuthCallback still never uses a location assignment', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallbackAt(`/auth/callback?returnTo=${encodeURIComponent('/\\evil.com')}`);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/\\evil.com', { replace: true });
    });

    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    // Falsifiability: this is the test that would catch the exact regression class
    // qa-fast flagged — if AuthCallback.tsx were ever changed to do
    // `window.location.href = resolveTarget(...)` (or .assign/.replace) instead of,
    // or in addition to, navigate(), this hostile backslash value would flow into a
    // real location assignment and this test goes red. A test that only asserted
    // navigate() was called would NOT catch that regression.
  });

  it('pinned-risky uppercase-scheme returnTo: sanitiser passes it through, but AuthCallback still never uses a location assignment', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallbackAt(`/auth/callback?returnTo=${encodeURIComponent('/HTTP://evil.com')}`);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/HTTP://evil.com', { replace: true });
    });

    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    // Falsifiability: same class as above — a future switch to a raw location
    // assignment for this uppercase-scheme value would turn this test red.
  });

  it('falls back to role-aware default landing when returnTo is absent (uses auth-state-change path)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderCallbackAt('/auth/callback');

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    const onChangeCallback = mockOnAuthStateChange.mock.calls[0][0];
    onChangeCallback('SIGNED_IN', { user: { id: 'u2' } });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/discover', { replace: true });
    });
    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
  });
});
