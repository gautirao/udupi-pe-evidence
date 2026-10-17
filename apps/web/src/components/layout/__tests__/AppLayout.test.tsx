import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import Onboarding from '../../../pages/Onboarding';
import { AppLayout } from '../AppLayout';
import { PublicDiscoverLayout } from '../PublicDiscoverLayout';
import { makeTestQueryClient } from '@/test/renderWithProviders';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';

// ─── Polyfills for jsdom ─────────────────────────────────

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Mocks ──────────────────────────────────────────────

// Stub out NotificationBell — we test nav rendering here, not notifications.
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notifications bell</button>,
}));

const mockSignOut = vi.fn();

type MockAuth = {
  user: { email: string } | null;
  session: null;
  isLoading: boolean;
  isAdmin: boolean;
  isBroker: boolean;
  userRole: 'admin' | 'user' | 'dealer' | null;
  insightsAccessUntil: string | null;
  signOut: typeof mockSignOut;
  signUp: () => Promise<{ error: null }>;
  signIn: () => Promise<{ error: null }>;
  refreshRole: () => Promise<void>;
};

let mockAuth: MockAuth;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// ─── Helpers ────────────────────────────────────────────

function baseAuth(overrides: Partial<MockAuth> = {}): MockAuth {
  return {
    user: null,
    session: null,
    isLoading: false,
    isAdmin: false,
    isBroker: false,
    userRole: null,
    insightsAccessUntil: null,
    signOut: mockSignOut,
    signUp: async () => ({ error: null }),
    signIn: async () => ({ error: null }),
    refreshRole: async () => {},
    ...overrides,
  };
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

// ─── Tests ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = baseAuth();
});

describe('AppLayout — nav links by role', () => {
  it('logged-out: shows public nav, List your property CTA, and Sign in link', () => {
    renderLayout();

    expect(screen.getAllByRole('link', { name: /discover/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /schools/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /agricultural land/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /trends/i }).length).toBeGreaterThan(0);

    const listCTA = screen.getByRole('link', { name: /list (your )?property/i });
    expect(listCTA).toBeInTheDocument();
    expect(listCTA).toHaveAttribute('href', '/auth?redirect=/broker/listings/new&returnTo=/broker/listings/new');
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: /^saved$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my listings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /broker dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin console/i })).not.toBeInTheDocument();
  });

  it('user role: shows public nav, List property, Saved, My bookings, Notifications — no broker/admin tools', () => {
    mockAuth = baseAuth({
      user: { email: 'user@test.com' },
      userRole: 'user',
    });
    renderLayout();

    expect(screen.getAllByRole('link', { name: /^discover$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^trends$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /saved/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /list property/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /my bookings/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /notifications/i }).length).toBeGreaterThan(0);

    // Admin-only items must not appear
    expect(screen.queryByRole('button', { name: /admin console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /feed runs/i })).not.toBeInTheDocument();
    // Broker dashboard link must not appear
    expect(screen.queryByRole('link', { name: /broker dashboard/i })).not.toBeInTheDocument();
  });

  // #2750 PR-5 area-overview-N1
  it('user role: Trends link points at /trends and there is no Insights link', () => {
    mockAuth = baseAuth({
      user: { email: 'user@test.com' },
      userRole: 'user',
    });
    renderLayout();

    const trendsLinks = screen.getAllByRole('link', { name: /^trends$/i });
    expect(trendsLinks.length).toBeGreaterThan(0);
    for (const link of trendsLinks) {
      expect(link.getAttribute('href')).toMatch(/^\/trends\?city=/);
    }
    // The retired /insights entry must not come back as a nav item.
    expect(screen.queryByRole('link', { name: /^insights$/i })).not.toBeInTheDocument();
  });

  it('dealer role: shows Broker dashboard, New listing, and Broker workspace menu — no user/admin links', async () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isBroker: true,
    });
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getAllByRole('link', { name: /broker dashboard/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /new listing/i }).length).toBeGreaterThan(0);

    const brokerTrigger = screen.getByRole('button', { name: /broker workspace/i });
    expect(brokerTrigger).toBeInTheDocument();

    await user.click(brokerTrigger);

    expect(screen.getAllByRole('menuitem', { name: /my listings/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /bookings/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /listing quality/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /demand gaps/i }).length).toBeGreaterThan(0);

    expect(screen.queryByRole('link', { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin console/i })).not.toBeInTheDocument();
  });

  it('admin role: shows public nav and "Admin console" dropdown trigger — no dealer/user links', async () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    const user = userEvent.setup();
    renderLayout();

    // Primary nav
    expect(screen.getAllByRole('link', { name: /^discover$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^trends$/i }).length).toBeGreaterThan(0);

    // Admin dropdown trigger is rendered
    const adminTrigger = screen.getByRole('button', { name: /admin console/i });
    expect(adminTrigger).toBeInTheDocument();

    await user.click(adminTrigger);

    expect(screen.getAllByRole('menuitem', { name: /feed runs/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /facebook groups/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /manual posts/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /process posts/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /pending approval/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /duplicates/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /chrome extension/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('menuitem', { name: /intelligence/i }).length).toBeGreaterThan(0);

    // Must NOT show dealer or user-only links
    expect(screen.queryByRole('link', { name: /broker dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /saved/i })).not.toBeInTheDocument();
  });
});

