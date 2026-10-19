/**
 * #2835 (#2750 PR-6 batch A) — route wiring + guard behaviour for the five broker-workspace routes whose legacy
 * Playwright specs are being retired: /broker/dashboard, /broker/listings, /broker/preferences,
 * /broker/demand-gaps and /broker/areas/:citySlug/:areaKey.
 *
 * The property the E2Es proved is "THIS route is guarded and admits the broker roles". Three independent links,
 * each pinned so any one breaking reddens a named `it`:
 *   (a)       App.tsx declares the path once, as <ProtectedRoute><Page/></ProtectedRoute>, lazily imported
 *             (source text via appRouteWiring.ts; tolerant of quote style / attribute order / extra props)
 *   (b)-(e)   the REAL ProtectedRoute + REAL routeAccess, mounted under the REAL path with a STUB child, for
 *             anonymous / auth-loading / broker / dealer / plain-user
 *   (f)       the REAL routeAccess policy for the same five paths
 *
 * Seams (disclosed): `@/contexts/AuthContext` is replaced by a controllable `useAuth` (identity seam; its
 * role mapping `dealer|broker -> isBroker` stays untested here, so the dealer arm sets `userRole: 'dealer'` with
 * `isBroker: false` and proves the dealer at the route-guard / role-allow level). Child pages are stubs: the pages
 * have their own guards and are covered by their own page tests.
 *
 * Deliberately NOT encoded: any admin expectation. routeAccess denies admin on these routes while some page
 * guards admit admin; that divergence awaits an owner ruling.
 * The /auth consumer of `?redirect=` (open-redirect validation) is out of scope: this proves the producer only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { canAccessRoute } from '@/lib/routeAccess';
import { BATCH_A_ROUTES, normalisePath, pathValuesIn, routeWiring, stripComments } from './support/appRouteWiring';

const authState = vi.hoisted(() => ({
  current: {
    user: null as { id: string } | null,
    isLoading: false,
    isAdmin: false,
    isBroker: false,
    userRole: null as string | null,
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

function setAuth(next: Partial<typeof authState.current>) {
  authState.current = { user: null, isLoading: false, isAdmin: false, isBroker: false, userRole: null, ...next };
}

interface RouteCase {
  /** Route pattern exactly as declared in App.tsx. */
  pattern: string;
  /** Concrete URL entered by the user (incl. search / encoded params). */
  entry: string;
  component: string;
  heading: string;
}

const CASES: RouteCase[] = [
  { pattern: '/broker/dashboard', entry: '/broker/dashboard', component: 'BrokerDashboard', heading: 'Stub Dashboard' },
  {
    pattern: '/broker/listings',
    // `&` and `,` in the search: dropping encodeURIComponent on the return URL truncates it at the first `&`.
    entry: '/broker/listings?status=DRAFT&sort=createdAt,desc',
    component: 'BrokerListings',
    heading: 'Stub Listings',
  },
  { pattern: '/broker/preferences', entry: '/broker/preferences', component: 'BrokerPreferences', heading: 'Stub Preferences' },
  { pattern: '/broker/demand-gaps', entry: '/broker/demand-gaps', component: 'BrokerDemandGaps', heading: 'Stub Demand Gaps' },
  {
    pattern: '/broker/areas/:citySlug/:areaKey',
    entry: '/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal',
    component: 'BrokerAreaInsights',
    heading: 'Stub Area Insights',
  },
];

function Probe({ id }: { id: string }) {
  const loc = useLocation();
  return <div data-testid={id} data-pathname={loc.pathname} data-search={loc.search} />;
}

function Tree({ rc }: { rc: RouteCase }) {
  return (
    <MemoryRouter initialEntries={[rc.entry]}>
      <Routes>
        <Route
          path={rc.pattern}
          element={
            <ProtectedRoute>
              <h1>{rc.heading}</h1>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<Probe id="at-auth" />} />
        <Route path="/discover" element={<Probe id="at-discover" />} />
        <Route path="/broker/dashboard" element={<Probe id="at-broker-dashboard" />} />
        <Route path="/" element={<Probe id="at-root" />} />
      </Routes>
    </MemoryRouter>
  );
}

const heading = (rc: RouteCase) => screen.queryByRole('heading', { name: rc.heading });

/** Exactly one URLSearchParams.get - never decoded twice. */
function redirectParam(): string | null {
  const search = screen.getByTestId('at-auth').getAttribute('data-search') ?? '';
  return new URLSearchParams(search).get('redirect');
}

beforeEach(() => {
  setAuth({});
});

