/**
 * #2750 PILOT N3 — retires e2e/broker-listing-quality.spec.ts LQ1 (anon -> /auth redirect, no heading)
 * and the route-access half of LQ2 ("broker stays on /broker/listing-quality").
 *
 * Why this is not just a unit test of ProtectedRoute: the property the E2E proved is "THIS route is guarded".
 * That has three independent links, each pinned here so any one breaking reddens a named `it`:
 *   (a) App.tsx wires path="/broker/listing-quality" to <ProtectedRoute><BrokerListingQuality/></ProtectedRoute>
 *       (source-text; comments stripped, same convention as App.propertyRequestsRoute.test.ts)
 *   (b)-(e) the REAL ProtectedRoute, under the REAL route path, behaves correctly for anon / loading /
 *       broker / signed-in user (AuthContext is the only seam mocked)
 *   (f) the REAL routeAccess policy admits the broker and dealer roles and rejects user / anonymous / admin.
 *
 * Guarded child is a stub with a heading "Listing Quality" — the page itself is covered by ListingQuality.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { canAccessRoute } from '@/lib/routeAccess';
import { FixPlanPanel } from '@/components/broker/listing-quality/FixPlanPanel';
import type { QualityListing } from '@/types/listingQuality';

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

const ROUTE = '/broker/listing-quality';

function setAuth(next: Partial<typeof authState.current>) {
  authState.current = {
    user: null,
    isLoading: false,
    isAdmin: false,
    isBroker: false,
    userRole: null,
    ...next,
  };
}

function Probe({ id }: { id: string }) {
  const loc = useLocation();
  return (
    <div data-testid={id}>
      {loc.pathname}|{loc.search}
    </div>
  );
}

function Tree() {
  return (
    <MemoryRouter initialEntries={[ROUTE]}>
      <Routes>
        <Route
          path={ROUTE}
          element={
            <ProtectedRoute>
              <h1>Listing Quality</h1>
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

const heading = () => screen.queryByRole('heading', { name: /listing quality/i });

beforeEach(() => {
  setAuth({});
});

// ── (a) source-text wiring ─────────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}
const APP = stripComments(readFileSync(path.join(__dirname, '../App.tsx'), 'utf-8'));

/**
 * Path-attribute scan (CX-3): `path` `\s*=\s*` value, whatever the quoting: "..", '..', {".."}, {'..'}, {`..`}.
 * Not anchored to attribute position, so prop order / extra props cannot hide a path.
 */
const PATH_ATTR_RE =
  /(?<![\w-])path\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\}|\{\s*`([^`]*)`\s*\})/gi;

function pathValuesIn(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(PATH_ATTR_RE)) out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

/** Every `path=` value in App.tsx. */
const allPathValues = pathValuesIn;

/**
 * The opening tag of every `<Route ...>`: from `<Route` to the first `>` at JSX-brace depth 0, so the nested
 * `element={<ProtectedRoute>...</ProtectedRoute>}` (whose own `>` sit inside braces) stays inside its tag.
 */
function routeOpeningTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<Route(?=[\s/>])/g)) {
    let depth = 0;
    let i = m.index ?? 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index ?? 0, i + 1));
  }
  return tags;
}

const GUARDED_ELEMENT_RE =
  /(?<![\w-])element\s*=\s*\{\s*<ProtectedRoute>\s*<BrokerListingQuality\s*\/>\s*<\/ProtectedRoute>\s*\}/;

/** Every route-wiring fact (a) asserts, computed quote-, order- and extra-prop-tolerantly from one source string. */
function lqWiring(src: string) {
  const exactPathCount = allPathValues(src).filter((v) => v.toLowerCase() === ROUTE).length;
  // Find the <Route> whose path is the LQ route, then check ITS element prop, whatever the attribute order.
  const lqTags = routeOpeningTags(src).filter((t) => pathValuesIn(t).some((v) => v.toLowerCase() === ROUTE));
  const guardedRoute = lqTags.length > 0 && lqTags.every((t) => GUARDED_ELEMENT_RE.test(t));
  const lazyImport =
    /const\s+BrokerListingQuality\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*(["'`])\.\/pages\/broker\/ListingQuality\1\s*\)\s*\)/.test(
      src,
    );
  const lqPathValues = allPathValues(src).filter((v) => /(^|\/)listing-quality\/?$/i.test(v));
  return { exactPathCount, guardedRoute, lazyImport, lqPathValues };
}