describe('AppLayout — admin badge', () => {
  it('shows Admin badge for admin users', () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    renderLayout();

    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
  });

  it('does not show Admin badge for regular users', () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    renderLayout();

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('does not show Admin badge for dealers', () => {
    mockAuth = baseAuth({ user: { email: 'dealer@test.com' }, userRole: 'dealer', isBroker: true });
    renderLayout();

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});

describe('AppLayout — role label in dropdown', () => {
  it('shows "User" label for user role', async () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /^US$/i }));
    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('shows "Broker" label for dealer role', async () => {
    mockAuth = baseAuth({ user: { email: 'dealer@test.com' }, userRole: 'dealer', isBroker: true });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /^DE$/i }));
    expect(screen.getByText('Broker')).toBeInTheDocument();
  });

  it('shows "Administrator" label for admin role', async () => {
    mockAuth = baseAuth({ user: { email: 'admin@test.com' }, userRole: 'admin', isAdmin: true });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /^AD$/i }));
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });
});

describe('AppLayout — broker nav link hrefs', () => {
  it('dealer role: My Listings link points to /broker/listings', async () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isBroker: true,
    });
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /broker workspace/i }));

    const links = screen.getAllByRole('menuitem', { name: /my listings/i });
    expect(links[0]).toHaveAttribute('href', '/broker/listings');
  });
});

