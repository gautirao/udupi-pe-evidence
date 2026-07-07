import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Onboarding from '../../../pages/Onboarding';
import { AppLayout } from '../AppLayout';
import { PublicDiscoverLayout } from '../PublicDiscoverLayout';

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
  function renderDiscover(url = '/discover?city=udupi') {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <PublicDiscoverLayout>
          <div>discover map surface</div>
        </PublicDiscoverLayout>
      </MemoryRouter>,
    );
  }

  it('1. Broker on /discover?city=udupi sees all public nav and broker actions', () => {
    mockAuth = baseAuth({
      user: { email: 'broker@test.com' },
      userRole: 'dealer',
      isBroker: true,
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^schools$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^agricultural land$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^trends$/i })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /broker dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new listing/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /broker workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^BR$/i })).toBeInTheDocument();
  });

  it('2. Admin on /discover?city=udupi sees Admin Console visible without opening avatar', () => {
    mockAuth = baseAuth({
      user: { email: 'admin@test.com' },
      userRole: 'admin',
      isAdmin: true,
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^schools$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^agricultural land$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^trends$/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /admin console/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /notifications bell/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^AD$/i })).toBeInTheDocument();
  });

  it('3. Normal user on /discover?city=udupi sees consumer actions', () => {
    mockAuth = baseAuth({
      user: { email: 'user@test.com' },
      userRole: 'user',
    });
    renderDiscover();

    expect(screen.getByRole('link', { name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^schools$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^agricultural land$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^trends$/i })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /list property/i })).toBeInTheDocument();
    // Issue #1566 — two distinct "Saved" links now exist (saved areas + saved homes);
    // anchor the regex so each assertion targets exactly one.
    expect(screen.getByRole('link', { name: /^saved$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /saved homes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my bookings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^US$/i })).toBeInTheDocument();
  });

  it('4. Anonymous user on /discover?city=udupi sees public links, List property, Sign in', () => {
    renderDiscover();

    expect(screen.getByRole('link', { name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^schools$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^agricultural land$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^trends$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /list property/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^saved$/i })).not.toBeInTheDocument();
  });

  it('5. Active tab state marks correct journey active', () => {
    const { unmount: u1 } = renderDiscover('/discover?city=udupi');
    expect(screen.getByRole('link', { name: /^discover$/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^schools$/i })).not.toHaveAttribute('aria-current');
    u1();

    const { unmount: u2 } = renderDiscover('/discover?city=udupi&journey=school-first');
    expect(screen.getByRole('link', { name: /^discover$/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /^schools$/i })).toHaveAttribute('aria-current', 'page');
    u2();

    renderDiscover('/discover?city=udupi&journey=agri-first');
    expect(screen.getByRole('link', { name: /^agricultural land$/i })).toHaveAttribute('aria-current', 'page');
  });
});

