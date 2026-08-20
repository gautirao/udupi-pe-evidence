import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ─── Hoisted mock handles ────────────────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() =>
  vi.fn(() => ({ user: null, isAdmin: false, isBroker: false }))
);
const mockAuthFormsProps = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

// AuthForms is not under test here — capture the props it receives so the
// sanitised-value-passed-down invariant can be asserted without rendering
// its full form/OAuth internals (those are covered by File 4).
vi.mock('@/components/auth/AuthForms', () => ({
  AuthForms: (props: unknown) => {
    mockAuthFormsProps.current = props;
    return null;
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────
import Auth from '@/pages/Auth';
import * as authUtils from '@/lib/authUtils';

function renderAuthAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Auth page — consumer invariants for getSafeReturnTo', () => {
  // jsdom's window.location own-properties (assign/replace/href) are
  // non-configurable, so neither Object.defineProperty nor vi.spyOn can
  // intercept them in place. Replace window.location wholesale with a plain
  // mock object instead — the standard jsdom workaround for spying on
  // location navigation.
  const originalLocation = window.location;
  let locationAssignSpy: ReturnType<typeof vi.fn>;
  let locationReplaceSpy: ReturnType<typeof vi.fn>;
  let hrefSpy: ReturnType<typeof vi.fn>;
  // Real getSafeReturnTo, spied-on-but-still-called-through — proves the
  // component actually invokes the sanitiser (mechanism), not merely that
  // some sanitised-looking value happens to come out the other end (output).
  // A hardcoded '/discover' fallback would satisfy an output-only assertion
  // but would never call this spy with the raw searchParams value.
  let getSafeReturnToSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    mockAuthFormsProps.current = null;
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

  it('(a) navigation invariant: authenticated render navigates via react-router, never via a location assignment', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?returnTo=/discover');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/discover', { replace: true });
    });

    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('/discover');
    // Falsifiability: if Auth.tsx ever added `window.location.href = target`
    // (or .assign/.replace) alongside or instead of navigate(), this test goes red.
    // Also falsifies a hardcoded-fallback regression: if Auth.tsx stopped calling
    // getSafeReturnTo at all (e.g. hardcoded '/discover'), the spy assertion fails
    // even though the navigate() assertion above would still pass.
  });

  it('(b) sanitised-value-passed-down: a hostile ?returnTo is NOT forwarded to AuthForms — null is', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?returnTo=https://evil.com');

    await waitFor(() => {
      expect(mockAuthFormsProps.current).not.toBeNull();
    });

    expect(
      (mockAuthFormsProps.current as { returnTo: string | null }).returnTo
    ).toBeNull();
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('https://evil.com');
    expect(getSafeReturnToSpy).toHaveReturnedWith(null);
    // Falsifiability: if Auth.tsx passed rawReturnTo straight to <AuthForms returnTo={...} />
    // instead of the sanitised explicitTarget, this would receive 'https://evil.com' and fail.
    // Also falsifies "always renders null regardless of input": the spy call-args
    // assertion proves the raw hostile string actually reached getSafeReturnTo.
  });

  it('(b) sanitised-value-passed-down: a safe ?returnTo IS forwarded to AuthForms unchanged', async () => {
    mockUseAuth.mockReturnValue({ user: null, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?returnTo=/discover?city=x');

    await waitFor(() => {
      expect(mockAuthFormsProps.current).not.toBeNull();
    });

    expect(
      (mockAuthFormsProps.current as { returnTo: string | null }).returnTo
    ).toBe('/discover?city=x');
    expect(getSafeReturnToSpy).toHaveBeenCalledWith('/discover?city=x');
    expect(getSafeReturnToSpy).toHaveReturnedWith('/discover?city=x');
    // Falsifiability: if Auth.tsx forwarded a hardcoded or unrelated string instead
    // of the real sanitiser's return value, the toHaveReturnedWith assertion (which
    // checks the SPY's actual real return value, not a guess) would fail.
  });

  it('pinned-risky backslash returnTo: sanitiser passes it through, but Auth.tsx still never uses a location assignment', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt(`/auth?returnTo=${encodeURIComponent('/\\evil.com')}`);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/\\evil.com', { replace: true });
    });

    // getSafeReturnTo genuinely returns this value verbatim (see authUtils test) —
    // the safety net here is entirely that Auth.tsx routes it through navigate(),
    // never through a location assignment.
    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    // Falsifiability: this is the test that would catch the exact regression class
    // qa-fast flagged — if Auth.tsx were ever changed to do
    // `window.location.href = explicitTarget` (or .assign/.replace) instead of, or
    // in addition to, `navigate(explicitTarget, ...)`, this hostile backslash value
    // would flow into a real location assignment and this test goes red. A test that
    // only asserted navigate() was called would NOT catch that regression, because
    // navigate() would still have been called too.
  });

  it('pinned-risky uppercase-scheme returnTo: sanitiser passes it through, but Auth.tsx still never uses a location assignment', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt(`/auth?returnTo=${encodeURIComponent('/HTTP://evil.com')}`);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/HTTP://evil.com', { replace: true });
    });

    expect(locationAssignSpy).not.toHaveBeenCalled();
    expect(locationReplaceSpy).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    // Falsifiability: same class as above — a future switch to a raw location
    // assignment for this uppercase-scheme value would turn this test red.
  });

  it('alias: accepts ?redirect= when ?returnTo= is absent', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?redirect=/listing/123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/listing/123', { replace: true });
    });
    // Falsifiability: if Auth.tsx dropped the `?? searchParams.get('redirect')` fallback,
    // navigate would instead be called with the role-aware default landing, not '/listing/123'.
  });

  it('alias: ?returnTo= takes precedence over ?redirect= when both are present', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?returnTo=/discover&redirect=/listing/123');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/discover', { replace: true });
    });
    expect(mockNavigate).not.toHaveBeenCalledWith('/listing/123', { replace: true });
    // Falsifiability: if the ?? order in Auth.tsx were reversed, this would navigate to
    // '/listing/123' instead and the test would fail.
  });

  it('a hostile ?redirect= alias is also sanitised away (not forwarded, not navigated to)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isAdmin: false, isBroker: false });

    renderAuthAt('/auth?redirect=//evil.com');

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });

    const [target] = mockNavigate.mock.calls[0];
    expect(target).not.toBe('//evil.com');
  });
});