// ── (a) source-text wiring ─────────────────────────────────────────────────────────────────────
// jsdom replaces the global URL class, so resolve with Node's own URL (not the jsdom global) before node:fs.
const APP_SRC = readFileSync(fileURLToPath(new NodeURL('../App.tsx', import.meta.url)), 'utf-8');

describe('App.tsx wiring of the broker workspace routes (#2835)', () => {
  it('the scan really sees App.tsx (a vacuous scan would pass every route below)', () => {
    expect(pathValuesIn(stripComments(APP_SRC)).length).toBeGreaterThan(20);
    expect(BATCH_A_ROUTES.map((r) => r.path)).toEqual(CASES.map((c) => c.pattern));
  });

  describe.each(BATCH_A_ROUTES)('$path', (spec) => {
    it(`[${spec.path}] (a) declares the path exactly once, as <ProtectedRoute><${spec.component} /></ProtectedRoute>, lazily imported`, () => {
      const w = routeWiring(APP_SRC, spec);
      // Single declaration, compared on NORMALISED paths so a harmless re-case / slash rewrite of the one
      // declaration still passes, while a second declaration differing only by case/slash gives length 2 and fails.
      expect(w.variantPathValues).toHaveLength(1);
      expect(w.variantPathValues.map(normalisePath)).toEqual([normalisePath(spec.path)]);
      expect(w.guardedRoute).toBe(true);
      expect(w.lazyImport).toBe(true);
    });
  });
});

// ── (b)-(e) behaviour of the real ProtectedRoute at each real path ──────────────────────────────
describe.each(CASES)('ProtectedRoute at $pattern (#2835)', (rc) => {
  it(`[${rc.pattern}] (b) anonymous is redirected to /auth with the exact original return path, and the page is absent`, () => {
    setAuth({ user: null, isLoading: false });
    render(<Tree rc={rc} />);

    expect(screen.getByTestId('at-auth').getAttribute('data-pathname')).toBe('/auth');
    expect(redirectParam()).toBe(rc.entry);
    expect(heading(rc)).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
  });

  it(`[${rc.pattern}] (c) while auth initialises it shows the spinner and does NOT redirect; settled with no user it redirects`, () => {
    setAuth({ user: null, isLoading: true });
    const { rerender } = render(<Tree rc={rc} />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(heading(rc)).toBeNull();

    setAuth({ user: null, isLoading: false });
    rerender(<Tree rc={rc} />);

    expect(redirectParam()).toBe(rc.entry);
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(heading(rc)).toBeNull();
  });

  it(`[${rc.pattern}] (d) control: a signed-in broker stays on the route and sees the page`, () => {
    setAuth({ user: { id: 'broker-1' }, userRole: 'broker', isBroker: true });
    render(<Tree rc={rc} />);

    expect(heading(rc)).not.toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
    expect(screen.queryByTestId('at-broker-dashboard')).toBeNull();
  });

  it(`[${rc.pattern}] (d-dealer) control: a signed-in dealer (userRole 'dealer', isBroker false) stays on the route and sees the page`, () => {
    // isBroker deliberately false: the role mapping lives in the mocked AuthContext, so only
    // `userRole: 'dealer'` makes ProtectedRoute/routeAccess decide on the dealer role itself.
    setAuth({ user: { id: 'dealer-1' }, userRole: 'dealer', isBroker: false });
    render(<Tree rc={rc} />);

    expect(heading(rc)).not.toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
    expect(screen.queryByTestId('at-broker-dashboard')).toBeNull();
  });

  it(`[${rc.pattern}] (e) a signed-in 'user' is redirected to /discover and never sees the page`, () => {
    setAuth({ user: { id: 'user-1' }, userRole: 'user' });
    render(<Tree rc={rc} />);

    expect(screen.getByTestId('at-discover').getAttribute('data-pathname')).toBe('/discover');
    expect(heading(rc)).toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
  });
});

// ── (f) policy ─────────────────────────────────────────────────────────────────────────────────
describe('routeAccess for the broker workspace routes (#2835)', () => {
  it.each(CASES)("[$pattern] (f) admits 'broker' and 'dealer'; rejects 'user' and 'anonymous'", (rc) => {
    const url = rc.entry.split('?')[0];
    expect(canAccessRoute(url, 'broker')).toBe(true);
    expect(canAccessRoute(url, 'dealer')).toBe(true);
    expect(canAccessRoute(url, 'user')).toBe(false);
    expect(canAccessRoute(url, 'anonymous')).toBe(false);
  });
});