describe('App — /broker/listing-quality wiring (#2750 PILOT LQ1)', () => {
  it('(a) declares the path exactly once, as <ProtectedRoute><BrokerListingQuality /></ProtectedRoute>, lazily imported from pages/broker/ListingQuality', () => {
    // quote-agnostic throughout: a valid rewrite to '..', {".."} or {`..`} must not fail; a trailing-slash or
    // relative 'listing-quality' duplicate must.
    expect(allPathValues(APP).length).toBeGreaterThan(20); // the scan really sees App.tsx's routes
    const w = lqWiring(APP);
    expect(w.lqPathValues).toEqual(['/broker/listing-quality']);
    expect(w.exactPathCount).toBe(1);
    expect(w.guardedRoute).toBe(true);
    expect(w.lazyImport).toBe(true);
  });

  it('(a-self) the matcher accepts every quoting style and rejects a guard-less route', () => {
    const guarded = (pathAttr: string) =>
      `<Route ${pathAttr} element={<ProtectedRoute><BrokerListingQuality /></ProtectedRoute>} />`;
    const lazyOf = (q: string) =>
      `const BrokerListingQuality = lazy(() => import(${q}./pages/broker/ListingQuality${q}));`;
    const accepted: Array<[string, string]> = [
      ['double-quoted', `${lazyOf('"')}\n${guarded('path="/broker/listing-quality"')}`],
      ['single-quoted', `${lazyOf("'")}\n${guarded("path='/broker/listing-quality'")}`],
      ['JSX expression, double', `${lazyOf('"')}\n${guarded('path={"/broker/listing-quality"}')}`],
      ['JSX expression, single', `${lazyOf("'")}\n${guarded("path={'/broker/listing-quality'}")}`],
      ['template literal', `${lazyOf('`')}\n${guarded('path={`/broker/listing-quality`}')}`],
    ];
    for (const [label, src] of accepted) {
      const w = lqWiring(src);
      expect(w, label).toMatchObject({
        exactPathCount: 1,
        guardedRoute: true,
        lazyImport: true,
        lqPathValues: ['/broker/listing-quality'],
      });
    }

    // guard-less: path present exactly once, but no ProtectedRoute wrapper -> guardedRoute must be false
    const guardless = lqWiring(
      `${lazyOf("'")}\n<Route path='/broker/listing-quality' element={<BrokerListingQuality />} />`,
    );
    expect(guardless.exactPathCount).toBe(1);
    expect(guardless.guardedRoute).toBe(false);

    // renamed path: the exact-path facts must vanish
    const renamed = lqWiring(`${lazyOf("'")}\n${guarded("path='/broker/listing-quality-v2'")}`);
    expect(renamed.exactPathCount).toBe(0);
    expect(renamed.guardedRoute).toBe(false);
    expect(renamed.lqPathValues).toEqual([]);

    // duplicate: two spellings of the same path must count as 2
    expect(
      lqWiring(`${guarded('path="/broker/listing-quality"')}${guarded("path='/broker/listing-quality'")}`)
        .exactPathCount,
    ).toBe(2);

    // wrong lazy target is rejected
    expect(lqWiring("const BrokerListingQuality = lazy(() => import('./pages/broker/Other'));").lazyImport).toBe(
      false,
    );

    // CX-3 accept: behaviour-preserving prop reorder / extra props / `path = '..'` spacing must stay green
    const GUARD = '<ProtectedRoute><BrokerListingQuality /></ProtectedRoute>';
    const tolerated: Array<[string, string]> = [
      ['element before path', `<Route element={${GUARD}} path="/broker/listing-quality" />`],
      ['extra prop (caseSensitive) between', `<Route path="/broker/listing-quality" caseSensitive element={${GUARD}} />`],
      ['extra prop after element', `<Route path="/broker/listing-quality" element={${GUARD}} caseSensitive />`],
      ['spaced `path = ...`', `<Route path = '/broker/listing-quality' element = {${GUARD}} />`],
      [
        'multi-line, element first',
        `<Route\n  element={\n    <ProtectedRoute>\n      <BrokerListingQuality />\n    </ProtectedRoute>\n  }\n  path="/broker/listing-quality"\n/>`,
      ],
      ['upper-cased path value', `<Route path="/Broker/Listing-Quality" element={${GUARD}} />`],
    ];
    for (const [label, route] of tolerated) {
      expect(lqWiring(route), label).toMatchObject({
        exactPathCount: 1,
        guardedRoute: true,
        lqPathValues: [expect.stringMatching(/^\/broker\/listing-quality$/i)],
      });
    }
    // an unrelated route with extra props earlier in the file must not mask or fake the LQ route
    expect(
      lqWiring(`<Route path="/other" element={<Other />} />\n<Route element={${GUARD}} caseSensitive path="${ROUTE}" />`),
    ).toMatchObject({ exactPathCount: 1, guardedRoute: true });

    // CX-3 reject: a trailing-slash or relative duplicate puts a second LQ path value in the scan (length 2)
    const base = `<Route path="/broker/listing-quality" element={${GUARD}} />`;
    expect(lqWiring(`${base}\n<Route path="/broker/listing-quality/" element={${GUARD}} />`).lqPathValues).toHaveLength(2);
    expect(lqWiring(`${base}\n<Route path="listing-quality" element={${GUARD}} />`).lqPathValues).toHaveLength(2);
    expect(lqWiring(`${base}\n<Route path = 'Listing-Quality' element={${GUARD}} />`).lqPathValues).toHaveLength(2);

    // CX-3 reject: unguarded route with reordered / extra props is still unguarded
    for (const unguarded of [
      `<Route element={<BrokerListingQuality />} path="/broker/listing-quality" />`,
      `<Route caseSensitive element={<BrokerListingQuality />} path = '/broker/listing-quality' />`,
      `<Route path="/broker/listing-quality" caseSensitive element={<ProtectedRoute><Other /></ProtectedRoute>} />`,
    ]) {
      expect(lqWiring(unguarded), unguarded).toMatchObject({ exactPathCount: 1, guardedRoute: false });
    }
    // a guarded sibling elsewhere must not vouch for an unguarded LQ route
    expect(
      lqWiring(`<Route path="/x" element={${GUARD}} />\n<Route element={<BrokerListingQuality />} path="${ROUTE}" />`)
        .guardedRoute,
    ).toBe(false);
  });
});

// ── (b)-(e) behaviour of the real ProtectedRoute at the real path ───────────────────────────────
describe('ProtectedRoute at /broker/listing-quality (#2750 PILOT LQ1/LQ2)', () => {
  it('(b) anonymous is redirected to /auth with the exact return path, and the page heading is absent', () => {
    setAuth({ user: null, isLoading: false });
    render(<Tree />);

    expect(screen.getByTestId('at-auth').textContent).toBe('/auth|?redirect=%2Fbroker%2Flisting-quality');
    expect(heading()).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
  });

  it('(c) while auth is initialising it shows the spinner and does NOT redirect; once settled with no user it redirects to /auth', () => {
    setAuth({ user: null, isLoading: true });
    const { rerender } = render(<Tree />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(heading()).toBeNull();

    setAuth({ user: null, isLoading: false });
    rerender(<Tree />);

    expect(screen.getByTestId('at-auth').textContent).toBe('/auth|?redirect=%2Fbroker%2Flisting-quality');
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(heading()).toBeNull();
  });

  it('(d) control: a signed-in broker stays on /broker/listing-quality and sees the heading', () => {
    setAuth({ user: { id: 'broker-1' }, userRole: 'broker', isBroker: true });
    render(<Tree />);

    expect(heading()).not.toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
    expect(screen.queryByTestId('at-broker-dashboard')).toBeNull();
  });

  it("(d-dealer) control: a signed-in dealer (broker-workspace role, CX-5) stays on /broker/listing-quality and sees the heading", () => {
    setAuth({ user: { id: 'dealer-1' }, userRole: 'dealer' });
    render(<Tree />);

    expect(heading()).not.toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
    expect(screen.queryByTestId('at-discover')).toBeNull();
    expect(screen.queryByTestId('at-broker-dashboard')).toBeNull();
  });

  it("(e) a signed-in 'user' is redirected to /discover and never sees the heading", () => {
    setAuth({ user: { id: 'user-1' }, userRole: 'user' });
    render(<Tree />);

    expect(screen.getByTestId('at-discover').textContent).toBe('/discover|');
    expect(heading()).toBeNull();
    expect(screen.queryByTestId('at-auth')).toBeNull();
  });
});

// ── LQ4 else-branch / LQ5 panel arm: the REAL FixPlanPanel ──────────────────────────────────────
// Shapes mirror makeListing / makeUnscoredListing in pages/broker/__tests__/ListingQuality.test.tsx.
function panelListing(overrides: Partial<QualityListing>): QualityListing {
  return {
    listingId: 'listing-abc-123',
    title: 'Test Plot, Udupi',
    status: 'LIVE',
    scoreStatus: 'SCORED',
    qualityScore: 72,
    band: 'NEEDS_IMPROVEMENT',
    computedAt: '2026-06-20T10:00:00Z',
    findings: [{ component: 'Photos', score: 10, applied: true, finding: 'Good photos' }],
    fixPlan: [
      {
        component: 'Description',
        impact: 'HIGH',
        action: 'Add a detailed property description',
        editDeepLink: '/broker/listings/listing-abc-123/edit',
      },
    ],
    engagement: { status: 'UNAVAILABLE', views: null, enquiries: null, enquiryRate: null },
    ...overrides,
  };
}

function renderPanel(listing: QualityListing) {
  return render(
    <MemoryRouter>
      <FixPlanPanel listing={listing} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe('LQ5 panel: not-scored listing never shows Score: 0 (#2750 PILOT LQ5-a)', () => {
  it('NOT_SCORED panel shows score-unavailable "Not yet scored" and no "Score: 0" anywhere; a SCORED panel shows its numeric score and no score-unavailable', () => {
    const { container, unmount } = renderPanel(
      panelListing({
        listingId: 'listing-unscored-999',
        title: 'New Draft',
        status: 'DRAFT',
        scoreStatus: 'NOT_SCORED',
        qualityScore: null,
        band: 'UNSCORED',
        computedAt: null,
        findings: [],
        fixPlan: [],
      }),
    );
    const unavailable = screen.getByTestId('score-unavailable');
    expect(unavailable).toBeVisible();
    expect(unavailable.textContent?.trim()).toBe('Not yet scored');
    expect(container.textContent ?? '').not.toMatch(/score:\s*0/i);
    expect(container.textContent ?? '').not.toMatch(/score:/i);
    unmount();

    // control arm: a scored listing renders its numeric score, not the unavailable marker
    const scored = renderPanel(panelListing({ qualityScore: 72 }));
    expect(screen.queryByTestId('score-unavailable')).toBeNull();
    expect(scored.container.textContent ?? '').toContain('Score: 72');
  });
});

describe('LQ4 else-branch: no fix plan means zero edit CTAs (#2750 PILOT LQ4)', () => {
  it('a buyer-ready listing with an empty fix plan renders no "Edit listing for:" link; a listing with one fix renders exactly one pointing at its edit route', () => {
    const empty = renderPanel(
      panelListing({ scoreStatus: 'SCORED', band: 'BUYER_READY', qualityScore: 95, fixPlan: [] }),
    );
    expect(screen.queryAllByRole('link', { name: /edit listing for:/i })).toHaveLength(0);
    expect(empty.container.querySelectorAll('[aria-label^="Edit listing for:"]')).toHaveLength(0);
    expect(screen.getByText(/no fixes required/i)).toBeInTheDocument();
    empty.unmount();

    // control arm: the link query really sees links when a fix exists
    renderPanel(panelListing({}));
    const links = screen.getAllByRole('link', { name: /edit listing for:/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/broker/listings/listing-abc-123/edit');
  });
});

// ── (f) policy ─────────────────────────────────────────────────────────────────────────────────
describe('routeAccess — /broker/listing-quality (#2750 PILOT LQ2)', () => {
  it("(f) admits 'broker' and 'dealer' (CX-5) and rejects 'user', 'anonymous' and 'admin'", () => {
    expect(canAccessRoute(ROUTE, 'broker')).toBe(true);
    expect(canAccessRoute(ROUTE, 'dealer')).toBe(true);
    expect(canAccessRoute(ROUTE, 'user')).toBe(false);
    expect(canAccessRoute(ROUTE, 'anonymous')).toBe(false);
    expect(canAccessRoute(ROUTE, 'admin')).toBe(false);
  });
});