describe('AppLayout — anonymous user menu', () => {
  it('shows "Sign in" link and no avatar button when user is null', () => {
    renderLayout();

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.getAttribute('href')).toMatch(/^\/auth(\?|$)/);
    expect(screen.queryByRole('button', { name: /^U$/i })).not.toBeInTheDocument();
  });

  it('Sign in link includes returnTo encoding current path+search', () => {
    render(
      <MemoryRouter initialEntries={['/discover?city=udupi']}>
        <AppLayout>
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    const href = signInLink.getAttribute('href') ?? '';
    expect(href).toContain('returnTo');
    expect(href).toContain('%2Fdiscover');
  });

  it('does not show "Sign in" link when user is authenticated', () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    renderLayout();

    expect(screen.queryByRole('link', { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^US$/i })).toBeInTheDocument();
  });

  // Issue #1926 — E2E auth-indicator selector expects a stable
  // data-testid="user-menu" on the account/avatar dropdown trigger.
  it('renders data-testid="user-menu" on the account trigger when authenticated', () => {
    mockAuth = baseAuth({ user: { email: 'user@test.com' }, userRole: 'user' });
    renderLayout();

    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('does not render data-testid="user-menu" when user is anonymous', () => {
    renderLayout();

    expect(screen.queryByTestId('user-menu')).not.toBeInTheDocument();
  });
});

describe('AppLayout — onboarding redirect for dealers', () => {
  it('dealer at /onboarding is redirected to /', () => {
    mockAuth = baseAuth({
      user: { email: 'dealer@test.com' },
      userRole: 'dealer',
      isBroker: true,
    });
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div>home page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});

describe('PublicDiscoverLayout — /discover route behaviour', () => {
  // These tests assert the collapsed desktop header's own behaviour, which only builds once the viewport is wide enough to host it — simulate that width here.
  let matchMediaMock: { restore: () => void };
  beforeEach(() => {
    matchMediaMock = mockMatchMediaWidth(1366);
  });
  afterEach(() => {
    matchMediaMock.restore();
  });

  // PublicHeader reads useDiscoverNav/useDiscoverShell directly and is always mounted inside DiscoverProvider in production, so this render helper matches that.
  function renderDiscover(url = '/discover?city=udupi') {
    return render(
      <QueryClientProvider client={makeTestQueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <DiscoverProvider>
            <PublicDiscoverLayout>
              <div>discover map surface</div>
            </PublicDiscoverLayout>
          </DiscoverProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  // Neither test below opens the overflow trigger via userEvent (Radix DropdownMenu click hangs in this environment); they check the structural fix directly instead.
  it('1. Broker on /discover?city=udupi sees the collapsed header journey tabs, Trends, and a compact Workspace overflow menu (not the wide broker actions)', () => {
    mockAuth = baseAuth({
      user: { email: 'broker@test.com' },
      userRole: 'dealer',
      isBroker: true,
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /explore by area/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search near a school/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toBeInTheDocument();

    // The old wide Zone 3 (3 separate links + a "Broker workspace" dropdown)
    // is REPLACED by one compact "Workspace" overflow trigger in the
    // collapsed header — real-browser evidence showed the wide version
    // overlapping the journey tabs at 1366×768.
    expect(screen.queryByRole('link', { name: /broker dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^broker workspace$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Workspace');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: /^BR$/i })).toBeInTheDocument();
    // "Trends" folds into the "Workspace" overflow menu instead of a standalone link (see `withTrends`/dedupeNavByHref.test.ts).
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
  });

  it('2. Admin on /discover?city=udupi sees a compact "Admin" overflow trigger (not the wide Admin Console + badge)', () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /explore by area/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search near a school/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toBeInTheDocument();

    // The redundant standalone "Admin" badge and the wide "Admin Console"
    // trigger are REPLACED by one compact "Admin" overflow trigger — real
    // browser evidence showed both overlapping the journey tabs at 1366×768.
    expect(screen.queryByRole('button', { name: /^admin console$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Admin$/, { selector: 'div' })).not.toBeInTheDocument();
    // "Trends" folds into the "Admin" overflow menu instead of a standalone link (see `withTrends`).
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Admin');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: /notifications bell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^AD$/i })).toBeInTheDocument();
  });

  it('3. Normal user on /discover?city=udupi sees a compact "Menu" overflow trigger (not the wide consumer-activity links)', () => {
    mockAuth = baseAuth({
      user: { email: 'user@test.com' },
      userRole: 'user',
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /explore by area/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search near a school/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toBeInTheDocument();

    // The wide Zone 3 (List property/Saved/Saved homes/My bookings/Notifications
    // links + a standalone Trends link) is replaced by one compact "Menu"
    // overflow trigger — same destinations, covered at the data level by
    // dedupeNavByHref.test.ts's withTrends coverage.
    expect(screen.queryByRole('link', { name: /^saved$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /list property/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: /^US$/i })).toBeInTheDocument();
  });

  it('4. Anonymous user on /discover?city=udupi sees the header journey tabs, a compact "Menu" overflow trigger, and Sign in', () => {
    renderDiscover();

    expect(screen.getByRole('link', { name: /explore by area/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search near a school/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toBeInTheDocument();
    // Anon's CTA + Trends fold into one compact trigger, same as Dealer/Admin.
    expect(screen.queryByRole('link', { name: /list property/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^trends$/i })).not.toBeInTheDocument();
    const trigger = screen.getByTestId('role-actions-overflow-trigger');
    expect(trigger).toHaveTextContent('Menu');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^saved$/i })).not.toBeInTheDocument();
  });

  it('5. Active journey link state marks the correct header journey link aria-current="page"', () => {
    // No journey= param resolves to the canonical area-first default (same
    // as useDiscoverNav().journey elsewhere in the app), so "By area" is the
    // active link here — unlike JourneySwitcher's journey-LESS landing state
    // (panelContent === 'guided-entry'), which has no equivalent in a bare
    // URL check and does mark no link current.
    const { unmount: u1 } = renderDiscover('/discover?city=udupi');
    expect(screen.getByRole('link', { name: /explore by area/i })).toHaveAttribute('aria-current', 'page');
    u1();

    const { unmount: u2 } = renderDiscover('/discover?city=udupi&journey=school-first');
    expect(screen.getByRole('link', { name: /explore by area/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /search near a school/i })).toHaveAttribute('aria-current', 'page');
    u2();

    renderDiscover('/discover?city=udupi&journey=agri-first');
    expect(screen.getByRole('link', { name: /find agricultural land/i })).toHaveAttribute('aria-current', 'page');
  });
});

